import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Embeddable "Verified GEO Score" badge. Brands can drop this on their site:
//
//   <a href="https://notanothermarketer.com/audit/<id>" target="_blank">
//     <img src="https://notanothermarketer.com/embed/<id>/badge.svg" alt="Verified GEO Score" />
//   </a>
//
// Cached for 5 minutes since scores don't swing by the second.

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const { data } = await getSupabase()
    .from("audits")
    .select("brand, overall_score, overall_verdict, status")
    .eq("id", id)
    .single();

  const score = data?.overall_score ?? 0;
  const verdict = (data?.overall_verdict && data.overall_verdict !== "pending" ? data.overall_verdict : "Pending").toUpperCase();
  const brand = (data?.brand ?? "BRAND").toUpperCase();
  const color = score >= 70 ? "#3b82f6" : score >= 45 ? "#fbbf24" : "#f87171";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="88" viewBox="0 0 260 88" role="img" aria-label="GEO Audit score ${score} of 100 for ${brand}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#f8fafc"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="259" height="87" rx="10" fill="url(#bg)" stroke="${color}" stroke-opacity="0.4"/>
  <g font-family="'Space Mono', ui-monospace, monospace">
    <text x="18" y="24" font-size="9" fill="#64748b" letter-spacing="2">VERIFIED GEO SCORE</text>
    <text x="18" y="48" font-size="22" font-weight="700" fill="#0f172a" font-family="'Space Grotesk', 'Inter', sans-serif" letter-spacing="-0.5">${escapeXml(brand).slice(0, 18)}</text>
    <text x="18" y="70" font-size="10" fill="${color}" letter-spacing="1.5">${escapeXml(verdict)}</text>
  </g>
  <g transform="translate(172, 44)">
    <circle cx="0" cy="0" r="32" fill="#ffffff" stroke="#e2e8f0" stroke-width="4"/>
    <circle cx="0" cy="0" r="32" fill="none" stroke="${color}" stroke-width="4"
            stroke-dasharray="${(score / 100) * 201} 201"
            stroke-dashoffset="0"
            transform="rotate(-90)"
            stroke-linecap="round"/>
    <text x="0" y="4" text-anchor="middle" font-size="22" font-weight="800" fill="${color}" font-family="'Space Grotesk', 'Inter', sans-serif">${score}</text>
    <text x="0" y="20" text-anchor="middle" font-size="8" fill="#94a3b8" font-family="'Space Mono', monospace" letter-spacing="1">/100</text>
  </g>
</svg>`;

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string));
}
