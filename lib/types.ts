// ── Shared types for GEO Audit ───────────────────────────────
// Used by both app/api/run-audit/route.ts and app/audit/[id]/page.tsx

export interface AwarenessModelResult {
  model: string;
  known: boolean;
  description: string | null;
  scores?: { recognition: number; accuracy: number; detail: number; confidence: number };
  citations?: string[];
}

export interface PositioningModelResult {
  model: string;
  strength: string;
  targetCustomer: string;
  valueProp: string;
  differentiation: string;
  scores?: { targetClarity: number; valuePropAccuracy: number; differentiationClarity: number };
  note: string;
}

export interface RecommendationModelResult {
  model: string;
  rank: number | null;
  listed: boolean;
  aboveYou: string[];
  fullList: string[];
}

export interface CompetitiveModelResult {
  model: string;
  sentiment: string;
  note: string;
}

export interface CompetitorBenchmark {
  name: string;
  awarenessScore: number;
  recommendationScore: number;
}

export interface OnlinePresenceSource {
  domain: string;
  status: "strong" | "weak" | "missing";
  note: string;
  priority: "high" | "medium" | "low";
}

export interface OnlinePresenceData {
  sources: OnlinePresenceSource[];
  insight: string;
}

export interface RoadmapAction {
  action: string;
  impact: "High" | "Medium" | "Low";
  category: string;
}

export interface RoadmapWeek {
  week: string;
  actions: RoadmapAction[];
}

export interface RoadmapData {
  weeks: RoadmapWeek[];
  insight: string;
}

export interface AuditResult {
  brand: string;
  category: string;
  auditDate: string;
  overallScore: number;
  overallVerdict: string;
  overallSub: string;
  quadrant: {
    awarenessScore: number;
    recommendationScore: number;
    label: string;
    description: string;
  };
  awareness: {
    score: number;
    label: string;
    color: string;
    modelResults: AwarenessModelResult[];
    consistencyBonus?: number;
    insight: string;
    accuracyScore?: number;
    accuracyFlag?: string;
  };
  positioning?: {
    score: number;
    label: string;
    color: string;
    modelResults: PositioningModelResult[];
    consistencyBonus?: number;
    insight: string;
  };
  recommendation?: {
    score: number;
    label: string;
    color: string;
    promptUsed: string;
    modelResults: RecommendationModelResult[];
    shareOfVoice: Array<{ name: string; pct: number }>;
    consistencyBonus?: number;
    insight: string;
  };
  competitive?: {
    score: number;
    label: string;
    color: string;
    competitor: string;
    wins: string[];
    losses: string[];
    sentimentPerModel: CompetitiveModelResult[];
    overallSentiment: string;
    consistencyBonus?: number;
    insight: string;
  };
  competitorBenchmarks?: CompetitorBenchmark[];
  onlinePresence?: OnlinePresenceData | null;
  /** @deprecated use onlinePresence */
  sourceAttribution?: OnlinePresenceData | null;
  roadmap?: RoadmapData | null;
}

export interface ScoreHistoryEntry {
  id: string;
  overall_score: number;
  created_at: string;
}

export interface AuditRow {
  id: string;
  status: string;
  result: AuditResult | null;
  brand: string;
  category: string;
  website_url: string | null;
  unlocked: boolean;
  scoreHistory?: ScoreHistoryEntry[];
}
