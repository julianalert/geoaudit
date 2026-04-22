// ── Shared types for GEO Audit ───────────────────────────────
// Used by both app/api/run-audit/route.ts and app/audit/[id]/page.tsx

export interface AwarenessModelResult {
  model: string;
  known: boolean;
  description: string | null;
  scores?: { recognition: number; accuracy: number; detail: number; confidence: number };
  citations?: string[];
  /** Post-hoc accuracy grade from judge comparing LLM description to scraped site. Null if judge didn't run. */
  accuracyScore?: number | null;
  /** Specific factual claims that contradicted the site. */
  falseClaims?: string[];
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

export type RecommendationQueryType = "category" | "alternatives" | "use-case";

export interface RecommendationModelQueryResult {
  type: RecommendationQueryType;
  query: string;
  rank: number | null;
  listed: boolean;
  aboveYou: string[];
  fullList: string[];
  score?: number;
}

export interface RecommendationModelResult {
  model: string;
  rank: number | null;
  listed: boolean;
  aboveYou: string[];
  fullList: string[];
  queries?: RecommendationModelQueryResult[];
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
  competitorGaps?: Array<{ platform: string; competitors: string[]; suggestion: string }>;
}

export interface RoadmapAction {
  action: string;
  impact: "High" | "Medium" | "Low";
  category: string;
  where?: string;
  template?: string;
  scoreImpact?: string;
}

export interface RoadmapWeek {
  week: string;
  actions: RoadmapAction[];
}

export interface RoadmapData {
  weeks: RoadmapWeek[];
  insight: string;
}

export interface OpportunityCalculator {
  monthlyCategoryQueries: number;
  currentCaptureRate: number;
  estimatedMonthlyLoss: number;
  assumedAvgDealValue: number;
  note: string;
}

export interface PositioningBrief {
  llmUnderstanding: string;
  siteStatement: string;
  heroRewrite: string;
  metaRewrite: string;
  aboutRewrite: string;
  jsonLd: string;
}

export interface ContentBrief {
  title: string;
  targetQuery: string;
  outline: string[];
  format: string;
}

export interface ContentGapMap {
  briefs: ContentBrief[];
  insight: string;
}

export interface DisagreementFlag {
  stddev: number;
  flagged: boolean;
}

export interface AuditResult {
  brand: string;
  category: string;
  auditDate: string;
  overallScore: number;
  overallVerdict: string;
  overallSub: string;
  meta?: { topCompetitor: string | null; icpPhrase: string | null };
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
    disagreement?: DisagreementFlag;
    /** @deprecated Use disagreement. Kept for old audits in DB. */
    consistencyBonus?: number;
    hallucinationFlag?: boolean;
    falseClaims?: Array<{ model: string; claim: string }>;
    insight: string;
    accuracyScore?: number;
    accuracyFlag?: string;
  };
  positioning?: {
    score: number;
    label: string;
    color: string;
    modelResults: PositioningModelResult[];
    disagreement?: DisagreementFlag;
    /** @deprecated */
    consistencyBonus?: number;
    insight: string;
  };
  recommendation?: {
    score: number;
    label: string;
    color: string;
    /** @deprecated single-prompt version. Use queriesUsed. */
    promptUsed?: string;
    queriesUsed?: Array<{ type: RecommendationQueryType; query: string }>;
    modelResults: RecommendationModelResult[];
    shareOfVoice: Array<{ name: string; pct: number }>;
    disagreement?: DisagreementFlag;
    /** @deprecated */
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
    disagreement?: DisagreementFlag;
    /** @deprecated */
    consistencyBonus?: number;
    insight: string;
  };
  competitorBenchmarks?: CompetitorBenchmark[];
  onlinePresence?: OnlinePresenceData | null;
  /** @deprecated use onlinePresence */
  sourceAttribution?: OnlinePresenceData | null;
  roadmap?: RoadmapData | null;
  opportunityCalculator?: OpportunityCalculator | null;
  positioningBrief?: PositioningBrief | null;
  contentGapMap?: ContentGapMap | null;
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
