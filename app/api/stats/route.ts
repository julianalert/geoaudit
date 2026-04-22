import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 300;

// Lightweight public counter surfaced on the landing page as social proof.
// Cached at the edge for 5 minutes to avoid DB hammering.
export async function GET() {
  try {
    const { count, error } = await getSupabase()
      .from("audits")
      .select("id", { head: true, count: "exact" });
    if (error) return NextResponse.json({ count: null });
    return NextResponse.json(
      { count: count ?? 0 },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch {
    return NextResponse.json({ count: null });
  }
}
