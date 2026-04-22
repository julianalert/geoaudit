"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ScoreRing, ModelBadge, Card, InsightBox } from "@/components/ui";
import type {
  AuditResult,
  AuditRow,
  ScoreHistoryEntry,
  AwarenessModelResult,
  RecommendationModelResult,
  CompetitorBenchmark,
} from "@/lib/types";

// Re-export types for local use
export type { AuditResult, AuditRow };

// ── Small UI primitives ──────────────────────────────────────

function SectionHeading({ label, badge, badgeColor }: {
  label: string;
  badge: string;
  badgeColor: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
      <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#64748b", margin: 0 }}>
        {label}
      </p>
      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: `${badgeColor}18`, color: badgeColor, fontWeight: 500, flexShrink: 0 }}>
        {badge}
      </span>
    </div>
  );
}

function CardDescription({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", marginTop: 0, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #e2e8f0" }}>
      {children}
    </p>
  );
}

function SectionSkeleton({ label }: { label: string }) {
  return (
    <div className="fade" style={{ marginBottom: 28 }}>
      <SectionHeading label={label} badge="Scanning" badgeColor="#fbbf24" />
      <div style={{ padding: "32px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, textAlign: "center" }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid #fbbf2440", margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fbbf24", animation: "pulse-dot 1.5s ease infinite" }} />
        </div>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: "0.15em", color: "#64748b" }}>SCANNING MODELS...</div>
      </div>
    </div>
  );
}

// ── Quadrant Chart ───────────────────────────────────────────

function QuadrantChart({ awarenessScore, recommendationScore, label }: { awarenessScore: number; recommendationScore: number; label: string }) {
  const x = Math.min(95, Math.max(5, awarenessScore));
  const y = Math.min(95, Math.max(5, 100 - recommendationScore));
  return (
    <div style={{ padding: "12px 0 4px" }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: "2 / 1", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
        {[25, 50, 75].map((pct) => (
          <div key={`v${pct}`} style={{ position: "absolute", left: `${pct}%`, top: 0, bottom: 0, width: 1, background: pct === 50 ? "#cbd5e1" : "#e2e8f0" }} />
        ))}
        {[25, 50, 75].map((pct) => (
          <div key={`h${pct}`} style={{ position: "absolute", top: `${pct}%`, left: 0, right: 0, height: 1, background: pct === 50 ? "#cbd5e1" : "#e2e8f0" }} />
        ))}
        {[
          { text: "Ghost", x: "25%", y: "75%" },
          { text: "Lucky", x: "25%", y: "25%" },
          { text: "Visible but Losing", x: "75%", y: "75%" },
          { text: "Dominant", x: "75%", y: "25%" },
        ].map((q) => {
          const active = q.text.toLowerCase() === label.toLowerCase();
          return (
            <div key={q.text} style={{ position: "absolute", left: q.x, top: q.y, transform: "translate(-50%, -50%)", fontFamily: "'Space Mono', monospace", fontSize: active ? 10 : 9, letterSpacing: "0.05em", color: active ? "#3b82f6" : "#94a3b8", fontWeight: active ? 700 : 400, textAlign: "center", pointerEvents: "none" }}>
              {q.text.toUpperCase()}
            </div>
          );
        })}
        <div style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)", width: 14, height: 14, borderRadius: "50%", background: "#3b82f6", boxShadow: "0 0 12px #3b82f650", zIndex: 2 }} />
        <div style={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#94a3b8", letterSpacing: "0.1em" }}>AWARENESS →</div>
        <div style={{ position: "absolute", left: 4, top: "50%", transform: "translateY(-50%) rotate(-90deg)", fontFamily: "'Space Mono', monospace", fontSize: 8, color: "#94a3b8", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>RECOMMENDATION →</div>
      </div>
    </div>
  );
}

// ── Score Delta ──────────────────────────────────────────────

function ScoreDelta({ scoreHistory, currentScore }: { scoreHistory: ScoreHistoryEntry[]; currentScore: number }) {
  if (!scoreHistory || scoreHistory.length === 0) return null;
  const prev = scoreHistory[0];
  const delta = currentScore - prev.overall_score;
  if (delta === 0) return null;
  const positive = delta > 0;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 10px", borderRadius: 20,
      background: positive ? "#3b82f615" : "#f8717115",
      border: `1px solid ${positive ? "#3b82f630" : "#f8717130"}`,
      fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700,
      color: positive ? "#3b82f6" : "#f87171",
      marginLeft: 8,
    }}>
      {positive ? "▲" : "▼"} {Math.abs(delta)} vs last audit
    </div>
  );
}

// ── Loading / Error ──────────────────────────────────────────

function LoadingState({ brand, category, phase }: { brand: string; category: string; phase: 1 | 2 }) {
  const models = ["GPT-4o", "Claude", "Gemini"];
  const phaseLabel = phase === 1
    ? "Querying awareness & positioning (context-free)..."
    : "Running 3 buyer-intent queries & competitive deep-dive...";
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
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
          {phaseLabel} This takes about 45 seconds.
        </p>
      </div>
    </div>
  );
}

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

// ── Locked Section ───────────────────────────────────────────

function LockedSection({ description, onUnlock, checkingOut, estimatedLoss }: {
  description: string;
  onUnlock: () => void;
  checkingOut: boolean;
  estimatedLoss?: number | null;
}) {
  return (
    <div style={{ padding: "28px 24px", background: "linear-gradient(135deg, #fffbeb 0%, #ffffff 100%)", border: "1px solid #fbbf2430", borderRadius: 8, textAlign: "center" }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 12 }}>
        <rect x="3" y="11" width="18" height="11" rx="2" stroke="#fbbf24" strokeWidth="2" />
        <path d="M7 11V7a5 5 0 0 1 9.9-1" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <p style={{ fontSize: 13, color: "#475569", margin: "0 auto 20px", maxWidth: 440, lineHeight: 1.65 }}>
        {description}
      </p>
      {estimatedLoss != null && estimatedLoss > 0 && (
        <div style={{ marginBottom: 20, fontSize: 12, color: "#64748b", fontFamily: "'Space Mono', monospace", letterSpacing: "0.05em" }}>
          Estimated leak: <span style={{ color: "#f87171", fontWeight: 700 }}>~${Math.round(estimatedLoss).toLocaleString()}/mo</span>
        </div>
      )}
      <button
        onClick={onUnlock}
        disabled={checkingOut}
        style={{
          background: checkingOut ? "#64748b" : "#fbbf24", color: "#1e293b", border: "none",
          padding: "12px 32px", fontFamily: "'Space Mono', monospace",
          fontSize: 12, fontWeight: 700, letterSpacing: "1.5px",
          cursor: checkingOut ? "not-allowed" : "pointer", borderRadius: 6,
          transition: "background 0.2s, transform 0.15s, box-shadow 0.2s",
          marginBottom: 10,
        }}
        onMouseEnter={(e) => { if (!checkingOut) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 28px #fbbf2450"; } }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
      >
        {checkingOut ? "REDIRECTING…" : "UNLOCK THE ACTION KIT - $39 →"}
      </button>
      <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "'Space Mono', monospace", letterSpacing: "0.05em" }}>
        One-time payment · Instant access · No account needed
      </div>
    </div>
  );
}

// ── Citation list (Perplexity) ───────────────────────────────

function CitationList({ citations }: { citations: string[] }) {
  const [open, setOpen] = useState(false);
  if (!citations || citations.length === 0) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: "#3b82f6" }}
      >
        <span style={{ fontSize: 10 }}>{open ? "▾" : "▸"}</span>
        {citations.length} PERPLEXITY SOURCE{citations.length !== 1 ? "S" : ""}
      </button>
      {open && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
          {citations.map((url, i) => {
            let host = url;
            try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
            return (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#3b82f6", textDecoration: "none", fontFamily: "'Space Mono', monospace" }} title={url}>
                {host}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Hallucination banner ─────────────────────────────────────

function HallucinationBanner({ falseClaims }: { falseClaims: Array<{ model: string; claim: string }> }) {
  const [open, setOpen] = useState(false);
  if (!falseClaims || falseClaims.length === 0) return null;
  return (
    <div style={{ marginBottom: 20, padding: "16px 18px", background: "#fef2f2", border: "1px solid #f8717140", borderRadius: 10, borderLeft: "3px solid #f87171" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#f87171", marginBottom: 4 }}>▸ HALLUCINATIONS DETECTED</div>
          <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>LLMs are making up {falseClaims.length === 1 ? "a claim" : `${falseClaims.length} claims`} about your brand that your website contradicts.</div>
        </div>
        <button onClick={() => setOpen((v) => !v)} style={{ background: "none", border: "1px solid #f8717140", color: "#f87171", padding: "6px 12px", borderRadius: 4, cursor: "pointer", fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em" }}>
          {open ? "HIDE" : "SHOW DETAILS"}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f8717125", display: "flex", flexDirection: "column", gap: 6 }}>
          {falseClaims.map((fc, i) => (
            <div key={i} style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#f87171", letterSpacing: "0.05em", marginRight: 8 }}>{fc.model.toUpperCase()}</span>
              &ldquo;{fc.claim}&rdquo;
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Competitor benchmark bar chart ───────────────────────────

function CompetitorBenchmarks({ brand, benchmarks, yourScore }: {
  brand: string;
  benchmarks: CompetitorBenchmark[];
  yourScore: number;
}) {
  if (!benchmarks || benchmarks.length === 0) return null;
  const rows = [
    { name: brand, awarenessScore: yourScore, isYou: true },
    ...benchmarks.map((b) => ({ name: b.name, awarenessScore: b.awarenessScore, isYou: false })),
  ].sort((a, b) => b.awarenessScore - a.awarenessScore);
  const max = Math.max(100, ...rows.map((r) => r.awarenessScore));
  return (
    <div className="fade" style={{ marginBottom: 28 }}>
      <SectionHeading label="YOU VS COMPETITORS" badge={`${benchmarks.length + 1} brands`} badgeColor="#3b82f6" />
      <Card>
        <CardDescription>How your LLM awareness stacks up against your top-ranked competitors.</CardDescription>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r) => {
            const pct = max > 0 ? (r.awarenessScore / max) * 100 : 0;
            const color = r.isYou ? "#3b82f6" : "#94a3b8";
            return (
              <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ minWidth: 140, fontSize: 13, fontWeight: r.isYou ? 700 : 500, color: r.isYou ? "#3b82f6" : "#1e293b", textAlign: "right" }}>
                  {r.name}{r.isYou && <span style={{ fontSize: 10, marginLeft: 6, fontFamily: "'Space Mono', monospace", color: "#64748b" }}>(YOU)</span>}
                </div>
                <div style={{ flex: 1, height: 18, background: "#f1f5f9", borderRadius: 4, overflow: "hidden", position: "relative" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 1s ease" }} />
                </div>
                <div style={{ minWidth: 40, fontSize: 13, fontWeight: 700, color, fontFamily: "'Space Mono', monospace" }}>
                  {r.awarenessScore}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ── Methodology Expandable ───────────────────────────────────

function MethodologySection({ result }: { result: AuditResult }) {
  const [open, setOpen] = useState(false);
  const awarenessPrompt = `Tell me what you know about "${result.brand}". If you don't recognize the name or have very little knowledge about it, say so plainly - do NOT guess, do NOT fabricate details.`;
  const queries = result.recommendation?.queriesUsed ?? [];
  return (
    <div className="fade" style={{ marginBottom: 28 }}>
      <div style={{ padding: "16px 20px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
        <button onClick={() => setOpen((v) => !v)} style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#0f172a", textAlign: "left" }}>
          <div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#64748b", marginBottom: 4 }}>METHODOLOGY</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>How we audit (and why we never feed the models your site)</div>
          </div>
          <span style={{ fontFamily: "'Space Mono', monospace", color: "#3b82f6", fontSize: 18 }}>{open ? "−" : "+"}</span>
        </button>
        {open && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: 0 }}>
              The audit measures what LLMs already know about your brand - not what they can learn from context. That&apos;s why every prompt below contains <b>only your brand name</b> (or a category/competitor). We never feed your website or positioning into the audit models. The answers you see are their raw, pre-trained knowledge - the same thing your buyers see when they ask ChatGPT about you.
            </p>
            <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: 0 }}>
              Perplexity is deliberately <b>excluded</b> from the main audit because it searches the web in real time - it would always find something, which defeats the measurement.
            </p>
            <div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#64748b", marginBottom: 6 }}>AWARENESS PROMPT</div>
              <pre style={{ fontSize: 11, color: "#1e293b", background: "#f1f5f9", padding: "10px 12px", borderRadius: 6, fontFamily: "'Space Mono', monospace", lineHeight: 1.5, margin: 0, whiteSpace: "pre-wrap" }}>{awarenessPrompt}</pre>
            </div>
            {queries.length > 0 && (
              <div>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#64748b", marginBottom: 6 }}>RECOMMENDATION - {queries.length} BUYER-INTENT QUERIES</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {queries.map((q, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#475569", background: "#f1f5f9", padding: "8px 12px", borderRadius: 6, fontFamily: "'Space Mono', monospace" }}>
                      <span style={{ color: "#94a3b8", marginRight: 8 }}>{q.type.toUpperCase()}</span>&ldquo;{q.query}&rdquo;
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#64748b", marginBottom: 6 }}>SCORING</div>
              <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: 0 }}>
                Overall = Recommendation 40% / Awareness 25% / Positioning 20% / Competitive 15%. Awareness is <b>penalized</b> by a post-hoc accuracy judge (Gemini Flash, run after the audit) that compares each model&apos;s description to your actual site and flags hallucinations.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Results View ────────────────────────────────────────

function AuditResultsView({ d, websiteUrl, unlocked, auditId, isPartial, scoreHistory }: {
  d: AuditResult;
  websiteUrl: string | null;
  unlocked: boolean;
  auditId: string;
  isPartial?: boolean;
  scoreHistory?: ScoreHistoryEntry[];
}) {
  const [copied, setCopied] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const shareUrl = typeof window !== "undefined" ? window.location.href.split("?")[0] : "";
  const verdictColor = d.overallScore >= 70 ? "#3b82f6" : d.overallScore >= 45 ? "#fbbf24" : "#f87171";
  const fixColor = (c: string) => (c === "#00ff87" || c === "#22c55e" || c === "#10b981" ? "#34d399" : c);
  const modelNames = d.awareness.modelResults.map((m) => m.model).join(" · ");

  const onlinePresenceData = d.onlinePresence || d.sourceAttribution;
  const falseClaims = d.awareness.falseClaims ?? [];

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

  async function handleRegenerate() {
    if (regenerating) return;
    setRegenerating(true);
    try {
      await fetch("/api/regenerate-action-kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditId }),
      });
    } catch {}
    setTimeout(() => window.location.reload(), 30_000);
  }

  const awarenessScore = d.awareness.score;
  const positioningScore = d.positioning?.score ?? 0;
  const recommendationScore = d.recommendation?.score ?? 0;
  const competitiveScore = d.competitive?.score ?? 0;
  const estimatedLoss = d.opportunityCalculator?.estimatedMonthlyLoss ?? null;

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "48px 24px", position: "relative", zIndex: 2 }}>
      {/* ── Header ── */}
      <div className="fade" style={{ marginBottom: 32, paddingBottom: 28, borderBottom: "1px solid #e2e8f0" }}>
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

        {/* Overall score card */}
        <div style={{ padding: "24px 28px", background: "#ffffff", border: `1px solid ${verdictColor}30`, borderRadius: 10, display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap", marginBottom: 16 }}>
          <ScoreRing score={isPartial ? 0 : d.overallScore} size={96} stroke={8} />
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#64748b", marginBottom: 6 }}>OVERALL LLM VISIBILITY SCORE</div>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4 }}>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(22px, 3vw, 34px)", fontWeight: 800, color: isPartial ? "#94a3b8" : verdictColor, lineHeight: 1.05, letterSpacing: "-0.5px", marginBottom: 4 }}>
                {isPartial ? "COMPUTING..." : d.overallVerdict}
              </div>
              {!isPartial && scoreHistory && scoreHistory.length > 0 && (
                <ScoreDelta scoreHistory={scoreHistory} currentScore={d.overallScore} />
              )}
            </div>
            {isPartial
              ? <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, margin: 0 }}>Scanning recommendations &amp; competitive...</p>
              : <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: 0 }}>{d.overallSub}</p>
            }
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 240, flexGrow: 1 }}>
            {[
              { label: "Brand Awareness", score: awarenessScore, color: fixColor(d.awareness.color), ready: true },
              { label: "Brand Positioning", score: positioningScore, color: fixColor(d.positioning?.color ?? "#64748b"), ready: !!d.positioning },
              { label: "Recommendation Rank", score: recommendationScore, color: fixColor(d.recommendation?.color ?? "#64748b"), ready: !!d.recommendation },
              { label: "Competitive Context", score: competitiveScore, color: fixColor(d.competitive?.color ?? "#64748b"), ready: !!d.competitive },
            ].map((dim) => (
              <div key={dim.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: "0.05em", color: "#64748b", width: 140, textAlign: "right", lineHeight: 1.4, flexShrink: 0 }}>{dim.label.toUpperCase()}</div>
                <div style={{ flex: 1, height: 4, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
                  {dim.ready
                    ? <div style={{ width: `${dim.score}%`, height: "100%", background: dim.color, borderRadius: 2, transition: "width 1.2s ease" }} />
                    : <div style={{ width: "30%", height: "100%", background: "#e2e8f0", borderRadius: 2, animation: "scanline 1.5s linear infinite" }} />
                  }
                </div>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: dim.ready ? dim.color : "#94a3b8", width: 28, fontWeight: 700, textAlign: "right", flexShrink: 0 }}>
                  {dim.ready ? dim.score : "…"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Share URL + PDF export */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#64748b", flexShrink: 0 }}>SHARE URL</span>
          <div style={{ flex: 1, minWidth: 120, padding: "6px 12px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 4, fontSize: 12, color: "#475569", fontFamily: "'Space Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shareUrl}</div>
          <button onClick={handleCopy} style={{ background: copied ? "#3b82f620" : "#e2e8f0", border: `1px solid ${copied ? "#3b82f640" : "#d1d5db"}`, color: copied ? "#3b82f6" : "#475569", padding: "6px 14px", borderRadius: 4, cursor: "pointer", fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 500 }}>
            {copied ? "COPIED" : "COPY"}
          </button>
          {unlocked && !isPartial && (
            <a
              href={`/api/audit-pdf/${auditId}`}
              style={{ background: "#fbbf24", color: "#1e293b", border: "none", padding: "6px 14px", borderRadius: 4, cursor: "pointer", fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textDecoration: "none" }}
            >
              DOWNLOAD PDF ↓
            </a>
          )}
        </div>
      </div>

      {/* Hallucination warning, right up top where it matters */}
      {!isPartial && falseClaims.length > 0 && <HallucinationBanner falseClaims={falseClaims} />}

      {/* Competitor benchmark bar chart */}
      {!isPartial && d.competitorBenchmarks && d.competitorBenchmarks.length > 0 && (
        <CompetitorBenchmarks brand={d.brand} benchmarks={d.competitorBenchmarks} yourScore={d.awareness.score} />
      )}

      {/* ── 01 Awareness ── */}
      <div className="fade" style={{ marginBottom: 28 }}>
        <SectionHeading label="01 - BRAND AWARENESS" badge={d.awareness.label} badgeColor={fixColor(d.awareness.color)} />
        <Card>
          <CardDescription>Do LLMs know your brand exists and can they describe it accurately?</CardDescription>
          <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            {d.awareness.modelResults.map((m: AwarenessModelResult, i) => {
              const status = m.known ? "strong" : "unknown";
              const acc = m.accuracyScore ?? null;
              const accColor = acc == null ? null : acc >= 80 ? "#3b82f6" : acc >= 60 ? "#fbbf24" : "#f87171";
              const accLabel = acc == null ? null : acc >= 80 ? "Accurate" : acc >= 60 ? "Partial accuracy" : "Inaccurate";
              return (
                <div key={i} style={{ display: "flex", gap: 14, padding: "12px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6 }}>
                  <div style={{ flexShrink: 0, paddingTop: 1 }}><ModelBadge model={m.model} status={status} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                      <p style={{ flex: 1, fontSize: 13, lineHeight: 1.6, margin: 0, color: m.known ? "#334155" : "#94a3b8", fontStyle: m.known ? "normal" : "italic" }}>
                        {m.description ? `\u201C${m.description}\u201D` : "Brand not recognized"}
                      </p>
                      {accLabel && accColor && (
                        <span title="Fact-checked against your website by a separate judge model" style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${accColor}18`, color: accColor, fontWeight: 500, flexShrink: 0, fontFamily: "'Space Mono', monospace", letterSpacing: "0.05em" }}>
                          FACT-CHECK: {accLabel.toUpperCase()} · {acc}
                        </span>
                      )}
                    </div>
                    {m.falseClaims && m.falseClaims.length > 0 && (
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                        {m.falseClaims.map((c, ci) => (
                          <div key={ci} style={{ fontSize: 11, color: "#f87171", lineHeight: 1.4 }}>✗ {c}</div>
                        ))}
                      </div>
                    )}
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
                    {m.model === "Perplexity" && m.citations && m.citations.length > 0 && (
                      <CitationList citations={m.citations} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <InsightBox>{d.awareness.insight || "No insight available."}</InsightBox>
        </Card>
      </div>

      {/* ── 02 Positioning ── */}
      {d.positioning && (
        <div className="fade" style={{ marginBottom: 28 }}>
          <SectionHeading label="02 - BRAND POSITIONING" badge={d.positioning.label} badgeColor={fixColor(d.positioning.color)} />
          <Card>
            <CardDescription>How do LLMs understand your market position and value proposition?</CardDescription>
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
                    </div>
                  </div>
                );
              })}
            </div>
            <InsightBox>{d.positioning.insight}</InsightBox>
          </Card>
        </div>
      )}

      {/* ── 03 Recommendation (multi-query) ── */}
      {isPartial && !d.recommendation && <SectionSkeleton label="03 - RECOMMENDATION RANK" />}
      {d.recommendation && (
        <div className="fade" style={{ marginBottom: 28 }}>
          <SectionHeading label="03 - RECOMMENDATION RANK" badge={d.recommendation.label} badgeColor={fixColor(d.recommendation.color)} />
          <Card>
            <CardDescription>Do you appear when buyers actually ask AI for recommendations?</CardDescription>

            {/* Aggregated per-model summary */}
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${d.recommendation.modelResults.length}, 1fr)`, gap: 8, marginBottom: 18 }}>
              {d.recommendation.modelResults.map((m: RecommendationModelResult, i) => (
                <div key={i} style={{ padding: 14, background: "#f1f5f9", border: `1px solid ${m.listed ? "#fbbf2425" : "#f8717130"}`, borderRadius: 8, textAlign: "center" }}>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: "#64748b", marginBottom: 8 }}>{m.model}</div>
                  {m.listed ? (
                    <>
                      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 800, lineHeight: 1, color: "#fbbf24" }}>#{m.rank ?? "?"}</div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>best rank across queries</div>
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

            {/* Per-query breakdown */}
            {d.recommendation.queriesUsed && d.recommendation.queriesUsed.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#64748b", marginBottom: 10 }}>BUYER-INTENT QUERIES TESTED</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {d.recommendation.queriesUsed.map((q, qi) => (
                    <div key={qi} style={{ padding: "12px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6 }}>
                      <div style={{ fontSize: 13, color: "#1e293b", fontStyle: "italic", marginBottom: 8 }}>&ldquo;{q.query}&rdquo;</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {d.recommendation!.modelResults.map((m) => {
                          const perQ = m.queries?.find((x) => x.type === q.type);
                          const listed = perQ?.listed ?? false;
                          const rank = perQ?.rank ?? null;
                          return (
                            <span key={m.model} style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, padding: "3px 8px", borderRadius: 4, background: listed ? "#3b82f618" : "#f8717118", color: listed ? "#3b82f6" : "#f87171", fontWeight: 500 }}>
                              {m.model}: {listed ? `#${rank}` : "NOT LISTED"}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Share of voice */}
            {d.recommendation.shareOfVoice && d.recommendation.shareOfVoice.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#64748b", marginBottom: 8 }}>SHARE OF VOICE - WHO AI MENTIONS MOST</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {d.recommendation.shareOfVoice.map((s) => {
                    const isYou = s.name.toLowerCase() === d.brand.toLowerCase();
                    return (
                      <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ minWidth: 120, fontSize: 12, color: isYou ? "#3b82f6" : "#475569", fontWeight: isYou ? 700 : 500 }}>
                          {s.name}{isYou && " (YOU)"}
                        </div>
                        <div style={{ flex: 1, height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ width: `${s.pct}%`, height: "100%", background: isYou ? "#3b82f6" : "#94a3b8", borderRadius: 4, transition: "width 1s ease" }} />
                        </div>
                        <div style={{ minWidth: 36, fontSize: 12, fontWeight: 700, color: isYou ? "#3b82f6" : "#64748b", fontFamily: "'Space Mono', monospace", textAlign: "right" }}>{s.pct}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <InsightBox>{d.recommendation.insight}</InsightBox>
          </Card>
        </div>
      )}

      {/* ── 04 Competitive ── */}
      {isPartial && !d.competitive && <SectionSkeleton label="04 - COMPETITIVE DEEP DIVE" />}
      {d.competitive && !isPartial && (
        <div className="fade" style={{ marginBottom: 28 }}>
          <SectionHeading label="04 - COMPETITIVE DEEP DIVE" badge={d.competitive.label} badgeColor={fixColor(d.competitive.color)} />
          <Card>
            <CardDescription>How do models compare you to your top competitors?</CardDescription>
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
            <InsightBox>{d.competitive.insight}</InsightBox>
          </Card>
        </div>
      )}

      {/* ── Paywall CTA - mid-report ── */}
      {!isPartial && !unlocked && (
        <div className="fade" style={{ position: "relative", overflow: "hidden", padding: "32px 32px", marginBottom: 28, background: "linear-gradient(135deg, #ffffff 0%, #fffbeb 100%)", border: "1px solid #fbbf2440", borderRadius: 12, boxShadow: "0 0 40px #fbbf2410" }}>
          <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, #fbbf2418 0%, transparent 70%)", pointerEvents: "none" }} />
          <div style={{ position: "relative" }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#fbbf24", marginBottom: 10 }}>▸ YOU KNOW YOUR SCORE. NOW FIX IT.</div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(22px, 3vw, 28px)", fontWeight: 800, color: "#0f172a", lineHeight: 1.15, marginBottom: 10 }}>
              The <span style={{ color: "#fbbf24" }}>$39 Action Kit</span> tells you exactly what to change.
            </div>
            <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.6, margin: "0 0 20px", maxWidth: 600 }}>
              Five things, in plain English: how much money you&apos;re losing every month, new copy for your website, where AI gets its info about you, which pages to write next, and a 30-day plan you can actually follow.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22 }}>
              {[
                { t: "How much money you're losing", b: "An estimate, in dollars, of the deals going to competitors every month because AI doesn't recommend you." },
                { t: "New website copy AI will understand", b: "Rewritten homepage, meta tags, and about page. Paste it onto your site and AI starts describing you correctly." },
                { t: "Where AI reads about you", b: "The actual websites AI uses to learn about your brand, with direct links. So you know where to focus." },
                { t: "8 pages you should write next", b: "Ready-to-write article ideas for the exact questions where competitors show up and you don't." },
                { t: "Your 30-day plan", b: "12 things to do over the next month. Each one has a copy-paste template and an expected score bump." },
              ].map((it) => (
                <div key={it.t} style={{ padding: "12px 14px", background: "#fbbf2408", border: "1px solid #fbbf2425", borderRadius: 8 }}>
                  <div style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 4 }}>
                    <span style={{ color: "#fbbf24", fontSize: 12 }}>🔒</span>
                    <span style={{ fontSize: 13, color: "#0f172a", fontWeight: 700 }}>{it.t}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 0 19px", lineHeight: 1.55 }}>{it.b}</p>
                </div>
              ))}
            </div>
            <button
              onClick={handleUnlock}
              disabled={checkingOut}
              style={{ background: checkingOut ? "#64748b" : "#fbbf24", color: "#1e293b", border: "none", padding: "14px 36px", fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, letterSpacing: "1.5px", cursor: checkingOut ? "not-allowed" : "pointer", borderRadius: 6, transition: "transform 0.15s, box-shadow 0.2s" }}
              onMouseEnter={(e) => { if (!checkingOut) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 28px #fbbf2450"; } }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
            >
              {checkingOut ? "REDIRECTING…" : "GET THE ACTION KIT - $39 →"}
            </button>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 10, fontFamily: "'Space Mono', monospace", letterSpacing: "0.05em" }}>
              One-time payment · Instant access · No account needed
            </div>
          </div>
        </div>
      )}

      {/* ── 05 Opportunity Calculator (premium) ── */}
      {!isPartial && (
        <div className="fade" style={{ marginBottom: 28 }}>
          <SectionHeading label="05 - HOW MUCH MONEY YOU'RE LOSING" badge={unlocked ? (d.opportunityCalculator ? "Calculated" : "Generating") : "Locked"} badgeColor={unlocked ? "#3b82f6" : "#fbbf24"} />
          <Card>
            <CardDescription>An estimate, in dollars, of the deals going to competitors every month because AI doesn&apos;t recommend you.</CardDescription>
            {unlocked ? (
              d.opportunityCalculator ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
                    {[
                      { l: "Monthly AI queries", v: d.opportunityCalculator.monthlyCategoryQueries.toLocaleString(), c: "#64748b" },
                      { l: "Current capture rate", v: `${d.opportunityCalculator.currentCaptureRate}%`, c: "#fbbf24" },
                      { l: "Assumed deal value", v: `$${d.opportunityCalculator.assumedAvgDealValue.toLocaleString()}`, c: "#64748b" },
                      { l: "Estimated monthly loss", v: `$${d.opportunityCalculator.estimatedMonthlyLoss.toLocaleString()}`, c: "#f87171" },
                    ].map((m) => (
                      <div key={m.l} style={{ padding: "16px 18px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: "#64748b", marginBottom: 6 }}>{m.l.toUpperCase()}</div>
                        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 800, color: m.c, lineHeight: 1 }}>{m.v}</div>
                      </div>
                    ))}
                  </div>
                  <InsightBox>{d.opportunityCalculator.note}</InsightBox>
                </>
              ) : (
                <div style={{ padding: "28px", textAlign: "center" }}>
                  <div style={{ fontSize: 24, marginBottom: 12, opacity: 0.5 }}>⟳</div>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: "0.15em", color: "#64748b" }}>CALCULATING YOUR OPPORTUNITY COST...</div>
                </div>
              )
            ) : (
              <LockedSection
                description="A dollar estimate of the deals going to competitors every month, based on how often people ask AI about your category, how often AI currently recommends you, and a typical deal size."
                onUnlock={handleUnlock}
                checkingOut={checkingOut}
              />
            )}
          </Card>
        </div>
      )}

      {/* ── 06 Positioning Brief (premium) ── */}
      {!isPartial && (
        <div className="fade" style={{ marginBottom: 28 }}>
          <SectionHeading label="06 - NEW WEBSITE COPY AI WILL UNDERSTAND" badge={unlocked ? (d.positioningBrief ? "Ready" : "Generating") : "Locked"} badgeColor={unlocked ? "#3b82f6" : "#fbbf24"} />
          <Card>
            <CardDescription>Rewritten copy for your homepage, meta tags, and about page. Paste it onto your site and AI starts describing you the way you want.</CardDescription>
            {unlocked ? (
              d.positioningBrief ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ padding: "12px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6 }}>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: "0.15em", color: "#64748b", marginBottom: 6 }}>AI UNDERSTANDS YOU AS</div>
                      <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{d.positioningBrief.llmUnderstanding}</div>
                    </div>
                    <div style={{ padding: "12px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6 }}>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: "0.15em", color: "#64748b", marginBottom: 6 }}>YOUR SITE SAYS</div>
                      <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{d.positioningBrief.siteStatement}</div>
                    </div>
                  </div>
                  <CopyBlock label="Hero rewrite" value={d.positioningBrief.heroRewrite} />
                  <CopyBlock label="Meta description" value={d.positioningBrief.metaRewrite} />
                  <CopyBlock label="About paragraph" value={d.positioningBrief.aboutRewrite} />
                  <CopyBlock label="JSON-LD (paste in <head>)" value={d.positioningBrief.jsonLd} mono />
                </div>
              ) : (
                <div style={{ padding: "28px", textAlign: "center" }}>
                  <div style={{ fontSize: 24, marginBottom: 12, opacity: 0.5 }}>⟳</div>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: "0.15em", color: "#64748b" }}>WRITING YOUR POSITIONING BRIEF...</div>
                </div>
              )
            ) : (
              <LockedSection
                description="A new homepage headline, meta description, about paragraph, and a small piece of code to paste in your site header. All written so AI learns to describe you the way you want."
                onUnlock={handleUnlock}
                checkingOut={checkingOut}
                estimatedLoss={estimatedLoss}
              />
            )}
          </Card>
        </div>
      )}

      {/* ── 07 Online Presence (premium) ── */}
      {!isPartial && (
        <div className="fade" style={{ marginBottom: 28 }}>
          <SectionHeading label="07 - WHERE AI READS ABOUT YOU" badge={unlocked ? (onlinePresenceData ? "Analyzed" : "Generating") : "Locked"} badgeColor={unlocked ? "#3b82f6" : "#fbbf24"} />
          <Card>
            <CardDescription>The actual websites AI uses to learn about your brand, with direct links. So you know where to focus.</CardDescription>
            {unlocked ? (
              onlinePresenceData ? (
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
                  {onlinePresenceData.competitorGaps && onlinePresenceData.competitorGaps.length > 0 && (
                    <>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#64748b", marginBottom: 10 }}>COMPETITOR CITATION GAPS</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                        {onlinePresenceData.competitorGaps.map((g, i) => (
                          <div key={i} style={{ padding: "12px 16px", background: "#f87171" + "08", border: "1px solid #f8717120", borderRadius: 6 }}>
                            <div style={{ fontSize: 12, color: "#f87171", fontWeight: 700, fontFamily: "'Space Mono', monospace", letterSpacing: "0.05em", marginBottom: 4 }}>
                              {g.platform.toUpperCase()} - {(g.competitors ?? []).join(", ")} listed. You&apos;re not.
                            </div>
                            <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{g.suggestion}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <InsightBox>{onlinePresenceData.insight}</InsightBox>
                </>
              ) : (
                <div style={{ padding: "28px", textAlign: "center" }}>
                  <div style={{ fontSize: 24, marginBottom: 12, opacity: 0.5 }}>⟳</div>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: "0.15em", color: "#64748b" }}>SEARCHING THE WEB FOR YOUR BRAND...</div>
                </div>
              )
            ) : (
              <LockedSection
                description="The actual websites AI reads to learn about your brand, with direct links. Plus the sites where your competitors show up and you don't."
                onUnlock={handleUnlock}
                checkingOut={checkingOut}
              />
            )}
          </Card>
        </div>
      )}

      {/* ── 08 Content Gap Map (premium) ── */}
      {!isPartial && (
        <div className="fade" style={{ marginBottom: 28 }}>
          <SectionHeading label="08 - 8 PAGES YOU SHOULD WRITE NEXT" badge={unlocked ? (d.contentGapMap ? "Ready" : "Generating") : "Locked"} badgeColor={unlocked ? "#3b82f6" : "#fbbf24"} />
          <Card>
            <CardDescription>8 ready-to-write article ideas for the exact questions where competitors show up in AI answers and you don&apos;t.</CardDescription>
            {unlocked ? (
              d.contentGapMap && d.contentGapMap.briefs.length > 0 ? (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
                    {d.contentGapMap.briefs.map((b, i) => (
                      <div key={i} style={{ padding: "14px 16px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{b.title}</div>
                          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#3b82f618", color: "#3b82f6", fontWeight: 500, flexShrink: 0 }}>{b.format}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8, fontStyle: "italic" }}>Targets: &ldquo;{b.targetQuery}&rdquo;</div>
                        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
                          {b.outline.map((o, oi) => (
                            <li key={oi} style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{o}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <InsightBox>{d.contentGapMap.insight}</InsightBox>
                </>
              ) : (
                <div style={{ padding: "28px", textAlign: "center" }}>
                  <div style={{ fontSize: 24, marginBottom: 12, opacity: 0.5 }}>⟳</div>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: "0.15em", color: "#64748b" }}>WRITING YOUR CONTENT BRIEFS...</div>
                </div>
              )
            ) : (
              <LockedSection
                description="For each question where AI mentions a competitor and not you, a ready-to-write article idea: title, what question it answers, outline, and format."
                onUnlock={handleUnlock}
                checkingOut={checkingOut}
              />
            )}
          </Card>
        </div>
      )}

      {/* ── 09 Roadmap (premium, upgraded) ── */}
      {!isPartial && (
        <div className="fade" style={{ marginBottom: 28 }}>
          <SectionHeading label="09 - YOUR 30-DAY PLAN" badge={unlocked ? (d.roadmap && d.roadmap.weeks.length > 0 ? "Ready" : d.roadmap ? "Needs regen" : "Generating") : "Locked"} badgeColor={unlocked ? (d.roadmap && d.roadmap.weeks.length === 0 ? "#f87171" : "#3b82f6") : "#fbbf24"} />
          <Card>
            <CardDescription>12 specific things to do over the next month. Each one has a copy-paste template, the exact place to do it, and an expected score bump.</CardDescription>
            {unlocked ? (
              d.roadmap && d.roadmap.weeks.length > 0 ? (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 18, marginBottom: 20 }}>
                    {d.roadmap.weeks.map((week, wi) => (
                      <div key={wi}>
                        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#fbbf24", marginBottom: 10 }}>{week.week}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {week.actions.map((item, ai) => {
                            const impactColor = item.impact === "High" ? "#f87171" : item.impact === "Medium" ? "#fbbf24" : "#64748b";
                            return (
                              <div key={ai} style={{ padding: "14px 16px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                                  <div style={{ flex: 1, minWidth: 220, fontSize: 14, color: "#0f172a", fontWeight: 600, lineHeight: 1.5 }}>{item.action}</div>
                                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${impactColor}18`, color: impactColor, fontWeight: 500 }}>{item.impact}</span>
                                    {item.scoreImpact && (
                                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#3b82f618", color: "#3b82f6", fontWeight: 500, fontFamily: "'Space Mono', monospace" }}>{item.scoreImpact}</span>
                                    )}
                                  </div>
                                </div>
                                {item.where && (
                                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: item.template ? 8 : 0 }}>
                                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: "#94a3b8", marginRight: 6 }}>WHERE</span>
                                    {item.where}
                                  </div>
                                )}
                                {item.template && (
                                  <div style={{ marginTop: 4 }}>
                                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: "#94a3b8", marginBottom: 4 }}>TEMPLATE</div>
                                    <div style={{ fontSize: 12, color: "#475569", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "10px 12px", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{item.template}</div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <InsightBox>{d.roadmap.insight}</InsightBox>
                </>
              ) : d.roadmap ? (
                <div style={{ padding: "28px 24px", textAlign: "center", background: "#f87171" + "08", border: "1px solid #f8717130", borderRadius: 8 }}>
                  <div style={{ fontSize: 14, color: "#0f172a", fontWeight: 600, marginBottom: 6 }}>Your 30-day plan didn&apos;t generate cleanly.</div>
                  <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5, marginBottom: 14, maxWidth: 480, margin: "0 auto 14px" }}>
                    The model response was truncated. Click below to regenerate, it takes about 30 seconds.
                  </div>
                  <button
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    style={{ background: regenerating ? "#64748b" : "#3b82f6", color: "#fff", border: "none", padding: "10px 22px", fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 700, letterSpacing: "1.2px", cursor: regenerating ? "not-allowed" : "pointer", borderRadius: 6 }}
                  >
                    {regenerating ? "REGENERATING… PAGE WILL REFRESH" : "REGENERATE MY 30-DAY PLAN"}
                  </button>
                </div>
              ) : (
                <div style={{ padding: "28px", textAlign: "center" }}>
                  <div style={{ fontSize: 24, marginBottom: 12, opacity: 0.5 }}>⟳</div>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: "0.15em", color: "#64748b" }}>BUILDING YOUR 30-DAY PLAN...</div>
                </div>
              )
            ) : (
              <LockedSection
                description="A week-by-week plan with 12 specific things to do. Every single action comes with a ready-to-use template and an expected score bump, so you know what to do first."
                onUnlock={handleUnlock}
                checkingOut={checkingOut}
              />
            )}
          </Card>
        </div>
      )}

      {/* ── Footer CTA (single, strategic) ── */}
      <div className="fade" style={{ position: "relative", overflow: "hidden", padding: "36px 36px", marginBottom: 28, background: "linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)", border: "1px solid #3b82f630", borderRadius: 12 }}>
        <div style={{ position: "absolute", top: -60, right: -60, width: 260, height: 260, borderRadius: "50%", background: "radial-gradient(circle, #3b82f618 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#3b82f6", background: "#3b82f615", border: "1px solid #3b82f630", padding: "4px 12px", borderRadius: 4, marginBottom: 16 }}>
            <span style={{ width: 6, height: 6, background: "#3b82f6", borderRadius: "50%", boxShadow: "0 0 6px #3b82f6", display: "inline-block" }} />WANT A HUMAN TO RUN THIS?
          </div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(22px, 3.5vw, 28px)", fontWeight: 800, letterSpacing: "-0.5px", color: "#0f172a", lineHeight: 1.15, marginBottom: 10 }}>
            If AI doesn&apos;t know you,<br /><span style={{ color: "#3b82f6" }}>your customers won&apos;t either.</span>
          </div>
          <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, marginBottom: 22 }}>
            Book a free 15-min call. I&apos;ll walk through your audit with you and we&apos;ll plan the next 30 days together. No pitch, just strategy.
          </p>
          <button onClick={() => window.open("https://calendly.com/not-another-marketer/free-ai-growth-audit-call", "_blank")} style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "14px 32px", fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, letterSpacing: "1.5px", cursor: "pointer", borderRadius: 6, transition: "transform 0.15s, box-shadow 0.2s" }} onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 28px #3b82f650"; }} onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
            BOOK A FREE STRATEGY CALL →
          </button>
        </div>
      </div>

      {/* ── Methodology ── */}
      {!isPartial && <MethodologySection result={d} />}

      {/* ── AI Visibility Matrix ── */}
      {d.quadrant && !isPartial && (
        <div className="fade" style={{ marginBottom: 28, padding: "14px 18px 10px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#64748b", marginBottom: 4 }}>AI VISIBILITY MATRIX</div>
          <QuadrantChart awarenessScore={d.quadrant.awarenessScore} recommendationScore={d.quadrant.recommendationScore} label={d.quadrant.label} />
          <p style={{ fontSize: 13, color: "#475569", textAlign: "center", margin: "4px 0 0" }}>{d.quadrant.description}</p>
        </div>
      )}
    </div>
  );
}

// ── Copy block (used in positioning brief) ───────────────────

function CopyBlock({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: "0.15em", color: "#64748b" }}>{label.toUpperCase()}</div>
        <button
          onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
          style={{ background: copied ? "#3b82f620" : "#f1f5f9", border: `1px solid ${copied ? "#3b82f640" : "#d1d5db"}`, color: copied ? "#3b82f6" : "#64748b", padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontFamily: "'Space Mono', monospace", fontSize: 10, fontWeight: 500, letterSpacing: "0.05em" }}
        >
          {copied ? "COPIED" : "COPY"}
        </button>
      </div>
      <pre style={{ fontSize: mono ? 11 : 13, color: "#1e293b", background: "#f1f5f9", padding: "10px 12px", borderRadius: 6, fontFamily: mono ? "'Space Mono', monospace" : "'Inter', sans-serif", lineHeight: 1.55, margin: 0, whiteSpace: "pre-wrap", overflow: "auto", maxHeight: mono ? 220 : undefined }}>{value}</pre>
    </div>
  );
}

// ── Main page wrapper ────────────────────────────────────────

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
      !audit.result.onlinePresence && !audit.result.sourceAttribution
      || !audit.result.roadmap
      || !audit.result.opportunityCalculator
      || !audit.result.positioningBrief
      || !audit.result.contentGapMap
    );
    if (!isPending && !isGenerating) return;
    const interval = setInterval(fetchAudit, 2500);
    return () => clearInterval(interval);
  }, [audit, fetchAudit]);

  const loadingPhase: 1 | 2 = (audit?.result?.awareness) ? 2 : 1;
  const isPartial = audit?.status === "pending" && !!audit?.result?.awareness;

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
          <span style={{ fontSize: 13, color: "#15803d" }}>✓ &nbsp;Payment confirmed - your full Action Kit is being generated now.</span>
          <button onClick={() => setPaymentBanner(null)} style={{ background: "none", border: "none", color: "#15803d", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}
      {paymentBanner === "cancelled" && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: "#fef2f2", borderBottom: "1px solid #f8717140", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "#f87171" }}>Payment was cancelled - your free audit is still available below.</span>
          <button onClick={() => setPaymentBanner(null)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      <div style={{ position: "fixed", left: 0, right: 0, height: "1px", background: "linear-gradient(90deg, transparent, #3b82f615, transparent)", animation: "scanline 10s linear infinite", pointerEvents: "none", zIndex: 1 }} />
      <div style={{ position: "fixed", inset: 0, opacity: 0.05, backgroundImage: "linear-gradient(#3b82f6 1px, transparent 1px), linear-gradient(90deg, #3b82f6 1px, transparent 1px)", backgroundSize: "48px 48px", pointerEvents: "none" }} />

      {error ? (
        <ErrorState onRetry={() => (window.location.href = "/")} />
      ) : !audit ? (
        <LoadingState brand="..." category="..." phase={1} />
      ) : audit.status === "pending" && !audit.result?.awareness ? (
        <LoadingState brand={audit.brand} category={audit.category} phase={1} />
      ) : isPartial && audit.result ? (
        <AuditResultsView d={audit.result} websiteUrl={audit.website_url} unlocked={audit.unlocked ?? false} auditId={audit.id} isPartial scoreHistory={audit.scoreHistory} />
      ) : audit.status === "complete" && audit.result ? (
        <AuditResultsView d={audit.result} websiteUrl={audit.website_url} unlocked={audit.unlocked ?? false} auditId={audit.id} scoreHistory={audit.scoreHistory} />
      ) : audit.status === "pending" ? (
        <LoadingState brand={audit.brand} category={audit.category} phase={loadingPhase} />
      ) : (
        <ErrorState onRetry={() => (window.location.href = "/")} />
      )}
    </div>
  );
}
