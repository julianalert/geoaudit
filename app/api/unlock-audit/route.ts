import { NextRequest, NextResponse, after } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { generatePremiumContent } from "@/lib/generate-premium-content";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { id?: string; stripe_payment_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, stripe_payment_id } = body;
  if (!id) {
    return NextResponse.json({ error: "Missing audit id" }, { status: 400 });
  }

  const { data: audit, error: fetchErr } = await getSupabase()
    .from("audits")
    .select("id, brand, category, result, unlocked")
    .eq("id", id)
    .single();

  if (fetchErr || !audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  const { error: updateErr } = await getSupabase()
    .from("audits")
    .update({
      unlocked: true,
      unlocked_at: new Date().toISOString(),
      ...(stripe_payment_id ? { stripe_payment_id } : {}),
    })
    .eq("id", id);

  if (updateErr) {
    console.error("unlock-audit update error:", updateErr);
    return NextResponse.json({ error: "Failed to unlock audit" }, { status: 500 });
  }

  after(async () => {
    try {
      await generatePremiumContent(id, audit.brand, audit.category, audit.result);
    } catch (err) {
      console.error("Premium content generation failed:", err);
    }
  });

  return NextResponse.json({ success: true, id, generating: true });
}
