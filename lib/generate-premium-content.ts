// ── Premium "Action Kit" Content Generation ──────────────────
// Runs AFTER the free audit is complete, triggered by Stripe webhook
// (or admin unlock). Generates the five pieces that justify the $39
// price tag: Opportunity Calculator, Positioning Brief, Citation Source
// Map, Content Gap Map, and the detailed 30-Day Action Plan.
//
// This stage IS allowed to use scraped site content and Perplexity web
// search - these are advice-generation tasks, not the audit itself.

import Anthropic from "@anthropic-ai/sdk";
import { getSupabase } from "@/lib/supabase";
import type { TokenUsage } from "@/app/api/run-audit/route";
import type {
  AuditResult,
  OpportunityCalculator,
  PositioningBrief,
  ContentGapMap,
  OnlinePresenceData,
  RoadmapData,
} from "@/lib/types";

const PREMIUM_PRICE_PER_M: Record<string, { input: number; output: number }> = {
  Perplexity: { input: 3.00, output: 15.00 },
  Claude:     { input: 3.00, output: 15.00 },
};

function computePremiumCost(usage: TokenUsage): number {
  let total = 0;
  for (const [model, counts] of Object.entries(usage)) {
    const price = PREMIUM_PRICE_PER_M[model];
    if (!price) continue;
    total += (counts.input / 1_000_000) * price.input + (counts.output / 1_000_000) * price.output;
  }
  return Math.round(total * 1_000_000) / 1_000_000;
}

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
  // Last-resort: response was likely truncated mid-JSON (hit max_tokens).
  // Walk from the start, close any unbalanced strings/arrays/objects, drop
  // the last incomplete element, and retry. Recovers partial but valid data.
  const repaired = attemptRepairTruncatedJSON(cleaned);
  if (repaired) {
    try { return JSON.parse(repaired); } catch {}
  }
  return null;
}

function attemptRepairTruncatedJSON(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let s = text.slice(start);
  let inStr = false;
  let escape = false;
  const stack: string[] = [];
  let lastSafe = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (c === "\\") { escape = true; continue; }
      if (c === '"') { inStr = false; }
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{" || c === "[") { stack.push(c); continue; }
    if (c === "}" || c === "]") { stack.pop(); if (stack.length === 0) lastSafe = i; continue; }
    if (c === "," && stack.length > 0) { lastSafe = i; }
  }
  if (stack.length === 0) return s;
  let truncated = s.slice(0, lastSafe + 1).replace(/,\s*$/, "");
  while (stack.length) {
    const open = stack.pop();
    truncated += open === "{" ? "}" : "]";
  }
  return truncated;
}

function buildAuditSummary(brand: string, category: string, result: AuditResult | null): string {
  if (!result) return `Brand: ${brand}\nCategory: ${category}`;
  const aboveUs = (result.recommendation?.modelResults ?? [])
    .flatMap((m) => m.aboveYou)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 8)
    .join(", ") || "none";
  const queriesWhereMissed = (result.recommendation?.modelResults ?? [])
    .flatMap((m) => (m.queries ?? []).filter((q) => !q.listed).map((q) => q.query))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 5);
  return `
Brand: ${brand}
Category: ${category}
Overall verdict: ${result.overallVerdict ?? ""} (${result.overallScore ?? 0}/100)
Awareness: ${result.awareness?.score ?? 0}/100
Positioning: ${result.positioning?.score ?? 0}/100
Recommendation: ${result.recommendation?.score ?? 0}/100
Competitive: ${result.competitive?.score ?? 0}/100
Top competitor: ${result.meta?.topCompetitor ?? "unknown"}
ICP: ${result.meta?.icpPhrase ?? "unknown"}
Ranked above ${brand}: ${aboveUs}
Competitive wins: ${(result.competitive?.wins ?? []).join(", ") || "none identified"}
Competitive losses: ${(result.competitive?.losses ?? []).join(", ") || "none identified"}
Positioning insight: ${result.positioning?.insight ?? ""}
Recommendation insight: ${result.recommendation?.insight ?? ""}
Queries where ${brand} did NOT appear: ${queriesWhereMissed.join(" | ") || "none"}
Hallucinations detected: ${result.awareness?.hallucinationFlag ? "yes" : "no"}
`.trim();
}

// ── 1. Opportunity Calculator (ROI math) ─────────────────────

async function generateOpportunityCalculator(
  brand: string,
  category: string,
  result: AuditResult | null
): Promise<{ data: OpportunityCalculator; inputTokens: number; outputTokens: number }> {
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
            content: "You are a business analyst estimating AI-search opportunity cost. Use public data to make conservative estimates. Respond with valid JSON only.",
          },
          {
            role: "user",
            content: `Estimate the AI-search (ChatGPT / Claude / Perplexity / Gemini) opportunity for "${brand}" in the "${category}" space.

Rough audit signals:
- Overall LLM visibility score: ${result?.overallScore ?? 0}/100
- Recommendation rank score: ${result?.recommendation?.score ?? 0}/100
- Currently listed in top 5 by ${(result?.recommendation?.modelResults ?? []).filter((m) => m.listed).length} of ${(result?.recommendation?.modelResults ?? []).length || 3} models

Using publicly known industry data:
1. Estimate monthly AI-assistant queries for the "${category}" category globally - be conservative.
2. Estimate current capture rate (0-100) given the rec score above: a brand listed in top-5 by all models captures ~60-80%; a brand listed by half captures ~20-40%; an invisible brand captures <5%.
3. Estimate a reasonable average deal value / customer LTV for this category (be conservative).
4. Compute estimated monthly pipeline lost to competitors:
   lost = monthlyQueries × (1 - captureRate/100) × conversionRate(0.5-2%) × avgDealValue
   Use a ~1% conversion rate assumption from query to qualified opportunity.

Return JSON ONLY:
{
  "monthlyCategoryQueries": <integer>,
  "currentCaptureRate": <integer 0-100>,
  "assumedAvgDealValue": <integer, in USD>,
  "estimatedMonthlyLoss": <integer, in USD>,
  "note": "one short sentence explaining the key assumption"
}`,
          },
        ],
        max_tokens: 500,
      }),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`Perplexity opportunity ${r.status}`);
      return r.json();
    }),
    30_000
  );
  const text = res.choices?.[0]?.message?.content ?? "{}";
  const parsed = safeParseJSON(text);
  if (!parsed) throw new Error("Opportunity calculator JSON parse failed");
  return {
    data: {
      monthlyCategoryQueries: Number(parsed.monthlyCategoryQueries) || 0,
      currentCaptureRate: Math.max(0, Math.min(100, Number(parsed.currentCaptureRate) || 0)),
      assumedAvgDealValue: Number(parsed.assumedAvgDealValue) || 0,
      estimatedMonthlyLoss: Number(parsed.estimatedMonthlyLoss) || 0,
      note: String(parsed.note ?? "Estimate based on public industry data."),
    },
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
  };
}

// ── 2. Positioning Brief (rewrite + JSON-LD) ─────────────────

async function generatePositioningBrief(
  brand: string,
  category: string,
  websiteUrl: string,
  result: AuditResult | null
): Promise<{ data: PositioningBrief; inputTokens: number; outputTokens: number }> {
  const llmPositioning = (result?.positioning?.modelResults ?? [])
    .map((m) => `- ${m.model}: target="${m.targetCustomer}" value="${m.valueProp}" diff="${m.differentiation}"`)
    .join("\n");

  const res = await withTimeout(
    getAnthropic().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      messages: [{
        role: "user",
        content: `You are a positioning strategist fixing how "${brand}" shows up in AI answers.

The brand (${category}): ${brand}
Website: ${websiteUrl}

How LLMs currently describe them:
${llmPositioning || "(no data)"}

Positioning insight from audit: ${result?.positioning?.insight ?? ""}
Competitive wins: ${(result?.competitive?.wins ?? []).join(", ") || "none"}
Competitive losses: ${(result?.competitive?.losses ?? []).join(", ") || "none"}

Your job: produce a concrete positioning-fix brief ready to paste onto the site. Be specific, not generic. Use the audit data - don't make up features.

Return JSON only:
{
  "llmUnderstanding": "one sentence summarizing how AI currently understands ${brand}",
  "siteStatement": "one sentence summarizing what their site claims (inferred, since you can't access it)",
  "heroRewrite": "single punchy homepage hero headline + 1 subheadline, max 25 words total",
  "metaRewrite": "SEO meta description, 150-160 chars, primary keywords included",
  "aboutRewrite": "About paragraph, 2-3 sentences, clear on who they serve and how they differentiate",
  "jsonLd": "Full Organization JSON-LD snippet as a STRING (including <script> tags), with correct description, url, sameAs (social profile placeholders), knowsAbout (3-5 topics), based on the category and audit data"
}`,
      }],
    }),
    35_000
  );
  const text = res.content[0]?.type === "text" ? res.content[0].text : "{}";
  const parsed = safeParseJSON(text) ?? {};
  return {
    data: {
      llmUnderstanding: String(parsed.llmUnderstanding ?? ""),
      siteStatement: String(parsed.siteStatement ?? ""),
      heroRewrite: String(parsed.heroRewrite ?? ""),
      metaRewrite: String(parsed.metaRewrite ?? ""),
      aboutRewrite: String(parsed.aboutRewrite ?? ""),
      jsonLd: String(parsed.jsonLd ?? ""),
    },
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  };
}

// ── 3. Citation Source Map (real URLs + competitor gap) ──────

async function generateOnlinePresence(
  brand: string,
  category: string,
  websiteUrl: string,
  result: AuditResult | null
): Promise<{ data: OnlinePresenceData; inputTokens: number; outputTokens: number }> {
  const topCompetitors = (result?.competitorBenchmarks ?? []).map((c) => c.name).slice(0, 2);

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
            content: "You are a research analyst. Search the web and report factual findings with specific URLs. Respond with valid JSON only.",
          },
          {
            role: "user",
            content: `Research the online presence of "${brand}" (${websiteUrl}) in the "${category}" space.

For each platform below, find what EXISTS today (not what you guess). Report specific URLs, review counts, post dates, follower counts when available.

Check:
- Review platforms: G2, Capterra, TrustRadius, Product Hunt
- Community: Reddit, Hacker News, Stack Overflow
- Content/social: LinkedIn company page, YouTube channel, podcast appearances
- Industry media: blogs, news, publications in the ${category} space

${topCompetitors.length > 0 ? `Also identify the 3 highest-leverage platforms where these competitors ARE listed but "${brand}" is NOT: ${topCompetitors.join(", ")}.` : ""}

Return JSON only:
{
  "sources": [
    {
      "domain": "platform name (e.g. G2, Reddit, LinkedIn)",
      "status": "strong" | "weak" | "missing",
      "note": "specific finding - include URL, review count, or date when available (max 25 words)",
      "priority": "high" | "medium" | "low"
    }
  ],
  "competitorGaps": [
    {
      "platform": "platform name",
      "competitors": ["competitor names present here"],
      "suggestion": "specific next step for ${brand} to close the gap (max 20 words)"
    }
  ],
  "insight": "one sentence identifying the single biggest online-presence gap for ${brand}"
}

Return exactly 6 sources ranked by importance for AI/LLM training data. competitorGaps: 0-3 entries.`,
          },
        ],
        max_tokens: 1200,
      }),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`Perplexity ${r.status}`);
      return r.json();
    }),
    40_000
  );
  const text = res.choices?.[0]?.message?.content ?? "{}";
  const parsed = safeParseJSON(text);
  if (!parsed) throw new Error("Failed to parse online presence JSON");
  return {
    data: {
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
      insight: String(parsed.insight ?? ""),
      competitorGaps: Array.isArray(parsed.competitorGaps) ? parsed.competitorGaps : [],
    },
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
  };
}

// ── 4. Content Gap Map ───────────────────────────────────────

async function generateContentGapMap(
  brand: string,
  category: string,
  auditSummary: string,
  result: AuditResult | null
): Promise<{ data: ContentGapMap; inputTokens: number; outputTokens: number }> {
  const missedQueries = (result?.recommendation?.modelResults ?? [])
    .flatMap((m) => (m.queries ?? []).filter((q) => !q.listed).map((q) => q.query))
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 5);

  const res = await withTimeout(
    getAnthropic().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      messages: [{
        role: "user",
        content: `You are a content strategist producing 8 concrete content briefs that would make "${brand}" (${category}) appear in AI-generated answers for their category.

${auditSummary}

Queries where the brand currently does NOT appear in AI answers:
${missedQueries.map((q, i) => `${i + 1}. ${q}`).join("\n") || "(none)"}

Produce 8 distinct content briefs. Each should target a specific buyer-intent query the brand is missing. Be concrete - real titles, specific outlines.

Return JSON only:
{
  "briefs": [
    {
      "title": "exact article/page title (max 70 chars)",
      "targetQuery": "the buyer-intent query this content would rank for",
      "outline": ["bullet 1 (max 12 words)", "bullet 2", "bullet 3", "bullet 4"],
      "format": "one of: comparison page | alternatives hub | use-case guide | listicle | customer story | data report | tool directory submission"
    }
  ],
  "insight": "one sentence identifying the single highest-leverage content piece to ship first"
}

Return exactly 8 briefs. Prioritize comparison and alternatives content - those are the highest-intent queries.`,
      }],
    }),
    35_000
  );
  const text = res.content[0]?.type === "text" ? res.content[0].text : "{}";
  const parsed = safeParseJSON(text) ?? {};
  return {
    data: {
      briefs: Array.isArray(parsed.briefs) ? parsed.briefs : [],
      insight: String(parsed.insight ?? ""),
    },
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  };
}

// ── 5. 30-Day Action Plan (upgraded: where + template + impact) ─

async function generateRoadmap(
  brand: string,
  category: string,
  auditSummary: string,
  attempt = 0
): Promise<{ data: RoadmapData; inputTokens: number; outputTokens: number }> {
  const res = await withTimeout(
    getAnthropic().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: `You are a growth consultant creating a 30-day LLM visibility action plan for "${brand}" (${category}).

${auditSummary}

Create a week-by-week plan that directly addresses the gaps in this audit. Every action must be concrete and immediately actionable - no generic advice.

Return JSON only:
{
  "weeks": [
    {
      "week": "WEEK 1",
      "actions": [
        {
          "action": "what to do (1 sentence, concrete)",
          "where": "specific platform / URL / tool where this happens",
          "template": "copy-pasteable template, script, email, or code snippet the user can use directly (max 60 words). If no template applicable, put a specific checklist of 2-3 steps.",
          "impact": "High" | "Medium" | "Low",
          "category": "awareness" | "positioning" | "recommendation" | "online-presence",
          "scoreImpact": "which score dimension this lifts and roughly how much, e.g. '+10-15 Awareness'"
        }
      ]
    }
  ],
  "insight": "one sentence on the single highest-leverage action for ${brand} right now"
}

Return exactly 4 weeks (WEEK 1 through WEEK 4), exactly 3 actions per week (12 total). Week 1 = quick wins (submissions, profile claims, schema fixes). Week 2 = positioning + public proof (reviews, testimonials, PR angles). Week 3 = content production (comparison pages, guides). Week 4 = distribution + citations (outreach, guest posts, syndication).`,
      }],
    }),
    40_000
  );
  const text = res.content[0]?.type === "text" ? res.content[0].text : "{}";
  const parsed = safeParseJSON(text) ?? {};
  const weeks = Array.isArray(parsed.weeks) ? parsed.weeks : [];
  if (weeks.length === 0 && attempt === 0) {
    console.warn(`[premium-content] Roadmap returned empty weeks (stop_reason=${res.stop_reason}), retrying once`);
    return generateRoadmap(brand, category, auditSummary, 1);
  }
  return {
    data: {
      weeks,
      insight: String(parsed.insight ?? ""),
    },
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  };
}

// ── Orchestrator ─────────────────────────────────────────────

export async function generatePremiumContent(
  auditId: string,
  brand: string,
  category: string,
  websiteUrl: string,
  result: AuditResult | null
) {
  const auditSummary = buildAuditSummary(brand, category, result);

  console.log(`[premium-content] Starting Action Kit generation for audit ${auditId} (${brand})`);

  // Run all 5 generators in parallel. Each is independent.
  const [opportunity, positioning, onlinePresence, contentGap, roadmap] = await Promise.allSettled([
    generateOpportunityCalculator(brand, category, result),
    generatePositioningBrief(brand, category, websiteUrl, result),
    generateOnlinePresence(brand, category, websiteUrl, result),
    generateContentGapMap(brand, category, auditSummary, result),
    generateRoadmap(brand, category, auditSummary),
  ]);

  const opp = opportunity.status === "fulfilled" ? opportunity.value : null;
  const pos = positioning.status === "fulfilled" ? positioning.value : null;
  const op  = onlinePresence.status === "fulfilled" ? onlinePresence.value : null;
  const cg  = contentGap.status === "fulfilled" ? contentGap.value : null;
  const rm  = roadmap.status === "fulfilled" ? roadmap.value : null;

  if (opportunity.status === "rejected")     console.error(`[premium-content] Opportunity failed (${auditId}):`, opportunity.reason);
  if (positioning.status === "rejected")     console.error(`[premium-content] Positioning failed (${auditId}):`, positioning.reason);
  if (onlinePresence.status === "rejected")  console.error(`[premium-content] OnlinePresence failed (${auditId}):`, onlinePresence.reason);
  if (contentGap.status === "rejected")      console.error(`[premium-content] ContentGap failed (${auditId}):`, contentGap.reason);
  if (roadmap.status === "rejected")         console.error(`[premium-content] Roadmap failed (${auditId}):`, roadmap.reason);

  const updatedResult = {
    ...(result ?? {}),
    opportunityCalculator: opp?.data ?? null,
    positioningBrief:      pos?.data ?? null,
    onlinePresence:        op?.data  ?? null,
    contentGapMap:         cg?.data  ?? null,
    roadmap:               rm?.data  ?? null,
  };

  // Cost accounting
  const premiumUsage: TokenUsage = {};
  const addUsage = (model: string, input: number, output: number) => {
    if (!input && !output) return;
    if (!premiumUsage[model]) premiumUsage[model] = { input: 0, output: 0 };
    premiumUsage[model].input += input;
    premiumUsage[model].output += output;
  };
  if (opp) addUsage("Perplexity", opp.inputTokens, opp.outputTokens);
  if (op)  addUsage("Perplexity", op.inputTokens, op.outputTokens);
  if (pos) addUsage("Claude", pos.inputTokens, pos.outputTokens);
  if (cg)  addUsage("Claude", cg.inputTokens, cg.outputTokens);
  if (rm)  addUsage("Claude", rm.inputTokens, rm.outputTokens);
  const premiumCost = computePremiumCost(premiumUsage);

  const { data: existing } = await getSupabase()
    .from("audits")
    .select("cost_usd, token_usage")
    .eq("id", auditId)
    .single();

  const existingCost = Number(existing?.cost_usd ?? 0);
  const existingUsage: TokenUsage = (existing?.token_usage as TokenUsage) ?? {};
  const mergedUsage: TokenUsage = { ...existingUsage };
  for (const [model, counts] of Object.entries(premiumUsage)) {
    mergedUsage[model] = {
      input:  (mergedUsage[model]?.input  ?? 0) + counts.input,
      output: (mergedUsage[model]?.output ?? 0) + counts.output,
    };
  }

  const { error } = await getSupabase()
    .from("audits")
    .update({
      result: updatedResult,
      cost_usd: existingCost + premiumCost,
      token_usage: mergedUsage,
    })
    .eq("id", auditId);

  if (error) {
    console.error(`[premium-content] DB update failed for ${auditId}:`, error);
  } else {
    console.log(`[premium-content] Done for audit ${auditId} - opp:${opp ? "ok" : "fail"} pos:${pos ? "ok" : "fail"} op:${op ? "ok" : "fail"} cg:${cg ? "ok" : "fail"} rm:${rm ? "ok" : "fail"} premium_cost:$${premiumCost.toFixed(6)}`);
  }
}
