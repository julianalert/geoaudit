import { NextRequest, NextResponse, after } from "next/server";
import { getSupabase } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms)
    ),
  ]);
}

async function generatePremiumContent(auditId: string, brand: string, category: string, result: any) {
  const awarenessScore = result?.awareness?.score ?? 0;
  const posScore = result?.positioning?.score ?? 0;
  const recScore = result?.recommendation?.score ?? 0;
  const compScore = result?.competitive?.score ?? 0;
  const wins = result?.competitive?.wins ?? [];
  const losses = result?.competitive?.losses ?? [];
  const overallVerdict = result?.overallVerdict ?? "";
  const posInsight = result?.positioning?.insight ?? "";
  const recInsight = result?.recommendation?.insight ?? "";

  const auditSummary = `
Brand: ${brand}
Category: ${category}
Overall verdict: ${overallVerdict}
Awareness score: ${awarenessScore}/100
Positioning score: ${posScore}/100
Recommendation rank score: ${recScore}/100
Competitive score: ${compScore}/100
Competitive wins: ${wins.join(", ") || "none identified"}
Competitive losses: ${losses.join(", ") || "none identified"}
Positioning insight: ${posInsight}
Recommendation insight: ${recInsight}
`.trim();

  // ── Generate Source Attribution ──
  let sourceAttribution = null;
  try {
    const saRes = await withTimeout(
      getAnthropic().messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
        messages: [{
          role: "user",
          content: `You are analyzing an LLM visibility audit for "${brand}" in the "${category}" space.

${auditSummary}

Based on this data, identify the most important citation sources that influence how LLMs perceive brands in this space, and assess ${brand}'s likely presence on each.

Return JSON only, no markdown:
{
  "sources": [
    {
      "domain": "source name (e.g. G2, Reddit, Capterra, LinkedIn, YouTube, etc.)",
      "status": "strong" | "weak" | "missing",
      "note": "one sentence on why this source matters and what it means for ${brand}",
      "priority": "high" | "medium" | "low"
    }
  ],
  "insight": "one sharp sentence identifying the single biggest source gap for ${brand}"
}

Return exactly 6 sources ranked by importance for LLM training data in the ${category} space.`,
        }],
      }),
      30_000
    );
    const text = saRes.content[0]?.type === "text" ? saRes.content[0].text : "{}";
    const cleaned = text.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    sourceAttribution = JSON.parse(cleaned);
  } catch (e) {
    console.error("Source attribution generation failed:", e);
    sourceAttribution = null;
  }

  // ── Generate 30-Day Roadmap ──
  let roadmap = null;
  try {
    const rmRes = await withTimeout(
      getAnthropic().messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `You are creating a personalized 30-day LLM visibility action plan for "${brand}" in the "${category}" space.

${auditSummary}

Create a week-by-week action plan that directly addresses the specific gaps found in this audit. Be concrete and actionable — no generic advice.

Return JSON only, no markdown:
{
  "weeks": [
    {
      "week": "WEEK 1",
      "actions": [
        {
          "action": "specific, actionable task (max 15 words)",
          "impact": "High" | "Medium" | "Low",
          "category": "awareness" | "positioning" | "recommendation" | "attribution"
        }
      ]
    }
  ],
  "insight": "one sentence on the single highest-leverage action for ${brand} right now"
}

Return exactly 4 weeks (WEEK 1 through WEEK 4), 2 actions per week. Sequence from quick wins (week 1) to deeper structural fixes (week 4).`,
        }],
      }),
      30_000
    );
    const text = rmRes.content[0]?.type === "text" ? rmRes.content[0].text : "{}";
    const cleaned = text.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    roadmap = JSON.parse(cleaned);
  } catch (e) {
    console.error("Roadmap generation failed:", e);
    roadmap = null;
  }

  // ── Merge into existing result and save ──
  const updatedResult = {
    ...result,
    sourceAttribution,
    roadmap,
  };

  await getSupabase()
    .from("audits")
    .update({ result: updatedResult })
    .eq("id", auditId);
}

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

  // Fetch the existing audit to get brand, category, result
  const { data: audit, error: fetchErr } = await getSupabase()
    .from("audits")
    .select("id, brand, category, result, unlocked")
    .eq("id", id)
    .single();

  if (fetchErr || !audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  // Set unlocked immediately so the UI reacts right away
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

  // Generate premium content in the background (non-blocking)
  after(async () => {
    try {
      await generatePremiumContent(id, audit.brand, audit.category, audit.result);
    } catch (err) {
      console.error("Premium content generation failed:", err);
    }
  });

  return NextResponse.json({ success: true, id, generating: true });
}
