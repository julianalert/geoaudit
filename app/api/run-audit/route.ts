import { NextRequest, NextResponse, after } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { AuditResult, CompetitorBenchmark } from "@/lib/types";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

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
// Distributed limiter via Upstash Redis when env vars are present;
// falls back to an in-memory map (per cold-start instance) otherwise.
// Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN to enable the
// distributed path (required for multi-instance Vercel deployments).

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60; // 1 hour

let _upstashLimiter: Ratelimit | null = null;
function getUpstashLimiter(): Ratelimit | null {
  if (_upstashLimiter) return _upstashLimiter;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  _upstashLimiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(RATE_LIMIT_MAX, `${RATE_LIMIT_WINDOW_SECONDS} s`),
    prefix: "geo-audit:rl",
  });
  return _upstashLimiter;
}

// Fallback: in-memory sliding window (single instance only).
const _rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = RATE_LIMIT_WINDOW_SECONDS * 1000;

async function checkRateLimit(ip: string): Promise<boolean> {
  const upstash = getUpstashLimiter();
  if (upstash) {
    const { success } = await upstash.limit(ip);
    return success;
  }
  // In-memory fallback
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

// Returns true for IP addresses and hostnames that map to private/internal
// networks so we can block SSRF attempts before making the outbound request.
function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();

  // Explicit loopback / wildcard
  if (h === "localhost" || h === "0.0.0.0" || h === "::1") return true;

  // Cloud metadata endpoints (GCP, AWS link-local, etc.)
  if (h === "metadata.internal" || h === "metadata.google.internal") return true;

  // IPv4: only block if the hostname is a raw IP address.
  // Hostname-based DNS bypass is a separate (harder) problem; this covers
  // the most common SSRF payloads that use IP literals.
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 0)   return true;  // 0.0.0.0/8
    if (a === 10)  return true;  // 10.0.0.0/8  private
    if (a === 127) return true;  // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true;     // 169.254.0.0/16 link-local (AWS metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 0  && Number(ipv4[3]) === 2) return true; // 192.0.2.0/24 TEST-NET
    if (a === 192 && b === 168) return true;     // 192.168.0.0/16 private
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
    if (a === 100 && b >= 64 && b <= 127) return true;   // 100.64.0.0/10 CGNAT
    if (a >= 224)  return true;  // 224+ multicast / reserved / broadcast
  }

  // IPv6 link-local and ULA
  if (h.startsWith("fe80:")) return true;  // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // ULA

  return false;
}

async function scrapeWebsite(url: string): Promise<{ title: string; description: string; content: string } | null> {
  try {
    let normalizedUrl = url;
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      normalizedUrl = "https://" + normalizedUrl;
    }

    // SSRF guard: validate scheme and block private/internal destinations.
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      return null;
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") return null;
    if (isPrivateHostname(parsedUrl.hostname)) return null;

    const res = await withTimeout(
      fetch(normalizedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; GEOAudit/1.0)" },
        // Disable automatic redirect-following to prevent SSRF via open redirects
        // to internal hosts. The scraped page is informational only; losing a
        // redirect is acceptable.
        redirect: "error",
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

// ── Brand metadata detection ─────────────────────────────────
// Runs LOCALLY against scraped site content. The strings it produces
// (category / topCompetitor / icpPhrase) are the ONLY site-derived data
// we're ever allowed to feed into audit-LLM prompts - and even those
// never mention the brand itself, so the audit stays context-free.

type BrandMeta = {
  category: string;
  topCompetitor: string | null;
  icpPhrase: string | null;
};

async function detectBrandMeta(
  scraped: { title: string; description: string; content: string },
  brand: string
): Promise<BrandMeta> {
  try {
    const model = getGenAI().getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" } as any,
    });
    // Sanitize user-supplied brand name and scraped content before injecting
    // into the prompt. Truncate to prevent runaway inputs and wrap untrusted
    // website content in XML delimiters so the model treats it as data.
    const safeBrand = brand.slice(0, 200);
    const safeTitle = scraped.title.slice(0, 200);
    const safeDesc  = scraped.description.slice(0, 500);
    const safeContent = scraped.content.slice(0, 1200);

    const res = await withTimeout(
      model.generateContent({
        contents: [{
          role: "user",
          parts: [{
            text: `Analyze this website for the brand "${safeBrand}" and extract three pieces of metadata.

Return JSON only:
{
  "category": "2-4 words describing the business / product category, e.g. 'project management', 'CRM for startups', 'coffee shop', 'law firm'",
  "topCompetitor": "single most well-known competitor brand name a typical buyer would compare against, or null if no clear competitor can be inferred. Must be a real, named competitor - not a generic phrase.",
  "icpPhrase": "one short noun phrase describing the ideal customer, e.g. 'small dev teams shipping B2B SaaS', 'solo freelancers', 'enterprise legal departments'. MUST NOT contain the name '${safeBrand}' or any brand name - describe only the customer type."
}

<website_data>
Title: ${safeTitle}
Description: ${safeDesc}
Content: ${safeContent}
</website_data>`,
          }],
        }],
      }),
      15_000
    );
    const json = safeParseJSON(res.response.text()) ?? {};
    const brandLower = brand.toLowerCase();
    const icp = typeof json.icpPhrase === "string" ? json.icpPhrase.trim() : "";
    const safeIcp = icp && !icp.toLowerCase().includes(brandLower) ? icp : null;
    const competitor = typeof json.topCompetitor === "string" ? json.topCompetitor.trim() : "";
    const safeCompetitor =
      competitor && competitor.toLowerCase() !== brandLower && competitor.toLowerCase() !== "null"
        ? competitor
        : null;
    return {
      category: json.category || "business",
      topCompetitor: safeCompetitor,
      icpPhrase: safeIcp,
    };
  } catch {
    return { category: "business", topCompetitor: null, icpPhrase: null };
  }
}

// ── Model Callers (JSON mode) ────────────────────────────────

const SYSTEM_PROMPT =
  "You are a knowledgeable business analyst with broad expertise across industries - technology, retail, finance, healthcare, hospitality, professional services, and more. Answer directly and honestly based on what you actually know. If you don't know something, say so. Always respond with valid JSON only, no markdown fences, no extra text.";

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
  return `Tell me what you know about "${brand}". If you don't recognize the name or have very little knowledge about it, say so plainly - do NOT guess, do NOT fabricate details, do NOT infer from the name what the product might be.

Respond with JSON:
{
  "brand_recognized": true/false,
  "description": "2-3 sentences describing what ${brand} does, who they serve, and how they differentiate - or null if unrecognized",
  "recognition_score": 0-100,
  "accuracy_score": 0-100,
  "detail_score": 0-100,
  "confidence_score": 0-100
}

recognition_score: 0 = never heard of it, 50 = vaguely familiar, 100 = deeply familiar.
accuracy_score: your own estimate of how factually correct your description is. Set to 0 if you're guessing or unrecognized.
detail_score: how detailed and specific your description is (vs generic).
confidence_score: your overall confidence level in this answer.`;
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

// ── Recommendation prompt variants ───────────────────────────
// Three buyer-intent queries. Each contains only a category, a
// competitor name, or an ICP phrase - never context about the brand
// itself. We check whether the brand shows up unprompted.

const RECOMMENDATION_JSON_SHAPE = `
Respond with JSON:
{
  "tools_mentioned": ["tool1", "tool2", "tool3", "tool4", "tool5"],
  "brand_mentioned": true/false,
  "brand_position": null or 1-5,
  "tools_above_brand": ["tools ranked above the brand"],
  "recommendation_strength": 0-100,
  "context_relevance": 0-100
}

recommendation_strength: 0 = would never recommend this brand, 50 = decent option, 100 = undisputed leader.
context_relevance: 0 = wrong category, 50 = tangentially relevant, 100 = perfect fit.`;

function buildRecommendationCategoryPrompt(brand: string, categoryBase: string): string {
  return `What are the best ${categoryBase} tools available right now? Give me your top 5 ranked from best to worst. Be specific about who each tool is best for.

After listing your top 5, check: does "${brand}" appear in your list?
${RECOMMENDATION_JSON_SHAPE}`;
}

function buildRecommendationAlternativesPrompt(brand: string, topCompetitor: string): string {
  return `I'm looking for alternatives to ${topCompetitor}. What 5 tools do you recommend instead, ranked best to worst? Be specific about who each tool is best for.

After listing, check: does "${brand}" appear in your list?
${RECOMMENDATION_JSON_SHAPE}`;
}

function buildRecommendationUseCasePrompt(brand: string, categoryBase: string, icpPhrase: string): string {
  return `What's the best ${categoryBase} for ${icpPhrase}? Give me your top 5 ranked best to worst, with a one-sentence reason for each.

After listing, check: does "${brand}" appear in your list?
${RECOMMENDATION_JSON_SHAPE}`;
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

function computeDisagreement(scores: number[]): { stddev: number; flagged: boolean } {
  const valid = scores.filter((s) => s > 0);
  if (valid.length < 2) return { stddev: 0, flagged: false };
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const variance = valid.reduce((sum, s) => sum + (s - mean) ** 2, 0) / valid.length;
  const stddev = Math.sqrt(variance);
  return { stddev: Math.round(stddev), flagged: stddev >= 20 };
}

// ── Accuracy judge ───────────────────────────────────────────
// Runs AFTER the audit LLMs have responded. Compares each LLM's
// description of the brand against the scraped site to flag
// hallucinations and produce an accuracy score. The audit LLMs
// themselves NEVER see site content - only the judge does.

async function judgeAccuracy(
  description: string,
  scraped: { title: string; description: string; content: string }
): Promise<{ accuracyScore: number; falseClaims: string[] } | null> {
  if (!description) return null;
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
            text: `You are fact-checking one LLM's description of a brand against that brand's actual website.

<llm_description>
${description.slice(0, 1000)}
</llm_description>

<website_data>
Title: ${scraped.title.slice(0, 200)}
Description: ${scraped.description.slice(0, 500)}
Content: ${scraped.content.slice(0, 1500)}
</website_data>

How factually accurate is the LLM description? Return JSON only:
{
  "accuracy_score": 0-100,
  "false_claims": ["specific claim that contradicts the site", "..."]
}

accuracy_score: 100 = every claim matches the site. 70 = mostly right, minor errors. 50 = partially right. 0 = heavily hallucinated or wrong.
Only include false_claims when a claim clearly contradicts what the site says. Keep them short (max 10 words each). Empty array if none.`,
          }],
        }],
      }),
      15_000
    );
    const json = safeParseJSON(res.response.text()) ?? {};
    const claims = Array.isArray(json.false_claims)
      ? json.false_claims
          .filter((c: unknown): c is string => typeof c === "string" && c.length > 0 && c.length < 200)
          .slice(0, 3)
      : [];
    return {
      accuracyScore: clamp(safeNum(json.accuracy_score)),
      falseClaims: claims,
    };
  } catch {
    return null;
  }
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
    if (avgScore < 50) parts.push("But descriptions lack depth and accuracy - there's room to improve how AI understands you.");
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

    if (!(await checkRateLimit(ip))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Max 3 audits per hour per IP." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { brand: rawBrand, category: rawCategory, websiteUrl: rawUrl } = body;

    if (!rawBrand || !rawUrl) {
      return NextResponse.json({ error: "Missing brand or website URL" }, { status: 400 });
    }

    // Sanitize and clamp user inputs to reasonable lengths.
    const brand = String(rawBrand).trim().slice(0, 200);
    const websiteUrl = String(rawUrl).trim().slice(0, 2048);
    const userCategory = rawCategory ? String(rawCategory).trim().slice(0, 200) : undefined;

    const scraped = await scrapeWebsite(websiteUrl);
    const meta: BrandMeta = scraped
      ? await detectBrandMeta(scraped, brand)
      : { category: "business", topCompetitor: null, icpPhrase: null };
    const category = userCategory?.trim() || meta.category;

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
        await processAudit(auditId, brand, category, meta.topCompetitor, meta.icpPhrase, scraped);
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

type RecQueryType = "category" | "alternatives" | "use-case";

type RecQueryDef = {
  type: RecQueryType;
  query: string;
  prompt: string;
};

function buildRecQueries(brand: string, categoryBase: string, topCompetitor: string | null, icpPhrase: string | null): RecQueryDef[] {
  const list: RecQueryDef[] = [{
    type: "category",
    query: `Best ${categoryBase} tools`,
    prompt: buildRecommendationCategoryPrompt(brand, categoryBase),
  }];
  if (topCompetitor) {
    list.push({
      type: "alternatives",
      query: `Alternatives to ${topCompetitor}`,
      prompt: buildRecommendationAlternativesPrompt(brand, topCompetitor),
    });
  }
  if (icpPhrase) {
    list.push({
      type: "use-case",
      query: `Best ${categoryBase} for ${icpPhrase}`,
      prompt: buildRecommendationUseCasePrompt(brand, categoryBase, icpPhrase),
    });
  }
  return list;
}

async function processAudit(
  auditId: string,
  brand: string,
  category: string,
  topCompetitor: string | null,
  icpPhrase: string | null,
  scraped: { title: string; description: string; content: string } | null
) {
  const supabase = getSupabase();
  const categoryBase = category.replace(/\s+tools?\s*$/i, "").trim();
  console.log(`[${auditId}] processAudit start - brand: ${brand}, category: ${category}, topCompetitor: ${topCompetitor ?? "none"}, icp: ${icpPhrase ?? "none"}`);

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

  // Accuracy judge - runs AFTER the audit LLMs have answered, completely
  // separate from them. The audit LLMs never see site content; only this
  // judge does, and only to grade their answers.
  const judgeResults = await Promise.all(awarenessResults.map(async (raw) => {
    if (!scraped || raw.error || !raw.data || !raw.data.brand_recognized || !raw.data.description) return null;
    return judgeAccuracy(raw.data.description, scraped);
  }));

  const modelAwareness = awarenessResults.map((raw, i) => {
    if (raw.error || !raw.data) return {
      model: MODEL_NAMES[i], known: false, description: null,
      scores: { recognition: 0, accuracy: 0, detail: 0, confidence: 0 }, score: 0,
      citations: [] as string[],
      accuracyScore: null as number | null, falseClaims: [] as string[],
    };
    const { score: rawScore, subscores } = scoreAwareness(raw.data);
    const judge = judgeResults[i];
    const accuracyScore = judge?.accuracyScore ?? null;
    const falseClaims = judge?.falseClaims ?? [];
    const finalScore = accuracyScore != null ? Math.round(rawScore * (accuracyScore / 100)) : rawScore;
    return {
      model: MODEL_NAMES[i],
      known: raw.data.brand_recognized ?? false,
      description: raw.data.description ?? null,
      scores: subscores,
      score: finalScore,
      citations: raw.citations ?? [],
      accuracyScore,
      falseClaims,
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

  const avgAwareness = Math.round(validAvg(awarenessScores));
  const avgPositioning = Math.round(validAvg(positioningScores));

  const awarenessDisagreement = computeDisagreement(awarenessScores);
  const positioningDisagreement = computeDisagreement(positioningScores);

  const awarenessInsight = generateAwarenessInsight(modelAwareness, brand);

  // Hallucination summary flag - surfaced prominently in the UI when models
  // make things up about the brand.
  const allFalseClaims = modelAwareness.flatMap((m) => m.falseClaims.map((c) => ({ model: m.model, claim: c })));
  const lowestAccuracy = modelAwareness
    .map((m) => m.accuracyScore)
    .filter((a): a is number => a != null)
    .reduce((min, v) => Math.min(min, v), 100);
  const hallucinationFlag = allFalseClaims.length > 0 || lowestAccuracy < 60;

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

  // Partial result - write to DB so the UI can start rendering
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
        accuracyScore: m.accuracyScore,
        falseClaims: m.falseClaims,
      })),
      disagreement: awarenessDisagreement,
      hallucinationFlag,
      falseClaims: allFalseClaims,
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
      disagreement: positioningDisagreement,
      insight: positioningInsight,
    },
  };

  console.log(`[${auditId}] Phase 1 complete - awareness: ${avgAwareness} (accuracy-adjusted), positioning: ${avgPositioning}`);
  await supabase
    .from("audits")
    .update({ result: partialResult })
    .eq("id", auditId);

  // ── Phase 2: Recommendation (multi-query) + Competitive ─────
  console.log(`[${auditId}] Phase 2 start`);
  const recQueries = buildRecQueries(brand, categoryBase, topCompetitor, icpPhrase);
  const phase2 = await Promise.all([
    runAllModels(buildCompetitivePrompt(brand, categoryBase)),
    ...recQueries.map((q) => runAllModels(q.prompt)),
  ]);
  const compResults = phase2[0];
  const recResultsByQuery = phase2.slice(1);

  for (let i = 0; i < MODEL_NAMES.length; i++) {
    addUsage(MODEL_NAMES[i], compResults[i].inputTokens, compResults[i].outputTokens);
    for (const qResults of recResultsByQuery) {
      addUsage(MODEL_NAMES[i], qResults[i].inputTokens, qResults[i].outputTokens);
    }
  }

  // Aggregate per-model recommendation across the 1-3 queries
  const modelRecommendation = MODEL_NAMES.map((name, mi) => {
    const perQuery = recQueries.map((q, qi) => {
      const raw = recResultsByQuery[qi][mi];
      if (raw.error || !raw.data) return {
        type: q.type, query: q.query,
        rank: null as number | null, listed: false, aboveYou: [] as string[], fullList: [] as string[], score: 0,
      };
      return {
        type: q.type,
        query: q.query,
        rank: (raw.data.brand_position ?? null) as number | null,
        listed: raw.data.brand_mentioned ?? false,
        aboveYou: toStringArray(raw.data.tools_above_brand),
        fullList: toStringArray(raw.data.tools_mentioned),
        score: scoreRecommendation(raw.data),
      };
    });
    const modelScore = perQuery.length ? Math.round(average(perQuery.map((p) => p.score))) : 0;
    const listed = perQuery.some((p) => p.listed);
    const ranks = perQuery.filter((p) => p.rank != null).map((p) => p.rank!);
    const rank = ranks.length ? Math.min(...ranks) : null;
    const aboveYou = [...new Set(perQuery.flatMap((p) => p.aboveYou))];
    const freq: Record<string, number> = {};
    perQuery.forEach((p) => p.fullList.forEach((t) => { freq[t] = (freq[t] || 0) + 1; }));
    const fullList = Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([t]) => t);
    return {
      model: name,
      rank,
      listed,
      aboveYou,
      fullList,
      score: modelScore,
      queries: perQuery,
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

  const avgRecommendation = Math.round(validAvg(recScores));
  const avgCompetitive = Math.round(validAvg(compScores));

  const recDisagreement = computeDisagreement(recScores);
  const compDisagreement = computeDisagreement(compScores);

  // Reweighted overall: Recommendation 40% (buyer intent), Awareness 25%,
  // Positioning 20%, Competitive 15%. Recommendation is the real money
  // metric - it's what happens at the moment of purchase consideration.
  const overallScore = clamp(Math.round(
    avgRecommendation * 0.40 +
    avgAwareness * 0.25 +
    avgPositioning * 0.20 +
    avgCompetitive * 0.15
  ));
  const overallVerdict = getOverallVerdict(overallScore);

  // Share of voice - counted across all recommendation queries
  const toolCounts: Record<string, number> = {};
  for (const m of modelRecommendation) {
    for (const q of m.queries) {
      for (const tool of q.fullList) {
        const normalized = tool.toLowerCase().trim();
        if (!normalized) continue;
        toolCounts[normalized] = (toolCounts[normalized] || 0) + 1;
      }
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

  console.log(`[${auditId}] Phase 2 complete - recommendation: ${avgRecommendation}, competitive: ${avgCompetitive}, overall: ${overallScore}`);
  const recInsight = generateRecInsight(modelRecommendation, brand);
  const compInsight = generateCompInsight(modelCompetitive, brand);

  // ── Phase 3: Competitor Benchmarking ─────────────────────────
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
              runAllModels(buildRecommendationCategoryPrompt(compName, categoryBase)),
            ]);
            for (let i = 0; i < MODEL_NAMES.length; i++) {
              addUsage(MODEL_NAMES[i], awaRes[i].inputTokens, awaRes[i].outputTokens);
              addUsage(MODEL_NAMES[i], recRes[i].inputTokens, recRes[i].outputTokens);
            }
            const awaScores = awaRes.map((r) => r.error || !r.data ? 0 : scoreAwareness(r.data).score);
            const recScoresComp = recRes.map((r) => r.error || !r.data ? 0 : scoreRecommendation(r.data));
            const awaScore = Math.round(validAvg(awaScores));
            const recScore = Math.round(validAvg(recScoresComp));
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
    meta: { topCompetitor, icpPhrase },
    awareness: partialResult.awareness,
    positioning: partialResult.positioning,
    recommendation: {
      score: avgRecommendation,
      label: getScoreLabel(avgRecommendation, "recommendation"),
      color: getScoreColor(avgRecommendation),
      queriesUsed: recQueries.map((q) => ({ type: q.type, query: q.query })),
      modelResults: modelRecommendation.map((m) => ({
        model: m.model,
        rank: m.rank,
        listed: m.listed,
        aboveYou: m.aboveYou,
        fullList: m.fullList,
        queries: m.queries,
      })),
      shareOfVoice,
      disagreement: recDisagreement,
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
      disagreement: compDisagreement,
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
  console.log(`[${auditId}] processAudit done ✓ - cost: $${computeTotalCost(usage).toFixed(6)}`);
}
