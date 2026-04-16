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

function safeParseJSON(text: string): any {
  try { return JSON.parse(text); } catch {}
  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return null;
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

async function generateOnlinePresence(brand: string, category: string, websiteUrl: string) {
  const res = await withTimeout(
    fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          {
            role: "system",
            content: "You are a research analyst. Search the web and provide factual findings. Respond with valid JSON only.",
          },
          {
            role: "user",
            content: `Search for real information about "${brand}" (${websiteUrl}) in the "${category}" space.

Find where this brand actually has a presence online. Check for:
- Review platforms (G2, Capterra, TrustRadius, Product Hunt)
- Community discussions (Reddit, Hacker News, Stack Overflow)
- Social media and content (LinkedIn, Twitter/X, YouTube)
- Industry blogs and media coverage

For each platform, report what you actually found — not guesses.

Return JSON only:
{
  "sources": [
    {
      "domain": "platform name",
      "status": "strong" | "weak" | "missing",
      "note": "what you actually found (be specific — mention review counts, post dates, follower counts if available)",
      "priority": "high" | "medium" | "low"
    }
  ],
  "insight": "one sentence identifying the single biggest online presence gap for ${brand}"
}

Return exactly 6 sources ranked by importance for AI/LLM training data in the ${category} space.`,
          },
        ],
        max_tokens: 800,
      }),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`Perplexity ${r.status}`);
      return r.json();
    }),
    30_000
  );
  const text = res.choices?.[0]?.message?.content ?? "{}";
  const parsed = safeParseJSON(text);
  if (!parsed) throw new Error("Failed to parse online presence JSON");
  return parsed;
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
          "category": "awareness" | "positioning" | "recommendation" | "online-presence"
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
  const text = res.content[0]?.type === "text" ? res.content[0].text : "{}";
  return JSON.parse(text.replace(/```json\s*/g, "").replace(/```/g, "").trim());
}

export async function generatePremiumContent(
  auditId: string,
  brand: string,
  category: string,
  websiteUrl: string,
  result: any
) {
  const auditSummary = buildAuditSummary(brand, category, result);

  console.log(`[premium-content] Starting generation for audit ${auditId} (${brand})`);

  const [onlinePresence, roadmap] = await Promise.allSettled([
    generateOnlinePresence(brand, category, websiteUrl),
    generateRoadmap(brand, category, auditSummary),
  ]);

  const opValue = onlinePresence.status === "fulfilled" ? onlinePresence.value : null;
  const rmValue = roadmap.status === "fulfilled" ? roadmap.value : null;

  if (onlinePresence.status === "rejected") {
    console.error(`[premium-content] Online presence failed for ${auditId}:`, onlinePresence.reason);
  }
  if (roadmap.status === "rejected") {
    console.error(`[premium-content] Roadmap failed for ${auditId}:`, roadmap.reason);
  }

  const updatedResult = { ...result, onlinePresence: opValue, roadmap: rmValue };

  const { error } = await getSupabase()
    .from("audits")
    .update({ result: updatedResult })
    .eq("id", auditId);

  if (error) {
    console.error(`[premium-content] DB update failed for ${auditId}:`, error);
  } else {
    console.log(`[premium-content] Done for audit ${auditId} — op:${opValue ? "ok" : "fail"} rm:${rmValue ? "ok" : "fail"}`);
  }
}
