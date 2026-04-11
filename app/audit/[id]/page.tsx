"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

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
      status: string;
      description: string;
    }>;
    accuracyScore: number;
    accuracyFlag: string;
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
    insight: string;
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
      accuracyScore: number;
      note: string;
    }>;
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
    insight: string;
  };
}

interface AuditRow {
  id: string;
  status: string;
  result: AuditResult | null;
  brand: string;
  category: string;
  website_url: string | null;
}

// ── Shared Components ────────────────────────────────────────

function ScoreRing({ score, size = 88, stroke = 7 }: { score: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 70 ? "#3b82f6" : score >= 45 ? "#fbbf24" : "#f87171";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", position: "absolute", inset: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e1e30" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div
        style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "'Space Mono', monospace", fontSize: size * 0.22, fontWeight: 700, color,
        }}
      >
        {score}
      </div>
    </div>
  );
}

function ModelBadge({ model, status }: { model: string; status: string }) {
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    strong: { bg: "#3b82f615", border: "#3b82f630", text: "#3b82f6" },
    weak: { bg: "#fbbf2415", border: "#fbbf2430", text: "#fbbf24" },
    confused: { bg: "#fb923c15", border: "#fb923c30", text: "#fb923c" },
    unknown: { bg: "#f8717115", border: "#f8717130", text: "#f87171" },
    error: { bg: "#f8717115", border: "#f8717130", text: "#f87171" },
  };
  const icons: Record<string, string> = { strong: "●", weak: "◐", confused: "◌", unknown: "○", error: "✗" };
  const c = colors[status] || colors.unknown;
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 10px", borderRadius: 4,
        background: c.bg, border: `1px solid ${c.border}`,
        fontSize: 11, color: c.text, fontWeight: 500,
      }}
    >
      {icons[status] || "○"} {model}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: "'Space Mono', monospace", fontSize: 10,
        letterSpacing: "0.2em", color: "#6b7a99", marginBottom: 10,
      }}
    >
      {children}
    </p>
  );
}

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "#0f0f1a", border: "1px solid #1e1e30",
        borderRadius: 10, padding: "24px 28px", ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({
  icon, title, description, score, label, color,
}: {
  icon: string; title: string; description: string; score: number; label: string; color: string;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 16,
        marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid #1e1e30",
      }}
    >
      <div style={{ fontSize: 22, opacity: 0.9, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#dce4f5" }}>{title}</span>
          <span
            style={{
              fontSize: 11, padding: "2px 8px", borderRadius: 4,
              background: `${color}18`, color, fontWeight: 500,
            }}
          >
            {label}
          </span>
        </div>
        <div style={{ fontSize: 13, color: "#6b7a99" }}>{description}</div>
      </div>
      <ScoreRing score={score} size={52} stroke={5} />
    </div>
  );
}

function InsightBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 16, padding: "12px 16px",
        background: "#0a0a14", border: "1px solid #3b82f620",
        borderRadius: 6, borderLeft: "3px solid #3b82f6",
      }}
    >
      <span
        style={{
          fontFamily: "'Space Mono', monospace", fontSize: 10,
          letterSpacing: "0.15em", color: "#3b82f6", display: "block", marginBottom: 5,
        }}
      >
        ▸ KEY INSIGHT
      </span>
      <p style={{ fontSize: 13, color: "#8892aa", margin: 0, lineHeight: 1.6 }}>{children}</p>
    </div>
  );
}

// ── Loading State ────────────────────────────────────────────

function LoadingState({ brand, category }: { brand: string; category: string }) {
  const models = ["GPT-4o", "Perplexity", "Claude", "Gemini"];
  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "48px 24px", position: "relative", zIndex: 2 }}>
      <div style={{ marginBottom: 40, paddingBottom: 32, borderBottom: "1px solid #1e1e30" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div
            style={{
              width: 7, height: 7, background: "#3b82f6", borderRadius: "50%",
              boxShadow: "0 0 8px #3b82f6", animation: "pulse-dot 2.5s ease infinite",
            }}
          />
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#6b7a99" }}>
          FREE GEO AUDIT TOOL v1.0
          </span>
        </div>
        <h1
          style={{
            fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(26px, 4vw, 42px)",
            fontWeight: 800, letterSpacing: "-1px", color: "#f0f4ff", lineHeight: 1.1, marginBottom: 8,
          }}
        >
          SCANNING LLMs FOR
          <br />
          <span style={{ color: "#fbbf24" }}>{(brand || "...").toUpperCase()}</span>
        </h1>
        <p style={{ fontSize: 14, color: "#6b7a99" }}>
          Category: <span style={{ color: "#8892aa" }}>{category || "..."}</span>
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {models.map((m, i) => (
          <div
            key={m}
            style={{
              padding: "24px 20px", background: "#0f0f1a",
              border: "1px solid #fbbf2425", borderRadius: 10,
              textAlign: "center", position: "relative", overflow: "hidden",
              animation: `fadeUp 0.4s ease ${i * 0.1}s both`,
            }}
          >
            <div
              style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 2,
                background: "linear-gradient(90deg, transparent, #fbbf24, transparent)",
                animation: "scanline 2s linear infinite",
              }}
            />
            <div
              style={{
                fontFamily: "'Space Mono', monospace", fontSize: 10,
                letterSpacing: "0.15em", color: "#6b7a99", marginBottom: 12,
              }}
            >
              {m.toUpperCase()}
            </div>
            <div
              style={{
                width: 44, height: 44, borderRadius: "50%",
                border: "2px solid #fbbf2440", margin: "0 auto 12px",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: "#fbbf24", animation: "pulse-dot 1.5s ease infinite",
                }}
              />
            </div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: "#fbbf24", letterSpacing: "0.1em" }}>
              SCANNING...
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 32, padding: "16px 20px",
          background: "#0f0f1a", border: "1px solid #1e1e30", borderRadius: 8,
          textAlign: "center",
        }}
      >
        <p style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#6b7a99", letterSpacing: "0.1em" }}>
          Querying LLMs to find out if you are showing up in AI answers. This can take up to 2 minutes.
        </p>
      </div>
    </div>
  );
}

// ── Error State ──────────────────────────────────────────────

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      style={{
        maxWidth: 500, margin: "120px auto", padding: "48px 32px",
        background: "#0f0f1a", border: "1px solid #f8717130", borderRadius: 10,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.6 }}>✗</div>
      <h2
        style={{
          fontFamily: "'Space Grotesk', sans-serif", fontSize: 22,
          fontWeight: 800, color: "#f87171", marginBottom: 10,
        }}
      >
        AUDIT FAILED
      </h2>
      <p style={{ fontSize: 14, color: "#6b7a99", marginBottom: 24, lineHeight: 1.6 }}>
        Something went wrong during the audit. This usually means one or more LLM APIs timed out.
      </p>
      <button
        onClick={onRetry}
        style={{
          background: "#3b82f6", color: "#0a0a0f", border: "none",
          padding: "12px 32px", fontFamily: "'Space Mono', monospace",
          fontSize: 13, fontWeight: 700, letterSpacing: "1.5px",
          cursor: "pointer", borderRadius: 6,
        }}
      >
        TRY AGAIN →
      </button>
    </div>
  );
}

// ── Full Results ─────────────────────────────────────────────

function AuditResultsView({ d, websiteUrl }: { d: AuditResult; websiteUrl: string | null }) {
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  function handleCopy() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const verdictColor = d.overallScore >= 75 ? "#3b82f6" : d.overallScore >= 45 ? "#fbbf24" : "#f87171";

  const sovColors = ["#fbbf24", "#f87171", "#6b7a99", "#3a4060", "#2a2a40"];

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "48px 24px", position: "relative", zIndex: 2 }}>
      {/* Page Header */}
      <div className="fade" style={{ marginBottom: 40, paddingBottom: 32, borderBottom: "1px solid #1e1e30" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div
            style={{
              width: 7, height: 7, background: "#3b82f6", borderRadius: "50%",
              boxShadow: "0 0 8px #3b82f6", animation: "pulse-dot 2.5s ease infinite",
            }}
          />
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#6b7a99" }}>
          FREE GEO AUDIT TOOL v1.0
          </span>
        </div>

        <h1
          style={{
            fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(26px, 4vw, 42px)",
            fontWeight: 800, letterSpacing: "-1px", color: "#f0f4ff", lineHeight: 1.1, marginBottom: 8,
          }}
        >
          GEO AUDIT REPORT
          <br />
          <span style={{ color: "#3b82f6" }}>{d.brand.toUpperCase()}</span>
        </h1>
        <p style={{ fontSize: 14, color: "#6b7a99", marginBottom: 14 }}>
          {websiteUrl && (
            <>
              Website: <span style={{ color: "#8892aa" }}>{websiteUrl}</span>
              &nbsp;&nbsp;·&nbsp;&nbsp;
            </>
          )}
          Category: <span style={{ color: "#8892aa" }}>{d.category}</span>
          &nbsp;&nbsp;·&nbsp;&nbsp;
          Audited: <span style={{ color: "#8892aa" }}>{d.auditDate}</span>
          &nbsp;&nbsp;·&nbsp;&nbsp;
          Models: <span style={{ color: "#8892aa" }}>GPT-4o · Perplexity · Claude · Gemini</span>
        </p>

        {/* Combined score card */}
        <div
          style={{
            padding: "24px 28px", background: "#0f0f1a",
            border: `1px solid ${verdictColor}30`, borderRadius: 10,
            display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap",
          }}
        >
          {/* Score ring */}
          <ScoreRing score={d.overallScore} size={96} stroke={8} />

          {/* Verdict + sub */}
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#6b7a99", marginBottom: 6 }}>
              OVERALL LLM VISIBILITY SCORE
            </div>
            <div
              style={{
                fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(22px, 3vw, 34px)",
                fontWeight: 800, color: verdictColor, lineHeight: 1.05,
                letterSpacing: "-0.5px", marginBottom: 10,
              }}
            >
              {d.overallVerdict}
            </div>
            <p style={{ fontSize: 13, color: "#8892aa", lineHeight: 1.6, margin: 0 }}>{d.overallSub}</p>
          </div>

          {/* Dimension bars */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 240, flexGrow: 1 }}>
            {[
              { label: "Brand Awareness", score: d.awareness.score, color: d.awareness.color },
              { label: "Brand Positioning", score: d.positioning?.score ?? 0, color: d.positioning?.color ?? "#6b7a99" },
              { label: "Recommendation Rank", score: d.recommendation.score, color: d.recommendation.color },
              { label: "Competitive Context", score: d.competitive.score, color: d.competitive.color },
            ].map((dim) => (
              <div key={dim.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    fontFamily: "'Space Mono', monospace", fontSize: 9,
                    letterSpacing: "0.05em", color: "#6b7a99",
                    width: 110, textAlign: "right", lineHeight: 1.4, flexShrink: 0,
                  }}
                >
                  {dim.label.toUpperCase()}
                </div>
                <div style={{ flex: 1, height: 4, background: "#1e1e30", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${dim.score}%`, height: "100%", background: dim.color, borderRadius: 2, transition: "width 1.2s ease" }} />
                </div>
                <div
                  style={{
                    fontFamily: "'Space Mono', monospace", fontSize: 11,
                    color: dim.color, width: 28, fontWeight: 700, textAlign: "right", flexShrink: 0,
                  }}
                >
                  {dim.score}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Share URL bar */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10,
            marginTop: 14, padding: "10px 16px",
            background: "#0f0f1a", border: "1px solid #1e1e30", borderRadius: 8,
          }}
        >
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#6b7a99", flexShrink: 0 }}>
            SHARE URL
          </span>
          <div
            style={{
              flex: 1, padding: "6px 12px", background: "#0a0a14",
              border: "1px solid #1e1e30", borderRadius: 4,
              fontSize: 12, color: "#8892aa", fontFamily: "'Space Mono', monospace",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {shareUrl}
          </div>
          <button
            onClick={handleCopy}
            style={{
              background: copied ? "#3b82f620" : "#1e1e30",
              border: `1px solid ${copied ? "#3b82f640" : "#2e2e48"}`,
              color: copied ? "#3b82f6" : "#8892aa",
              padding: "6px 14px", borderRadius: 4, cursor: "pointer",
              fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 500,
              transition: "all 0.2s",
            }}
          >
            {copied ? "COPIED" : "COPY LINK"}
          </button>
        </div>
      </div>

      {/* Card 1: Awareness */}
      <div className="fade" style={{ marginBottom: 28 }}>
        <SectionLabel>01 — BRAND AWARENESS</SectionLabel>
        <Card>
          <CardHeader
            icon="◈" title="Brand Awareness" score={d.awareness.score}
            label={d.awareness.label} color={d.awareness.color}
            description="Do LLMs know your brand exists and describe it accurately?"
          />

          <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            {d.awareness.modelResults.map((m, i) => (
              <div
                key={i}
                style={{
                  display: "flex", gap: 14, padding: "12px 14px",
                  background: "#0a0a14", border: "1px solid #1e1e30", borderRadius: 6,
                }}
              >
                <div style={{ flexShrink: 0, paddingTop: 1 }}>
                  <ModelBadge model={m.model} status={m.status} />
                </div>
                <p
                  style={{
                    fontSize: 13, lineHeight: 1.6, margin: 0,
                    color: m.status === "strong" ? "#b0bcd8" : m.status === "weak" ? "#8892aa" : "#4a5270",
                    fontStyle: m.status === "unknown" ? "italic" : "normal",
                  }}
                >
                  &ldquo;{m.description}&rdquo;
                </p>
              </div>
            ))}
          </div>

          {/* Accuracy score */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#6b7a99" }}>
              DESCRIPTION ACCURACY
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <div
                  key={n}
                  style={{
                    width: 20, height: 4, borderRadius: 2,
                    background: n <= Math.round(d.awareness.accuracyScore) ? "#fbbf24" : "#1e1e30",
                  }}
                />
              ))}
            </div>
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#fbbf24" }}>
              {d.awareness.accuracyScore}/5
            </span>
          </div>

          <InsightBox>{d.awareness.accuracyFlag}</InsightBox>
        </Card>
      </div>

      {/* Mid-report CTA */}
      <div
        className="fade"
        style={{
          position: "relative", overflow: "hidden",
          padding: "28px 32px", marginBottom: 28,
          background: "linear-gradient(135deg, #0f0f1a 0%, #0a0f18 100%)",
          border: "1px solid #3b82f630",
          borderRadius: 12,
          boxShadow: "0 0 40px #3b82f610, inset 0 1px 0 #3b82f618",
        }}
      >
        <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, #3b82f618 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 20 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#3b82f6", marginBottom: 10 }}>
              LLM VISIBILITY = CUSTOMERS YOU&apos;RE NOT REACHING YET.
            </div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 800, color: "#f0f4ff", letterSpacing: "-0.3px", lineHeight: 1.2 }}>
              Book a free 15-min call and leave with a prioritized action plan.
            </div>
          </div>
          <button
            onClick={() => window.open("https://calendly.com/not-another-marketer/free-ai-growth-audit-call", "_blank")}
            style={{
              background: "#3b82f6", color: "#fff", border: "none",
              padding: "13px 28px", fontFamily: "'Space Mono', monospace",
              fontSize: 12, fontWeight: 700, letterSpacing: "1.2px",
              cursor: "pointer", borderRadius: 6, whiteSpace: "nowrap", flexShrink: 0,
              transition: "transform 0.15s, box-shadow 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px #3b82f650"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
          >
            BOOK A FREE CALL →
          </button>
        </div>
      </div>

      {/* Card 2: Brand Positioning */}
      {d.positioning && (
        <div className="fade" style={{ marginBottom: 28 }}>
          <SectionLabel>02 — BRAND POSITIONING</SectionLabel>
          <Card>
            <CardHeader
              icon="◎" title="Brand Positioning" score={d.positioning.score}
              label={d.positioning.label} color={d.positioning.color}
              description="How do LLMs understand your market position and value proposition?"
            />

            <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
              {d.positioning.modelResults.map((m, i) => {
                const statusColor = m.strength === "strong" ? "#b0bcd8" : m.strength === "weak" ? "#8892aa" : "#4a5270";
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex", gap: 14, padding: "12px 14px",
                      background: "#0a0a14", border: "1px solid #1e1e30", borderRadius: 6,
                    }}
                  >
                    <div style={{ flexShrink: 0, paddingTop: 1 }}>
                      <ModelBadge model={m.model} status={m.strength} />
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                      {[
                        { label: "Target", value: m.targetCustomer },
                        { label: "Value prop", value: m.valueProp },
                        { label: "Differentiator", value: m.differentiation },
                      ].map((row) => (
                        <div key={row.label}>
                          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: "#6b7a99", marginRight: 8 }}>
                            {row.label.toUpperCase()}
                          </span>
                          <span style={{ fontSize: 13, color: statusColor, lineHeight: 1.5 }}>{row.value || "—"}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
                      <div style={{ display: "flex", gap: 3 }}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <div
                            key={n}
                            style={{
                              width: 6, height: 6, borderRadius: "50%",
                              background: n <= m.accuracyScore ? (m.strength === "strong" ? "#3b82f6" : m.strength === "weak" ? "#fbbf24" : "#fb923c") : "#1e1e30",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <InsightBox>{d.positioning.insight}</InsightBox>
          </Card>
        </div>
      )}

      {/* Card 3: Recommendation Rank (Locked) */}
      <div className="fade" style={{ marginBottom: 28 }}>
        <SectionLabel>03 — RECOMMENDATION RANK</SectionLabel>
        <div style={{ background: "#0f0f1a", border: "1px solid #1e1e30", borderRadius: 10, overflow: "hidden" }}>
          {/* Card header (visible above blur) */}
          <div style={{ padding: "24px 28px 0" }}>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 16,
                marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid #1e1e30",
              }}
            >
              <div style={{ fontSize: 22, opacity: 0.9, flexShrink: 0 }}>◆</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#dce4f5" }}>Recommendation Rank</span>
                  <span style={{
                    fontSize: 11, padding: "4px 12px", borderRadius: 4,
                    background: "#fbbf2415", border: "1px solid #fbbf2430", color: "#fbbf24", fontWeight: 500,
                  }}>
                    🔒 LOCKED
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#6b7a99" }}>Do you appear when buyers search for your category?</div>
              </div>
            </div>
          </div>

          {/* Blurred + overlay container */}
          <div style={{ position: "relative", overflow: "hidden" }}>
            {/* Blurred fake content */}
            <div style={{ filter: "blur(6px)", pointerEvents: "none", userSelect: "none", padding: "0 28px 28px" }}>
              <div style={{ marginBottom: 16, padding: "10px 14px", background: "#0a0a14", border: "1px solid #1e1e30", borderRadius: 6 }}>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#6b7a99" }}>PROMPT USED &nbsp;</span>
                <span style={{ fontSize: 13, color: "#8892aa", fontStyle: "italic" }}>&ldquo;What are the best project management tools available right now?&rdquo;</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
                {[
                  { model: "GPT-4o", rank: 2, listed: true },
                  { model: "Perplexity", rank: null, listed: false },
                  { model: "Claude", rank: 3, listed: true },
                  { model: "Gemini", rank: 1, listed: true },
                ].map((m, i) => (
                  <div key={i} style={{ padding: 14, background: "#0a0a14", border: `1px solid ${m.listed ? "#fbbf2425" : "#f8717130"}`, borderRadius: 8, textAlign: "center" }}>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: "#6b7a99", marginBottom: 8 }}>{m.model}</div>
                    {m.listed ? (
                      <>
                        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 800, lineHeight: 1, color: "#fbbf24" }}>#{m.rank}</div>
                        <div style={{ fontSize: 11, color: "#6b7a99", marginTop: 4 }}>of 5 listed</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 800, color: "#f87171", lineHeight: 1, marginTop: 4 }}>—</div>
                        <div style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>Not listed</div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#6b7a99", marginBottom: 10 }}>SHARE OF VOICE — ALL MODELS</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[
                    { name: "Competitor A", pct: 34 },
                    { name: "Your Brand", pct: 22 },
                    { name: "Competitor B", pct: 18 },
                    { name: "Competitor C", pct: 14 },
                    { name: "Others", pct: 12 },
                  ].map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 12, color: "#8892aa", width: 70, flexShrink: 0 }}>{item.name}</span>
                      <div style={{ flex: 1, height: 4, background: "#1e1e30", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${item.pct}%`, height: "100%", background: sovColors[i] || "#3a4060", borderRadius: 2 }} />
                      </div>
                      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: sovColors[i] || "#3a4060", width: 36, textAlign: "right" }}>{item.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 16, padding: "12px 16px", background: "#0a0a14", border: "1px solid #3b82f620", borderRadius: 6, borderLeft: "3px solid #3b82f6" }}>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#3b82f6", display: "block", marginBottom: 5 }}>▸ KEY INSIGHT</span>
                <p style={{ fontSize: 13, color: "#8892aa", margin: 0, lineHeight: 1.6 }}>Your brand is invisible on 2 out of 4 models. Competitors are capturing buyer intent you should own.</p>
              </div>
            </div>

            {/* Gradient overlay with CTA */}
            <div
              style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(to bottom, #0a0a0f00 0%, #0a0a0fcc 30%, #0a0a0fff 60%)",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
                padding: "40px 32px",
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 16 }}>
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="#6b7a99" strokeWidth="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#6b7a99" strokeWidth="2" strokeLinecap="round" />
              </svg>

              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 800, color: "#f0f4ff", marginBottom: 8, textAlign: "center" }}>
                Are you showing up when buyers search for your category?
              </div>

              <div style={{ fontSize: 14, color: "#8892aa", maxWidth: 440, textAlign: "center", lineHeight: 1.6, marginBottom: 24 }}>
                Unlock your full Recommendation Rank report. See exactly where each LLM ranks you, who's above you, and your share of voice vs competitors.
              </div>

              <span style={{
                fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: "0.15em", color: "#fbbf24",
                background: "#fbbf2415", border: "1px solid #fbbf2430",
                padding: "4px 14px", borderRadius: 4, marginBottom: 16,
              }}>
                ONE-TIME · $17
              </span>

              <button
                onClick={() => {}}
                style={{
                  background: "#fbbf24", color: "#0a0a0f", border: "none",
                  padding: "14px 36px", fontFamily: "'Space Mono', monospace",
                  fontSize: 14, fontWeight: 700, letterSpacing: "1.5px",
                  cursor: "pointer", borderRadius: 6,
                  transition: "background 0.2s, transform 0.15s, box-shadow 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 24px #fbbf2440"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
              >
                UNLOCK FULL REPORT →
              </button>

              <div style={{ fontSize: 11, color: "#3a4060", marginTop: 10 }}>
                Includes recommendation rank · competitive context · source attribution · 30-day fix roadmap
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Card 4: Competitive Context (Locked) */}
      <div className="fade" style={{ marginBottom: 28 }}>
        <SectionLabel>04 — COMPETITIVE CONTEXT</SectionLabel>
        <div style={{ background: "#0f0f1a", border: "1px solid #1e1e30", borderRadius: 10, overflow: "hidden" }}>
          {/* Card header (visible above blur) */}
          <div style={{ padding: "24px 28px 0" }}>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 16,
                marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid #1e1e30",
              }}
            >
              <div style={{ fontSize: 22, opacity: 0.9, flexShrink: 0 }}>◇</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#dce4f5" }}>Competitive Context</span>
                  <span style={{
                    fontSize: 11, padding: "4px 12px", borderRadius: 4,
                    background: "#fbbf2415", border: "1px solid #fbbf2430", color: "#fbbf24", fontWeight: 500,
                  }}>
                    🔒 LOCKED
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#6b7a99" }}>How do models compare you to your top competitors?</div>
              </div>
            </div>
          </div>

          {/* Blurred + overlay container */}
          <div style={{ position: "relative", overflow: "hidden" }}>
            {/* Blurred fake content */}
            <div style={{ filter: "blur(6px)", pointerEvents: "none", userSelect: "none", padding: "0 28px 28px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <div style={{ padding: "14px 16px", background: "#0a0a14", border: "1px solid #3b82f620", borderRadius: 8 }}>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#3b82f6", marginBottom: 12 }}>WHERE YOU WIN</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {["Ease of onboarding", "Customer support quality", "Pricing flexibility"].map((w, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ color: "#3b82f6", fontSize: 11, marginTop: 2, flexShrink: 0 }}>✓</span>
                        <span style={{ fontSize: 13, color: "#8892aa", lineHeight: 1.5 }}>{w}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ padding: "14px 16px", background: "#0a0a14", border: "1px solid #f8717120", borderRadius: 8 }}>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#f87171", marginBottom: 12 }}>WHERE YOU LOSE</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {["Enterprise feature depth", "Integration ecosystem", "Brand recognition"].map((l, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <span style={{ color: "#f87171", fontSize: 11, marginTop: 2, flexShrink: 0 }}>✗</span>
                        <span style={{ fontSize: 13, color: "#8892aa", lineHeight: 1.5 }}>{l}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#6b7a99", marginBottom: 10 }}>SENTIMENT PER MODEL</div>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr>
                      {["MODEL", "SENTIMENT", "NOTE"].map((h) => (
                        <th key={h} style={{ fontSize: 11, fontWeight: 500, color: "#6b7a99", textAlign: "left", padding: "0 0 10px", fontFamily: "'Space Mono', monospace", letterSpacing: "0.1em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { model: "GPT-4o", sentiment: "positive", note: "Positions brand favorably vs market leader." },
                      { model: "Perplexity", sentiment: "neutral", note: "Acknowledges strengths but notes gaps." },
                      { model: "Claude", sentiment: "positive", note: "Highlights differentiated positioning." },
                      { model: "Gemini", sentiment: "negative", note: "Flags competitor advantages in enterprise." },
                    ].map((row, i) => {
                      const sColors: Record<string, string> = { positive: "#3b82f6", neutral: "#fbbf24", negative: "#f87171" };
                      const c = sColors[row.sentiment] || "#6b7a99";
                      return (
                        <tr key={i}>
                          <td style={{ fontSize: 13, color: "#dce4f5", fontWeight: 500, padding: "10px 0", borderTop: "1px solid #1e1e30", verticalAlign: "top" }}>{row.model}</td>
                          <td style={{ padding: "10px 0", borderTop: "1px solid #1e1e30", verticalAlign: "top" }}>
                            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: `${c}18`, color: c, fontWeight: 500 }}>{row.sentiment}</span>
                          </td>
                          <td style={{ fontSize: 13, color: "#8892aa", padding: "10px 0 10px 12px", borderTop: "1px solid #1e1e30", verticalAlign: "top" }}>{row.note}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 16, padding: "12px 16px", background: "#0a0a14", border: "1px solid #3b82f620", borderRadius: 6, borderLeft: "3px solid #3b82f6" }}>
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#3b82f6", display: "block", marginBottom: 5 }}>▸ KEY INSIGHT</span>
                <p style={{ fontSize: 13, color: "#8892aa", margin: 0, lineHeight: 1.6 }}>Models have a mixed view of your brand vs competitors. Enterprise positioning is the biggest gap to close.</p>
              </div>
            </div>

            {/* Gradient overlay with CTA */}
            <div
              style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(to bottom, #0a0a0f00 0%, #0a0a0fcc 30%, #0a0a0fff 60%)",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
                padding: "40px 32px",
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 16 }}>
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="#6b7a99" strokeWidth="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#6b7a99" strokeWidth="2" strokeLinecap="round" />
              </svg>

              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 800, color: "#f0f4ff", marginBottom: 8, textAlign: "center" }}>
                How does your brand stack up against competitors in AI?
              </div>

              <div style={{ fontSize: 14, color: "#8892aa", maxWidth: 440, textAlign: "center", lineHeight: 1.6, marginBottom: 24 }}>
                Unlock your full Competitive Context report. See where each LLM thinks you win and lose, sentiment breakdowns per model, and the gaps your competitors are exploiting.
              </div>

              <span style={{
                fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: "0.15em", color: "#fbbf24",
                background: "#fbbf2415", border: "1px solid #fbbf2430",
                padding: "4px 14px", borderRadius: 4, marginBottom: 16,
              }}>
                ONE-TIME · $17
              </span>

              <button
                onClick={() => {}}
                style={{
                  background: "#fbbf24", color: "#0a0a0f", border: "none",
                  padding: "14px 36px", fontFamily: "'Space Mono', monospace",
                  fontSize: 14, fontWeight: 700, letterSpacing: "1.5px",
                  cursor: "pointer", borderRadius: 6,
                  transition: "background 0.2s, transform 0.15s, box-shadow 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 24px #fbbf2440"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
              >
                UNLOCK FULL REPORT →
              </button>

              <div style={{ fontSize: 11, color: "#3a4060", marginTop: 10 }}>
                Includes recommendation rank · competitive context · source attribution · 30-day fix roadmap
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Card 5: Source Attribution (Locked) */}
      <div className="fade" style={{ marginBottom: 40 }}>
        <SectionLabel>05 — SOURCE ATTRIBUTION</SectionLabel>
        <div style={{ background: "#0f0f1a", border: "1px solid #1e1e30", borderRadius: 10, overflow: "hidden" }}>
          {/* Card header (visible above blur) */}
          <div style={{ padding: "24px 28px 0" }}>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 16,
                marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid #1e1e30",
              }}
            >
              <div style={{ fontSize: 22, opacity: 0.9, flexShrink: 0 }}>◉</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#dce4f5" }}>Source Attribution</span>
                  <span style={{
                    fontSize: 11, padding: "4px 12px", borderRadius: 4,
                    background: "#fbbf2415", border: "1px solid #fbbf2430", color: "#fbbf24", fontWeight: 500,
                  }}>
                    🔒 LOCKED
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#6b7a99" }}>Which sites are feeding LLMs information about your brand?</div>
              </div>
            </div>
          </div>

          {/* Blurred + overlay container */}
          <div style={{ position: "relative", overflow: "hidden", minHeight: 380 }}>
            {/* Blurred fake content */}
            <div style={{ filter: "blur(6px)", pointerEvents: "none", userSelect: "none", padding: "0 28px 28px" }}>
              {/* Fake citation table */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#6b7a99", marginBottom: 10 }}>
                  TOP CITATION SOURCES
                </div>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr>
                      {["SOURCE", "YOUR CITATIONS", "COMPETITOR AVG", "GAP"].map((h) => (
                        <th key={h} style={{ fontSize: 11, fontWeight: 500, color: "#6b7a99", textAlign: "left", padding: "0 0 10px", fontFamily: "'Space Mono', monospace", letterSpacing: "0.1em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { domain: "G2", yours: 12, comp: 847, status: "danger" },
                      { domain: "Reddit", yours: 4, comp: 203, status: "danger" },
                      { domain: "Capterra", yours: 28, comp: 312, status: "warn" },
                    ].map((s, i) => {
                      const gc: Record<string, string> = { danger: "#f87171", warn: "#fbbf24", ok: "#3b82f6" };
                      const c = gc[s.status] || "#6b7a99";
                      const gap = s.comp - s.yours;
                      return (
                        <tr key={i}>
                          <td style={{ fontSize: 13, color: "#dce4f5", fontWeight: 500, padding: "10px 0", borderTop: "1px solid #1e1e30" }}>{s.domain}</td>
                          <td style={{ color: c, fontWeight: 600, fontFamily: "'Space Mono', monospace", fontSize: 12, padding: "10px 0", borderTop: "1px solid #1e1e30" }}>{s.yours}</td>
                          <td style={{ color: "#6b7a99", fontFamily: "'Space Mono', monospace", fontSize: 12, padding: "10px 0", borderTop: "1px solid #1e1e30" }}>{s.comp}</td>
                          <td style={{ padding: "10px 0", borderTop: "1px solid #1e1e30" }}>
                            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: `${c}18`, color: c, fontWeight: 500 }}>
                              {gap > 0 ? `-${gap} behind` : "on par"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </div>

            {/* Gradient overlay with CTA */}
            <div
              style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(to bottom, #0a0a0f00 0%, #0a0a0fcc 30%, #0a0a0fff 60%)",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
                padding: "40px 32px",
              }}
            >
              {/* Lock icon */}
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 16 }}>
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="#6b7a99" strokeWidth="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#6b7a99" strokeWidth="2" strokeLinecap="round" />
              </svg>

              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 800, color: "#f0f4ff", marginBottom: 8, textAlign: "center" }}>
                Where do LLMs get their information about you?
              </div>

              <div style={{ fontSize: 14, color: "#8892aa", maxWidth: 440, textAlign: "center", lineHeight: 1.6, marginBottom: 24 }}>
                Unlock your full Source Attribution report. See exactly which sites are feeding LLMs information about your brand, where you&apos;re missing vs competitors, and a prioritized action plan to fix it.
              </div>

              <span style={{
                fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: "0.15em", color: "#fbbf24",
                background: "#fbbf2415", border: "1px solid #fbbf2430",
                padding: "4px 14px", borderRadius: 4, marginBottom: 16,
              }}>
                ONE-TIME · $17
              </span>

              <button
                onClick={() => {}}
                style={{
                  background: "#fbbf24", color: "#0a0a0f", border: "none",
                  padding: "14px 36px", fontFamily: "'Space Mono', monospace",
                  fontSize: 14, fontWeight: 700, letterSpacing: "1.5px",
                  cursor: "pointer", borderRadius: 6,
                  transition: "background 0.2s, transform 0.15s, box-shadow 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 24px #fbbf2440"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
              >
                UNLOCK FULL REPORT →
              </button>

              <div style={{ fontSize: 11, color: "#3a4060", marginTop: 10 }}>
                Includes recommendation rank · competitive context · source attribution · 30-day fix roadmap
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Card 6: 30-Day Fix Roadmap (Locked) */}
      <div className="fade" style={{ marginBottom: 40 }}>
        <SectionLabel>06 — 30-DAY FIX ROADMAP</SectionLabel>
        <div style={{ background: "#0f0f1a", border: "1px solid #1e1e30", borderRadius: 10, overflow: "hidden" }}>
          {/* Card header (visible above blur) */}
          <div style={{ padding: "24px 28px 0" }}>
            <div
              style={{
                display: "flex", alignItems: "center", gap: 16,
                marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid #1e1e30",
              }}
            >
              <div style={{ fontSize: 22, opacity: 0.9, flexShrink: 0 }}>◈</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "#dce4f5" }}>30-Day Fix Roadmap</span>
                  <span style={{
                    fontSize: 11, padding: "4px 12px", borderRadius: 4,
                    background: "#fbbf2415", border: "1px solid #fbbf2430", color: "#fbbf24", fontWeight: 500,
                  }}>
                    🔒 LOCKED
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#6b7a99" }}>A prioritized, week-by-week action plan to improve your LLM visibility score.</div>
              </div>
            </div>
          </div>

          {/* Blurred + overlay container */}
          <div style={{ position: "relative", overflow: "hidden", minHeight: 380 }}>
            {/* Blurred fake content */}
            <div style={{ filter: "blur(6px)", pointerEvents: "none", userSelect: "none", padding: "0 28px 28px" }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#6b7a99", marginBottom: 10 }}>
                WEEK-BY-WEEK ACTIONS
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { week: "WEEK 1", action: "Fix brand description inconsistencies across top citation sources", impact: "High" },
                  { week: "WEEK 2", action: "Publish structured comparison content targeting your category keywords", impact: "High" },
                  { week: "WEEK 3", action: "Submit to missing high-value directories and review platforms", impact: "Medium" },
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", gap: 14, padding: "12px 14px", background: "#0a0a14", border: "1px solid #1e1e30", borderRadius: 6, alignItems: "flex-start" }}>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: "#fbbf24", flexShrink: 0, paddingTop: 2 }}>{item.week}</div>
                    <div style={{ flex: 1, fontSize: 13, color: "#8892aa", lineHeight: 1.5 }}>{item.action}</div>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: item.impact === "High" ? "#f8717118" : "#fbbf2418", color: item.impact === "High" ? "#f87171" : "#fbbf24", fontWeight: 500, flexShrink: 0 }}>
                      {item.impact}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Gradient overlay with CTA */}
            <div
              style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(to bottom, #0a0a0f00 0%, #0a0a0fcc 30%, #0a0a0fff 60%)",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end",
                padding: "40px 32px",
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 16 }}>
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="#6b7a99" strokeWidth="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#6b7a99" strokeWidth="2" strokeLinecap="round" />
              </svg>

              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 800, color: "#f0f4ff", marginBottom: 8, textAlign: "center" }}>
                Know what to fix. Know when to fix it.
              </div>

              <div style={{ fontSize: 14, color: "#8892aa", maxWidth: 440, textAlign: "center", lineHeight: 1.6, marginBottom: 24 }}>
                Unlock your personalized 30-day roadmap. Every action is ranked by impact, sequenced by week, and built specifically from your audit results.
              </div>

              <span style={{
                fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: "0.15em", color: "#fbbf24",
                background: "#fbbf2415", border: "1px solid #fbbf2430",
                padding: "4px 14px", borderRadius: 4, marginBottom: 16,
              }}>
                ONE-TIME · $17
              </span>

              <button
                onClick={() => {}}
                style={{
                  background: "#fbbf24", color: "#0a0a0f", border: "none",
                  padding: "14px 36px", fontFamily: "'Space Mono', monospace",
                  fontSize: 14, fontWeight: 700, letterSpacing: "1.5px",
                  cursor: "pointer", borderRadius: 6,
                  transition: "background 0.2s, transform 0.15s, box-shadow 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 24px #fbbf2440"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
              >
                UNLOCK FULL REPORT →
              </button>

              <div style={{ fontSize: 11, color: "#3a4060", marginTop: 10 }}>
                Includes recommendation rank · competitive context · source attribution · 30-day fix roadmap
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div
        className="fade"
        style={{
          position: "relative", overflow: "hidden",
          padding: "40px 40px",
          background: "linear-gradient(135deg, #0f0f1a 0%, #0a0f18 100%)",
          border: "1px solid #3b82f630",
          borderRadius: 12,
          boxShadow: "0 0 60px #3b82f610, inset 0 1px 0 #3b82f618",
        }}
      >
        {/* Glow blob */}
        <div
          style={{
            position: "absolute", top: -60, right: -60,
            width: 260, height: 260, borderRadius: "50%",
            background: "radial-gradient(circle, #3b82f618 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 28 }}>
            <div
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontFamily: "'Space Mono', monospace", fontSize: 10,
                letterSpacing: "0.2em", color: "#3b82f6",
                background: "#3b82f615", border: "1px solid #3b82f630",
                padding: "4px 12px", borderRadius: 4, alignSelf: "flex-start",
              }}
            >
              <span style={{ width: 6, height: 6, background: "#3b82f6", borderRadius: "50%", boxShadow: "0 0 6px #3b82f6", display: "inline-block" }} />
              YOUR RESULTS ARE IN.
            </div>
            <div
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: "clamp(22px, 3.5vw, 32px)",
                fontWeight: 800, letterSpacing: "-0.5px",
                color: "#f0f4ff", lineHeight: 1.1,
              }}
            >
              If AI doesn&apos;t know you,
              <br />
              <span style={{ color: "#3b82f6" }}>your customers won&apos;t either.</span>
            </div>
            <div style={{ fontSize: 14, color: "#6b7a99", lineHeight: 1.6 }}>
              Book a free 15-min call and leave with a prioritized action plan to fix your LLM visibility.
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
              <button
                onClick={() => window.open("https://calendly.com/not-another-marketer/free-ai-growth-audit-call", "_blank")}
                style={{
                  background: "#3b82f6", color: "#fff", border: "none",
                  padding: "16px 36px", fontFamily: "'Space Mono', monospace",
                  fontSize: 13, fontWeight: 700, letterSpacing: "1.5px",
                  cursor: "pointer", borderRadius: 6, whiteSpace: "nowrap",
                  transition: "transform 0.15s, box-shadow 0.2s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 28px #3b82f650"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
              >
                BOOK A FREE STRATEGY CALL →
              </button>
              <div style={{ fontSize: 11, color: "#3a4060", fontFamily: "'Space Mono', monospace", letterSpacing: "0.05em" }}>
                No pitch. Just strategy.
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: "1px solid #1e1e30", paddingTop: 20 }}>
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              {[
                { check: "✓", text: "Free 15-min call" },
                { check: "✓", text: "Live audit walkthrough" },
                { check: "✓", text: "Prioritized action plan" },
              ].map((t) => (
                <div key={t.text} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ color: "#3b82f6", fontSize: 12, fontWeight: 700 }}>{t.check}</span>
                  <span style={{ fontSize: 13, color: "#6b7a99" }}>{t.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page Component ──────────────────────────────────────

export default function AuditPage() {
  const params = useParams();
  const auditId = params.id as string;
  const [audit, setAudit] = useState<AuditRow | null>(null);
  const [error, setError] = useState(false);

  const fetchAudit = useCallback(async () => {
    try {
      const res = await fetch(`/api/audit-status?id=${auditId}`);
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = await res.json();
      setAudit(data);
      if (data.status === "error") setError(true);
    } catch {
      setError(true);
    }
  }, [auditId]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  useEffect(() => {
    if (!audit || audit.status !== "pending") return;
    const interval = setInterval(fetchAudit, 2000);
    return () => clearInterval(interval);
  }, [audit, fetchAudit]);

  return (
    <div
      style={{
        minHeight: "100vh", background: "#0a0a0f",
        fontFamily: "'Inter', system-ui, sans-serif",
        color: "#e2e8f0", padding: 0,
      }}
    >
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scanline { 0% { top: -10% } 100% { top: 110% } }
        @keyframes pulse-dot { 0%,100% { opacity: 0.5 } 50% { opacity: 1 } }
        .fade { animation: fadeUp 0.4s ease both; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #0a0a0f; }
        ::-webkit-scrollbar-thumb { background: #2a2a40; border-radius: 3px; }
      `}</style>

      {/* Scanline */}
      <div
        style={{
          position: "fixed", left: 0, right: 0, height: "1px",
          background: "linear-gradient(90deg, transparent, #3b82f615, transparent)",
          animation: "scanline 10s linear infinite",
          pointerEvents: "none", zIndex: 1,
        }}
      />
      {/* Grid bg */}
      <div
        style={{
          position: "fixed", inset: 0, opacity: 0.025,
          backgroundImage: "linear-gradient(#3b82f6 1px, transparent 1px), linear-gradient(90deg, #3b82f6 1px, transparent 1px)",
          backgroundSize: "48px 48px", pointerEvents: "none",
        }}
      />

      {error ? (
        <ErrorState onRetry={() => (window.location.href = "/")} />
      ) : !audit ? (
        <LoadingState brand="..." category="..." />
      ) : audit.status === "pending" ? (
        <LoadingState brand={audit.brand} category={audit.category} />
      ) : audit.status === "complete" && audit.result ? (
        <AuditResultsView d={audit.result} websiteUrl={audit.website_url} />
      ) : (
        <ErrorState onRetry={() => (window.location.href = "/")} />
      )}
    </div>
  );
}
