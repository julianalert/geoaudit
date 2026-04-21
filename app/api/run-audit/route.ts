import { NextRequest, NextResponse, after } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { AuditResult, CompetitorBenchmark } from "@/lib/types";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 300;

let _anthropic: Anthropic | null = null;
let _openai: OpenAI | null = null;
let _genAI: GoogleGenerativeAI | null = null;

function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}
function getOpenAI() {
  if (!_openai) _openai = new OpenAI();
  return _openai;
}
function getGenAI() {
  if (!_genAI) _genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
  return _genAI;
}

const TIMEOUT_MS = 25_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms)
    ),
  ]);
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function safeNum(val: unknown): number {
  return Number(val) || 0;
}

function safeParseJSON(text: string): any {
  try { return JSON.parse(text); } catch {}
  let cleaned = text
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
  try { return JSON.parse(cleaned); } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  return null;
}

// ── Rate Limiting ─────────────────────────────────────────────
// Simple in-memory per-instance limiter: 3 audits / hour / IP.

const _rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 3;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = (_rateLimitMap.get(ip) ?? []).filter(
    (t) => t > now - RATE_LIMIT_WINDOW_MS
  );
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  _rateLimitMap.set(ip, timestamps);
  return true;
}

// ── Website Scraping ─────────────────────────────────────────

async function scrapeWebsite(url: string): Promise<{ title: string; description: string; content: string } | null> {
  try {
    let normalizedUrl = url;
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      normalizedUrl = "https://" + normalizedUrl;
    }
    const res = await withTimeout(
      fetch(normalizedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; GEOAudit/1.0)" },
        redirect: "follow",
      }),
      10_000
    );
    if (!res.ok) return null;
    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "";

    const descMatch =
      html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i) ||
      html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["']/i);
    const ogDescMatch =
      html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([\s\S]*?)["']/i) ||
      html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*property=["']og:description["']/i);
    const description = descMatch?.[1]?.trim() ?? ogDescMatch?.[1]?.trim() ?? "";

    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = bodyMatch?.[1] ?? html;
    const content = bodyHtml
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);

    return { title, description, content };
  } catch {
    return null;
  }
}

async function detectCategory(
  scraped: { title: string; description: string; content: string },
  brand: string
): Promise<string> {
  try {
    const model = getGenAI().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" } as any,
    });
    const res = await withTimeout(
      model.generateContent({
        contents: [{
          role: "user",
          parts: [{
            text: `Based on this website, determine the business or product category for "${brand}". Return JSON: {"category": "category in 2-4 words, e.g. project management, coffee shop, accounting firm, e-commerce, fitness app, law firm"}\n\nTitle: ${scraped.title}\nDescription: ${scraped.description}\nContent: ${scraped.content.slice(0, 800)}`,
          }],
        }],
      }),
      15_000
    );
    const json = safeParseJSON(res.response.text());
    return json?.category || "business";
  } catch {
    return "business";
  }
}

// ── Model Callers (JSON mode) ────────────────────────────────

const SYSTEM_PROMPT =
  "You are a knowledgeable business analyst with broad expertise across industries — technology, retail, finance, healthcare, hospitality, professional services, and more. Answer directly and honestly based on what you actually know. If you don't know something, say so. Always respond with valid JSON only, no markdown fences, no extra text.";

type ModelCallerResult = { parsed: any; citations?: string[]; inputTokens: number; outputTokens: number };
type ModelCaller = (prompt: string) => Promise<ModelCallerResult>;

async function callOpenAIJSON(prompt: string): Promise<ModelCallerResult> {
  const res = await withTimeout(
    getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      max_tokens: 1024,
      response_format: { type: "json_object" },
    }),
    TIMEOUT_MS
  );
  return {
    parsed: JSON.parse(res.choices[0]?.message?.content ?? "{}"),
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
  };
}

async function callPerplexityJSON(prompt: string): Promise<ModelCallerResult> {
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
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        max_tokens: 1024,
      }),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`Perplexity ${r.status}`);
      return r.json();
    }),
    TIMEOUT_MS
  );
  const text = res.choices?.[0]?.message?.content ?? "{}";
  const parsed = safeParseJSON(text);
  if (!parsed) throw new Error("Perplexity JSON parse failed");
  const citations: string[] = Array.isArray(res.citations) ? res.citations : [];
  return {
    parsed,
    citations,
    inputTokens: res.usage?.prompt_tokens ?? 0,
    outputTokens: res.usage?.completion_tokens ?? 0,
  };
}

async function callClaudeJSON(prompt: string): Promise<ModelCallerResult> {
  const res = await withTimeout(
    getAnthropic().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM_PROMPT + "\nRespond ONLY with the JSON object. No preamble, no explanation, no markdown fences.",
      messages: [
        { role: "user", content: prompt },
      ],
    }),
    30_000
  );
  const text = res.content[0]?.type === "text" ? res.content[0].text : "{}";
  const parsed = safeParseJSON(text);
  if (!parsed) throw new Error("Claude JSON parse failed");
  return {
    parsed,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  };
}

async function callGeminiJSON(prompt: string): Promise<ModelCallerResult> {
  const model = getGenAI().getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" } as any,
  });
  const res = await withTimeout(
    model.generateContent({
      contents: [{ role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\n${prompt}` }] }],
    }),
    TIMEOUT_MS
  );
  return {
    parsed: JSON.parse(res.response.text()),
    inputTokens: res.response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: res.response.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

const MODEL_NAMES = ["GPT-4o", "Claude", "Gemini"] as const;
const MODEL_CALLERS: ModelCaller[] = [callOpenAIJSON, callClaudeJSON, callGeminiJSON];

// ── Cost Tracking ────────────────────────────────────────────

export type TokenUsage = Record<string, { input: number; output: number }>;

const PRICE_PER_M: Record<string, { input: number; output: number }> = {
  "GPT-4o":     { input: 2.50,  output: 10.00 },
  "Claude":     { input: 3.00,  output: 15.00 },
  "Gemini":     { input: 0.075, output: 0.30  },
  "Perplexity": { input: 3.00,  output: 15.00 },
};

function computeTotalCost(usage: TokenUsage): number {
  let total = 0;
  for (const [model, counts] of Object.entries(usage)) {
    const price = PRICE_PER_M[model];
    if (!price) continue;
    total += (counts.input / 1_000_000) * price.input + (counts.output / 1_000_000) * price.output;
  }
  return Math.round(total * 1_000_000) / 1_000_000;
}

// ── Retry wrapper ────────────────────────────────────────────

async function runWithRetry(
  caller: ModelCaller,
  modelName: string,
  prompt: string
): Promise<{ data: any; citations?: string[]; error?: boolean; inputTokens: number; outputTokens: number }> {
  try {
    const { parsed, citations, inputTokens, outputTokens } = await caller(prompt);
    return { data: parsed, citations, inputTokens, outputTokens };
  } catch (firstErr) {
    console.warn(`[${modelName}] call failed, retrying in 2s:`, (firstErr as Error)?.message);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      const { parsed, citations, inputTokens, outputTokens } = await caller(prompt);
      return { data: parsed, citations, inputTokens, outputTokens };
    } catch (e) {
      console.error(`[${modelName}] call failed after retry:`, (e as Error)?.message);
      return { data: null, error: true, inputTokens: 0, outputTokens: 0 };
    }
  }
}

async function runAllModels(
  prompt: string
): Promise<Array<{ data: any; citations?: string[]; error?: boolean; inputTokens: number; outputTokens: number }>> {
  return Promise.all(
    MODEL_CALLERS.map((caller, i) => runWithRetry(caller, MODEL_NAMES[i], prompt))
  );
}

// ── Prompt Builders ──────────────────────────────────────────

function buildAwarenessPrompt(brand: string): string {
  return `Do you know a product called "${brand}"? Rate honestly — if you've never heard of it, all scores should be near 0.

Respond with JSON:
{
  "brand_recognized": true/false,
  "description": "2-3 sentence description, or null if unrecognized",
  "recognition_score": 0-100,
  "accuracy_score": 0-100,
  "detail_score": 0-100,
  "confidence_score": 0-100
}

Scoring guide: 0-20 = no knowledge, 21-40 = vaguely familiar, 41-60 = know it reasonably well, 61-80 = know it well with details, 81-100 = deep expertise on this product.`;
}

function buildPositioningPrompt(brand: string, categoryBase: string): string {
  return `How is "${brand}" positioned in the ${categoryBase} market? Who is their target customer? What is their main value proposition? How do they differentiate?

IMPORTANT: Only answer based on what you genuinely know about this brand. If you don't recognize "${brand}" or have very little knowledge about it, set all scores to 0-10 and positioning_strength to "confused". Do NOT fabricate or guess positioning details for brands you don't know.

Respond with JSON:
{
  "brand_known": true/false,
  "target_customer": "one sentence, or empty string if unknown",
  "value_proposition": "one sentence, or empty string if unknown",
  "differentiation": "one sentence, or empty string if unknown",
  "target_clarity": 0-100,
  "value_prop_accuracy": 0-100,
  "differentiation_clarity": 0-100,
  "positioning_strength": "strong" | "weak" | "confused",
  "note": "one sentence flagging anything inaccurate or missing"
}

Scoring: 0-10 = don't know this brand, 11-30 = vague guesses, 31-60 = partially clear, 61-80 = clear and accurate, 81-100 = precisely understood.`;
}

function buildRecommendationPrompt(brand: string, categoryBase: string): string {
  return `What are the best ${categoryBase} tools available right now? Give me your top 5 ranked from best to worst. Be specific about who each tool is best for.

After listing your top 5, check: does "${brand}" appear in your list?

Respond with JSON:
{
  "tools_mentioned": ["tool1", "tool2", "tool3", "tool4", "tool5"],
  "brand_mentioned": true/false,
  "brand_position": null or 1-5,
  "tools_above_brand": ["tools ranked above ${brand}"],
  "recommendation_strength": 0-100,
  "context_relevance": 0-100
}

recommendation_strength: 0 = would never recommend, 50 = decent option, 100 = undisputed leader.
context_relevance: 0 = wrong category, 50 = tangentially relevant, 100 = perfect fit.`;
}

function buildCompetitivePrompt(brand: string, categoryBase: string): string {
  return `Compare "${brand}" to its top competitors in the ${categoryBase} space. What does ${brand} do better? Where do competitors beat ${brand}?

Respond with JSON:
{
  "wins": ["specific advantage 1", "specific advantage 2", "specific advantage 3"],
  "losses": ["specific weakness 1", "specific weakness 2", "specific weakness 3"],
  "sentiment": "positive" | "neutral" | "negative",
  "sentiment_note": "one sentence explaining overall tone",
  "sentiment_score": 0-100,
  "win_specificity": 0-100,
  "competitive_awareness": 0-100
}

sentiment_score: 0 = very negative view, 50 = neutral, 100 = very favorable.
win_specificity: 0 = can't name anything specific, 50 = generic wins, 100 = highly specific and accurate advantages.
competitive_awareness: 0 = don't know this competitive landscape, 50 = basic understanding, 100 = deep knowledge.`;
}

// ── Scoring ──────────────────────────────────────────────────

function scoreAwareness(data: any): { score: number; subscores: { recognition: number; accuracy: number; detail: number; confidence: number } } {
  if (!data || !data.brand_recognized) {
    const r = clamp(safeNum(data?.recognition_score));
    return { score: Math.round(r * 0.3), subscores: { recognition: r, accuracy: 0, detail: 0, confidence: 0 } };
  }
  const recognition = clamp(safeNum(data.recognition_score));
  const accuracy = clamp(safeNum(data.accuracy_score));
  const detail = clamp(safeNum(data.detail_score));
  const confidence = clamp(safeNum(data.confidence_score));
  const score = Math.round((recognition + accuracy + detail + confidence) / 4);
  return { score, subscores: { recognition, accuracy, detail, confidence } };
}

function scorePositioning(data: any, awarenessKnown: boolean): number {
  if (!data) return 0;
  if (data.brand_known === false || !awarenessKnown) {
    const tc = clamp(safeNum(data.target_clarity));
    const vp = clamp(safeNum(data.value_prop_accuracy));
    const dc = clamp(safeNum(data.differentiation_clarity));
    return Math.min(10, Math.round((tc + vp + dc) / 3));
  }
  const tc = clamp(safeNum(data.target_clarity));
  const vp = clamp(safeNum(data.value_prop_accuracy));
  const dc = clamp(safeNum(data.differentiation_clarity));
  return Math.round((tc + vp + dc) / 3);
}

function scoreRecommendation(data: any): number {
  if (!data) return 0;
  if (!data.brand_mentioned) return 0;
  const pos = data.brand_position;
  if (!pos || pos < 1 || pos > 5) return 0;
  const posScore = clamp(((6 - pos) / 5) * 100);
  const rs = clamp(safeNum(data.recommendation_strength));
  const cr = clamp(safeNum(data.context_relevance));
  return Math.round(posScore * 0.6 + rs * 0.25 + cr * 0.15);
}

function scoreCompetitive(data: any): number {
  if (!data) return 0;
  const hasRealData = (data.sentiment_score != null && data.sentiment_score > 0)
    || (data.wins && data.wins.length > 0)
    || (data.losses && data.losses.length > 0);
  if (!hasRealData) return 0;
  const ss = clamp(safeNum(data.sentiment_score));
  const ws = clamp(safeNum(data.win_specificity));
  const ca = clamp(safeNum(data.competitive_awareness));
  return Math.round((ss + ws + ca) / 3);
}

function computeConsistency(scores: number[]): number {
  const valid = scores.filter((s) => s > 0);
  if (valid.length < 2) return 0;
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const variance = valid.reduce((sum, s) => sum + (s - mean) ** 2, 0) / valid.length;
  const stddev = Math.sqrt(variance);
  return Math.max(0, Math.round(5 - stddev / 5));
}

function getScoreLabel(score: number, type: string): string {
  if (type === "awareness") {
    if (score >= 75) return "Well Known";
    if (score >= 50) return "Recognized";
    if (score >= 30) return "Barely Known";
    return "Unknown";
  }
  if (type === "positioning") {
    if (score >= 75) return "Well Defined";
    if (score >= 50) return "Partially Clear";
    if (score >= 30) return "Confused";
    return "Unknown";
  }
  if (type === "recommendation") {
    if (score >= 75) return "Top Pick";
    if (score >= 50) return "Competitive";
    if (score >= 25) return "Weak Rank";
    return "Not Listed";
  }
  if (type === "competitive") {
    if (score >= 70) return "Strong";
    if (score >= 45) return "Moderate";
    if (score >= 25) return "Weak";
    return "Poor";
  }
  return "";
}

function getScoreColor(score: number): string {
  if (score >= 70) return "#34d399";
  if (score >= 45) return "#fbbf24";
  return "#f87171";
}

function getOverallVerdict(score: number): string {
  if (score >= 85) return "LLM DOMINANT";
  if (score >= 70) return "WELL POSITIONED";
  if (score >= 55) return "IN THE ROOM";
  if (score >= 40) return "VISIBLE BUT LOSING";
  if (score >= 20) return "FAINT SIGNAL";
  return "GHOST";
}

function getVerdictSub(verdict: string, brand: string): string {
  const map: Record<string, string> = {
    GHOST: `LLMs have no idea ${brand} exists. You're completely invisible in AI search.`,
    "FAINT SIGNAL": `LLMs barely know ${brand}. Competitors are dominating the AI answer layer.`,
    "VISIBLE BUT LOSING": `LLMs know ${brand} but aren't recommending you consistently. Competitors are capturing the intent you should own.`,
    "IN THE ROOM": `LLMs know ${brand} and sometimes recommend you, but positioning gaps remain.`,
    "WELL POSITIONED": `${brand} has strong LLM presence. A few gaps to close before you dominate AI search.`,
    "LLM DOMINANT": `${brand} is owning the AI answer layer. LLMs consistently know, describe, and recommend you.`,
  };
  return map[verdict] || "";
}

function getQuadrant(awarenessScore: number, recommendationScore: number) {
  const highAwareness = awarenessScore >= 45;
  const highRec = recommendationScore >= 45;
  if (highAwareness && highRec) return { label: "Dominant", description: "Models know and recommend you consistently." };
  if (highAwareness && !highRec) return { label: "Visible but Losing", description: "Models know you but don't recommend you. High awareness, low conversion in AI search." };
  if (!highAwareness && highRec) return { label: "Lucky", description: "Getting recommended without strong brand awareness. Fragile position." };
  return { label: "Ghost", description: "Low awareness and low recommendation. Invisible in AI search." };
}

// ── Helpers ──────────────────────────────────────────────────

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

const toStringArray = (arr: any): string[] =>
  Array.isArray(arr) ? arr.map((x) => (typeof x === "string" ? x : String(x?.name ?? x ?? ""))).filter(Boolean) : [];

function validAvg(arr: number[]): number {
  const valid = arr.filter((n) => n > 0);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
}

function findTopCompetitor(modelRec: any[], brand: string): string {
  const brandLower = brand.toLowerCase();
  const competitors: Record<string, number> = {};
  for (const m of modelRec) {
    for (const item of m.fullList) {
      const name = typeof item === "string" ? item : String(item?.name ?? item ?? "");
      if (!name) continue;
      const t = name.toLowerCase().trim();
      if (t !== brandLower) {
        competitors[name.trim()] = (competitors[name.trim()] || 0) + 1;
      }
    }
  }
  const sorted = Object.entries(competitors).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? "competitors";
}

function getMajoritySentiment(models: any[]): string {
  const counts: Record<string, number> = {};
  for (const m of models) {
    if (m.sentiment && m.sentiment !== "unknown") {
      counts[m.sentiment] = (counts[m.sentiment] || 0) + 1;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "neutral";
}

function generateAwarenessInsight(models: any[], brand: string): string {
  const known = models.filter((m) => m.known);
  const unknown = models.filter((m) => !m.known);
  const parts: string[] = [];
  if (known.length === models.length) {
    const avgScore = Math.round(average(known.map((m) => m.score)));
    parts.push(`All ${models.length} models recognize ${brand} (avg score: ${avgScore}/100).`);
    if (avgScore < 50) parts.push("But descriptions lack depth and accuracy — there's room to improve how AI understands you.");
  } else if (known.length > 0) {
    parts.push(`${known.map((m) => m.model).join(" and ")} recognize ${brand}.`);
    parts.push(`${unknown.map((m) => m.model).join(" and ")} ${unknown.length === 1 ? "doesn't" : "don't"} meaningfully recognize the brand.`);
  } else {
    parts.push(`No model recognizes ${brand}. You're invisible in AI search.`);
  }
  return parts.join(" ");
}

function generateRecInsight(models: any[], brand: string): string {
  const listed = models.filter((m) => m.listed);
  const notListed = models.filter((m) => !m.listed);
  const parts: string[] = [];
  if (notListed.length > 0) parts.push(`${brand} is not listed on ${notListed.map((m) => m.model).join(" or ")}.`);
  const topPicks = listed.filter((m) => m.rank === 1);
  if (topPicks.length > 0) parts.push(`You're the top pick on ${topPicks.map((m) => m.model).join(" and ")}.`);
  const topCompetitor = findTopCompetitor(models, brand);
  if (topCompetitor !== "competitors") parts.push(`${topCompetitor} is your biggest threat in AI recommendations.`);
  return parts.join(" ") || `Mixed recommendation presence for ${brand}.`;
}

function generateCompInsight(models: any[], brand: string): string {
  const negative = models.filter((m) => m.sentiment === "negative");
  const positive = models.filter((m) => m.sentiment === "positive");
  const parts: string[] = [];
  if (negative.length > 0) parts.push(`${negative.map((m) => m.model).join(" and ")} ${negative.length === 1 ? "has" : "have"} a negative view of ${brand} vs competitors.`);
  if (positive.length > 0) parts.push(`${positive.map((m) => m.model).join(" and ")} ${positive.length === 1 ? "favors" : "favor"} ${brand}.`);
  if (negative.length === 0 && positive.length === 0) parts.push(`Models have a neutral view of ${brand} vs competitors.`);
  return parts.join(" ");
}

// ── Main Handler ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Max 3 audits per hour per IP." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { brand, category: userCategory, websiteUrl } = body;

    if (!brand || !websiteUrl) {
      return NextResponse.json({ error: "Missing brand or website URL" }, { status: 400 });
    }

    const scraped = await scrapeWebsite(websiteUrl);
    const category = userCategory?.trim() || (scraped ? await detectCategory(scraped, brand) : "SaaS");

    const { data: row, error: insertErr } = await getSupabase()
      .from("audits")
      .insert({
        brand,
        category,
        website_url: websiteUrl,
        overall_score: 0,
        overall_verdict: "pending",
        status: "pending",
      })
      .select("id")
      .single();

    if (insertErr || !row) {
      console.error("Supabase insert error:", insertErr);
      return NextResponse.json({ error: "Failed to create audit" }, { status: 500 });
    }

    const auditId = row.id;

    after(async () => {
      try {
        await processAudit(auditId, brand, category, scraped);
      } catch (err) {
        console.error("Audit processing failed:", err);
        await getSupabase().from("audits").update({ status: "error" }).eq("id", auditId);
      }
    });

    return NextResponse.json({ id: auditId, category });
  } catch (err) {
    console.error("run-audit error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── Audit Processing (two phases) ────────────────────────────

async function processAudit(
  auditId: string,
  brand: string,
  category: string,
  scraped: { title: string; description: string; content: string } | null
) {
  const supabase = getSupabase();
  const categoryBase = category.replace(/\s+tools?\s*$/i, "").trim();
  console.log(`[${auditId}] processAudit start — brand: ${brand}, category: ${category}`);

  const usage: TokenUsage = {};
  const addUsage = (model: string, input: number, output: number) => {
    if (!usage[model]) usage[model] = { input: 0, output: 0 };
    usage[model].input  += input;
    usage[model].output += output;
  };

  // ── Phase 1: Awareness + Positioning ────────────────────────
  console.log(`[${auditId}] Phase 1 start`);
  const [awarenessResults, posResults] = await Promise.all([
    runAllModels(buildAwarenessPrompt(brand)),
    runAllModels(buildPositioningPrompt(brand, categoryBase)),
  ]);
  for (let i = 0; i < MODEL_NAMES.length; i++) {
    addUsage(MODEL_NAMES[i], awarenessResults[i].inputTokens, awarenessResults[i].outputTokens);
    addUsage(MODEL_NAMES[i], posResults[i].inputTokens, posResults[i].outputTokens);
  }

  const modelAwareness = awarenessResults.map((raw, i) => {
    if (raw.error || !raw.data) return {
      model: MODEL_NAMES[i], known: false, description: null,
      scores: { recognition: 0, accuracy: 0, detail: 0, confidence: 0 }, score: 0,
      citations: [] as string[],
    };
    const { score, subscores } = scoreAwareness(raw.data);
    return {
      model: MODEL_NAMES[i],
      known: raw.data.brand_recognized ?? false,
      description: raw.data.description ?? null,
      scores: subscores,
      score,
      citations: raw.citations ?? [],
    };
  });

  const modelPositioning = posResults.map((raw, i) => {
    if (raw.error || !raw.data) return {
      model: MODEL_NAMES[i], strength: "confused", targetCustomer: "",
      valueProp: "", differentiation: "", scores: { targetClarity: 0, valuePropAccuracy: 0, differentiationClarity: 0 },
      note: "Model unavailable", score: 0,
    };
    const awarenessKnown = modelAwareness[i]?.known ?? false;
    const score = scorePositioning(raw.data, awarenessKnown);
    return {
      model: MODEL_NAMES[i],
      strength: raw.data.positioning_strength ?? "confused",
      targetCustomer: raw.data.target_customer ?? "",
      valueProp: raw.data.value_proposition ?? "",
      differentiation: raw.data.differentiation ?? "",
      scores: {
        targetClarity: clamp(safeNum(raw.data.target_clarity)),
        valuePropAccuracy: clamp(safeNum(raw.data.value_prop_accuracy)),
        differentiationClarity: clamp(safeNum(raw.data.differentiation_clarity)),
      },
      note: raw.data.note ?? "",
      score,
    };
  });

  const awarenessScores = modelAwareness.map((m) => m.score);
  const positioningScores = modelPositioning.map((m) => m.score);

  const avgAwareness = Math.round(validAvg(awarenessScores) + computeConsistency(awarenessScores));
  const avgPositioning = Math.round(validAvg(positioningScores) + computeConsistency(positioningScores));

  const awarenessInsight = generateAwarenessInsight(modelAwareness, brand);

  let positioningInsight = "";
  try {
    const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });
    const res = await withTimeout(
      model.generateContent({
        contents: [{
          role: "user",
          parts: [{
            text: `Based on how ${MODEL_NAMES.length} LLMs describe ${brand}'s positioning in the ${category} space, write one sharp sentence identifying the biggest positioning gap or inconsistency. Be direct. No fluff.\n\nModel results: ${JSON.stringify(modelPositioning.map((m) => ({ model: m.model, strength: m.strength, target: m.targetCustomer, valueProp: m.valueProp, diff: m.differentiation })))}`,
          }],
        }],
      }),
      TIMEOUT_MS
    );
    positioningInsight = res.response.text().trim();
  } catch {
    positioningInsight = `Mixed positioning signals across models for ${brand}.`;
  }

  // Partial result — write to DB so the UI can start rendering
  const partialResult = {
    brand,
    category,
    auditDate: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    awareness: {
      score: avgAwareness,
      label: getScoreLabel(avgAwareness, "awareness"),
      color: getScoreColor(avgAwareness),
      modelResults: modelAwareness.map((m) => ({
        model: m.model,
        known: m.known,
        description: m.description,
        scores: m.scores,
        citations: m.citations,
      })),
      consistencyBonus: computeConsistency(awarenessScores),
      insight: awarenessInsight,
    },
    positioning: {
      score: avgPositioning,
      label: getScoreLabel(avgPositioning, "positioning"),
      color: getScoreColor(avgPositioning),
      modelResults: modelPositioning.map((m) => ({
        model: m.model,
        strength: m.strength,
        targetCustomer: m.targetCustomer,
        valueProp: m.valueProp,
        differentiation: m.differentiation,
        scores: m.scores,
        note: m.note,
      })),
      consistencyBonus: computeConsistency(positioningScores),
      insight: positioningInsight,
    },
  };

  console.log(`[${auditId}] Phase 1 complete — awareness: ${avgAwareness}, positioning: ${avgPositioning}`);
  await supabase
    .from("audits")
    .update({ result: partialResult })
    .eq("id", auditId);

  // ── Phase 2: Recommendation + Competitive ────────────────────
  console.log(`[${auditId}] Phase 2 start`);
  const [recResults, compResults] = await Promise.all([
    runAllModels(buildRecommendationPrompt(brand, categoryBase)),
    runAllModels(buildCompetitivePrompt(brand, categoryBase)),
  ]);
  for (let i = 0; i < MODEL_NAMES.length; i++) {
    addUsage(MODEL_NAMES[i], recResults[i].inputTokens, recResults[i].outputTokens);
    addUsage(MODEL_NAMES[i], compResults[i].inputTokens, compResults[i].outputTokens);
  }

  const modelRecommendation = recResults.map((raw, i) => {
    if (raw.error || !raw.data) return {
      model: MODEL_NAMES[i], rank: null, listed: false, aboveYou: [] as string[], fullList: [] as string[], score: 0,
    };
    const score = scoreRecommendation(raw.data);
    return {
      model: MODEL_NAMES[i],
      rank: raw.data.brand_position ?? null,
      listed: raw.data.brand_mentioned ?? false,
      aboveYou: toStringArray(raw.data.tools_above_brand),
      fullList: toStringArray(raw.data.tools_mentioned),
      score,
    };
  });

  const modelCompetitive = compResults.map((raw, i) => {
    if (raw.error || !raw.data) return {
      model: MODEL_NAMES[i], sentiment: "unknown", note: "Model unavailable", wins: [], losses: [], score: 0,
    };
    const score = scoreCompetitive(raw.data);
    return {
      model: MODEL_NAMES[i],
      sentiment: raw.data.sentiment ?? "neutral",
      note: raw.data.sentiment_note ?? "",
      wins: raw.data.wins ?? [],
      losses: raw.data.losses ?? [],
      score,
    };
  });

  const recScores = modelRecommendation.map((m) => m.score);
  const compScores = modelCompetitive.map((m) => m.score);

  const avgRecommendation = Math.round(validAvg(recScores) + computeConsistency(recScores));
  const avgCompetitive = Math.round(validAvg(compScores) + computeConsistency(compScores));

  // Weighted scoring: Recommendation 35%, Awareness 30%, Positioning 20%, Competitive 15%
  const overallScore = clamp(Math.round(
    avgRecommendation * 0.35 +
    avgAwareness * 0.30 +
    avgPositioning * 0.20 +
    avgCompetitive * 0.15
  ));
  const overallVerdict = getOverallVerdict(overallScore);

  // Share of voice
  const toolCounts: Record<string, number> = {};
  for (const m of modelRecommendation) {
    for (const tool of m.fullList) {
      const normalized = tool.toLowerCase().trim();
      toolCounts[normalized] = (toolCounts[normalized] || 0) + 1;
    }
  }
  const totalMentions = Object.values(toolCounts).reduce((a, b) => a + b, 0) || 1;
  const shareOfVoice = Object.entries(toolCounts)
    .map(([name, count]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), pct: Math.round((count / totalMentions) * 100) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);

  const allWins = modelCompetitive.flatMap((m) => m.wins).filter(Boolean);
  const allLosses = modelCompetitive.flatMap((m) => m.losses).filter(Boolean);
  const topWins = [...new Set(allWins)].slice(0, 3);
  const topLosses = [...new Set(allLosses)].slice(0, 3);

  const quadrant = {
    awarenessScore: avgAwareness,
    recommendationScore: avgRecommendation,
    ...getQuadrant(avgAwareness, avgRecommendation),
  };

  console.log(`[${auditId}] Phase 2 complete — recommendation: ${avgRecommendation}, competitive: ${avgCompetitive}, overall: ${overallScore}`);
  const recInsight = generateRecInsight(modelRecommendation, brand);
  const compInsight = generateCompInsight(modelCompetitive, brand);

  // ── Phase 3: Competitor Benchmarking (premium) ───────────────
  // Aggregate competitors mentioned above the brand, pick top 2 unique names
  const brandLower = brand.toLowerCase();
  const competitorCounts: Record<string, number> = {};
  for (const m of modelRecommendation) {
    for (const c of m.aboveYou) {
      const norm = c.toLowerCase().trim();
      if (norm && norm !== brandLower) {
        const display = c.trim();
        competitorCounts[display] = (competitorCounts[display] || 0) + 1;
      }
    }
  }
  const topCompetitorNames = Object.entries(competitorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name);

  let competitorBenchmarks: CompetitorBenchmark[] = [];
  if (topCompetitorNames.length > 0) {
    console.log(`[${auditId}] Phase 3: benchmarking ${topCompetitorNames.join(", ")}`);
    try {
      const benchmarkResults = await Promise.race([
        Promise.all(
          topCompetitorNames.map(async (compName) => {
            const [awaRes, recRes] = await Promise.all([
              runAllModels(buildAwarenessPrompt(compName)),
              runAllModels(buildRecommendationPrompt(compName, categoryBase)),
            ]);
            for (let i = 0; i < MODEL_NAMES.length; i++) {
              addUsage(MODEL_NAMES[i], awaRes[i].inputTokens, awaRes[i].outputTokens);
              addUsage(MODEL_NAMES[i], recRes[i].inputTokens, recRes[i].outputTokens);
            }
            const awaScores = awaRes.map((r) => r.error || !r.data ? 0 : scoreAwareness(r.data).score);
            const recScoresComp = recRes.map((r) => r.error || !r.data ? 0 : scoreRecommendation(r.data));
            const awaScore = Math.round(validAvg(awaScores) + computeConsistency(awaScores));
            const recScore = Math.round(validAvg(recScoresComp) + computeConsistency(recScoresComp));
            return { name: compName, awarenessScore: awaScore, recommendationScore: recScore };
          })
        ),
        new Promise<CompetitorBenchmark[]>((resolve) =>
          setTimeout(() => {
            console.warn(`[${auditId}] Competitor benchmarking timed out after 45s, skipping`);
            resolve([]);
          }, 45_000)
        ),
      ]);
      competitorBenchmarks = benchmarkResults;
    } catch (e) {
      console.error(`[${auditId}] Competitor benchmarking failed:`, (e as Error)?.message);
    }
  }

  // ── Assemble final result ─────────────────────────────────────
  const result: AuditResult = {
    brand,
    category,
    auditDate: partialResult.auditDate,
    overallScore,
    overallVerdict,
    overallSub: getVerdictSub(overallVerdict, brand),
    quadrant,
    awareness: partialResult.awareness,
    positioning: partialResult.positioning,
    recommendation: {
      score: avgRecommendation,
      label: getScoreLabel(avgRecommendation, "recommendation"),
      color: getScoreColor(avgRecommendation),
      promptUsed: buildRecommendationPrompt(brand, categoryBase),
      modelResults: modelRecommendation.map((m) => ({
        model: m.model,
        rank: m.rank,
        listed: m.listed,
        aboveYou: m.aboveYou,
        fullList: m.fullList,
      })),
      shareOfVoice,
      consistencyBonus: computeConsistency(recScores),
      insight: recInsight,
    },
    competitive: {
      score: avgCompetitive,
      label: getScoreLabel(avgCompetitive, "competitive"),
      color: getScoreColor(avgCompetitive),
      competitor: findTopCompetitor(modelRecommendation, brand),
      wins: topWins,
      losses: topLosses,
      sentimentPerModel: modelCompetitive.map((m) => ({
        model: m.model,
        sentiment: m.sentiment,
        note: m.note,
      })),
      overallSentiment: getMajoritySentiment(modelCompetitive),
      consistencyBonus: computeConsistency(compScores),
      insight: compInsight,
    },
    competitorBenchmarks,
  };

  await supabase
    .from("audits")
    .update({
      status: "complete",
      overall_score: overallScore,
      overall_verdict: overallVerdict,
      result,
      cost_usd: computeTotalCost(usage),
      token_usage: usage,
    })
    .eq("id", auditId);
  console.log(`[${auditId}] processAudit done ✓ — cost: $${computeTotalCost(usage).toFixed(6)}`);
}
