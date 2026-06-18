import { ImageResponse } from "next/og";
import { getMunicipality } from "@/lib/metrics";
import { PREF_NAMES_JA } from "@/lib/site";

export const runtime = "edge";

const OG_SIZE = { width: 1200, height: 630 };

export async function GET(
  _req: Request,
  { params }: { params: { code: string } },
) {
  const m = await getMunicipality(params.code);
  if (!m) {
    return new Response("not found", { status: 404 });
  }
  const prefName = PREF_NAMES_JA[m.pref] ?? m.pref;
  // 区の場合はパンくず的に "埼玉県 / さいたま市" を上に出し、見出しは "浦和区" のみ
  const parent = m.parentCode ? await getMunicipality(m.parentCode) : null;
  const breadcrumbText = parent ? `${prefName} / ${parent.name}` : prefName;
  const heading = m.name;
  const rent = m.rent.value.toLocaleString();
  const pop = m.population.toLocaleString();
  // ImageResponse の組込フォントには U+33A1 (㎡) のグリフが無いため m² に置換
  const landUnit = (m.landPrice.unit || "").replace("㎡", "m²");
  const land = `${m.landPrice.value.toLocaleString()}${landUnit ? ` ${landUnit}` : ""}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, #eff6ff 0%, #dbeafe 45%, #bfdbfe 100%)",
          display: "flex",
          flexDirection: "column",
          padding: "64px 72px",
          fontFamily: "sans-serif",
          color: "#0f172a",
          position: "relative",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "linear-gradient(135deg, #60a5fa, #2563eb 60%, #1e3a8a)",
              boxShadow: "inset 0 -2px 6px rgba(0,0,0,0.18), 0 4px 12px rgba(37,99,235,0.4)",
            }}
          />
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.01em" }}>
            MachiMap
          </div>
        </div>

        {/* Title */}
        <div style={{ marginTop: 56, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 26, color: "#475569", fontWeight: 600 }}>
            {breadcrumbText}
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 96,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              color: "#0f172a",
            }}
          >
            {heading}
          </div>
          <div style={{ marginTop: 8, fontSize: 28, color: "#1e3a8a", fontWeight: 600 }}>
            の住みやすさ
          </div>
        </div>

        {/* Stats row */}
        <div style={{ marginTop: "auto", display: "flex", gap: 24 }}>
          <Stat label="家賃中央値" value={`${rent}円/月`} accent />
          <Stat label="人口" value={`${pop}人`} />
          <Stat label="地価" value={land} />
        </div>

        {/* Footer */}
        <div
          style={{
            position: "absolute",
            right: 72,
            top: 72,
            fontSize: 18,
            color: "#64748b",
            fontWeight: 600,
            background: "rgba(255,255,255,0.7)",
            padding: "6px 14px",
            borderRadius: 999,
            border: "1px solid rgba(15,23,42,0.08)",
          }}
        >
          machi-map.vercel.app
        </div>
      </div>
    ),
    OG_SIZE,
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: accent ? "#1e3a8a" : "rgba(255,255,255,0.85)",
        color: accent ? "#ffffff" : "#0f172a",
        padding: "16px 24px",
        borderRadius: 16,
        border: accent ? "none" : "1px solid rgba(15,23,42,0.08)",
        boxShadow: accent
          ? "0 12px 30px rgba(30,58,138,0.35)"
          : "0 4px 12px rgba(15,23,42,0.08)",
      }}
    >
      <span style={{ fontSize: 16, opacity: 0.8, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 36, fontWeight: 800, marginTop: 4, letterSpacing: "-0.01em" }}>
        {value}
      </span>
    </div>
  );
}
