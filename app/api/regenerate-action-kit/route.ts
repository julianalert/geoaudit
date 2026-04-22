import { NextRequest, NextResponse, after } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { generatePremiumContent } from "@/lib/generate-premium-content";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

// ── Per-audit regeneration rate limit ────────────────────────
// Prevents cost abuse: any caller who knows an unlocked auditId could
// spam this endpoint to run up Perplexity + Claude bills indefinitely.
// A proper fix requires a per-purchase customer token (stored in DB at
// checkout) - this in-memory guard limits the blast radius in the interim.
const _regenMap = new Map<string, number[]>();
const REGEN_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 h
const REGEN_MAX = 3;

function checkRegenRateLimit(auditId: string): boolean {
  const now = Date.now();
  const timestamps = (_regenMap.get(auditId) ?? []).filter(
    (t) => t > now - REGEN_WINDOW_MS
  );
  if (timestamps.length >= REGEN_MAX) return false;
  timestamps.push(now);
  _regenMap.set(auditId, timestamps);
  return true;
}

// Re-runs the Action Kit generators for an already-unlocked audit.
// Useful when a section came back empty (e.g. the roadmap hitting the token
// cap and truncating mid-JSON).
export async function POST(req: NextRequest) {
  const { auditId } = await req.json().catch(() => ({}));
  if (!auditId || typeof auditId !== "string") {
    return NextResponse.json({ error: "Missing auditId" }, { status: 400 });
  }

  const { data: audit, error } = await getSupabase()
    .from("audits")
    .select("id, brand, category, website_url, unlocked, result")
    .eq("id", auditId)
    .single();

  if (error || !audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  if (!audit.unlocked) {
    return NextResponse.json({ error: "Audit is not unlocked" }, { status: 402 });
  }

  if (!checkRegenRateLimit(auditId)) {
    return NextResponse.json(
      { error: "Regeneration limit reached. Max 3 regenerations per 24 hours." },
      { status: 429 }
    );
  }

  console.log(`[regenerate-action-kit] Regenerating Action Kit for audit ${auditId}`);

  after(async () => {
    try {
      await generatePremiumContent(
        audit.id,
        audit.brand,
        audit.category,
        audit.website_url || "",
        audit.result
      );
    } catch (err) {
      console.error("[regenerate-action-kit] Regeneration failed:", err);
    }
  });

  return NextResponse.json({ queued: true });
}
