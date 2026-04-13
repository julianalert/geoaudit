import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "@/lib/supabase";

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

function buildAuditSummary(brand: string, category: string, result: any): string {
  return `
Brand: ${brand}
Category: ${category}
Overall verdict: ${result?.overallVerdict ?? ""}
Awareness score: ${result?.awareness?.score ?? 0}/100
Positioning score: ${result?.positioning?.score ?? 0}/100
Recommendation rank score: ${result?.recommendation?.score ?? 0}/100
Competitive score: ${result?.competitive?.score ?? 0}/100
Competitive wins: ${(result?.competitive?.wins ?? []).join(", ") || "none identified"}
Competitive losses: ${(result?.competitive?.losses ?? []).join(", ") || "none identified"}
Positioning insight: ${result?.positioning?.insight ?? ""}
Recommendation insight: ${result?.recommendation?.insight ?? ""}
`.trim();
}

async function generateSourceAttribution(brand: string, category: string, auditSummary: string) {
  const res = await withTimeout(
    getAnthropic().messages.create({
      model: "claude-sonnet-4-6",
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
    25_000
  );
  const text = res.content[0]?.type === "text" ? res.content[0].text : "{}";
  return JSON.parse(text.replace(/```json\s*/g, "").replace(/```/g, "").trim());
}

async function generateRoadmap(brand: string, category: string, auditSummary: string) {
  const res = await withTimeout(
    getAnthropic().messages.create({
      model: "claude-sonnet-4-6",
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
    25_000
  );
  const text = res.content[0]?.type === "text" ? res.content[0].text : "{}";
  return JSON.parse(text.replace(/```json\s*/g, "").replace(/```/g, "").trim());
}

export async function generatePremiumContent(
  auditId: string,
  brand: string,
  category: string,
  result: any
) {
  const auditSummary = buildAuditSummary(brand, category, result);

  console.log(`[premium-content] Starting generation for audit ${auditId} (${brand})`);

  // Run both calls in parallel — cuts total time from ~60s to ~25s
  const [sourceAttribution, roadmap] = await Promise.allSettled([
    generateSourceAttribution(brand, category, auditSummary),
    generateRoadmap(brand, category, auditSummary),
  ]);

  const saValue = sourceAttribution.status === "fulfilled" ? sourceAttribution.value : null;
  const rmValue = roadmap.status === "fulfilled" ? roadmap.value : null;

  if (sourceAttribution.status === "rejected") {
    console.error(`[premium-content] Source attribution failed for ${auditId}:`, sourceAttribution.reason);
  }
  if (roadmap.status === "rejected") {
    console.error(`[premium-content] Roadmap failed for ${auditId}:`, roadmap.reason);
  }

  const updatedResult = { ...result, sourceAttribution: saValue, roadmap: rmValue };

  const { error } = await getSupabase()
    .from("audits")
    .update({ result: updatedResult })
    .eq("id", auditId);

  if (error) {
    console.error(`[premium-content] DB update failed for ${auditId}:`, error);
  } else {
    console.log(`[premium-content] Done for audit ${auditId} — sa:${saValue ? "✓" : "✗"} rm:${rmValue ? "✓" : "✗"}`);
  }
}
