"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// maplibre-gl の値（~209KB）は地図初期化の useEffect 内で動的 import() し、
// 初期バンドル＝メインスレッドのクリティカルパスから外す（モバイルの TBT 改善）。
// MapView 本体は SSR されるためヘッダー・検索・凡例が即時描画され、LCP 要素が
// JS 実行完了(TTI)に張り付くのを防ぐ。型のみここで取り込む（実行時に消える）。
import type {
  Map as MapLibreMap,
  MapMouseEvent,
  GeoJSONSource,
  MapGeoJSONFeature,
  DataDrivenPropertyValueSpecification,
  FilterSpecification,
  StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Municipality, MuniSummary } from "@/lib/types";
import { PREFS, getPrefByCode } from "@/lib/prefs";
import { RENT_NODATA_COLOR, hasRent } from "@/lib/rentColor";
import { MAP_METRICS, getMapMetric, DEFAULT_METRIC_KEY, TREND_PROPERTY, type MapMetricKey } from "@/lib/mapMetrics";
import { trackSelectMunicipality, trackChangeMetric, trackApplyFilter } from "@/lib/analytics";
import {
  EMPTY_FILTERS, RENT_MAX_OPTIONS, LAND_MAX_OPTIONS, FLOOD_MAX_OPTIONS,
  isFilterActive, matchesFilter, buildMatchExpression, type MapFilters,
} from "@/lib/mapFilters";
import {
  HAZARD_OVERLAYS, DEFAULT_HAZARD_KEY, getHazardOverlay, type HazardOverlayKey,
  HAZARD_ZONE_ZOOM, GSI_HAZARD_ATTRIBUTION, gsiTileUrl,
} from "@/lib/mapHazards";
import { BASEMAPS, DEFAULT_BASEMAP, getBasemap, type BasemapKey } from "@/lib/mapBasemaps";
import AreaPanel from "./AreaPanel";
import MobileSheet from "./MobileSheet";

type Props = { summary: MuniSummary[]; onMenuClick?: () => void };

const WARDS_MIN_ZOOM = 11;
const MUNI_MIN_ZOOM = 7.5;       // 市区町村レイヤーを出すズーム
const PREF_FADE_END_ZOOM = 9;    // 都道府県レイヤーの fill が完全に消えるズーム
const PREF_CLICK_MAX_ZOOM = 8;   // この zoom 以下で pref クリックを fly-in 扱い

// ベース地図は lib/mapBasemaps.ts（シンプル=OpenFreeMap positron / 淡色=GSI）。
// 初期表示は東京本土（23区＋多摩）を収める。島嶼部（大島〜小笠原, 緯度35.4以南）は
// bbox が極端に縦長になり初期ズームが破綻するため、本土だけを枠に使う。
const TOKYO_BBOX: [number, number, number, number] = [138.94, 35.5, 139.92, 35.9];

export default function MapView({ summary, onMenuClick }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const muniGeoRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const wardsGeoRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const prefGeoRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const ensurePrefsRef = useRef<((slugs: string[]) => Promise<void>) | null>(null);
  const selectedCodeRef = useRef<string | null>(null);
  // 直前に selected=true にした自治体コード。選択変更時に「前回を false / 今回を true」
  // の2回だけ setFeatureState すれば済むよう保持する（全件 forEach の O(n) を回避）。
  const prevSelectedRef = useRef<string | null>(null);
  const hoveredCodeRef = useRef<string | null>(null);
  const hoveredSourceRef = useRef<"muni" | "wards" | null>(null);
  const activeMetricRef = useRef<MapMetricKey>(DEFAULT_METRIC_KEY);
  // 選択時に減光するベース地図ラベル（道路名・水系名等。place=地名は残す）。
  // 元の opacity を保存し、選択解除で復元する。
  const labelDimRef = useRef<{ ids: string[]; text: Map<string, unknown>; icon: Map<string, unknown> }>({
    ids: [],
    text: new Map(),
    icon: new Map(),
  });

  // ベース地図スタイル。state は UI 表示用、ref は地図初期化 effect が再実行されない
  // よう現在値を保持する用。
  const [basemap, setBasemap] = useState<BasemapKey>(DEFAULT_BASEMAP);
  const basemapRef = useRef<BasemapKey>(DEFAULT_BASEMAP);

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [hazardKey, setHazardKey] = useState<HazardOverlayKey>(DEFAULT_HAZARD_KEY);
  const [activeMetric, setActiveMetric] = useState<MapMetricKey>(DEFAULT_METRIC_KEY);
  const [filters, setFilters] = useState<MapFilters>(EMPTY_FILTERS);
  const [isMobile, setIsMobile] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // 検索候補のキーボード選択位置（-1 = 未選択）。コンボボックスの aria-activedescendant に対応。
  const [activeIndex, setActiveIndex] = useState(-1);
  const [mapReady, setMapReady] = useState(false);
  // 初回ビューのポリゴンが描画され切るまで true にしない（凡例先行・白地図対策）
  const [firstPaintReady, setFirstPaintReady] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; label: string; value: string; flip: boolean } | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  // 選択中自治体のフル詳細（/api/muni/[code] で取得）。サマリには無い人口/地価等を含む
  const [selectedDetail, setSelectedDetail] = useState<Municipality | null>(null);

  const { municipalities, wards } = useMemo(() => {
    const mu: MuniSummary[] = [];
    const wa: MuniSummary[] = [];
    for (const x of summary) (x.level === "ward" ? wa : mu).push(x);
    return { municipalities: mu, wards: wa };
  }, [summary]);

  const byCode = useMemo(() => {
    const m = new Map<string, MuniSummary>();
    for (const x of summary) m.set(x.code, x);
    return m;
  }, [summary]);

  useEffect(() => {
    const detect = () => setIsMobile(window.innerWidth < 768);
    detect();
    window.addEventListener("resize", detect);
    return () => window.removeEventListener("resize", detect);
  }, []);

  // PC は塗り分け指標が核なのでレイヤーパネルを初期表示（発見性向上）。
  // SP は画面が狭いため閉じたまま。マウント後に一度だけ設定し hydration 不一致を避ける。
  useEffect(() => {
    if (window.innerWidth >= 768) setLayersOpen(true);
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const { default: maplibregl } = await import("maplibre-gl");
      // 動的 import 中にアンマウントされた / 既にマップが立っていれば中断
      if (disposed || !containerRef.current || mapRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: getBasemap(basemapRef.current).style,
        center: [139.69, 35.69],
        zoom: 8.5,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), "bottom-right");

      const mergeFeatureData = (geo: GeoJSON.FeatureCollection) => {
        for (const f of geo.features) {
          const code = String(f.properties?.code ?? "");
          const m = byCode.get(code);
          if (!m) continue;
          f.properties = {
            ...f.properties,
            rent: m.rent,
            landPrice: m.landPrice,
            [TREND_PROPERTY]: m.populationTrend ?? "",
            name: m.name,
            floodLevel: m.floodLevel, // -1=対象外, 0=なし, 1..6
            landslideLevel: m.landslideLevel,
            tsunamiLevel: m.tsunamiLevel,
            stormSurgeLevel: m.stormSurgeLevel,
            liquefactionLevel: m.liquefactionLevel,
          };
        }
      };

      map.on("load", async () => {
        map.fitBounds(TOKYO_BBOX, { padding: 40, duration: 0 });
        // prefectures(47県の輪郭, 約580KB)だけ起動時にロード。各県の市区町村/区
        // ポリゴンは全件で22MB超あり SP 実機で破綻するため、ズームしてビューポートに
        // 入った県だけを遅延ロードする（下の ensurePrefs / checkViewport）。
        const prefGeo = await fetch("/prefectures.geojson").then(
          (r) => r.json() as Promise<GeoJSON.FeatureCollection>,
        );
        prefGeoRef.current = prefGeo;
        // muni / wards は空で開始し、遅延ロードのたびに features を足して setData する
        const muniGeo: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
        const wardsGeo: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
        muniGeoRef.current = muniGeo;
        wardsGeoRef.current = wardsGeo;
        const geo = muniGeo; // 既存コード互換

        // ラベルを日本語優先に書き換え（OSMの name:ja があれば優先、無ければ name）
        const allLayers = map.getStyle().layers ?? [];
        for (const layer of allLayers) {
          if (layer.type !== "symbol") continue;
          const layout = (layer as { layout?: { "text-field"?: unknown } }).layout;
          if (!layout?.["text-field"]) continue;
          map.setLayoutProperty(layer.id, "text-field", [
            "coalesce",
            ["get", "name:ja"],
            ["get", "name:latin"],
            ["get", "name"],
          ]);
        }

        // 自治体選択時に減光する「道路名・水系名等」のラベル群を控えておく
        // （source-layer="place" の地名ラベルは選択中も読めるよう対象外）。
        collectBaseLabels(map, labelDimRef.current);

        map.addSource("prefectures", { type: "geojson", data: prefGeo, promoteId: "code" });
        map.addSource("muni", { type: "geojson", data: geo, promoteId: "code" });
        map.addSource("wards", { type: "geojson", data: wardsGeo, promoteId: "code" });

        // 地名ラベル等の symbol レイヤーより下にコロプレスを差し込む
        const firstSymbolId = allLayers.find((l) => l.type === "symbol")?.id;

        // 災害リスク オーバーレイ用の斜線ハッチ画像を用意（コロプレスを塗り潰さず
        // 重ねられる＝家賃/トレンドの色を保ったまま「浸水想定あり」を示せる）。
        ensureHazardPattern(map);

        // ===== 都道府県レイヤー（低ズームで前面、高ズームでフェードアウト）=====
        map.addLayer({
          id: "pref-fill",
          type: "fill",
          source: "prefectures",
          paint: {
            "fill-color": [
              "case",
              ["boolean", ["feature-state", "hover"], false], "#2563eb",
              "rgba(37, 99, 235, 0.08)",
            ],
            "fill-opacity": [
              "interpolate", ["linear"], ["zoom"],
              5, 0.7,
              7, 0.5,
              PREF_FADE_END_ZOOM, 0,
            ],
          },
        }, firstSymbolId);
        map.addLayer({
          id: "pref-outline",
          type: "line",
          source: "prefectures",
          paint: {
            "line-color": "rgba(15, 23, 42, 0.45)",
            "line-width": [
              "case",
              ["boolean", ["feature-state", "hover"], false], 2.0,
              0.8,
            ],
            "line-opacity": [
              "interpolate", ["linear"], ["zoom"],
              5, 1,
              8, 0.6,
              PREF_FADE_END_ZOOM, 0.2,
              11, 0,
            ],
          },
        }, firstSymbolId);

        // 家賃コロプレス（透過強め、地図が透ける）
        map.addLayer({
          id: "muni-fill",
          type: "fill",
          source: "muni",
          minzoom: MUNI_MIN_ZOOM,
          paint: {
            "fill-color": getMapMetric(DEFAULT_METRIC_KEY).colorExpression() as DataDrivenPropertyValueSpecification<string>,
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "selected"], false], 0.85,
              ["boolean", ["feature-state", "hover"], false], 0.7,
              0.55,
            ],
          },
        }, firstSymbolId);
        // 絞り込み減光：条件に該当しない自治体を白でマスク（既定は非表示。
        // 塗り分け・災害オーバーレイには手を入れず、この層だけを被せる）
        map.addLayer({
          id: "muni-dim",
          type: "fill",
          source: "muni",
          minzoom: MUNI_MIN_ZOOM,
          layout: { visibility: "none" },
          paint: { "fill-color": "#f8fafc", "fill-opacity": 0.66 },
        }, firstSymbolId);
        // 災害リスク オーバーレイ（さらに弱く）
        map.addLayer({
          id: "muni-hazard",
          type: "fill",
          source: "muni",
          minzoom: MUNI_MIN_ZOOM,
          // 自治体集計ハッチは比較用。拡大（HAZARD_ZONE_ZOOM 以上）では実区域ラスタに譲る。
          maxzoom: HAZARD_ZONE_ZOOM,
          // 浸水深ランク>0 に重ね、深いほど不透明に（下のコロプレスは透ける範囲で）。
          filter: [">", ["get", "floodLevel"], 0],
          paint: {
            "fill-pattern": "hazard-hatch",
            "fill-opacity": HAZARD_DEPTH_OPACITY,
          },
        }, firstSymbolId);
        // 境界線
        map.addLayer({
          id: "muni-outline",
          type: "line",
          source: "muni",
          minzoom: MUNI_MIN_ZOOM,
          paint: {
            "line-color": "rgba(15, 23, 42, 0.42)",
            "line-width": [
              "case",
              ["boolean", ["feature-state", "hover"], false], 1.8,
              0.8,
            ],
          },
        }, firstSymbolId);
        // 選択中ハイライト（明るいリング）
        map.addLayer({
          id: "muni-selected",
          type: "line",
          source: "muni",
          minzoom: MUNI_MIN_ZOOM,
          paint: {
            "line-color": "#1d4ed8",
            "line-width": [
              "case",
              ["boolean", ["feature-state", "selected"], false], 3.6,
              0,
            ],
            "line-blur": 0.4,
          },
        }, firstSymbolId);

        // ===== 政令市の行政区レイヤー（ズーム閾値以上で表示）=====
        map.addLayer({
          id: "wards-fill",
          type: "fill",
          source: "wards",
          minzoom: WARDS_MIN_ZOOM,
          paint: {
            "fill-color": getMapMetric(DEFAULT_METRIC_KEY).colorExpression() as DataDrivenPropertyValueSpecification<string>,
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "selected"], false], 0.85,
              ["boolean", ["feature-state", "hover"], false], 0.7,
              0.55,
            ],
          },
        }, firstSymbolId);
        map.addLayer({
          id: "wards-dim",
          type: "fill",
          source: "wards",
          minzoom: WARDS_MIN_ZOOM,
          layout: { visibility: "none" },
          paint: { "fill-color": "#f8fafc", "fill-opacity": 0.66 },
        }, firstSymbolId);
        map.addLayer({
          id: "wards-hazard",
          type: "fill",
          source: "wards",
          minzoom: WARDS_MIN_ZOOM,
          maxzoom: HAZARD_ZONE_ZOOM,
          filter: [">", ["get", "floodLevel"], 0],
          paint: { "fill-pattern": "hazard-hatch", "fill-opacity": HAZARD_DEPTH_OPACITY },
        }, firstSymbolId);
        // 実区域ラスタ（国土地理院ハザードマップポータルの公開タイル）。拡大時のみ表示し、
        // 自治体集計ハッチに代わって実際の浸水想定区域ポリゴンを公式の深さ凡例で描く。
        // API キー不要・CORS 可。種別ごとに1ソース/レイヤーを用意し、選択中のみ可視化。
        for (const h of HAZARD_OVERLAYS) {
          // 土砂は3レイヤー（土石流/急傾斜/地すべり）。種別ごとに layerId 分のソース/レイヤーを作る。
          h.gsiLayerIds.forEach((layerId, i) => {
            const sid = `gsi-${h.key}-${i}`;
            map.addSource(sid, {
              type: "raster",
              tiles: [gsiTileUrl(layerId)],
              tileSize: 256,
              minzoom: 2,
              maxzoom: 17,
              attribution: GSI_HAZARD_ATTRIBUTION,
            });
            map.addLayer({
              id: sid,
              type: "raster",
              source: sid,
              minzoom: HAZARD_ZONE_ZOOM,
              layout: { visibility: "none" },
              paint: { "raster-opacity": 0.7 },
            }, firstSymbolId);
          });
        }
        map.addLayer({
          id: "wards-outline",
          type: "line",
          source: "wards",
          minzoom: WARDS_MIN_ZOOM,
          paint: {
            "line-color": "rgba(15, 23, 42, 0.42)",
            "line-width": [
              "case",
              ["boolean", ["feature-state", "hover"], false], 1.8,
              0.8,
            ],
          },
        }, firstSymbolId);
        map.addLayer({
          id: "wards-selected",
          type: "line",
          source: "wards",
          minzoom: WARDS_MIN_ZOOM,
          paint: {
            "line-color": "#1d4ed8",
            "line-width": [
              "case",
              ["boolean", ["feature-state", "selected"], false], 3.6,
              0,
            ],
            "line-blur": 0.4,
          },
        }, firstSymbolId);

        const onPolyClick = (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
          const f = e.features?.[0];
          if (!f) return;
          const code = String(f.properties?.code ?? "");
          setSelectedCode(code);
          trackSelectMunicipality(code, "map");
          flyToCode(code);
        };
        map.on("click", "muni-fill", onPolyClick);
        map.on("click", "wards-fill", onPolyClick);

        // 都道府県クリック → その県内まで fly-in（pref outline がまだ見える低〜中ズーム時のみ）
        let hoveredPrefRef = "";
        map.on("click", "pref-fill", (e) => {
          if (map.getZoom() >= PREF_CLICK_MAX_ZOOM) return; // 高ズームでは pref クリックを無視
          const f = e.features?.[0];
          if (!f) return;
          const bbox = computeBbox(f.geometry);
          if (!bbox) return;
          const sp = typeof window !== "undefined" && window.innerWidth < 768;
          map.fitBounds(bbox, {
            padding: sp ? { top: 80, bottom: 264, left: 24, right: 24 } : { top: 60, bottom: 60, left: 60, right: 60 },
            maxZoom: 9.5,
            duration: 900,
          });
        });
        map.on("mousemove", "pref-fill", (e) => {
          if (map.getZoom() >= PREF_CLICK_MAX_ZOOM) return;
          const f = e.features?.[0];
          if (!f) return;
          const code = String(f.properties?.code ?? "");
          if (hoveredPrefRef && hoveredPrefRef !== code) {
            map.setFeatureState({ source: "prefectures", id: hoveredPrefRef }, { hover: false });
          }
          hoveredPrefRef = code;
          map.setFeatureState({ source: "prefectures", id: code }, { hover: true });
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "pref-fill", () => {
          if (hoveredPrefRef) {
            map.setFeatureState({ source: "prefectures", id: hoveredPrefRef }, { hover: false });
            hoveredPrefRef = "";
          }
          map.getCanvas().style.cursor = "";
        });

        const onPolyMove = (sourceId: "muni" | "wards") =>
          (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
            const f = e.features?.[0];
            if (!f) return;
            const code = String(f.properties?.code ?? "");
            if (hoveredCodeRef.current && hoveredSourceRef.current &&
                (hoveredCodeRef.current !== code || hoveredSourceRef.current !== sourceId)) {
              map.setFeatureState(
                { source: hoveredSourceRef.current, id: hoveredCodeRef.current },
                { hover: false },
              );
            }
            hoveredCodeRef.current = code;
            hoveredSourceRef.current = sourceId;
            map.setFeatureState({ source: sourceId, id: code }, { hover: true });
            map.getCanvas().style.cursor = "pointer";
            const metric = getMapMetric(activeMetricRef.current);
            const propKey = metric.key === "populationTrend" ? TREND_PROPERTY : metric.key;
            // 右端付近ではツールチップをカーソルの左側に出して見切れを防ぐ
            const canvasW = map.getCanvas().clientWidth;
            setTooltip({
              x: e.point.x,
              y: e.point.y,
              name: String(f.properties?.name ?? ""),
              label: metric.label,
              value: metric.formatValue(f.properties?.[propKey]),
              flip: e.point.x > canvasW - 200,
            });
          };
        map.on("mousemove", "muni-fill", onPolyMove("muni"));
        map.on("mousemove", "wards-fill", onPolyMove("wards"));
        const onPolyLeave = () => {
          if (hoveredCodeRef.current && hoveredSourceRef.current) {
            map.setFeatureState(
              { source: hoveredSourceRef.current, id: hoveredCodeRef.current },
              { hover: false },
            );
            hoveredCodeRef.current = null;
            hoveredSourceRef.current = null;
          }
          map.getCanvas().style.cursor = "";
          setTooltip(null);
        };
        map.on("mouseleave", "muni-fill", onPolyLeave);
        map.on("mouseleave", "wards-fill", onPolyLeave);

        // ===== 県単位の遅延ロード（ビューポートに入った県だけ取得）=====
        const codeToSlug = new Map(PREFS.map((p) => [p.codePrefix, p.slug]));
        const prefBySlug = new Map(PREFS.map((p) => [p.slug, p]));
        const prefBboxBySlug = new Map<string, [number, number, number, number]>();
        for (const f of prefGeo.features) {
          const slug = codeToSlug.get(String(f.properties?.code ?? "").slice(0, 2));
          if (!slug) continue;
          const bb = computeBbox(f.geometry);
          if (bb) prefBboxBySlug.set(slug, [bb[0][0], bb[0][1], bb[1][0], bb[1][1]]);
        }
        const loadedPrefs = new Set<string>();
        const bboxHit = (a: number[], b: number[]) =>
          !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);

        async function loadPrefGeo(p: (typeof PREFS)[number]) {
          const muni = await fetch(`/${p.slug}.geojson`).then((r) => r.json() as Promise<GeoJSON.FeatureCollection>);
          mergeFeatureData(muni);
          muniGeoRef.current!.features.push(...muni.features);
          if (p.hasWards) {
            const wd = await fetch(`/${p.slug}_wards.geojson`).then((r) => r.json() as Promise<GeoJSON.FeatureCollection>);
            mergeFeatureData(wd);
            wardsGeoRef.current!.features.push(...wd.features);
          }
        }
        async function ensurePrefs(slugs: string[]) {
          const todo = [...new Set(slugs)].filter((s) => !loadedPrefs.has(s) && prefBySlug.has(s));
          if (!todo.length) return;
          todo.forEach((s) => loadedPrefs.add(s)); // 同期的に印を付け二重取得を防ぐ
          await Promise.all(
            todo.map((s) =>
              loadPrefGeo(prefBySlug.get(s)!).catch((err) => {
                loadedPrefs.delete(s);
                console.error("pref geojson load 失敗:", s, err);
              }),
            ),
          );
          (map.getSource("muni") as GeoJSONSource | undefined)?.setData(muniGeoRef.current!);
          (map.getSource("wards") as GeoJSONSource | undefined)?.setData(wardsGeoRef.current!);
          // setData で feature-state が消えるため、選択中の自治体をハイライトし直す
          const sel = selectedCodeRef.current;
          if (sel) {
            map.setFeatureState({ source: "muni", id: sel }, { selected: true });
            map.setFeatureState({ source: "wards", id: sel }, { selected: true });
          }
        }
        ensurePrefsRef.current = ensurePrefs;

        function checkViewport() {
          if (map.getZoom() < MUNI_MIN_ZOOM) return; // 県レベル表示中は muni 不要
          const b = map.getBounds();
          const vb = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
          const slugs: string[] = [];
          for (const [slug, bb] of prefBboxBySlug) if (bboxHit(vb, bb)) slugs.push(slug);
          if (slugs.length) void ensurePrefs(slugs);
        }
        map.on("moveend", checkViewport);

        setMapReady(true);

        // SP では出典（アトリビューション）を (i) ボタンに畳み、凡例・コントロールと
        // の干渉や右端の見切れを防ぐ。タップで展開できライセンス表記は維持される。
        if (typeof window !== "undefined" && window.innerWidth < 768) {
          map
            .getContainer()
            .querySelector(".maplibregl-ctrl-attrib")
            ?.classList.remove("maplibregl-compact-show");
        }

        // 初期ビュー(東京付近)の県ポリゴンを await し、描画が落ち着いてから
        // ローディングオーバーレイを外す。idle が来ない環境向けに失敗保険も置く。
        if (map.getZoom() >= MUNI_MIN_ZOOM) {
          const b = map.getBounds();
          const vb = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
          const initSlugs: string[] = [];
          for (const [slug, bb] of prefBboxBySlug) if (bboxHit(vb, bb)) initSlugs.push(slug);
          await ensurePrefs(initSlugs);
        }
        map.once("idle", () => setFirstPaintReady(true));
        setTimeout(() => setFirstPaintReady(true), 6000);
      });

      mapRef.current = map;

      // コンテナサイズ変化に追従（初期レイアウト未確定対策含む）
      const ro = new ResizeObserver(() => map.resize());
      ro.observe(containerRef.current);
      // 初期化直後の追加リサイズ
      requestAnimationFrame(() => map.resize());

      cleanup = () => {
        ro.disconnect();
        map.remove();
        mapRef.current = null;
      };
      // セットアップ完了前にアンマウントされていた場合は即座に後始末
      if (disposed) cleanup();
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [byCode]);

  // 選択中のハザード種別に応じてオーバーレイ2層（市/区）の表示・対象・濃淡を切り替える。
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const overlay = getHazardOverlay(hazardKey);
    const visible = overlay ? "visible" : "none";
    for (const id of ["muni-hazard", "wards-hazard"]) {
      map.setLayoutProperty(id, "visibility", visible);
      if (overlay) {
        map.setFilter(id, overlay.filter as FilterSpecification);
        map.setPaintProperty(id, "fill-opacity", overlay.opacity as DataDrivenPropertyValueSpecification<number>);
      }
    }
    // 実区域ラスタは選択中の種別のみ可視（ズーム閾値はレイヤーの minzoom が制御）。
    for (const h of HAZARD_OVERLAYS) {
      const vis = h.key === hazardKey ? "visible" : "none";
      h.gsiLayerIds.forEach((_, i) => map.setLayoutProperty(`gsi-${h.key}-${i}`, "visibility", vis));
    }
  }, [hazardKey, mapReady]);

  // 指標切替：muni/wards の fill-color を選択中メトリックの式に差し替える
  useEffect(() => {
    activeMetricRef.current = activeMetric;
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const expr = getMapMetric(activeMetric).colorExpression() as DataDrivenPropertyValueSpecification<string>;
    map.setPaintProperty("muni-fill", "fill-color", expr);
    map.setPaintProperty("wards-fill", "fill-color", expr);
  }, [activeMetric, mapReady]);

  // 条件フィルタ：非該当を減光レイヤーで覆う（フィルタ式の否定を filter に設定）。
  // 描画と件数を一致させるため、ここの match は matchesFilter（JS版）と同一条件。
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const match = buildMatchExpression(filters);
    for (const id of ["muni-dim", "wards-dim"]) {
      if (!match) {
        map.setLayoutProperty(id, "visibility", "none");
      } else {
        map.setFilter(id, ["!", match] as FilterSpecification);
        map.setLayoutProperty(id, "visibility", "visible");
      }
    }
  }, [filters, mapReady]);

  // 自治体選択中はベース地図の道路名・水系名ラベルを減光し、選択ポリゴンと
  // パネルに視線を集める。地名(place)は残す。解除で元の opacity に復元。
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const { ids, text, icon } = labelDimRef.current;
    const dim = !!selectedCode;
    for (const id of ids) {
      map.setPaintProperty(id, "text-opacity-transition", { duration: 300, delay: 0 });
      map.setPaintProperty(id, "icon-opacity-transition", { duration: 300, delay: 0 });
      map.setPaintProperty(id, "text-opacity", dim ? 0.35 : (text.get(id) ?? 1));
      map.setPaintProperty(id, "icon-opacity", dim ? 0.3 : (icon.get(id) ?? 1));
    }
  }, [selectedCode, mapReady]);

  useEffect(() => {
    selectedCodeRef.current = selectedCode;
    const map = mapRef.current;
    if (!map || !mapReady) return;
    // 前回選択を解除し、今回選択のみ true にする（~1,900件の全件 forEach を回避）。
    // code が muni / wards どちらの source にあるか不定なので両方に投げる（無い側は no-op）。
    const prev = prevSelectedRef.current;
    if (prev && prev !== selectedCode) {
      map.setFeatureState({ source: "muni", id: prev }, { selected: false });
      map.setFeatureState({ source: "wards", id: prev }, { selected: false });
    }
    if (selectedCode) {
      map.setFeatureState({ source: "muni", id: selectedCode }, { selected: true });
      map.setFeatureState({ source: "wards", id: selectedCode }, { selected: true });
    }
    prevSelectedRef.current = selectedCode;
  }, [selectedCode, mapReady]);

  // 選択中自治体のフル詳細をオンデマンド取得（初期配信はサマリのみのため）
  useEffect(() => {
    if (!selectedCode) { setSelectedDetail(null); return; }
    let aborted = false;
    setSelectedDetail(null);
    fetch(`/api/muni/${selectedCode}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Municipality | null) => { if (!aborted) setSelectedDetail(d); })
      .catch(() => { if (!aborted) setSelectedDetail(null); });
    return () => { aborted = true; };
  }, [selectedCode]);

  // 条件フィルタの全国該当件数（JS判定。地図の減光と必ず同一条件）。
  const filterActive = isFilterActive(filters);
  const matchedCount = useMemo(
    () => (filterActive ? summary.reduce((n, m) => n + (matchesFilter(m, filters) ? 1 : 0), 0) : 0),
    [filterActive, filters, summary],
  );

  // フィルタ条件を更新しつつ GA4 に適用イベントを送る共通ハンドラ。
  const updateFilters = useCallback((next: MapFilters) => {
    setFilters(next);
    if (isFilterActive(next)) trackApplyFilter(next);
  }, []);

  // ベース地図の切替。setStyle はベースごと全レイヤーを破棄するため、transformStyle で
  // 自前のソース/レイヤー（コロプレス・ハザード・実区域）を新ベースへ引き継ぐ。
  // setStyle で消える「画像（ハッチ）・選択 feature-state・ラベル群」は styledata で再適用。
  const switchBasemap = useCallback((key: BasemapKey) => {
    const map = mapRef.current;
    if (!map || key === basemapRef.current) return;
    basemapRef.current = key;
    setBasemap(key);
    const sourceIsOurs = (id: string) =>
      id === "prefectures" || id === "muni" || id === "wards" || id.startsWith("gsi-");
    const layerIsOurs = (id: string) => /^(pref-|muni-|wards-|gsi-)/.test(id);
    map.setStyle(getBasemap(key).style, {
      transformStyle: (prev, next) => {
        if (!prev) return next;
        const keepSources = Object.fromEntries(
          Object.entries(prev.sources).filter(([id]) => sourceIsOurs(id)),
        );
        const ours = prev.layers.filter((l) => layerIsOurs(l.id));
        // 新ベースのラベル(symbol)より下に自前レイヤーを差し込む（ラスタは symbol 無し→末尾）。
        const at = next.layers.findIndex((l) => l.type === "symbol");
        const layers = [...next.layers];
        layers.splice(at < 0 ? layers.length : at, 0, ...ours);
        return { ...next, sources: { ...next.sources, ...keepSources }, layers } as StyleSpecification;
      },
    });
    map.once("styledata", () => {
      ensureHazardPattern(map);
      collectBaseLabels(map, labelDimRef.current);
      const sel = selectedCodeRef.current;
      if (sel) {
        map.setFeatureState({ source: "muni", id: sel }, { selected: true });
        map.setFeatureState({ source: "wards", id: sel }, { selected: true });
      }
    });
  }, []);

  // サイドパネル余白用：選択中自治体と同県・同階層で家賃中央値が近い上位3件。
  const relatedNearby = useMemo(() => {
    const m = selectedDetail;
    if (!m || !hasRent(m.rent.value)) return [];
    const level = m.level ?? "muni";
    const myRent = m.rent.value;
    return [...municipalities, ...wards]
      .filter((x) => (x.level ?? "muni") === level && x.pref === m.pref && x.code !== m.code && hasRent(x.rent))
      .sort((a, b) => Math.abs(a.rent - myRent) - Math.abs(b.rent - myRent))
      .slice(0, 3);
  }, [selectedDetail, municipalities, wards]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    // 市区町村と区を両方検索対象に
    return [...municipalities, ...wards]
      .filter((m) => (m.displayName ?? m.name).includes(q) || m.name.includes(q))
      .slice(0, 8);
  }, [searchQuery, municipalities, wards]);

  // 自治体コードを画面内に収める。SP は下部シート分、PC は右パネル分の余白を確保。
  const flyToCode = useCallback((code: string) => {
    const map = mapRef.current;
    if (!map) return;
    // muniGeo にあれば muni、なければ wardsGeo を見る
    const muniFeat = muniGeoRef.current?.features.find(
      (x) => String(x.properties?.code) === code,
    );
    const wardFeat = !muniFeat
      ? wardsGeoRef.current?.features.find((x) => String(x.properties?.code) === code)
      : undefined;
    const feat = muniFeat || wardFeat;
    if (!feat) return;
    const bbox = computeBbox(feat.geometry);
    if (!bbox) return;
    const sp = typeof window !== "undefined" && window.innerWidth < 768;
    // SP は header (~60px) + half シート (~200px) を避けて選択ポリゴンを画面内に収める。
    // full は modal で地図を覆うので fit は half 基準で OK。
    const padding = sp
      ? { top: 80, bottom: 264, left: 24, right: 24 }
      : { top: 80, bottom: 60, left: 60, right: 420 };
    // 区を選択した時は最低 z=11 まで寄せて区レイヤーが見える状態に
    const minZoom = wardFeat ? WARDS_MIN_ZOOM : 0;
    const currentZoom = map.getZoom();
    map.fitBounds(bbox, { padding, maxZoom: 13.5, duration: 800 });
    if (wardFeat && currentZoom < minZoom) {
      // fitBounds の結果が minZoom 未満ならズーム引き上げ
      setTimeout(() => {
        if (map.getZoom() < minZoom) map.easeTo({ zoom: minZoom, duration: 400 });
      }, 850);
    }
  }, []);

  const flyToMuni = useCallback(async (m: MuniSummary) => {
    setSelectedCode(m.code);
    trackSelectMunicipality(m.code, "search");
    setSearchQuery("");
    // 検索で他県を選んだ場合、その県がまだ遅延ロードされていなければ先に取得
    const pref = getPrefByCode(m.code);
    if (pref) await ensurePrefsRef.current?.([pref.slug]);
    flyToCode(m.code);
  }, [flyToCode]);

  // 候補リストが変わるたびにキーボード選択位置をリセット
  useEffect(() => { setActiveIndex(-1); }, [searchQuery]);

  // コンボボックスのキーボード操作（↓↑で候補移動・Enterで確定・Escで閉じる）
  const onSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setSearchQuery(""); return; }
    if (!filtered.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? filtered.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < filtered.length) {
        e.preventDefault();
        void flyToMuni(filtered[activeIndex]);
      }
    }
  }, [filtered, activeIndex, flyToMuni]);

  // パネル開閉はフル詳細の取得完了で判定（取得中の一瞬は閉のまま）
  const rootClass = [
    "map-root",
    selectedDetail && isMobile ? "is-sheet-open" : "",
    selectedDetail && !isMobile ? "is-panel-open" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={rootClass}>
      <div
        ref={containerRef}
        className="map-canvas"
        role="region"
        aria-label="日本全国の市区町村を家賃・地価・人口で塗り分けた地図。地図にフォーカスすると矢印キーで移動、＋／−キーで拡大縮小できます。個別の自治体はヘッダーの検索からも選べます。"
      />

      {/* 初期描画用スケルトン地図（LCP 要素）。常時マウントして SSR HTML に含め、
          MapLibre が描画完了したらフェードアウトする。地図は WebGL canvas で
          描かれ canvas は LCP の候補外なので、この <img> が早期に LCP を確定させ、
          LCP が地図初期化(TTI)に張り付くのを防ぐ。素材は scripts/build-initial-view-svg.mjs 生成。 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/initial-view.svg"
        alt=""
        aria-hidden="true"
        className={`map-skeleton ${firstPaintReady ? "is-hidden" : ""}`}
      />

      {/* 初回描画までのローディング表示（スケルトンの上に重ねる薄いスピナー） */}
      {!firstPaintReady && (
        <div className="map-loading" aria-hidden="true">
          <div className="map-loading-spinner" />
          <div className="map-loading-text">地図を読み込み中…</div>
        </div>
      )}

      {/* ホバーツールチップ */}
      {tooltip && !isMobile && (
        <div
          className={`map-tooltip ${tooltip.flip ? "is-flipped" : ""}`}
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="map-tooltip-name">{tooltip.name}</div>
          <div className="map-tooltip-rent">
            {tooltip.label} <strong>{tooltip.value}</strong>
          </div>
        </div>
      )}

      {/* 統合ヘッダー（固定） */}
      <header className="app-header">
        <div className="app-header-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className="brand-mark" width={30} height={30} />
          <div className="brand-name">KurashiMap</div>
        </div>
        <div className="app-header-search">
          <div className="search-input-wrap">
            <SearchIcon />
            <input
              type="search"
              placeholder="自治体名で検索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              aria-label="自治体検索"
              role="combobox"
              aria-expanded={filtered.length > 0}
              aria-controls="muni-search-listbox"
              aria-autocomplete="list"
              aria-activedescendant={activeIndex >= 0 && filtered[activeIndex] ? `sopt-${filtered[activeIndex].code}` : undefined}
            />
          </div>
          {filtered.length > 0 && (
            <ul id="muni-search-listbox" className="search-results" role="listbox" aria-label="自治体の検索候補">
              {filtered.map((m, i) => (
                <li key={m.code} role="presentation">
                  <button
                    id={`sopt-${m.code}`}
                    role="option"
                    aria-selected={i === activeIndex}
                    tabIndex={-1}
                    className={i === activeIndex ? "is-active" : undefined}
                    onClick={() => flyToMuni(m)}
                    onMouseEnter={() => setActiveIndex(i)}
                  >
                    <span className="search-place">
                      {searchContextLabel(m) && (
                        <span className="search-pref">{searchContextLabel(m)}</span>
                      )}
                      <span className="search-name">{m.name}</span>
                    </span>
                    <span className="search-rent">{hasRent(m.rent) ? `${m.rent.toLocaleString()}円` : "—"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {onMenuClick && (
          <button
            className="app-header-menu-btn"
            aria-label="エリア・ランキングのメニューを開く"
            onClick={onMenuClick}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span className="menu-btn-label">エリア・ランキング</span>
          </button>
        )}
      </header>

      {/* 塗り分け指標の切替（地図上のフローティング操作）。サイトナビ（ヘッダーの
          メニュー）と地図コントロールを役割で分け、ヘッダーに混在させない。 */}
      {firstPaintReady && (
        <div className={`map-layers ${layersOpen ? "is-open" : ""}`}>
          <button
            className={`map-layers-btn ${layersOpen ? "is-active" : ""}`}
            aria-label={`塗り分け指標を切り替え（現在: ${getMapMetric(activeMetric).label}）`}
            aria-expanded={layersOpen}
            onClick={() => setLayersOpen((v) => !v)}
          >
            <LayersIcon />
            <span className="map-layers-btn-label">{getMapMetric(activeMetric).label}</span>
          </button>
          {layersOpen && (
            <div className="layers-panel">
              <div className="layers-title">塗り分け指標</div>
              <div className="metric-radios" role="radiogroup" aria-label="塗り分け指標">
                {MAP_METRICS.map((m) => (
                  <label key={m.key} className={`metric-radio ${activeMetric === m.key ? "is-active" : ""}`}>
                    <input
                      type="radio"
                      name="map-metric"
                      checked={activeMetric === m.key}
                      onChange={() => { setActiveMetric(m.key); trackChangeMetric(m.key); }}
                    />
                    <span className="metric-radio-label">{m.label}</span>
                  </label>
                ))}
              </div>
              {/* 選択中の指標が「何の色か」を1行で説明（出典つき）。初見の文脈不足を補う */}
              <p className="layers-desc">{getMapMetric(activeMetric).description}</p>

              <div className="layers-title layers-title-sub">地図</div>
              <div className="filter-row">
                <div className="filter-segments" role="radiogroup" aria-label="地図スタイル">
                  {BASEMAPS.map((b) => (
                    <button
                      key={b.key}
                      className={`filter-seg ${basemap === b.key ? "is-active" : ""}`}
                      aria-pressed={basemap === b.key}
                      onClick={() => switchBasemap(b.key)}
                    >{b.label}</button>
                  ))}
                </div>
              </div>

              <div className="layers-title layers-title-sub">災害オーバーレイ</div>
              <div className="filter-row">
                <div className="filter-segments" role="radiogroup" aria-label="災害オーバーレイ">
                  <button
                    className={`filter-seg ${hazardKey === "none" ? "is-active" : ""}`}
                    aria-pressed={hazardKey === "none"}
                    onClick={() => setHazardKey("none")}
                  >なし</button>
                  {HAZARD_OVERLAYS.map((h) => (
                    <button
                      key={h.key}
                      className={`filter-seg ${hazardKey === h.key ? "is-active" : ""}`}
                      aria-pressed={hazardKey === h.key}
                      onClick={() => setHazardKey(h.key)}
                    >{h.label}</button>
                  ))}
                </div>
              </div>
              {getHazardOverlay(hazardKey) && (
                <p className="layers-desc">{getHazardOverlay(hazardKey)!.legend}</p>
              )}

              <div className="layers-title layers-title-sub">絞り込み</div>
              <SegmentedFilter
                label="家賃上限"
                options={RENT_MAX_OPTIONS}
                value={filters.rentMax}
                onChange={(v) => updateFilters({ ...filters, rentMax: v })}
              />
              <SegmentedFilter
                label="地価上限"
                options={LAND_MAX_OPTIONS}
                value={filters.landMax}
                onChange={(v) => updateFilters({ ...filters, landMax: v })}
              />
              <SegmentedFilter
                label="浸水深上限"
                options={FLOOD_MAX_OPTIONS}
                value={filters.floodMax}
                onChange={(v) => updateFilters({ ...filters, floodMax: v })}
              />
              {filterActive && (
                <div className="filter-summary" aria-live="polite">
                  <span className="filter-count">
                    全国該当 <strong>{matchedCount.toLocaleString()}</strong> 自治体
                    <span className="filter-count-note">（データなしの自治体は除外）</span>
                  </span>
                  <button className="filter-clear" onClick={() => setFilters(EMPTY_FILTERS)}>クリア</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 凡例（選択中の指標に追従）。初回描画完了まで出さず「凡例だけ先行」を防ぐ */}
      {firstPaintReady && <MetricLegend metricKey={activeMetric} hazardKey={hazardKey} />}

      {/* パネル / シート */}
      {!isMobile ? (
        <AreaPanel municipality={selectedDetail} selectedCode={selectedCode} related={relatedNearby} onClose={() => setSelectedCode(null)} />
      ) : (
        <MobileSheet municipality={selectedDetail} onClose={() => setSelectedCode(null)} />
      )}
    </div>
  );
}

// 検索候補に添える所属コンテキスト（都道府県名。政令市の区は「県名 市名」）。
// 同名自治体（府中市=東京/広島、北区=東京/大阪市/さいたま市…）の誤選択を防ぐ。
function searchContextLabel(m: MuniSummary): string {
  const prefName = getPrefByCode(m.code)?.nameJa ?? "";
  if (m.level === "ward" && m.displayName) {
    const city = m.displayName.replace(m.name, "").trim();
    if (city) return `${prefName} ${city}`.trim();
  }
  return prefName;
}

function MetricLegend({ metricKey, hazardKey }: { metricKey: MapMetricKey; hazardKey: HazardOverlayKey }) {
  const hazardOverlay = getHazardOverlay(hazardKey);
  const metric = getMapMetric(metricKey);
  const { legend } = metric;
  return (
    <div className="legend">
      <div className="legend-eyebrow">塗り分け中</div>
      <div className="legend-title">{metric.legendTitle}</div>
      {legend.kind === "numeric" ? (
        <>
          <div className="legend-bar">
            {legend.colors.map((c) => (
              <div key={c} className="legend-cell" style={{ background: c }} />
            ))}
          </div>
          {/* 4つの境界ラベルを5セルの境界（20/40/60/80%）に整列。
              space-between だと境界とラベル位置がずれて区切り値が曖昧になる。 */}
          <div className="legend-scale">
            {legend.scaleLabels.map((s, i) => (
              <span key={s} style={{ left: `${((i + 1) * 100) / legend.colors.length}%` }}>{s}</span>
            ))}
          </div>
        </>
      ) : (
        <div className="legend-cats">
          {legend.items.map((it) => (
            <div key={it.label} className="legend-cat">
              <span className="legend-cell" style={{ background: it.color }} />
              {it.label}
            </div>
          ))}
        </div>
      )}
      <div className="legend-nodata">
        <span className="legend-cell" style={{ background: RENT_NODATA_COLOR }} />
        {metric.nodataLabel}
      </div>
      {hazardOverlay && (
        <>
          <div className="legend-overlay">
            <span className="legend-cell legend-hazard-cell" />
            {hazardOverlay.legend}
          </div>
          <div className="legend-overlay-note">
            拡大すると実際の区域を表示（出典: ハザードマップポータル）
          </div>
        </>
      )}
    </div>
  );
}

function LayersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function SegmentedFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { label: string; value: number }[];
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="filter-row">
      <span className="filter-row-label">{label}</span>
      <div className="filter-segments" role="group" aria-label={label}>
        <button
          className={`filter-seg ${value == null ? "is-active" : ""}`}
          aria-pressed={value == null}
          onClick={() => onChange(null)}
        >
          なし
        </button>
        {options.map((o) => (
          <button
            key={o.value}
            className={`filter-seg ${value === o.value ? "is-active" : ""}`}
            aria-pressed={value === o.value}
            onClick={() => onChange(value === o.value ? null : o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// 災害リスク オーバーレイの色（amber-800）。寒色の家賃コロプレスや紫⇔緑の
// 人口トレンド上でも沈まない警告色。凡例のハッチ見本とも共有する。
const HAZARD_HATCH_COLOR = "#b45309";

// 浸水深ランク（floodLevel 1..6）に応じてハッチの不透明度を段階化（深いほど濃い）。
// 下のコロプレスが透ける上限（0.82）に抑える。filter で floodLevel>0 のみ描画。
const HAZARD_DEPTH_OPACITY = [
  "step", ["get", "floodLevel"],
  0,
  1, 0.34, 2, 0.44, 3, 0.54, 4, 0.64, 5, 0.74, 6, 0.82,
] as unknown as DataDrivenPropertyValueSpecification<number>;

// 「浸水想定あり」を示す 45° 斜線ハッチ画像を map に登録する。fill-color の
// ベタ塗りと違い、下のコロプレス色を保ったまま重ねられる。
// 現ベース地図の「道路名・水系名等」ラベル群（place=地名は除く）を控える。
// 選択時の減光に使う。スタイル切替後にも呼んで取り直す。
function collectBaseLabels(
  map: MapLibreMap,
  ref: { ids: string[]; text: Map<string, unknown>; icon: Map<string, unknown> },
) {
  const layers = map.getStyle().layers ?? [];
  const ids = layers
    .filter((l) => l.type === "symbol" && (l as { "source-layer"?: string })["source-layer"] !== "place")
    .map((l) => l.id);
  ref.ids = ids;
  ref.text.clear();
  ref.icon.clear();
  for (const id of ids) {
    ref.text.set(id, map.getPaintProperty(id, "text-opacity"));
    ref.icon.set(id, map.getPaintProperty(id, "icon-opacity"));
  }
}

function ensureHazardPattern(map: MapLibreMap) {
  if (map.hasImage("hazard-hatch")) return;
  const size = 12;
  const cnv = document.createElement("canvas");
  cnv.width = cnv.height = size;
  const ctx = cnv.getContext("2d");
  if (!ctx) return;
  ctx.strokeStyle = HAZARD_HATCH_COLOR;
  ctx.lineWidth = 1.1;
  ctx.lineCap = "round";
  // タイル境界で斜線が連続するよう、隅を補う3本を引く
  ctx.beginPath();
  ctx.moveTo(0, size); ctx.lineTo(size, 0);
  ctx.moveTo(-1, 1); ctx.lineTo(1, -1);
  ctx.moveTo(size - 1, size + 1); ctx.lineTo(size + 1, size - 1);
  ctx.stroke();
  const img = ctx.getImageData(0, 0, size, size);
  map.addImage("hazard-hatch", { width: size, height: size, data: new Uint8Array(img.data) });
}

function computeBbox(geom: GeoJSON.Geometry): [[number, number], [number, number]] | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visit = (coords: unknown) => {
    if (typeof coords === "number") return;
    if (Array.isArray(coords)) {
      if (typeof coords[0] === "number" && typeof coords[1] === "number") {
        const x = coords[0] as number;
        const y = coords[1] as number;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        return;
      }
      for (const c of coords) visit(c);
    }
  };
  if (geom.type === "Polygon" || geom.type === "MultiPolygon") {
    visit(geom.coordinates);
  } else {
    return null;
  }
  if (!isFinite(minX)) return null;
  return [[minX, minY], [maxX, maxY]];
}
