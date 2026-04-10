import { useState, useEffect } from "react";

const MODELS = [
  { id: "chatgpt", name: "ChatGPT", color: "#10a37f" },
  { id: "claude", name: "Claude", color: "#d97757" },
  { id: "gemini", name: "Gemini", color: "#4285f4" },
  { id: "perplexity", name: "Perplexity", color: "#6366f1" },
];

const AUDIT_PROMPTS = (brand, category) => [
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

async function runAuditPrompt(prompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: `You are simulating how a large language model would respond to queries about software brands. 
Respond naturally and honestly. If you don't have confident knowledge about a brand, say so clearly. 
Don't hedge excessively — be direct like a knowledgeable advisor would be.`,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  return data.content?.[0]?.text || "No response";
}

function scoreResponse(response, brand, promptId) {
  const lower = response.toLowerCase();
  const brandLower = brand.toLowerCase();

  if (promptId === "existence") {
    if (lower.includes("don't recognize") || lower.includes("not familiar") || lower.includes("no information"))
      return { score: 0, label: "Unknown", color: "#ef4444" };
    if (lower.includes(brandLower) && lower.length > 100)
      return { score: 90, label: "Well Known", color: "#10b981" };
    return { score: 45, label: "Vaguely Known", color: "#f59e0b" };
  }

  if (promptId === "recommendation") {
    const pos = lower.indexOf(brandLower);
    if (pos === -1) return { score: 0, label: "Not Listed", color: "#ef4444" };
    const beforeBrand = lower.substring(0, pos);
    const listPos = (beforeBrand.match(/\d\.|first|second|third|1\.|2\.|3\./g) || []).length;
    if (listPos === 0) return { score: 95, label: "#1 Pick", color: "#10b981" };
    if (listPos <= 2) return { score: 70, label: "Top 3", color: "#10b981" };
    return { score: 40, label: "Listed", color: "#f59e0b" };
  }

  if (lower.includes("don't") || lower.includes("no information") || lower.length < 80)
    return { score: 20, label: "Weak Signal", color: "#ef4444" };
  if (lower.length > 300 && lower.includes(brandLower))
    return { score: 85, label: "Strong", color: "#10b981" };
  return { score: 55, label: "Moderate", color: "#f59e0b" };
}

function ScoreRing({ score, size = 64, stroke = 6 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 75 ? "#00ff87" : score >= 45 ? "#fbbf24" : "#f87171";

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1a1a2e" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 1s ease", filter: `drop-shadow(0 0 6px ${color}88)` }}
      />
      <text
        x={size / 2} y={size / 2 + 5}
        textAnchor="middle" fill={color}
        fontSize={size * 0.22} fontWeight="700"
        style={{ transform: "rotate(90deg)", transformOrigin: `${size / 2}px ${size / 2}px`, fontFamily: "monospace" }}
      >
        {score}
      </text>
    </svg>
  );
}

function SkeletonPulse({ width = "100%", height = 16, radius = 4 }) {
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
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState({});
  const [activeResult, setActiveResult] = useState(null);
  const [phase, setPhase] = useState("input"); // input | running | done

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
    const out = {};

    for (const p of prompts) {
      setProgress(prev => ({ ...prev, [p.id]: "loading" }));
      try {
        const text = await runAuditPrompt(p.prompt);
        const scored = scoreResponse(text, brand, p.id);
        out[p.id] = { ...scored, response: text, label: p.label, icon: p.icon, description: p.description };
        setProgress(prev => ({ ...prev, [p.id]: "done" }));
        setResults({ ...out });
      } catch (e) {
        out[p.id] = { score: 0, label: "Error", color: "#ef4444", response: "Failed to fetch.", label: p.label, icon: p.icon, description: p.description };
        setProgress(prev => ({ ...prev, [p.id]: "error" }));
        setResults({ ...out });
      }
    }

    setPhase("done");
    setRunning(false);
  }

  const verdictMap = {
    0: { label: "GHOST", sub: "LLMs have no idea you exist. You're invisible in AI search.", color: "#ef4444" },
    30: { label: "FAINT SIGNAL", sub: "Mentioned sometimes but not trusted. Competitors are eating your lunch.", color: "#f97316" },
    55: { label: "IN THE ROOM", sub: "LLMs know you but don't consistently recommend you. Needs work.", color: "#fbbf24" },
    75: { label: "WELL POSITIONED", sub: "Strong LLM presence. A few gaps to close before you dominate.", color: "#10b981" },
    90: { label: "LLM DOMINANT", sub: "You're owning the AI answer layer. Keep feeding the models.", color: "#00ff87" },
  };

  const getVerdict = (score) => {
    const thresholds = [90, 75, 55, 30, 0];
    for (const t of thresholds) {
      if (score >= t) return verdictMap[t];
    }
    return verdictMap[0];
  };

  const verdict = results ? getVerdict(overallScore) : null;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0f",
      fontFamily: "'Courier New', 'Monaco', monospace",
      color: "#e2e8f0",
      padding: "0",
      position: "relative",
      overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; }
        @keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
        @keyframes scanline { 0% { top: -10% } 100% { top: 110% } }
        @keyframes pulse-ring { 0%, 100% { opacity: 0.4 } 50% { opacity: 1 } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes blink { 0%, 100% { opacity: 1 } 50% { opacity: 0 } }
        .card-hover { transition: all 0.2s ease; cursor: pointer; }
        .card-hover:hover { transform: translateY(-2px); border-color: #ffffff22 !important; }
        .btn-main { background: #00ff87; color: #0a0a0f; border: none; padding: 14px 40px; font-family: 'Space Mono', monospace; font-size: 14px; font-weight: 700; letter-spacing: 2px; cursor: pointer; transition: all 0.2s; clip-path: polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%); }
        .btn-main:hover:not(:disabled) { background: #00e077; transform: translateY(-1px); box-shadow: 0 8px 30px #00ff8744; }
        .btn-main:disabled { opacity: 0.4; cursor: not-allowed; }
        .input-field { background: #111118; border: 1px solid #2a2a40; color: #e2e8f0; padding: 12px 16px; font-family: 'Space Mono', monospace; font-size: 14px; width: 100%; outline: none; transition: border-color 0.2s; }
        .input-field:focus { border-color: #00ff8766; }
        .result-card { background: #0f0f1a; border: 1px solid #1e1e30; padding: 20px; animation: fadeUp 0.4s ease forwards; }
        .score-bar-fill { height: 4px; transition: width 1.2s ease; border-radius: 2px; }
        ::-webkit-scrollbar { width: 6px; } 
        ::-webkit-scrollbar-track { background: #0a0a0f; }
        ::-webkit-scrollbar-thumb { background: #2a2a40; border-radius: 3px; }
      `}</style>

      {/* Scanline effect */}
      <div style={{
        position: "fixed", left: 0, right: 0, height: "2px",
        background: "linear-gradient(90deg, transparent, #00ff8720, transparent)",
        animation: "scanline 8s linear infinite",
        pointerEvents: "none", zIndex: 1,
      }} />

      {/* Grid background */}
      <div style={{
        position: "fixed", inset: 0, opacity: 0.03,
        backgroundImage: "linear-gradient(#00ff87 1px, transparent 1px), linear-gradient(90deg, #00ff87 1px, transparent 1px)",
        backgroundSize: "40px 40px",
        pointerEvents: "none",
      }} />

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 20px", position: "relative", zIndex: 2 }}>

        {/* Header */}
        <div style={{ marginBottom: 48, borderBottom: "1px solid #1e1e30", paddingBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{
              width: 8, height: 8, background: "#00ff87", borderRadius: "50%",
              boxShadow: "0 0 12px #00ff87",
              animation: "pulse-ring 2s ease infinite",
            }} />
            <span style={{ fontSize: 11, letterSpacing: 3, color: "#4a5568", fontFamily: "'Space Mono', monospace" }}>
              NOT ANOTHER MARKETER — GEO AUDIT v1.0
            </span>
          </div>
          <h1 style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "clamp(28px, 5vw, 48px)",
            fontWeight: 800,
            margin: "0 0 8px",
            lineHeight: 1.1,
            letterSpacing: "-1px",
          }}>
            LLM VISIBILITY<br />
            <span style={{ color: "#00ff87" }}>AUDIT TOOL</span>
          </h1>
          <p style={{ color: "#4a5568", fontSize: 13, margin: 0, letterSpacing: 1 }}>
            FIND OUT IF AI MODELS KNOW YOUR BRAND — OR IF YOU'RE INVISIBLE
          </p>
        </div>

        {/* Input Section */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 10, letterSpacing: 2, color: "#4a5568", marginBottom: 8 }}>
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
              <label style={{ display: "block", fontSize: 10, letterSpacing: 2, color: "#4a5568", marginBottom: 8 }}>
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

        {/* Progress indicators while running */}
        {(running || phase === "done") && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {AUDIT_PROMPTS(brand, category).map(p => (
                <div key={p.id} style={{
                  padding: "12px 16px",
                  background: "#0f0f1a",
                  border: `1px solid ${progress[p.id] === "done" ? "#00ff8733" : progress[p.id] === "loading" ? "#fbbf2433" : "#1e1e30"}`,
                  transition: "border-color 0.4s",
                }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{p.icon}</div>
                  <div style={{ fontSize: 10, letterSpacing: 1, color: "#4a5568" }}>{p.label.toUpperCase()}</div>
                  <div style={{ marginTop: 8, fontSize: 10, color: progress[p.id] === "done" ? "#00ff87" : progress[p.id] === "loading" ? "#fbbf24" : "#2a2a40" }}>
                    {progress[p.id] === "done" ? "● DONE" : progress[p.id] === "loading" ? "◌ SCANNING" : "○ WAITING"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {results && Object.keys(results).length > 0 && (
          <div>
            {/* Overall Score */}
            {phase === "done" && (
              <div style={{
                background: "#0f0f1a",
                border: "1px solid #1e1e30",
                padding: "32px",
                marginBottom: 24,
                display: "flex",
                alignItems: "center",
                gap: 32,
                animation: "fadeUp 0.5s ease",
              }}>
                <div style={{ flexShrink: 0 }}>
                  <ScoreRing score={overallScore} size={96} stroke={8} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, letterSpacing: 3, color: "#4a5568", marginBottom: 4 }}>OVERALL LLM VISIBILITY SCORE</div>
                  <div style={{
                    fontFamily: "'Syne', sans-serif",
                    fontSize: 28, fontWeight: 800,
                    color: verdict?.color,
                    marginBottom: 4,
                    textShadow: `0 0 20px ${verdict?.color}44`,
                  }}>
                    {verdict?.label}
                  </div>
                  <div style={{ fontSize: 13, color: "#718096", maxWidth: 400 }}>{verdict?.sub}</div>
                </div>
                <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  {Object.values(results).map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontSize: 10, color: "#4a5568", width: 80, textAlign: "right" }}>{r.label}</div>
                      <div style={{ width: 80, height: 4, background: "#1a1a2e", borderRadius: 2, overflow: "hidden" }}>
                        <div className="score-bar-fill" style={{ width: `${r.score}%`, background: r.color }} />
                      </div>
                      <div style={{ fontSize: 10, color: r.color, width: 28 }}>{r.score}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Individual Results */}
            <div style={{ display: "grid", gap: 12 }}>
              {AUDIT_PROMPTS(brand, category).map(p => {
                const r = results[p.id];
                if (!r) return (
                  <div key={p.id} className="result-card" style={{ opacity: 0.4 }}>
                    <SkeletonPulse height={12} width="40%" />
                    <div style={{ marginTop: 12 }}><SkeletonPulse height={8} /></div>
                    <div style={{ marginTop: 8 }}><SkeletonPulse height={8} width="80%" /></div>
                  </div>
                );

                const isActive = activeResult === p.id;

                return (
                  <div
                    key={p.id}
                    className="result-card card-hover"
                    onClick={() => setActiveResult(isActive ? null : p.id)}
                    style={{ borderColor: isActive ? "#00ff8733" : "#1e1e30" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ fontSize: 24, flexShrink: 0 }}>{p.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>{p.label.toUpperCase()}</span>
                          <span style={{
                            fontSize: 10, padding: "2px 8px",
                            background: `${r.color}22`, color: r.color,
                            letterSpacing: 1,
                          }}>{r.label}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#4a5568" }}>{p.description}</div>
                      </div>
                      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
                        <ScoreRing score={r.score} size={48} stroke={5} />
                        <div style={{ fontSize: 12, color: "#4a5568" }}>{isActive ? "▲" : "▼"}</div>
                      </div>
                    </div>

                    {isActive && (
                      <div style={{
                        marginTop: 20, paddingTop: 20,
                        borderTop: "1px solid #1e1e30",
                        fontSize: 13, lineHeight: 1.7,
                        color: "#a0aec0",
                        whiteSpace: "pre-wrap",
                        animation: "fadeUp 0.3s ease",
                      }}>
                        <div style={{ fontSize: 10, letterSpacing: 2, color: "#4a5568", marginBottom: 8 }}>
                          ▸ LLM RESPONSE
                        </div>
                        {r.response}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* CTA */}
            {phase === "done" && (
              <div style={{
                marginTop: 32, padding: "24px 32px",
                background: "#0f0f1a",
                border: "1px solid #00ff8722",
                animation: "fadeUp 0.6s ease",
              }}>
                <div style={{ fontSize: 10, letterSpacing: 3, color: "#4a5568", marginBottom: 8 }}>
                  WANT THIS FIXED?
                </div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
                  We build GEO systems that make LLMs recommend <span style={{ color: "#00ff87" }}>your brand</span>.
                </div>
                <div style={{ fontSize: 13, color: "#718096", marginBottom: 16 }}>
                  Not theory. Actual workflows. Actual outputs. → notanothermarketer.com
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 11, color: "#4a5568", display: "flex", gap: 24 }}>
                    <span>✓ Full GEO audit report</span>
                    <span>✓ Competitor gap analysis</span>
                    <span>✓ 90-day fix roadmap</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {phase === "input" && (
          <div style={{
            border: "1px dashed #1e1e30", padding: "48px 32px",
            textAlign: "center", color: "#2a2a40",
          }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>◈</div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, letterSpacing: 2 }}>
              ENTER A BRAND TO BEGIN SCAN
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
