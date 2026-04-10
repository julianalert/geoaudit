"use client";

import { useState } from "react";

interface AuditPrompt {
  id: string;
  label: string;
  description: string;
  icon: string;
  prompt: string;
}

interface ScoreResult {
  score: number;
  label: string;
  color: string;
}

interface AuditResult extends ScoreResult {
  response: string;
  icon: string;
  description: string;
  promptLabel: string;
}

type ResultsMap = Record<string, AuditResult>;
type ProgressMap = Record<string, "loading" | "done" | "error">;

const AUDIT_PROMPTS = (brand: string, category: string): AuditPrompt[] => [
  {
    id: "existence",
    label: "Brand Existence",
    description: "Does the LLM know this brand exists?",
    icon: "◈",
    prompt: `Do you know a SaaS company or product called "${brand}"? If yes, describe what it does in 2-3 sentences. If no, say you don't recognize it. Be direct and factual.`,
  },
  {
    id: "positioning",
    label: "Brand Positioning",
    description: "How accurately is the brand described?",
    icon: "◎",
    prompt: `How would you describe "${brand}" to someone evaluating it as a solution? What is it known for, who is it for, and what are its main strengths or weaknesses? Be honest and specific.`,
  },
  {
    id: "recommendation",
    label: "Recommendation Rank",
    description: "Does the brand appear in buyer-intent searches?",
    icon: "◆",
    prompt: `Someone is looking for the best ${category} software. Give them your top 5 recommendations. Be specific and rank them. Include "${brand}" only if it genuinely belongs there.`,
  },
  {
    id: "competitive",
    label: "Competitive Context",
    description: "How does the brand compare to competitors?",
    icon: "◇",
    prompt: `Compare "${brand}" to its main competitors in the ${category} space. Who is each best suited for? Be direct about where "${brand}" wins and where it loses.`,
  },
];

async function runAuditPrompt(prompt: string): Promise<string> {
  const response = await fetch("/api/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.text || "No response";
}

function scoreResponse(response: string, brand: string, promptId: string): ScoreResult {
  const lower = response.toLowerCase();
  const brandLower = brand.toLowerCase();

  if (promptId === "existence") {
    if (lower.includes("don't recognize") || lower.includes("not familiar") || lower.includes("no information"))
      return { score: 0, label: "Unknown", color: "#f87171" };
    if (lower.includes(brandLower) && lower.length > 100)
      return { score: 90, label: "Well Known", color: "#00ff87" };
    return { score: 45, label: "Vaguely Known", color: "#fbbf24" };
  }

  if (promptId === "recommendation") {
    const pos = lower.indexOf(brandLower);
    if (pos === -1) return { score: 0, label: "Not Listed", color: "#f87171" };
    const beforeBrand = lower.substring(0, pos);
    const listPos = (beforeBrand.match(/\d\.|first|second|third|1\.|2\.|3\./g) || []).length;
    if (listPos === 0) return { score: 95, label: "#1 Pick", color: "#00ff87" };
    if (listPos <= 2) return { score: 70, label: "Top 3", color: "#00ff87" };
    return { score: 40, label: "Listed", color: "#fbbf24" };
  }

  if (lower.includes("don't") || lower.includes("no information") || lower.length < 80)
    return { score: 20, label: "Weak Signal", color: "#f87171" };
  if (lower.length > 300 && lower.includes(brandLower))
    return { score: 85, label: "Strong", color: "#00ff87" };
  return { score: 55, label: "Moderate", color: "#fbbf24" };
}

function ScoreRing({ score, size = 64, stroke = 6 }: { score: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 75 ? "#00ff87" : score >= 45 ? "#fbbf24" : "#f87171";

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", position: "absolute", inset: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e1e30" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Space Mono', monospace",
        fontSize: size * 0.22, fontWeight: 700,
        color,
      }}>
        {score}
      </div>
    </div>
  );
}

function SkeletonPulse({ width = "100%", height = 16, radius = 4 }: { width?: string | number; height?: number; radius?: number }) {
  return (
    <div style={{
      width, height, borderRadius: radius,
      background: "linear-gradient(90deg, #1a1a2e 25%, #252545 50%, #1a1a2e 75%)",
      backgroundSize: "200% 100%",
      animation: "shimmer 1.5s infinite",
    }} />
  );
}

export default function LLMAuditTool() {
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ResultsMap | null>(null);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [activeResult, setActiveResult] = useState<string | null>(null);
  const [phase, setPhase] = useState<"input" | "running" | "done">("input");

  const overallScore = results
    ? Math.round(Object.values(results).reduce((s, r) => s + r.score, 0) / Object.keys(results).length)
    : 0;

  async function runAudit() {
    if (!brand.trim() || !category.trim()) return;
    setRunning(true);
    setResults(null);
    setProgress({});
    setPhase("running");

    const prompts = AUDIT_PROMPTS(brand, category);
    const out: ResultsMap = {};

    for (const p of prompts) {
      setProgress(prev => ({ ...prev, [p.id]: "loading" }));
      try {
        const text = await runAuditPrompt(p.prompt);
        const scored = scoreResponse(text, brand, p.id);
        out[p.id] = { ...scored, response: text, icon: p.icon, description: p.description, promptLabel: p.label };
        setProgress(prev => ({ ...prev, [p.id]: "done" }));
        setResults({ ...out });
      } catch {
        out[p.id] = { score: 0, label: "Error", color: "#f87171", response: "Failed to fetch.", icon: p.icon, description: p.description, promptLabel: p.label };
        setProgress(prev => ({ ...prev, [p.id]: "error" }));
        setResults({ ...out });
      }
    }

    setPhase("done");
    setRunning(false);
  }

  const verdictMap: Record<number, { label: string; sub: string; color: string }> = {
    0:  { label: "GHOST",           sub: "LLMs have no idea you exist. You're invisible in AI search.",                color: "#f87171" },
    30: { label: "FAINT SIGNAL",    sub: "Mentioned sometimes but not trusted. Competitors are eating your lunch.",    color: "#fb923c" },
    55: { label: "IN THE ROOM",     sub: "LLMs know you but don't consistently recommend you. Needs work.",            color: "#fbbf24" },
    75: { label: "WELL POSITIONED", sub: "Strong LLM presence. A few gaps to close before you dominate.",             color: "#00ff87" },
    90: { label: "LLM DOMINANT",    sub: "You're owning the AI answer layer. Keep feeding the models.",               color: "#00ff87" },
  };

  const getVerdict = (score: number) => {
    for (const t of [90, 75, 55, 30, 0]) {
      if (score >= t) return verdictMap[t];
    }
    return verdictMap[0];
  };

  const verdict = results ? getVerdict(overallScore) : null;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0f",
      fontFamily: "'Inter', system-ui, sans-serif",
      color: "#e2e8f0",
      padding: "0",
      position: "relative",
      overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Space+Mono:wght@400;700&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; }

        @keyframes shimmer   { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
        @keyframes scanline  { 0% { top: -10% } 100% { top: 110% } }
        @keyframes pulse-dot { 0%, 100% { opacity: 0.5 } 50% { opacity: 1 } }
        @keyframes fadeUp    { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }

        .mono { font-family: 'Space Mono', monospace; }

        .input-field {
          background: #12121a;
          border: 1px solid #2a2a40;
          color: #e2e8f0;
          padding: 12px 16px;
          font-family: 'Inter', sans-serif;
          font-size: 15px;
          width: 100%;
          outline: none;
          border-radius: 6px;
          transition: border-color 0.2s;
        }
        .input-field::placeholder { color: #4a5270; }
        .input-field:focus { border-color: #00ff8780; }

        .btn-main {
          background: #00ff87;
          color: #0a0a0f;
          border: none;
          padding: 13px 32px;
          font-family: 'Space Mono', monospace;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 1.5px;
          cursor: pointer;
          border-radius: 6px;
          transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
          white-space: nowrap;
        }
        .btn-main:hover:not(:disabled) {
          background: #00e87a;
          transform: translateY(-1px);
          box-shadow: 0 6px 24px #00ff8740;
        }
        .btn-main:disabled { opacity: 0.35; cursor: not-allowed; }

        .result-card {
          background: #0f0f1a;
          border: 1px solid #1e1e30;
          border-radius: 8px;
          padding: 20px;
          animation: fadeUp 0.4s ease forwards;
          cursor: pointer;
          transition: border-color 0.2s, transform 0.2s;
        }
        .result-card:hover { transform: translateY(-2px); border-color: #2e2e48; }
        .result-card.active { border-color: #00ff8740; }

        .score-bar-fill { height: 3px; border-radius: 2px; transition: width 1.2s ease; }

        @media (max-width: 1024px) {
          .score-mini-bars { width: 100%; }
          .score-mini-bars .score-bar-label { text-align: left; width: auto; }
          .score-mini-bars .score-bar-track { flex: 1; width: auto; }
        }

        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #0a0a0f; }
        ::-webkit-scrollbar-thumb { background: #2a2a40; border-radius: 3px; }
      `}</style>

      {/* Scanline */}
      <div style={{
        position: "fixed", left: 0, right: 0, height: "1px",
        background: "linear-gradient(90deg, transparent, #00ff8715, transparent)",
        animation: "scanline 10s linear infinite",
        pointerEvents: "none", zIndex: 1,
      }} />

      {/* Grid bg */}
      <div style={{
        position: "fixed", inset: 0, opacity: 0.025,
        backgroundImage: "linear-gradient(#00ff87 1px, transparent 1px), linear-gradient(90deg, #00ff87 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        pointerEvents: "none",
      }} />

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "48px 24px", position: "relative", zIndex: 2 }}>

        {/* ── HEADER ── */}
        <div style={{ marginBottom: 48, borderBottom: "1px solid #1e1e30", paddingBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{
              width: 7, height: 7, background: "#00ff87", borderRadius: "50%",
              boxShadow: "0 0 8px #00ff87",
              animation: "pulse-dot 2.5s ease infinite",
            }} />
            <h1 className="mono" style={{ fontSize: 10, letterSpacing: "0.2em", color: "#6b7a99", margin: 0, fontWeight: "inherit" }}>
              FREE GEO AUDIT TOOL v1.0
            </h1>
          </div>

          <p style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "clamp(30px, 5vw, 52px)",
            fontWeight: 800,
            margin: "0 0 12px",
            lineHeight: 1.08,
            letterSpacing: "-1.5px",
            color: "#f0f4ff",
          }}>
            Does ChatGPT even know
            <span style={{ color: "#00ff87" }}> your brand exist?</span>
          </p>

          <p style={{ color: "#8892aa", fontSize: 15, margin: 0, lineHeight: 1.6, fontWeight: 400 }}>
            Find out if AI models know your brand, describe you accurately, and recommend you when buyers ask.
          </p>
        </div>

        {/* ── INPUTS ── */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label className="mono" style={{ display: "block", fontSize: 10, letterSpacing: "0.15em", color: "#6b7a99", marginBottom: 8 }}>
                BRAND / PRODUCT NAME
              </label>
              <input
                className="input-field"
                placeholder="e.g. Notion, Linear, Loom"
                value={brand}
                onChange={e => setBrand(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !running && runAudit()}
              />
            </div>
            <div>
              <label className="mono" style={{ display: "block", fontSize: 10, letterSpacing: "0.15em", color: "#6b7a99", marginBottom: 8 }}>
                PRODUCT CATEGORY
              </label>
              <input
                className="input-field"
                placeholder="e.g. project management, CRM, analytics"
                value={category}
                onChange={e => setCategory(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !running && runAudit()}
              />
            </div>
          </div>
          <button className="btn-main" onClick={runAudit} disabled={running || !brand || !category}>
            {running ? "SCANNING..." : "RUN AUDIT →"}
          </button>
        </div>

        {/* ── PROGRESS ── */}
        {(running || phase === "done") && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 32 }}>
            {AUDIT_PROMPTS(brand, category).map(p => {
              const st = progress[p.id];
              const isDone = st === "done";
              const isLoading = st === "loading";
              return (
                <div key={p.id} style={{
                  padding: "14px 16px",
                  background: "#0f0f1a",
                  border: `1px solid ${isDone ? "#00ff8730" : isLoading ? "#fbbf2425" : "#1e1e30"}`,
                  borderRadius: 8,
                  transition: "border-color 0.4s",
                }}>
                  <div style={{ fontSize: 16, marginBottom: 6 }}>{p.icon}</div>
                  <div style={{ fontSize: 12, color: "#c8d0e8", fontWeight: 500, marginBottom: 4 }}>{p.label}</div>
                  <div className="mono" style={{
                    fontSize: 10, letterSpacing: "0.1em",
                    color: isDone ? "#00ff87" : isLoading ? "#fbbf24" : "#3a4060",
                  }}>
                    {isDone ? "● DONE" : isLoading ? "◌ SCANNING" : "○ WAITING"}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── RESULTS ── */}
        {results && Object.keys(results).length > 0 && (
          <div>

            {/* Overall score block */}
            {phase === "done" && (
              <div style={{
                background: "#0f0f1a",
                border: "1px solid #1e1e30",
                borderRadius: 10,
                padding: "28px 32px",
                marginBottom: 24,
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 28,
                animation: "fadeUp 0.5s ease",
              }}>
                <ScoreRing score={overallScore} size={88} stroke={7} />

                <div style={{ flex: 1 }}>
                  <h2 className="mono" style={{ fontSize: 10, letterSpacing: "0.2em", color: "#6b7a99", marginBottom: 6, margin: "0 0 6px", fontWeight: "inherit" }}>
                    OVERALL LLM VISIBILITY SCORE
                  </h2>
                  <div style={{
                    fontFamily: "'Syne', sans-serif",
                    fontSize: 26, fontWeight: 800,
                    color: verdict?.color,
                    marginBottom: 5,
                    letterSpacing: "-0.5px",
                  }}>
                    {verdict?.label}
                  </div>
                  <div style={{ fontSize: 14, color: "#8892aa", maxWidth: 380, lineHeight: 1.55 }}>
                    {verdict?.sub}
                  </div>
                </div>

                <div className="score-mini-bars" style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 7 }}>
                  {Object.values(results).map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="score-bar-label" style={{ fontSize: 11, color: "#6b7a99", width: 88, textAlign: "right", lineHeight: 1.3 }}>
                        {r.promptLabel}
                      </div>
                      <div className="score-bar-track" style={{ width: 72, height: 3, background: "#1e1e30", borderRadius: 2, overflow: "hidden" }}>
                        <div className="score-bar-fill" style={{ width: `${r.score}%`, background: r.color }} />
                      </div>
                      <div style={{ fontSize: 11, color: r.color, width: 26, fontWeight: 600 }}>{r.score}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Individual cards */}
            <div style={{ display: "grid", gap: 10 }}>
              {AUDIT_PROMPTS(brand, category).map(p => {
                const r = results[p.id];
                if (!r) return (
                  <div key={p.id} className="result-card" style={{ opacity: 0.4 }}>
                    <SkeletonPulse height={11} width="38%" />
                    <div style={{ marginTop: 10 }}><SkeletonPulse height={7} /></div>
                    <div style={{ marginTop: 7 }}><SkeletonPulse height={7} width="75%" /></div>
                  </div>
                );

                const isActive = activeResult === p.id;

                return (
                  <div
                    key={p.id}
                    className={`result-card${isActive ? " active" : ""}`}
                    onClick={() => setActiveResult(isActive ? null : p.id)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ fontSize: 22, flexShrink: 0, opacity: 0.9 }}>{p.icon}</div>

                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <h2 style={{ fontSize: 14, fontWeight: 600, color: "#dce4f5", letterSpacing: "-0.2px", margin: 0 }}>
                            {p.label}
                          </h2>
                          <span style={{
                            fontSize: 11, padding: "2px 8px", borderRadius: 4,
                            background: `${r.color}18`, color: r.color,
                            fontWeight: 500,
                          }}>
                            {r.label}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: "#6b7a99" }}>{p.description}</div>
                      </div>

                      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
                        <ScoreRing score={r.score} size={46} stroke={5} />
                        <span style={{ fontSize: 11, color: "#4a5270" }}>{isActive ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    {isActive && (
                      <div style={{
                        marginTop: 18, paddingTop: 18,
                        borderTop: "1px solid #1e1e30",
                        animation: "fadeUp 0.25s ease",
                      }}>
                        <div className="mono" style={{ fontSize: 10, letterSpacing: "0.15em", color: "#6b7a99", marginBottom: 10 }}>
                          ▸ LLM RESPONSE
                        </div>
                        <p style={{
                          fontSize: 14, lineHeight: 1.75,
                          color: "#b0bcd8",
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          fontWeight: 300,
                        }}>
                          {r.response}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* CTA */}
            {phase === "done" && (
              <div style={{
                marginTop: 28,
                padding: "28px 32px",
                background: "#0f0f1a",
                border: "1px solid #00ff8720",
                borderRadius: 10,
                animation: "fadeUp 0.6s ease",
              }}>
                <h2 className="mono" style={{ fontSize: 10, letterSpacing: "0.2em", color: "#6b7a99", marginBottom: 10, margin: "0 0 10px", fontWeight: "inherit" }}>
                  WANT THIS FIXED?
                </h2>
                <div style={{
                  fontFamily: "'Syne', sans-serif",
                  fontSize: 20, fontWeight: 800,
                  color: "#f0f4ff",
                  marginBottom: 8,
                  letterSpacing: "-0.3px",
                }}>
                  We build GEO systems that make LLMs recommend{" "}
                  <span style={{ color: "#00ff87" }}>your brand.</span>
                </div>
                <div style={{ fontSize: 14, color: "#8892aa", marginBottom: 18, lineHeight: 1.55 }}>
                  Not theory. Actual workflows. Actual outputs. → notanothermarketer.com
                </div>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                  {["✓ Full GEO audit report", "✓ Competitor gap analysis", "✓ 90-day fix roadmap"].map(t => (
                    <span key={t} style={{ fontSize: 13, color: "#8892aa" }}>{t}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── EMPTY STATE ── */}
        {phase === "input" && (
          <div style={{
            border: "1px dashed #1e1e30",
            borderRadius: 10,
            padding: "56px 32px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.2 }}>◈</div>
            <div className="mono" style={{ fontSize: 11, letterSpacing: "0.2em", color: "#3a4060" }}>
              ENTER A BRAND TO BEGIN SCAN
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
