import { ImageResponse } from "next/og";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const alt = "GEO Audit - LLM Visibility Report";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Per-audit share image. Rendered via Next.js ImageResponse (Edge satori),
// so no external image service is required.
export default async function OgImage({ params }: { params: { id: string } }) {
  const { data } = await getSupabase()
    .from("audits")
    .select("brand, category, overall_score, overall_verdict")
    .eq("id", params.id)
    .single();

  const brand = data?.brand ?? "Brand";
  const category = data?.category ?? "";
  const score = data?.overall_score ?? 0;
  const verdict = data?.overall_verdict && data.overall_verdict !== "pending" ? data.overall_verdict : "In Progress";
  const color = score >= 70 ? "#3b82f6" : score >= 45 ? "#fbbf24" : "#f87171";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#f8fafc",
          padding: "72px 88px",
          fontFamily: "Inter, sans-serif",
          color: "#0f172a",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "linear-gradient(#3b82f622 1px, transparent 1px), linear-gradient(90deg, #3b82f622 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            opacity: 0.35,
            display: "flex",
          }}
        />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 12, height: 12, borderRadius: 999, background: "#3b82f6", boxShadow: "0 0 18px #3b82f6" }} />
          <div style={{ fontSize: 22, letterSpacing: 4, color: "#64748b", fontFamily: "monospace" }}>GEO AUDIT REPORT</div>
        </div>
        <div style={{ position: "relative", fontSize: 76, fontWeight: 800, lineHeight: 1, marginBottom: 16, letterSpacing: -2, display: "flex", flexDirection: "column" }}>
          <div style={{ color: "#0f172a" }}>LLM VISIBILITY:</div>
          <div style={{ color }}>{brand.toUpperCase()}</div>
        </div>
        <div style={{ position: "relative", fontSize: 26, color: "#475569", marginBottom: "auto", display: "flex" }}>
          {category}
        </div>

        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 20, letterSpacing: 3, color: "#64748b", fontFamily: "monospace", marginBottom: 8 }}>OVERALL VERDICT</div>
            <div style={{ fontSize: 44, fontWeight: 800, color, letterSpacing: -1 }}>{verdict.toUpperCase()}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ width: 200, height: 200, borderRadius: 100, background: "#ffffff", border: `12px solid ${color}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 72, fontWeight: 800, color, lineHeight: 1 }}>{score}</div>
              <div style={{ fontSize: 16, color: "#94a3b8", fontFamily: "monospace", letterSpacing: 2 }}>/ 100</div>
            </div>
          </div>
        </div>

        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, paddingTop: 20, borderTop: "2px solid #e2e8f0" }}>
          <div style={{ fontSize: 20, color: "#64748b", fontFamily: "monospace", letterSpacing: 2 }}>GPT-4O · CLAUDE · GEMINI</div>
          <div style={{ fontSize: 20, color: "#3b82f6", fontFamily: "monospace", letterSpacing: 2 }}>NOTANOTHERMARKETER.COM</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
