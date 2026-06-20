"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Municipality, MuniSummary } from "@/lib/types";
import { PREFS, getPrefByCode } from "@/lib/prefs";
import { RENT_NODATA_COLOR, hasRent } from "@/lib/rentColor";
import { MAP_METRICS, getMapMetric, DEFAULT_METRIC_KEY, TREND_PROPERTY, type MapMetricKey } from "@/lib/mapMetrics";
import AreaPanel from "./AreaPanel";
import MobileSheet from "./MobileSheet";

type Props = { summary: MuniSummary[] };

const WARDS_MIN_ZOOM = 11;
const MUNI_MIN_ZOOM = 7.5;       // 市区町村レイヤーを出すズーム
const PREF_FADE_END_ZOOM = 9;    // 都道府県レイヤーの fill が完全に消えるズーム
const PREF_CLICK_MAX_ZOOM = 8;   // この zoom 以下で pref クリックを fly-in 扱い

// OpenFreeMap の Positron スタイル（Mapbox Light 相当の軽量モノクロ基盤）
// CORS 対応、トークン不要、Apache-2.0
const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const SAITAMA_BBOX: [number, number, number, number] = [138.71, 35.74, 139.91, 36.29];

export default function MapView({ summary }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const muniGeoRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const wardsGeoRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const prefGeoRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const ensurePrefsRef = useRef<((slugs: string[]) => Promise<void>) | null>(null);
  const selectedCodeRef = useRef<string | null>(null);
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

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [hazardOn, setHazardOn] = useState(true);
  const [activeMetric, setActiveMetric] = useState<MapMetricKey>(DEFAULT_METRIC_KEY);
  const [isMobile, setIsMobile] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mapReady, setMapReady] = useState(false);
  // 初回ビューのポリゴンが描画され切るまで true にしない（凡例先行・白地図対策）
  const [firstPaintReady, setFirstPaintReady] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string; label: string; value: string } | null>(null);
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
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: [139.31, 36.015],
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
          hasFloodRisk: m.hasFloodRisk ? 1 : 0,
        };
      }
    };

    map.on("load", async () => {
      map.fitBounds(SAITAMA_BBOX, { padding: 40, duration: 0 });
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
      const dimIds = allLayers
        .filter((l) => l.type === "symbol" && (l as { "source-layer"?: string })["source-layer"] !== "place")
        .map((l) => l.id);
      labelDimRef.current.ids = dimIds;
      for (const id of dimIds) {
        labelDimRef.current.text.set(id, map.getPaintProperty(id, "text-opacity"));
        labelDimRef.current.icon.set(id, map.getPaintProperty(id, "icon-opacity"));
      }

      map.addSource("prefectures", { type: "geojson", data: prefGeo, promoteId: "code" });
      map.addSource("muni", { type: "geojson", data: geo, promoteId: "code" });
      map.addSource("wards", { type: "geojson", data: wardsGeo, promoteId: "code" });

      // 地名ラベル等の symbol レイヤーより下にコロプレスを差し込む
      const firstSymbolId = allLayers.find((l) => l.type === "symbol")?.id;

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
          "fill-color": getMapMetric(DEFAULT_METRIC_KEY).colorExpression() as maplibregl.DataDrivenPropertyValueSpecification<string>,
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false], 0.62,
            ["boolean", ["feature-state", "hover"], false], 0.52,
            0.32,
          ],
        },
      }, firstSymbolId);
      // 災害リスク オーバーレイ（さらに弱く）
      map.addLayer({
        id: "muni-hazard",
        type: "fill",
        source: "muni",
        minzoom: MUNI_MIN_ZOOM,
        filter: ["==", ["get", "hasFloodRisk"], 1],
        paint: {
          "fill-color": "#1d4ed8",
          "fill-opacity": 0.08,
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
          "fill-color": getMapMetric(DEFAULT_METRIC_KEY).colorExpression() as maplibregl.DataDrivenPropertyValueSpecification<string>,
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false], 0.62,
            ["boolean", ["feature-state", "hover"], false], 0.52,
            0.32,
          ],
        },
      }, firstSymbolId);
      map.addLayer({
        id: "wards-hazard",
        type: "fill",
        source: "wards",
        minzoom: WARDS_MIN_ZOOM,
        filter: ["==", ["get", "hasFloodRisk"], 1],
        paint: { "fill-color": "#1d4ed8", "fill-opacity": 0.08 },
      }, firstSymbolId);
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

      const onPolyClick = (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        const f = e.features?.[0];
        if (!f) return;
        const code = String(f.properties?.code ?? "");
        setSelectedCode(code);
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
          padding: sp ? { top: 80, bottom: 220, left: 24, right: 24 } : { top: 60, bottom: 60, left: 60, right: 60 },
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
        (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
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
          setTooltip({
            x: e.point.x,
            y: e.point.y,
            name: String(f.properties?.name ?? ""),
            label: metric.label,
            value: metric.formatValue(f.properties?.[propKey]),
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
        (map.getSource("muni") as maplibregl.GeoJSONSource | undefined)?.setData(muniGeoRef.current!);
        (map.getSource("wards") as maplibregl.GeoJSONSource | undefined)?.setData(wardsGeoRef.current!);
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

      // 初期ビュー(埼玉付近)の県ポリゴンを await し、描画が落ち着いてから
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

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [byCode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setLayoutProperty("muni-hazard", "visibility", hazardOn ? "visible" : "none");
    map.setLayoutProperty("wards-hazard", "visibility", hazardOn ? "visible" : "none");
  }, [hazardOn, mapReady]);

  // 指標切替：muni/wards の fill-color を選択中メトリックの式に差し替える
  useEffect(() => {
    activeMetricRef.current = activeMetric;
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const expr = getMapMetric(activeMetric).colorExpression() as maplibregl.DataDrivenPropertyValueSpecification<string>;
    map.setPaintProperty("muni-fill", "fill-color", expr);
    map.setPaintProperty("wards-fill", "fill-color", expr);
  }, [activeMetric, mapReady]);

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
    municipalities.forEach((m) => {
      map.setFeatureState({ source: "muni", id: m.code }, { selected: m.code === selectedCode });
    });
    wards.forEach((m) => {
      map.setFeatureState({ source: "wards", id: m.code }, { selected: m.code === selectedCode });
    });
  }, [selectedCode, mapReady, municipalities, wards]);

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
      ? { top: 80, bottom: 220, left: 24, right: 24 }
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
    setSearchQuery("");
    // 検索で他県を選んだ場合、その県がまだ遅延ロードされていなければ先に取得
    const pref = getPrefByCode(m.code);
    if (pref) await ensurePrefsRef.current?.([pref.slug]);
    flyToCode(m.code);
  }, [flyToCode]);

  // パネル開閉はフル詳細の取得完了で判定（取得中の一瞬は閉のまま）
  const rootClass = [
    "map-root",
    selectedDetail && isMobile ? "is-sheet-open" : "",
    selectedDetail && !isMobile ? "is-panel-open" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={rootClass}>
      <div ref={containerRef} className="map-canvas" />

      {/* 初回描画までのローディングオーバーレイ（白地図・凡例先行の体感を解消） */}
      {!firstPaintReady && (
        <div className="map-loading" aria-hidden="true">
          <div className="map-loading-spinner" />
          <div className="map-loading-text">地図を読み込み中…</div>
        </div>
      )}

      {/* ホバーツールチップ */}
      {tooltip && !isMobile && (
        <div
          className="map-tooltip"
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
          <div className="brand-mark" />
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
              aria-label="自治体検索"
            />
          </div>
          {filtered.length > 0 && (
            <ul className="search-results">
              {filtered.map((m) => (
                <li key={m.code}>
                  <button onClick={() => flyToMuni(m)}>
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
        {firstPaintReady && (
          <button
            className={`app-header-layers-btn ${layersOpen ? "is-active" : ""}`}
            aria-label="レイヤーを開閉"
            aria-expanded={layersOpen}
            onClick={() => setLayersOpen((v) => !v)}
          >
            <LayersIcon />
            <span className="layers-btn-label">{getMapMetric(activeMetric).label}</span>
          </button>
        )}
      </header>

      {/* レイヤーパネル（デフォルト展開、ヘッダー右下） */}
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
                  onChange={() => setActiveMetric(m.key)}
                />
                <span className="metric-radio-label">{m.label}</span>
              </label>
            ))}
          </div>
          <div className="layers-title layers-title-sub">オーバーレイ</div>
          <LayerToggle label="災害リスク" checked={hazardOn} onChange={setHazardOn} />
        </div>
      )}

      {/* 凡例（選択中の指標に追従）。初回描画完了まで出さず「凡例だけ先行」を防ぐ */}
      {firstPaintReady && <MetricLegend metricKey={activeMetric} />}

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

function MetricLegend({ metricKey }: { metricKey: MapMetricKey }) {
  const metric = getMapMetric(metricKey);
  const { legend } = metric;
  return (
    <div className="legend">
      <div className="legend-title">{metric.legendTitle}</div>
      {legend.kind === "numeric" ? (
        <>
          <div className="legend-bar">
            {legend.colors.map((c) => (
              <div key={c} className="legend-cell" style={{ background: c }} />
            ))}
          </div>
          <div className="legend-scale">
            {legend.scaleLabels.map((s) => (
              <span key={s}>{s}</span>
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

function LayerToggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`layer-toggle ${disabled ? "is-disabled" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span className="layer-switch" />
      <span className="layer-label">{label}</span>
    </label>
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
