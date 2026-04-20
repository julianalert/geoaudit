import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { data, error } = await getSupabase()
    .from("audits")
    .select("id, status, brand, category, website_url, result, overall_score, overall_verdict, unlocked, unlocked_at, created_at")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  // Fetch score history: last 5 completed audits for the same brand (excluding current)
  const { data: history } = await getSupabase()
    .from("audits")
    .select("id, overall_score, created_at")
    .eq("brand", data.brand)
    .eq("status", "complete")
    .neq("id", id)
    .order("created_at", { ascending: false })
    .limit(5);

  return NextResponse.json({ ...data, scoreHistory: history ?? [] });
}
