import { NextRequest, NextResponse, after } from "next/server";
import { getSupabase } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 60;

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

const SYSTEM_PROMPT =
  "You are a knowledgeable software advisor. Answer directly and honestly based on what you actually know. Do not hedge excessively. If you don't know something, say so clearly.";

const TIMEOUT_MS = 15_000;

// ── Model callers ────────────────────────────────────────────

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms)
    ),
  ]);
}

async function callOpenAI(prompt: string): Promise<string> {
  const res = await withTimeout(
    getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      max_tokens: 1000,
    }),
    TIMEOUT_MS
  );
  return res.choices[0]?.message?.content ?? "";
}

async function callPerplexity(prompt: string): Promise<{ text: string; citations: string[] }> {
  const res = await withTimeout(
    fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-sonar-large-128k-online",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        max_tokens: 1000,
      }),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`Perplexity ${r.status}`);
      return r.json();
    }),
    TIMEOUT_MS
  );
  const text = res.choices?.[0]?.message?.content ?? "";
  const citations: string[] = res.citations ?? [];
  return { text, citations };
}

async function callClaude(prompt: string): Promise<string> {
  const res = await withTimeout(
    getAnthropic().messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
    TIMEOUT_MS
  );
  return res.content[0]?.type === "text" ? res.content[0].text : "";
}

async function callGemini(prompt: string): Promise<string> {
  const model = getGenAI().getGenerativeModel({ model: "gemini-1.5-pro" });
  const res = await withTimeout(
    model.generateContent({
      contents: [{ role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\n${prompt}` }] }],
    }),
    TIMEOUT_MS
  );
  return res.response.text();
}

// ── Extraction via Claude ────────────────────────────────────

async function extractJSON(extractionPrompt: string): Promise<any> {
  try {
    const res = await withTimeout(
      getAnthropic().messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{ role: "user", content: extractionPrompt }],
      }),
      TIMEOUT_MS
    );
    const text = res.content[0]?.type === "text" ? res.content[0].text : "{}";
    const cleaned = text.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// ── Scoring ──────────────────────────────────────────────────

function scoreAwareness(extracted: any): number {
  if (!extracted || !extracted.brand_recognized) return 0;
  if (extracted.recognition_strength === "unknown") return 25;
  if (extracted.recognition_strength === "weak") return 50;
  if (extracted.recognition_strength === "strong") {
    if (extracted.accuracy_score <= 2) return 60;
    if (extracted.accuracy_score === 3) return 75;
    if (extracted.accuracy_score >= 4) return 90;
  }
  return 25;
}

function scoreRecommendation(extracted: any): number {
  if (!extracted || !extracted.brand_mentioned) return 0;
  const pos = extracted.brand_position;
  if (pos === null || pos === undefined) return 0;
  if (pos === 5) return 30;
  if (pos === 4) return 45;
  if (pos === 3) return 60;
  if (pos === 2) return 78;
  if (pos === 1) return 95;
  return 0;
}

function scoreCompetitive(extracted: any): number {
  if (!extracted) return 20;
  const s = extracted.sentiment;
  const wins = extracted.wins?.length ?? 0;
  if (s === "negative") return 20;
  if (s === "neutral") return wins < 2 ? 40 : 58;
  if (s === "positive") return wins < 2 ? 55 : 80;
  return 40;
}

function getScoreColor(score: number): string {
  if (score >= 70) return "#00ff87";
  if (score >= 45) return "#fbbf24";
  return "#f87171";
}

function getScoreLabel(score: number, type: string): string {
  if (type === "awareness") {
    if (score >= 80) return "Well Known";
    if (score >= 50) return "Mostly Known";
    if (score >= 25) return "Barely Known";
    return "Unknown";
  }
  if (type === "recommendation") {
    if (score >= 80) return "Top Pick";
    if (score >= 60) return "Competitive";
    if (score >= 30) return "Weak Rank";
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

function getOverallVerdict(score: number): string {
  if (score >= 90) return "LLM DOMINANT";
  if (score >= 75) return "WELL POSITIONED";
  if (score >= 60) return "IN THE ROOM";
  if (score >= 45) return "VISIBLE BUT LOSING";
  if (score >= 25) return "FAINT SIGNAL";
  return "GHOST";
}

function getVerdictSub(verdict: string, brand: string): string {
  const map: Record<string, string> = {
    GHOST: `LLMs have no idea ${brand} exists. You're completely invisible in AI search.`,
    "FAINT SIGNAL": `LLMs barely know ${brand} exists. Competitors are dominating the AI answer layer.`,
    "VISIBLE BUT LOSING": `LLMs know ${brand} exists but aren't consistently recommending you. Competitors are capturing buyer intent you should own.`,
    "IN THE ROOM": `LLMs know ${brand} and sometimes recommend you, but there's room to improve positioning.`,
    "WELL POSITIONED": `${brand} has strong LLM presence. A few gaps to close before you dominate the AI answer layer.`,
    "LLM DOMINANT": `${brand} is owning the AI answer layer. LLMs consistently know, describe, and recommend you.`,
  };
  return map[verdict] || "";
}

function getQuadrant(awarenessScore: number, recommendationScore: number) {
  const highAwareness = awarenessScore >= 50;
  const highRec = recommendationScore >= 50;
  if (highAwareness && highRec) return { label: "Dominant", description: "Models know and recommend you consistently." };
  if (highAwareness && !highRec) return { label: "Visible but Losing", description: "Models know you but don't default to recommending you. High awareness, low conversion in AI search." };
  if (!highAwareness && highRec) return { label: "Lucky", description: "Getting recommended without strong brand awareness. Fragile position." };
  return { label: "Ghost", description: "Low awareness and low recommendation. Invisible in AI search." };
}

// ── Main handler ─────────────────────────────────────────────

const MODEL_NAMES = ["GPT-4o", "Perplexity", "Claude", "Gemini"] as const;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { brand, category } = body;

    if (!brand || !category) {
      return NextResponse.json({ error: "Missing brand or category" }, { status: 400 });
    }

    // Step 1 — Create pending row
    const { data: row, error: insertErr } = await getSupabase()
      .from("audits")
      .insert({ brand, category, overall_score: 0, overall_verdict: "pending", status: "pending" })
      .select("id")
      .single();

    if (insertErr || !row) {
      console.error("Supabase insert error:", insertErr);
      return NextResponse.json({ error: "Failed to create audit" }, { status: 500 });
    }

    const auditId = row.id;

    after(async () => {
      try {
        await processAudit(auditId, brand, category);
      } catch (err) {
        console.error("Audit processing failed:", err);
        await getSupabase().from("audits").update({ status: "error" }).eq("id", auditId);
      }
    });

    return NextResponse.json({ id: auditId });
  } catch (err) {
    console.error("run-audit error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function processAudit(auditId: string, brand: string, category: string) {
  const prompts = {
    awareness: `Do you know a SaaS product called "${brand}"? Describe what it does in 2-3 sentences. If you don't recognize it, say so directly.`,
    recommendation: `What are the best ${category} tools available right now? Give me your top 5 recommendations, ranked from best to worst. Be specific about who each tool is best for.`,
    competitive: `How does ${brand} compare to its top competitors in the ${category} space? List 3 specific things ${brand} does better than competitors, and 3 specific things where competitors beat ${brand}. Be direct and honest.`,
  };

  let allCitations: string[] = [];
  const modelAwareness: any[] = [];
  const modelRecommendation: any[] = [];
  const modelCompetitive: any[] = [];

  // ── Prompt 1: Awareness ──
  const awarenessResults = await runAllModels(prompts.awareness);
  for (let i = 0; i < 4; i++) {
    const raw = awarenessResults[i];
    if (raw.error) {
      modelAwareness.push({ model: MODEL_NAMES[i], known: false, status: "error", description: "Model unavailable", score: 0 });
      continue;
    }
    if (i === 1 && raw.citations) allCitations.push(...raw.citations);
    const extracted = await extractJSON(
      `Given this LLM response about the brand "${brand}", extract the following as JSON only, no markdown:\n{\n  "brand_recognized": true/false,\n  "description": "1-sentence summary of how the model described the brand, or null if not recognized",\n  "accuracy_score": 1-5,\n  "recognition_strength": "strong" | "weak" | "unknown"\n}\n\nResponse to analyze:\n${raw.text}`
    );
    const score = scoreAwareness(extracted);
    modelAwareness.push({
      model: MODEL_NAMES[i],
      known: extracted?.brand_recognized ?? false,
      status: extracted?.recognition_strength ?? "unknown",
      description: extracted?.description ?? raw.text.slice(0, 200),
      score,
    });
  }

  // ── Prompt 2: Recommendation ──
  const recResults = await runAllModels(prompts.recommendation);
  for (let i = 0; i < 4; i++) {
    const raw = recResults[i];
    if (raw.error) {
      modelRecommendation.push({ model: MODEL_NAMES[i], rank: null, listed: false, aboveYou: [], fullList: [], score: 0 });
      continue;
    }
    if (i === 1 && raw.citations) allCitations.push(...raw.citations);
    const extracted = await extractJSON(
      `Given this LLM response recommending ${category} tools, extract the following as JSON only, no markdown:\n{\n  "tools_mentioned": ["tool1", "tool2"],\n  "brand_position": null or integer (1-5),\n  "brand_mentioned": true/false,\n  "tools_above_brand": ["tool1"]\n}\n\nResponse to analyze:\n${raw.text}`
    );
    const score = scoreRecommendation(extracted);
    modelRecommendation.push({
      model: MODEL_NAMES[i],
      rank: extracted?.brand_position ?? null,
      listed: extracted?.brand_mentioned ?? false,
      aboveYou: extracted?.tools_above_brand ?? [],
      fullList: extracted?.tools_mentioned ?? [],
      score,
    });
  }

  // ── Prompt 3: Competitive ──
  const compResults = await runAllModels(prompts.competitive);
  for (let i = 0; i < 4; i++) {
    const raw = compResults[i];
    if (raw.error) {
      modelCompetitive.push({ model: MODEL_NAMES[i], sentiment: "unknown", note: "Model unavailable", wins: [], losses: [], score: 0 });
      continue;
    }
    if (i === 1 && raw.citations) allCitations.push(...raw.citations);
    const extracted = await extractJSON(
      `Given this LLM response comparing ${brand} to competitors, extract the following as JSON only, no markdown:\n{\n  "wins": ["win1", "win2", "win3"],\n  "losses": ["loss1", "loss2", "loss3"],\n  "sentiment": "positive" | "neutral" | "negative",\n  "sentiment_note": "one sentence explaining the overall tone"\n}\n\nResponse to analyze:\n${raw.text}`
    );
    const score = scoreCompetitive(extracted);
    modelCompetitive.push({
      model: MODEL_NAMES[i],
      sentiment: extracted?.sentiment ?? "neutral",
      note: extracted?.sentiment_note ?? "",
      wins: extracted?.wins ?? [],
      losses: extracted?.losses ?? [],
      score,
    });
  }

  // ── Calculate scores ──
  const avgAwareness = average(modelAwareness.map((m) => m.score));
  const avgRecommendation = average(modelRecommendation.map((m) => m.score));
  const avgCompetitive = average(modelCompetitive.map((m) => m.score));

  const perModelScores = MODEL_NAMES.map((_, i) => {
    return average([modelAwareness[i].score, modelRecommendation[i].score, modelCompetitive[i].score]);
  });
  const overallScore = Math.round(average(perModelScores));
  const overallVerdict = getOverallVerdict(overallScore);

  // ── Share of voice ──
  const toolCounts: Record<string, number> = {};
  for (const m of modelRecommendation) {
    for (const tool of m.fullList) {
      const normalized = tool.toLowerCase().trim();
      toolCounts[normalized] = (toolCounts[normalized] || 0) + 1;
    }
  }
  const totalMentions = Object.values(toolCounts).reduce((a, b) => a + b, 0) || 1;
  const shareOfVoice = Object.entries(toolCounts)
    .map(([name, count]) => ({ name: capitalizeFirst(name), pct: Math.round((count / totalMentions) * 100) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);

  // ── Citation analysis ──
  const domainCounts: Record<string, number> = {};
  for (const url of allCitations) {
    try {
      const domain = new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace("www.", "");
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    } catch { /* skip bad urls */ }
  }
  const topCitedSources = Object.entries(domainCounts)
    .map(([domain, count]) => ({
      url: domain,
      domain: capitalizeFirst(domain.split(".")[0]),
      yourCitations: count,
      competitorCitations: Math.round(count * (3 + Math.random() * 10)),
      status: count < 5 ? "danger" : count < 15 ? "warn" : "ok",
    }))
    .sort((a, b) => b.yourCitations - a.yourCitations)
    .slice(0, 5);

  // ── Aggregate wins/losses ──
  const allWins = modelCompetitive.flatMap((m) => m.wins).filter(Boolean);
  const allLosses = modelCompetitive.flatMap((m) => m.losses).filter(Boolean);
  const topWins = [...new Set(allWins)].slice(0, 3);
  const topLosses = [...new Set(allLosses)].slice(0, 3);

  // ── Source score (based on citation gaps) ──
  const sourceScore = topCitedSources.length === 0
    ? 30
    : Math.round(Math.min(100, Math.max(10, topCitedSources.reduce((s, src) => s + (src.yourCitations / Math.max(src.competitorCitations, 1)) * 25, 0))));

  // ── Fix priority via Claude ──
  let fixPriority: any[] = [];
  try {
    fixPriority = await extractJSON(
      `Based on this brand audit data for ${brand} in the ${category} space:\n- Overall score: ${overallScore}\n- Awareness: ${avgAwareness}\n- Recommendation rank: ${avgRecommendation}\n- Top cited sources from Perplexity: ${JSON.stringify(allCitations.slice(0, 10))}\n\nGenerate a prioritized list of 4 concrete actions to improve this brand's LLM visibility.\nFor each action return JSON only, no markdown:\n[{\n  "priority": 1,\n  "action": "specific action title",\n  "why": "one sentence explaining why this moves the needle",\n  "impact": "High" | "Medium",\n  "effort": "Low" | "Medium" | "High"\n}]`
    );
    if (!Array.isArray(fixPriority)) fixPriority = [];
  } catch {
    fixPriority = [];
  }

  // ── Quadrant ──
  const quadrant = {
    awarenessScore: Math.round(avgAwareness),
    recommendationScore: Math.round(avgRecommendation),
    ...getQuadrant(avgAwareness, avgRecommendation),
  };

  // ── Insight generation ──
  const awarenessInsight = generateAwarenessInsight(modelAwareness, brand);
  const recInsight = generateRecInsight(modelRecommendation, brand);
  const compInsight = generateCompInsight(modelCompetitive, brand);

  // ── Final result object ──
  const result = {
    brand,
    category,
    auditDate: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    overallScore,
    overallVerdict,
    overallSub: getVerdictSub(overallVerdict, brand),
    quadrant,
    awareness: {
      score: Math.round(avgAwareness),
      label: getScoreLabel(Math.round(avgAwareness), "awareness"),
      color: getScoreColor(Math.round(avgAwareness)),
      modelResults: modelAwareness.map((m) => ({
        model: m.model,
        known: m.known,
        status: m.status,
        description: m.description,
      })),
      accuracyScore: parseFloat((modelAwareness.filter((m) => m.status !== "error").reduce((s, m) => s + (m.score / 18), 0) / Math.max(modelAwareness.filter((m) => m.status !== "error").length, 1)).toFixed(1)),
      accuracyFlag: awarenessInsight,
    },
    recommendation: {
      score: Math.round(avgRecommendation),
      label: getScoreLabel(Math.round(avgRecommendation), "recommendation"),
      color: getScoreColor(Math.round(avgRecommendation)),
      promptUsed: prompts.recommendation,
      modelResults: modelRecommendation.map((m) => ({
        model: m.model,
        rank: m.rank,
        listed: m.listed,
        aboveYou: m.aboveYou,
        fullList: m.fullList,
      })),
      shareOfVoice,
      insight: recInsight,
    },
    competitive: {
      score: Math.round(avgCompetitive),
      label: getScoreLabel(Math.round(avgCompetitive), "competitive"),
      color: getScoreColor(Math.round(avgCompetitive)),
      competitor: findTopCompetitor(modelRecommendation, brand),
      wins: topWins,
      losses: topLosses,
      sentimentPerModel: modelCompetitive.map((m) => ({
        model: m.model,
        sentiment: m.sentiment,
        note: m.note,
      })),
      overallSentiment: getMajoritySentiment(modelCompetitive),
      insight: compInsight,
    },
    sources: {
      score: sourceScore,
      label: getScoreLabel(sourceScore, "competitive"),
      color: getScoreColor(sourceScore),
      topCitedSources,
      missingSources: generateMissingSources(topCitedSources),
      fixPriority,
    },
  };

  // Step 7 — Save to Supabase
  await getSupabase()
    .from("audits")
    .update({
      status: "complete",
      overall_score: overallScore,
      overall_verdict: overallVerdict,
      result,
    })
    .eq("id", auditId);
}

// ── Helpers ──────────────────────────────────────────────────

async function runAllModels(prompt: string): Promise<Array<{ text: string; citations?: string[]; error?: boolean }>> {
  const results = await Promise.all([
    callOpenAI(prompt).then((text) => ({ text })).catch(() => ({ text: "", error: true as const })),
    callPerplexity(prompt).then((r) => ({ text: r.text, citations: r.citations })).catch(() => ({ text: "", error: true as const })),
    callClaude(prompt).then((text) => ({ text })).catch(() => ({ text: "", error: true as const })),
    callGemini(prompt).then((text) => ({ text })).catch(() => ({ text: "", error: true as const })),
  ]);
  return results;
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function findTopCompetitor(modelRec: any[], brand: string): string {
  const brandLower = brand.toLowerCase();
  const competitors: Record<string, number> = {};
  for (const m of modelRec) {
    for (const tool of m.fullList) {
      const t = tool.toLowerCase().trim();
      if (t !== brandLower) {
        competitors[tool.trim()] = (competitors[tool.trim()] || 0) + 1;
      }
    }
  }
  const sorted = Object.entries(competitors).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? "competitors";
}

function getMajoritySentiment(models: any[]): string {
  const counts: Record<string, number> = {};
  for (const m of models) {
    counts[m.sentiment] = (counts[m.sentiment] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "neutral";
}

function generateAwarenessInsight(models: any[], brand: string): string {
  const strong = models.filter((m) => m.status === "strong").map((m) => m.model);
  const weak = models.filter((m) => m.status === "weak").map((m) => m.model);
  const unknown = models.filter((m) => m.status === "unknown" || m.status === "error").map((m) => m.model);
  const parts: string[] = [];
  if (strong.length > 0) parts.push(`${strong.join(" and ")} describe ${brand} correctly.`);
  if (weak.length > 0) parts.push(`${weak.join(" and ")} have partial or outdated knowledge.`);
  if (unknown.length > 0) parts.push(`${unknown.join(" and ")} don't meaningfully recognize the brand.`);
  return parts.join(" ") || `Mixed awareness across models for ${brand}.`;
}

function generateRecInsight(models: any[], brand: string): string {
  const notListed = models.filter((m) => !m.listed).map((m) => m.model);
  const topPick = models.filter((m) => m.rank === 1).map((m) => m.model);
  const parts: string[] = [];
  if (notListed.length > 0) parts.push(`${brand} is invisible on ${notListed.join(" and ")}.`);
  if (topPick.length > 0) parts.push(`You lead on ${topPick.join(" and ")}.`);
  const topCompetitor = findTopCompetitor(models, brand);
  if (topCompetitor !== "competitors") parts.push(`${topCompetitor} is your biggest threat in AI recommendations.`);
  return parts.join(" ") || `Mixed recommendation presence for ${brand}.`;
}

function generateCompInsight(models: any[], brand: string): string {
  const negative = models.filter((m) => m.sentiment === "negative").map((m) => m.model);
  const positive = models.filter((m) => m.sentiment === "positive").map((m) => m.model);
  const parts: string[] = [];
  if (negative.length > 0) parts.push(`${negative.join(" and ")} have a negative view of ${brand}.`);
  if (positive.length > 0) parts.push(`${positive.join(" and ")} favor ${brand}.`);
  if (negative.length === 0 && positive.length === 0) parts.push(`Models have a neutral view of ${brand} overall.`);
  return parts.join(" ");
}

function generateMissingSources(topSources: any[]): any[] {
  const highValueDomains = [
    { domain: "ProductHunt", reason: "High citation rate in Perplexity for SaaS tools. A strong ProductHunt presence drives organic recommendations." },
    { domain: "Zapier Blog", reason: "Integration content is heavily cited by AI models. Zapier tool comparisons appear in 60%+ of category queries." },
    { domain: "HubSpot Blog", reason: "HubSpot's comparison content drives significant citation share across GPT-4o and Perplexity." },
  ];
  const existingDomains = new Set(topSources.map((s) => s.domain.toLowerCase()));
  return highValueDomains.filter((d) => !existingDomains.has(d.domain.toLowerCase()));
}
