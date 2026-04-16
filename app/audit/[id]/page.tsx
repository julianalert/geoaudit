"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ScoreRing, ModelBadge, SectionLabel, Card, CardHeader, InsightBox, PaywallGate } from "@/components/ui";

// ── Types ────────────────────────────────────────────────────

interface AuditResult {
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
    modelResults: Array<{
      model: string;
      known: boolean;
      description: string | null;
      scores?: { recognition: number; accuracy: number; detail: number; confidence: number };
    }>;
    consistencyBonus?: number;
    insight: string;
    accuracyScore?: number;
    accuracyFlag?: string;
  };
  positioning: {
    score: number;
    label: string;
    color: string;
    modelResults: Array<{
      model: string;
      strength: string;
      targetCustomer: string;
      valueProp: string;
      differentiation: string;
      scores?: { targetClarity: number; valuePropAccuracy: number; differentiationClarity: number };
      accuracyScore?: number;
      note: string;
    }>;
    consistencyBonus?: number;
    insight: string;
  };
  recommendation: {
    score: number;
    label: string;
    color: string;
    promptUsed: string;
    modelResults: Array<{
      model: string;
      rank: number | null;
      listed: boolean;
      aboveYou: string[];
      fullList: string[];
    }>;
    shareOfVoice: Array<{ name: string; pct: number }>;
    consistencyBonus?: number;
    insight: string;
  };
  competitive: {
    score: number;
    label: string;
    color: string;
    competitor: string;
    wins: string[];
    losses: string[];
    sentimentPerModel: Array<{
      model: string;
      sentiment: string;
      note: string;
    }>;
    overallSentiment: string;
    consistencyBonus?: number;
    insight: string;
  };
  onlinePresence?: {
    sources: Array<{
      domain: string;
      status: "strong" | "weak" | "missing";
      note: string;
      priority: "high" | "medium" | "low";
    }>;
    insight: string;
  } | null;
  sourceAttribution?: {
    sources: Array<{
      domain: string;
      status: "strong" | "weak" | "missing";
      note: string;
      priority: "high" | "medium" | "low";
    }>;
    insight: string;
  } | null;
  roadmap?: {
    weeks: Array<{
      week: string;
      actions: Array<{
        action: string;
        impact: "High" | "Medium" | "Low";
        category: string;
      }>;
    }>;
    insight: string;
  } | null;
}

interface AuditRow {
  id: string;
  status: string;
  result: AuditResult | null;
  brand: string;
  category: string;
  website_url: string | null;
  unlocked: boolean;
}

// ── Quadrant Chart ───────────────────────────────────────────

function QuadrantChart({ awarenessScore, recommendationScore, label }: { awarenessScore: number; recommendationScore: number; label: string }) {
  const x = Math.min(95, Math.max(5, awarenessScore));
  const y = Math.min(95, Math.max(5, 100 - recommendationScore));
  return (
    <div style={{ padding: "16px 0" }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "1.6 / 1", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#e2e8f020" }} />
        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "#e2e8f020" }} />
        {[
          { text: "Ghost", x: "25%", y: "75%" },
          { text: "Lucky", x: "25%", y: "25%" },
          { text: "Visible but Losing", x: "75%", y: "75%" },
          { text: "Dominant", x: "75%", y: "25%" },
        ].map((q) => (
          <div key={q.text} style={{ position: "absolute", left: q.x, top: q.y, transform: "translate(-50%, -50%)", fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: "0.05em", color: "#94a3b8", textAlign: "center", pointerEvents: "none" }}>
            {q.text.toUpperCase()}
          </div>
        ))}
        <div
          style={{
            position: "absolute",
            left: `${x}%`, top: `${y}%`,
            transform: "translate(-50%, -50%)",
            width: 14, height: 14, borderRadius: "50%",
            background: "#3b82f6", boxShadow: "0 0 12px #3b82f650",
            zIndex: 2,
          }}
        />
        <div style={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#94a3b8", letterSpacing: "0.1em" }}>AWARENESS →</div>
        <div style={{ position: "absolute", left: 4, top: "50%", transform: "translateY(-50%) rotate(-90deg)", fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#94a3b8", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>RECOMMENDATION →</div>
      </div>
      <div style={{ textAlign: "center", marginTop: 8 }}>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#3b82f6", fontWeight: 700 }}>{label.toUpperCase()}</span>
      </div>
    </div>
  );
}

// ── Loading State ────────────────────────────────────────────

function LoadingState({ brand, category }: { brand: string; category: string }) {
  const models = ["GPT-4o", "Perplexity", "Claude", "Gemini"];
  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "48px 24px", position: "relative", zIndex: 2 }}>
      <div style={{ marginBottom: 40, paddingBottom: 32, borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div style={{ width: 7, height: 7, background: "#3b82f6", borderRadius: "50%", boxShadow: "0 0 8px #3b82f6", animation: "pulse-dot 2.5s ease infinite" }} />
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#64748b" }}>FREE GEO AUDIT TOOL v2.0</span>
        </div>
        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(26px, 4vw, 42px)", fontWeight: 800, letterSpacing: "-1px", color: "#0f172a", lineHeight: 1.1, marginBottom: 8 }}>
          SCANNING LLMs FOR<br /><span style={{ color: "#fbbf24" }}>{(brand || "...").toUpperCase()}</span>
        </h1>
        <p style={{ fontSize: 14, color: "#64748b" }}>Category: <span style={{ color: "#475569" }}>{category || "Auto-detecting..."}</span></p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {models.map((m, i) => (
          <div key={m} style={{ padding: "24px 20px", background: "#ffffff", border: "1px solid #fbbf2425", borderRadius: 10, textAlign: "center", position: "relative", overflow: "hidden", animation: `fadeUp 0.4s ease ${i * 0.1}s both` }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent, #fbbf24, transparent)", animation: "scanline 2s linear infinite" }} />
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#64748b", marginBottom: 12 }}>{m.toUpperCase()}</div>
            <div style={{ width: 44, height: 44, borderRadius: "50%", border: "2px solid #fbbf2440", margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fbbf24", animation: "pulse-dot 1.5s ease infinite" }} />
            </div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#fbbf24", letterSpacing: "0.1em" }}>SCANNING...</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 32, padding: "16px 20px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, textAlign: "center" }}>
        <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#64748b", letterSpacing: "0.1em" }}>
          Querying LLMs with structured prompts. This takes about 30 seconds.
        </p>
      </div>
    </div>
  );
}

// ── Error State ──────────────────────────────────────────────

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ maxWidth: 500, margin: "120px auto", padding: "48px 32px", background: "#ffffff", border: "1px solid #f8717130", borderRadius: 10, textAlign: "center" }}>
      <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.6 }}>✗</div>
      <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 800, color: "#f87171", marginBottom: 10 }}>AUDIT FAILED</h2>
      <p style={{ fontSize: 14, color: "#64748b", marginBottom: 24, lineHeight: 1.6 }}>Something went wrong. This usually means one or more LLM APIs timed out.</p>
      <button onClick={onRetry} style={{ background: "#3b82f6", color: "#f8fafc", border: "none", padding: "12px 32px", fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, letterSpacing: "1.5px", cursor: "pointer", borderRadius: 6 }}>TRY AGAIN →</button>
    </div>
  );
}

// ── Full Results ─────────────────────────────────────────────

function AuditResultsView({ d, websiteUrl, unlocked, auditId }: { d: AuditResult; websiteUrl: string | null; unlocked: boolean; auditId: string }) {
  const [copied, setCopied] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const shareUrl = typeof window !== "undefined" ? window.location.href.split("?")[0] : "";
  const verdictColor = d.overallScore >= 70 ? "#3b82f6" : d.overallScore >= 45 ? "#fbbf24" : "#f87171";
  const sovColors = ["#fbbf24", "#f87171", "#64748b", "#94a3b8", "#cbd5e1"];

  // Remap legacy neon greens stored in DB to the design-system blue
  const fixColor = (c: string) => (c === "#00ff87" || c === "#22c55e" || c === "#10b981" ? "#34d399" : c);
  const modelNames = d.awareness.modelResults.map((m) => m.model).join(" · ");

  const onlinePresenceData = d.onlinePresence || d.sourceAttribution;

  async function handleUnlock() {
    if (checkingOut) return;
    setCheckingOut(true);
    try {
      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setCheckingOut(false);
      }
    } catch {
      setCheckingOut(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const paywallTeasers = buildTeasers(d);

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "48px 24px", position: "relative", zIndex: 2 }}>
      {/* ── Page Header ── */}
      <div className="fade" style={{ marginBottom: 40, paddingBottom: 32, borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div style={{ width: 7, height: 7, background: "#3b82f6", borderRadius: "50%", boxShadow: "0 0 8px #3b82f6", animation: "pulse-dot 2.5s ease infinite" }} />
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#64748b" }}>FREE GEO AUDIT TOOL v2.0</span>
        </div>
        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(26px, 4vw, 42px)", fontWeight: 800, letterSpacing: "-1px", color: "#0f172a", lineHeight: 1.1, marginBottom: 8 }}>
          GEO AUDIT REPORT<br /><span style={{ color: "#3b82f6" }}>{d.brand.toUpperCase()}</span>
        </h1>
        <p style={{ fontSize: 14, color: "#64748b", marginBottom: 14 }}>
          {websiteUrl && <>{websiteUrl}&nbsp;&nbsp;·&nbsp;&nbsp;</>}
          {d.category}&nbsp;&nbsp;·&nbsp;&nbsp;{d.auditDate}&nbsp;&nbsp;·&nbsp;&nbsp;Models: {modelNames}
        </p>

        {/* Combined score card */}
        <div style={{ padding: "24px 28px", background: "#ffffff", border: `1px solid ${verdictColor}30`, borderRadius: 10, display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
          <ScoreRing score={d.overallScore} size={96} stroke={8} />
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#64748b", marginBottom: 6 }}>OVERALL LLM VISIBILITY SCORE</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(22px, 3vw, 34px)", fontWeight: 800, color: verdictColor, lineHeight: 1.05, letterSpacing: "-0.5px", marginBottom: 10 }}>{d.overallVerdict}</div>
            <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: 0 }}>{d.overallSub}</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 240, flexGrow: 1 }}>
            {[
              { label: "Brand Awareness", score: d.awareness.score, color: fixColor(d.awareness.color) },
              { label: "Brand Positioning", score: d.positioning?.score ?? 0, color: fixColor(d.positioning?.color ?? "#64748b") },
              { label: "Recommendation Rank", score: d.recommendation.score, color: fixColor(d.recommendation.color) },
              { label: "Competitive Context", score: d.competitive.score, color: fixColor(d.competitive.color) },
            ].map((dim) => (
              <div key={dim.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: "0.05em", color: "#64748b", width: 110, textAlign: "right", lineHeight: 1.4, flexShrink: 0 }}>{dim.label.toUpperCase()}</div>
                <div style={{ flex: 1, height: 4, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${dim.score}%`, height: "100%", background: dim.color, borderRadius: 2, transition: "width 1.2s ease" }} />
                </div>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: dim.color, width: 28, fontWeight: 700, textAlign: "right", flexShrink: 0 }}>{dim.score}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Share URL */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, padding: "10px 16px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8 }}>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#64748b", flexShrink: 0 }}>SHARE URL</span>
          <div style={{ flex: 1, padding: "6px 12px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 4, fontSize: 12, color: "#475569", fontFamily: "'Space Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shareUrl}</div>
          <button onClick={handleCopy} style={{ background: copied ? "#3b82f620" : "#e2e8f0", border: `1px solid ${copied ? "#3b82f640" : "#d1d5db"}`, color: copied ? "#3b82f6" : "#475569", padding: "6px 14px", borderRadius: 4, cursor: "pointer", fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 500, transition: "all 0.2s" }}>
            {copied ? "COPIED" : "COPY"}
          </button>
        </div>
      </div>

      {/* ── Section 01: Brand Awareness (FREE) ── */}
      <div className="fade" style={{ marginBottom: 28 }}>
        <SectionLabel>01 — BRAND AWARENESS</SectionLabel>
        <Card>
          <CardHeader icon="◈" title="Brand Awareness" score={d.awareness.score} label={d.awareness.label} color={fixColor(d.awareness.color)} description="Do LLMs know your brand exists and can they describe it accurately?" />
          <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            {d.awareness.modelResults.map((m, i) => {
              const status = m.known ? "strong" : "unknown";
              return (
                <div key={i} style={{ display: "flex", gap: 14, padding: "12px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6 }}>
                  <div style={{ flexShrink: 0, paddingTop: 1 }}><ModelBadge model={m.model} status={status} /></div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, color: m.known ? "#334155" : "#94a3b8", fontStyle: m.known ? "normal" : "italic" }}>
                      {m.description ? `\u201C${m.description}\u201D` : "Brand not recognized"}
                    </p>
                    {m.scores && (
                      <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                        {[
                          { label: "Recognition", val: m.scores.recognition },
                          { label: "Accuracy", val: m.scores.accuracy },
                          { label: "Detail", val: m.scores.detail },
                          { label: "Confidence", val: m.scores.confidence },
                        ].map((s) => (
                          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#94a3b8" }}>{s.label.toUpperCase()}</span>
                            <div style={{ width: 40, height: 3, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ width: `${s.val}%`, height: "100%", background: s.val >= 60 ? "#3b82f6" : s.val >= 30 ? "#fbbf24" : "#f87171", borderRadius: 2 }} />
                            </div>
                            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#64748b" }}>{s.val}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <InsightBox>{d.awareness.insight || d.awareness.accuracyFlag || "No insight available."}</InsightBox>
        </Card>
      </div>

      {/* Mid-report CTA */}
      <div className="fade" style={{ position: "relative", overflow: "hidden", padding: "28px 32px", marginBottom: 28, background: "linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)", border: "1px solid #3b82f630", borderRadius: 12, boxShadow: "0 0 40px #3b82f610, inset 0 1px 0 #3b82f618" }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, #3b82f618 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#3b82f6", marginBottom: 10 }}>LLM VISIBILITY = CUSTOMERS YOU&apos;RE NOT REACHING YET.</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.3px", lineHeight: 1.2 }}>Book a free 15-min call and leave with a prioritized action plan.</div>
          </div>
          <button onClick={() => window.open("https://calendly.com/not-another-marketer/free-ai-growth-audit-call", "_blank")} style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "13px 28px", fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 700, letterSpacing: "1.2px", cursor: "pointer", borderRadius: 6, whiteSpace: "nowrap", flexShrink: 0, transition: "transform 0.15s, box-shadow 0.2s" }} onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px #3b82f650"; }} onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
            BOOK A FREE CALL →
          </button>
        </div>
      </div>

      {/* ── Section 02: Brand Positioning (FREE) ── */}
      {d.positioning && (
        <div className="fade" style={{ marginBottom: 28 }}>
          <SectionLabel>02 — BRAND POSITIONING</SectionLabel>
          <Card>
            <CardHeader icon="◎" title="Brand Positioning" score={d.positioning.score} label={d.positioning.label} color={fixColor(d.positioning.color)} description="How do LLMs understand your market position and value proposition?" />
            <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
              {d.positioning.modelResults.map((m, i) => {
                const statusColor = m.strength === "strong" ? "#334155" : m.strength === "weak" ? "#475569" : "#94a3b8";
                return (
                  <div key={i} style={{ display: "flex", gap: 14, padding: "12px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6 }}>
                    <div style={{ flexShrink: 0, paddingTop: 1 }}><ModelBadge model={m.model} status={m.strength} /></div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                      {[
                        { label: "Target", value: m.targetCustomer },
                        { label: "Value prop", value: m.valueProp },
                        { label: "Differentiator", value: m.differentiation },
                      ].map((row) => (
                        <div key={row.label}>
                          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: "#64748b", marginRight: 8 }}>{row.label.toUpperCase()}</span>
                          <span style={{ fontSize: 13, color: statusColor, lineHeight: 1.5 }}>{row.value || "\u2014"}</span>
                        </div>
                      ))}
                      {m.scores && (
                        <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
                          {[
                            { label: "Clarity", val: m.scores.targetClarity },
                            { label: "Accuracy", val: m.scores.valuePropAccuracy },
                            { label: "Differentiation", val: m.scores.differentiationClarity },
                          ].map((s) => (
                            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#94a3b8" }}>{s.label.toUpperCase()}</span>
                              <div style={{ width: 36, height: 3, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ width: `${s.val}%`, height: "100%", background: s.val >= 60 ? "#3b82f6" : s.val >= 30 ? "#fbbf24" : "#f87171", borderRadius: 2 }} />
                              </div>
                              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: "#64748b" }}>{s.val}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <InsightBox>{d.positioning.insight}</InsightBox>
          </Card>
        </div>
      )}

      {/* ── Section 03: Recommendation Rank (PARTIAL FREE) ── */}
      <div className="fade" style={{ marginBottom: 28 }}>
        <SectionLabel>03 — RECOMMENDATION RANK</SectionLabel>
        <Card>
          <CardHeader icon="◆" title="Recommendation Rank" score={d.recommendation.score} label={d.recommendation.label} color={fixColor(d.recommendation.color)} description="Do you appear when buyers search for your category?" />
          <div style={{ marginBottom: 16, padding: "10px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6 }}>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#64748b" }}>PROMPT &nbsp;</span>
            <span style={{ fontSize: 13, color: "#475569", fontStyle: "italic" }}>&ldquo;What are the best {d.category} tools?&rdquo;</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${d.recommendation.modelResults.length}, 1fr)`, gap: 8, marginBottom: 16 }}>
            {d.recommendation.modelResults.map((m, i) => (
              <div key={i} style={{ padding: 14, background: "#f1f5f9", border: `1px solid ${m.listed ? "#fbbf2425" : "#f8717130"}`, borderRadius: 8, textAlign: "center" }}>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: "#64748b", marginBottom: 8 }}>{m.model}</div>
                {m.listed ? (
                  <>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 800, lineHeight: 1, color: "#fbbf24" }}>#{m.rank}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>of 5 listed</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 800, color: "#f87171", lineHeight: 1, marginTop: 4 }}>&mdash;</div>
                    <div style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>Not listed</div>
                  </>
                )}
              </div>
            ))}
          </div>
          <InsightBox>{d.recommendation.insight}</InsightBox>
        </Card>
      </div>

      {/* ── PAYWALL BOUNDARY ── */}
      {!unlocked && (
        <PaywallGate onUnlock={handleUnlock} checkingOut={checkingOut} teasers={paywallTeasers} />
      )}

      {/* ── Premium Sections (only when unlocked) ── */}
      {unlocked && (
        <>
          {/* Share of Voice */}
          <div className="fade" style={{ marginBottom: 28 }}>
            <SectionLabel>04 — SHARE OF VOICE</SectionLabel>
            <Card>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#64748b", marginBottom: 12 }}>MENTIONS ACROSS ALL MODELS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                {d.recommendation.shareOfVoice.map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12, color: item.name.toLowerCase() === d.brand.toLowerCase() ? "#1e293b" : "#475569", width: 120, flexShrink: 0, fontWeight: item.name.toLowerCase() === d.brand.toLowerCase() ? 600 : 400 }}>{item.name}</span>
                    <div style={{ flex: 1, height: 4, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${item.pct}%`, height: "100%", background: sovColors[i] || "#94a3b8", borderRadius: 2 }} />
                    </div>
                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: sovColors[i] || "#94a3b8", width: 36, textAlign: "right" }}>{item.pct}%</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Competitive Deep Dive */}
          <div className="fade" style={{ marginBottom: 28 }}>
            <SectionLabel>05 — COMPETITIVE DEEP DIVE</SectionLabel>
            <Card>
              <CardHeader icon="◇" title="Competitive Context" score={d.competitive.score} label={d.competitive.label} color={fixColor(d.competitive.color)} description="How do models compare you to your top competitors?" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <div style={{ padding: "14px 16px", background: "#f1f5f9", border: "1px solid #3b82f620", borderRadius: 8 }}>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#3b82f6", marginBottom: 12 }}>WHERE YOU WIN</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {d.competitive.wins.length > 0 ? d.competitive.wins.map((w, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ color: "#3b82f6", fontSize: 11, marginTop: 2, flexShrink: 0 }}>✓</span>
                        <span style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{w}</span>
                      </div>
                    )) : <span style={{ fontSize: 13, color: "#64748b" }}>No clear wins identified.</span>}
                  </div>
                </div>
                <div style={{ padding: "14px 16px", background: "#f1f5f9", border: "1px solid #f8717120", borderRadius: 8 }}>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#f87171", marginBottom: 12 }}>WHERE YOU LOSE</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {d.competitive.losses.length > 0 ? d.competitive.losses.map((l, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ color: "#f87171", fontSize: 11, marginTop: 2, flexShrink: 0 }}>✗</span>
                        <span style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{l}</span>
                      </div>
                    )) : <span style={{ fontSize: 13, color: "#64748b" }}>No clear losses identified.</span>}
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#64748b", marginBottom: 10 }}>SENTIMENT PER MODEL</div>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr>
                      {["MODEL", "SENTIMENT", "NOTE"].map((h) => (
                        <th key={h} style={{ fontSize: 11, fontWeight: 500, color: "#64748b", textAlign: "left", padding: "0 0 10px", fontFamily: "'Space Mono', monospace", letterSpacing: "0.1em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.competitive.sentimentPerModel.map((row, i) => {
                      const sColors: Record<string, string> = { positive: "#3b82f6", neutral: "#fbbf24", negative: "#f87171" };
                      const c = sColors[row.sentiment] || "#64748b";
                      return (
                        <tr key={i}>
                          <td style={{ fontSize: 13, color: "#1e293b", fontWeight: 500, padding: "10px 0", borderTop: "1px solid #e2e8f0", verticalAlign: "top" }}>{row.model}</td>
                          <td style={{ padding: "10px 0", borderTop: "1px solid #e2e8f0", verticalAlign: "top" }}>
                            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: `${c}18`, color: c, fontWeight: 500 }}>{row.sentiment}</span>
                          </td>
                          <td style={{ fontSize: 13, color: "#475569", padding: "10px 0 10px 12px", borderTop: "1px solid #e2e8f0", verticalAlign: "top" }}>{row.note}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <InsightBox>{d.competitive.insight}</InsightBox>
            </Card>
          </div>

          {/* Online Presence */}
          <div className="fade" style={{ marginBottom: 28 }}>
            <SectionLabel>06 — WHERE AI LEARNS ABOUT YOU</SectionLabel>
            <Card>
              <CardHeader icon="◉" title="Online Presence" score={d.awareness.score} label={onlinePresenceData ? "Analyzed" : "Generating"} color="#3b82f6" description="Which platforms and sources feed LLMs information about your brand?" />
              {onlinePresenceData ? (
                <>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#64748b", marginBottom: 12 }}>CITATION SOURCES</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                    {onlinePresenceData.sources.map((s, i) => {
                      const statusColors: Record<string, string> = { strong: "#3b82f6", weak: "#fbbf24", missing: "#f87171" };
                      const priorityColors: Record<string, string> = { high: "#f87171", medium: "#fbbf24", low: "#64748b" };
                      const c = statusColors[s.status] || "#64748b";
                      return (
                        <div key={i} style={{ display: "flex", gap: 14, padding: "12px 16px", background: "#f1f5f9", border: `1px solid ${c}20`, borderRadius: 8, alignItems: "flex-start" }}>
                          <div style={{ minWidth: 90, flexShrink: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{s.domain}</div>
                            <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: `${c}18`, color: c, fontWeight: 500 }}>{s.status}</span>
                          </div>
                          <div style={{ flex: 1, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{s.note}</div>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${priorityColors[s.priority] || "#64748b"}18`, color: priorityColors[s.priority] || "#64748b", fontWeight: 500, flexShrink: 0 }}>{s.priority} priority</span>
                        </div>
                      );
                    })}
                  </div>
                  <InsightBox>{onlinePresenceData.insight}</InsightBox>
                </>
              ) : (
                <div style={{ padding: "28px", textAlign: "center" }}>
                  <div style={{ fontSize: 24, marginBottom: 12, opacity: 0.5 }}>⟳</div>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: "0.15em", color: "#64748b" }}>SEARCHING THE WEB FOR YOUR BRAND...</div>
                  <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 8 }}>Perplexity is scanning review sites, forums, and directories. Updates automatically.</div>
                </div>
              )}
            </Card>
          </div>

          {/* 30-Day Roadmap */}
          <div className="fade" style={{ marginBottom: 28 }}>
            <SectionLabel>07 — 30-DAY FIX ROADMAP</SectionLabel>
            <Card>
              <CardHeader icon="◈" title="30-Day Roadmap" score={d.overallScore} label={d.roadmap ? "Ready" : "Generating"} color="#3b82f6" description="A prioritized, week-by-week action plan built from your audit results." />
              {d.roadmap ? (
                <>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#64748b", marginBottom: 12 }}>WEEK-BY-WEEK ACTIONS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
                    {d.roadmap.weeks.map((week, wi) => (
                      <div key={wi}>
                        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#fbbf24", marginBottom: 8 }}>{week.week}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {week.actions.map((item, ai) => {
                            const impactColor = item.impact === "High" ? "#f87171" : item.impact === "Medium" ? "#fbbf24" : "#64748b";
                            return (
                              <div key={ai} style={{ display: "flex", gap: 14, padding: "12px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, alignItems: "flex-start" }}>
                                <div style={{ flex: 1, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{item.action}</div>
                                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${impactColor}18`, color: impactColor, fontWeight: 500, flexShrink: 0 }}>{item.impact}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <InsightBox>{d.roadmap.insight}</InsightBox>
                </>
              ) : (
                <div style={{ padding: "28px", textAlign: "center" }}>
                  <div style={{ fontSize: 24, marginBottom: 12, opacity: 0.5 }}>⟳</div>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: "0.15em", color: "#64748b" }}>GENERATING YOUR ROADMAP...</div>
                  <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 8 }}>Building a personalized action plan. Updates automatically.</div>
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      {/* ── Footer CTA ── */}
      <div className="fade" style={{ position: "relative", overflow: "hidden", padding: "40px 40px", background: "linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)", border: "1px solid #3b82f630", borderRadius: 12, boxShadow: "0 0 60px #3b82f610, inset 0 1px 0 #3b82f618" }}>
        <div style={{ position: "absolute", top: -60, right: -60, width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle, #3b82f618 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 28 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#3b82f6", background: "#3b82f615", border: "1px solid #3b82f630", padding: "4px 12px", borderRadius: 4, alignSelf: "flex-start" }}>
              <span style={{ width: 6, height: 6, background: "#3b82f6", borderRadius: "50%", boxShadow: "0 0 6px #3b82f6", display: "inline-block" }} />WANT HELP ACTING ON THIS?
            </div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(22px, 3.5vw, 32px)", fontWeight: 800, letterSpacing: "-0.5px", color: "#0f172a", lineHeight: 1.1 }}>
              If AI doesn&apos;t know you,<br /><span style={{ color: "#3b82f6" }}>your customers won&apos;t either.</span>
            </div>
            <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>Book a free 15-min call and leave with a prioritized action plan to fix your LLM visibility.</div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
              <button onClick={() => window.open("https://calendly.com/not-another-marketer/free-ai-growth-audit-call", "_blank")} style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "16px 36px", fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, letterSpacing: "1.5px", cursor: "pointer", borderRadius: 6, whiteSpace: "nowrap", transition: "transform 0.15s, box-shadow 0.2s" }} onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 28px #3b82f650"; }} onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
                BOOK A FREE STRATEGY CALL →
              </button>
              <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'Space Mono', monospace", letterSpacing: "0.05em" }}>No pitch. Just strategy.</div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 20 }}>
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              {["Free 15-min call", "Live audit walkthrough", "Prioritized action plan"].map((t) => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ color: "#3b82f6", fontSize: 12, fontWeight: 700 }}>✓</span>
                  <span style={{ fontSize: 13, color: "#64748b" }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── AI Visibility Matrix ── */}
      {d.quadrant && (
        <div className="fade" style={{ marginTop: 28, padding: "16px 20px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#64748b", marginBottom: 4 }}>AI VISIBILITY MATRIX</div>
          <QuadrantChart awarenessScore={d.quadrant.awarenessScore} recommendationScore={d.quadrant.recommendationScore} label={d.quadrant.label} />
          <p style={{ fontSize: 13, color: "#475569", textAlign: "center", margin: 0 }}>{d.quadrant.description}</p>
        </div>
      )}
    </div>
  );
}

// ── Teaser Builder ───────────────────────────────────────────

function buildTeasers(_d: AuditResult): { title: string; body: string }[] {
  return [
    {
      title: "How does your brand stack up against competitors in AI?",
      body: "Unlock your full Competitive Context report. See where each LLM thinks you win and lose, sentiment breakdowns per model, and the gaps your competitors are exploiting.",
    },
    {
      title: "Where do LLMs get their information about you?",
      body: "Unlock your full Source Attribution report. See exactly which sites are feeding LLMs information about your brand and where you're missing vs competitors.",
    },
    {
      title: "Know what to fix. Know when to fix it.",
      body: "Unlock your personalized 30-day roadmap. Every action is ranked by impact, sequenced by week, and built specifically from your audit results.",
    },
  ];
}

// ── Main Page Component ──────────────────────────────────────

export default function AuditPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const auditId = params.id as string;
  const [audit, setAudit] = useState<AuditRow | null>(null);
  const [error, setError] = useState(false);
  const [paymentBanner, setPaymentBanner] = useState<"success" | "cancelled" | null>(
    () => (searchParams.get("payment") as "success" | "cancelled" | null)
  );

  const fetchAudit = useCallback(async () => {
    try {
      const res = await fetch(`/api/audit-status?id=${auditId}`);
      if (!res.ok) { setError(true); return; }
      const data = await res.json();
      setAudit(data);
      if (data.status === "error") setError(true);
    } catch {
      setError(true);
    }
  }, [auditId]);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  useEffect(() => {
    if (!audit) return;
    const isPending = audit.status === "pending";
    const isGenerating = audit.unlocked && audit.result && (
      !audit.result.onlinePresence && !audit.result.sourceAttribution || !audit.result.roadmap
    );
    if (!isPending && !isGenerating) return;
    const interval = setInterval(fetchAudit, 2000);
    return () => clearInterval(interval);
  }, [audit, fetchAudit]);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', system-ui, sans-serif", color: "#1e293b", padding: 0 }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scanline { 0% { top: -10% } 100% { top: 110% } }
        @keyframes pulse-dot { 0%,100% { opacity: 0.5 } 50% { opacity: 1 } }
        .fade { animation: fadeUp 0.4s ease both; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #f8fafc; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
      `}</style>

      {paymentBanner === "success" && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: "#f0fdf4", borderBottom: "1px solid #16a34a40", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "#15803d" }}>✓ &nbsp;Payment confirmed — your full report is being generated now.</span>
          <button onClick={() => setPaymentBanner(null)} style={{ background: "none", border: "none", color: "#15803d", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}
      {paymentBanner === "cancelled" && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: "#fef2f2", borderBottom: "1px solid #f8717140", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "#f87171" }}>Payment was cancelled — your free report is still available below.</span>
          <button onClick={() => setPaymentBanner(null)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      <div style={{ position: "fixed", left: 0, right: 0, height: "1px", background: "linear-gradient(90deg, transparent, #3b82f615, transparent)", animation: "scanline 10s linear infinite", pointerEvents: "none", zIndex: 1 }} />
      <div style={{ position: "fixed", inset: 0, opacity: 0.05, backgroundImage: "linear-gradient(#3b82f6 1px, transparent 1px), linear-gradient(90deg, #3b82f6 1px, transparent 1px)", backgroundSize: "48px 48px", pointerEvents: "none" }} />

      {error ? (
        <ErrorState onRetry={() => (window.location.href = "/")} />
      ) : !audit ? (
        <LoadingState brand="..." category="..." />
      ) : audit.status === "pending" ? (
        <LoadingState brand={audit.brand} category={audit.category} />
      ) : audit.status === "complete" && audit.result ? (
        <AuditResultsView d={audit.result} websiteUrl={audit.website_url} unlocked={audit.unlocked ?? false} auditId={audit.id} />
      ) : (
        <ErrorState onRetry={() => (window.location.href = "/")} />
      )}
    </div>
  );
}
