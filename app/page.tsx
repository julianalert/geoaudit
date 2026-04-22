"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// ── Landing page / audit launcher ────────────────────────────

export default function Home() {
  const [brand, setBrand] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [auditCount, setAuditCount] = useState<number | null>(null);

  const router = useRouter();

  // Fetch total audit count once (optional - live counter / social proof)
  useEffect(() => {
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.count === "number") setAuditCount(d.count); })
      .catch(() => {});
  }, []);

  async function handleSubmit() {
    setError(null);
    if (!brand.trim() || !isValidUrl(websiteUrl) || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/run-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: brand.trim(),
          websiteUrl: websiteUrl.trim(),
        }),
      });
      if (res.status === 429) {
        setError("You've hit the rate limit - try again in a minute.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.id) {
        router.push(`/audit/${data.id}`);
      } else {
        setError("Something went wrong. Please try again.");
        setLoading(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  function isValidUrl(value: string): boolean {
    try {
      const url = new URL(value.trim());
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  const isUrlValid = isValidUrl(websiteUrl);
  const canSubmit = brand.trim() && isUrlValid && !loading;

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#1e293b", position: "relative", overflow: "hidden" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes scanline { 0% { top: -10% } 100% { top: 110% } }
        @keyframes pulse-dot { 0%,100% { opacity: 0.5 } 50% { opacity: 1 } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .fade { animation: fadeUp 0.5s ease both; }
      `}</style>

      <div style={{ position: "fixed", left: 0, right: 0, height: "1px", background: "linear-gradient(90deg, transparent, #3b82f615, transparent)", animation: "scanline 10s linear infinite", pointerEvents: "none", zIndex: 1 }} />
      <div style={{ position: "fixed", inset: 0, opacity: 0.05, backgroundImage: "linear-gradient(#3b82f6 1px, transparent 1px), linear-gradient(90deg, #3b82f6 1px, transparent 1px)", backgroundSize: "48px 48px", pointerEvents: "none" }} />

      <div style={{ maxWidth: 920, margin: "0 auto", padding: "80px 24px 60px", position: "relative", zIndex: 2 }}>

        {/* ── Hero ── */}
        <div className="fade" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
          <div style={{ width: 7, height: 7, background: "#3b82f6", borderRadius: "50%", boxShadow: "0 0 8px #3b82f6", animation: "pulse-dot 2.5s ease infinite" }} />
          <h1 style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#64748b", fontWeight: "normal", margin: 0 }}>
            FREE GEO AUDIT TOOL v2.0
          </h1>
          {auditCount != null && auditCount > 0 && (
            <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: "#3b82f6", background: "#3b82f615", border: "1px solid #3b82f630", padding: "3px 10px", borderRadius: 4 }}>
              {auditCount.toLocaleString()}+ BRANDS AUDITED
            </span>
          )}
        </div>

        <h2 className="fade" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(32px, 5vw, 54px)", fontWeight: 800, letterSpacing: "-1.5px", color: "#0f172a", lineHeight: 1.05, marginBottom: 18 }}>
          Is your brand <span style={{ color: "#3b82f6" }}>showing up</span><br />in AI answers?
        </h2>

        <p className="fade" style={{ fontSize: 16, color: "#475569", lineHeight: 1.6, maxWidth: 700, marginBottom: 34 }}>
          Find out if AI models know your brand, describe you accurately, and recommend you when buyers ask.
          Get a tailored action plan to improve your visibility across AI search.
        </p>

        {/* ── Form ── */}
        <div className="fade" style={{ marginBottom: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 10 }}>
            <FormField label="BRAND / PRODUCT NAME" value={brand} onChange={setBrand} placeholder="e.g. Notion, Linear, Loom" onEnter={handleSubmit} />
            <div>
              <FormField label="WEBSITE URL" value={websiteUrl} onChange={setWebsiteUrl} placeholder="e.g. https://yoursite.com" onEnter={handleSubmit} />
              {websiteUrl.trim() && !isUrlValid && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#f87171", fontFamily: "'Space Mono', monospace", letterSpacing: "0.05em" }}>
                  Must be a valid URL starting with https://
                </div>
              )}
            </div>
          </div>

          {error && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "#fef2f2", border: "1px solid #f8717140", borderRadius: 6, fontSize: 13, color: "#f87171" }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              marginTop: 6,
              background: loading ? "#e2e8f0" : "#3b82f6",
              color: loading ? "#64748b" : "#f8fafc",
              border: "none", padding: "14px 36px",
              fontFamily: "'Space Mono', monospace", fontSize: 13,
              fontWeight: 700, letterSpacing: "1.5px",
              cursor: canSubmit ? "pointer" : "not-allowed",
              borderRadius: 6,
              transition: "background 0.2s, transform 0.15s, box-shadow 0.2s",
              opacity: !canSubmit && !loading ? 0.35 : 1,
            }}
            onMouseEnter={(e) => { if (canSubmit) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 24px #3b82f640"; } }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
          >
            {loading ? "LAUNCHING AUDIT..." : "RUN MY FREE AUDIT →"}
          </button>
        </div>

        <div className="fade" style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 20 }}>
          {["Free", "Instant access", "No account needed"].map((t) => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#3b82f6", fontSize: 11 }}>✓</span>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#64748b", letterSpacing: "0.05em" }}>{t}</span>
            </div>
          ))}
        </div>

        {/* ── Scan placeholder ── */}
        <div className="fade" style={{ marginTop: 56, border: "1px dashed #e2e8f0", borderRadius: 10, padding: "56px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.15 }}>◈</div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: "0.2em", color: "#94a3b8" }}>ENTER A BRAND TO BEGIN SCAN</div>
        </div>

        {/* ── What you get (sample preview) ── */}
        {/* <section className="fade" style={{ marginTop: 80 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#64748b", marginBottom: 12 }}>WHAT YOU GET - FREE IN 45 SECONDS</div>
          <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(22px, 3vw, 30px)", fontWeight: 800, letterSpacing: "-0.5px", color: "#0f172a", lineHeight: 1.15, marginBottom: 22 }}>
            An honest scorecard of how AI actually sees you.
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {[
              { n: "01", t: "Does AI know you exist?", d: "We ask 3 AI models what they know about you, then fact-check their answers against your real site to flag anything they got wrong." },
              { n: "02", t: "Does AI describe you correctly?", d: "What do AIs think you do, who you serve, and how you stand out? Across all 3 models, side by side." },
              { n: "03", t: "Does AI recommend you?", d: "We ask the 3 questions buyers actually ask: 'best in the category', 'alternatives to your top competitor', and 'best for someone like me', and see where you rank." },
              { n: "04", t: "How do you compare?", d: "Where you win and where you lose head-to-head against the competitors AI already knows best." },
            ].map((c) => (
              <div key={c.n} style={{ padding: "18px 20px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#3b82f6", marginBottom: 8 }}>{c.n}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>{c.t}</div>
                <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.55, margin: 0 }}>{c.d}</p>
              </div>
            ))}
          </div>
        </section> */}

        {/* ── Context-free methodology (trust hook) ── */}
        {/* <section className="fade" style={{ marginTop: 64 }}>
          <div style={{ padding: "28px 32px", background: "linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)", border: "1px solid #3b82f630", borderRadius: 12 }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#3b82f6", marginBottom: 10 }}>▸ WHY THIS AUDIT IS DIFFERENT</div>
            <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 800, color: "#0f172a", marginBottom: 12, lineHeight: 1.2 }}>
              We never tell the AI who you are.
            </h3>
            <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.65, marginBottom: 12 }}>
              Every prompt in this audit contains <b>only your brand name</b> - nothing about your site, your category, or your pitch. We measure what GPT-4o, Claude, and Gemini already know about you from their training - the same knowledge they use when your buyers ask them about you.
            </p>
            <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.65, marginBottom: 0 }}>
              We deliberately exclude Perplexity from the main audit: it searches the web in real time and would always find something, which defeats the measurement. An independent judge model <em>does</em> compare each LLM&apos;s description to your actual site - but only after the fact, to flag hallucinations.
            </p>
          </div>
        </section> */}

        {/* ── How it works ── */}
        {/* <section className="fade" style={{ marginTop: 64 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#64748b", marginBottom: 12 }}>HOW IT WORKS</div>
          <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(22px, 3vw, 30px)", fontWeight: 800, letterSpacing: "-0.5px", color: "#0f172a", lineHeight: 1.15, marginBottom: 22 }}>
            From brand name to action plan in under a minute.
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {[
              { n: "01", t: "You enter your brand and website", d: "We send your brand name (and only your brand name) to the AIs. Your site is used separately, to fact-check what they say about you." },
              { n: "02", t: "3 AIs answer 6 questions", d: "One about awareness, one about how they describe you, three about whether they recommend you, and one head-to-head against competitors." },
              { n: "03", t: "We score what they said", d: "Each answer is graded, and an independent AI judge compares it to your real website to flag anything that was made up." },
              { n: "04", t: "You see exactly where you stand", d: "An overall score, a breakdown by area, how often AI mentions you vs. competitors, and a side-by-side with the top brands in your space." },
            ].map((c) => (
              <div key={c.n} style={{ padding: "18px 20px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#3b82f6", marginBottom: 8 }}>STEP {c.n}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>{c.t}</div>
                <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.55, margin: 0 }}>{c.d}</p>
              </div>
            ))}
          </div>
        </section> */}

        {/* ── Action Kit upsell ── */}
        {/* <section className="fade" style={{ marginTop: 72 }}>
          <div style={{ padding: "32px 32px", background: "linear-gradient(135deg, #ffffff 0%, #fffbeb 100%)", border: "1px solid #fbbf2440", borderRadius: 12, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, #fbbf2418 0%, transparent 70%)", pointerEvents: "none" }} />
            <div style={{ position: "relative" }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#fbbf24", marginBottom: 10 }}>UPGRADE · THE $39 ACTION KIT</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(22px, 3vw, 30px)", fontWeight: 800, color: "#0f172a", lineHeight: 1.15, margin: 0 }}>
                  Go from a score to an actual fix.
                </h3>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700, color: "#fbbf24" }}>$39</div>
              </div>
              <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.6, marginBottom: 22, maxWidth: 700 }}>
                The free audit tells you what&apos;s broken. The Action Kit tells you <em>exactly</em> what to change, in plain English, with text you can paste straight onto your site.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginBottom: 20 }}>
                {[
                  { t: "How much money you're losing", d: "An estimate, in dollars, of the deals going to competitors every month because AI doesn't recommend you." },
                  { t: "New website copy AI will understand", d: "Rewritten homepage, meta tags, and about page. Copy, paste, and AI starts describing you the way you want." },
                  { t: "Where AI reads about you", d: "The actual websites AI uses to learn about your brand, with direct links. So you know where to focus." },
                  { t: "8 pages you should write next", d: "Ready-to-write article ideas for the exact questions where competitors show up and you don't." },
                  { t: "Your 30-day plan", d: "12 things to do over the next month. Each one has a copy-paste template and an expected score bump." },
                  { t: "Downloadable PDF", d: "A clean PDF version you can send to your team or agency." },
                ].map((i) => (
                  <div key={i.t} style={{ padding: "12px 14px", background: "#fbbf2408", border: "1px solid #fbbf2425", borderRadius: 8 }}>
                    <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 700, marginBottom: 4 }}>{i.t}</div>
                    <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.55 }}>{i.d}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: "0.05em", color: "#64748b" }}>
                One-time payment · Unlocks on your report after you run the free audit.
              </div>
            </div>
          </div>
        </section> */}

        {/* ── FAQ ── */}
        {/* <section className="fade" style={{ marginTop: 72 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#64748b", marginBottom: 12 }}>FAQ</div>
          <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(22px, 3vw, 30px)", fontWeight: 800, letterSpacing: "-0.5px", color: "#0f172a", lineHeight: 1.15, marginBottom: 22 }}>
            Quick answers.
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { q: "Why don't you feed my site into the audit LLMs?", a: "Because then we'd be measuring what they can LEARN from context, not what they already KNOW. The whole point is to see what your buyers see when they ask ChatGPT about you - with no hint of who you are. It's uncomfortable, and that's the point." },
              { q: "Which models do you test?", a: "GPT-4o (OpenAI), Claude (Anthropic), and Gemini 2.5 Flash (Google). Perplexity is deliberately excluded from the main audit because it searches the web in real time - it would always find something." },
              { q: "How accurate are the scores?", a: "Each model answers the same prompt in JSON-mode, and we grade the responses. Descriptions are fact-checked against your actual site by an independent judge model. Hallucinations drop your awareness score automatically." },
              { q: "What's the difference between the free audit and the $39 Action Kit?", a: "The free audit tells you what's broken: your score, where you rank against competitors, what AI gets wrong about you. The Action Kit tells you what to do about it, in plain English: how much money you're losing, new website copy you can paste, the actual sites AI reads to learn about you, 8 pages you should write next, and a 30-day plan with copy-paste templates." },
              { q: "Is this a subscription?", a: "No. $39 one-time unlocks the full report for that brand. You can re-run a free audit any time." },
              { q: "Can I audit a competitor?", a: "Yes - enter any brand name and URL. The audit runs on the brand name alone, so the URL just helps with category detection and fact-checking. The result shows you exactly what AI thinks of them." },
            ].map((item, i) => {
              const open = openFaq === i;
              return (
                <div key={i} style={{ padding: "14px 18px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
                  <button onClick={() => setOpenFaq(open ? null : i)} style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#0f172a" }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{item.q}</span>
                    <span style={{ color: "#3b82f6", fontSize: 18, lineHeight: 1 }}>{open ? "−" : "+"}</span>
                  </button>
                  {open && <p style={{ marginTop: 10, fontSize: 13, color: "#475569", lineHeight: 1.6 }}>{item.a}</p>}
                </div>
              );
            })}
          </div>
        </section> */}

        {/* ── Secondary CTA ── */}
        {/* <section className="fade" style={{ marginTop: 72, marginBottom: 20, textAlign: "center", paddingBottom: 8 }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.2em", color: "#64748b", marginBottom: 10 }}>STOP GUESSING WHAT AI SAYS ABOUT YOU</div>
          <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(24px, 4vw, 34px)", fontWeight: 800, color: "#0f172a", lineHeight: 1.15, marginBottom: 16 }}>
            Run your free audit now.
          </h3>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "14px 36px", fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: 700, letterSpacing: "1.5px", cursor: "pointer", borderRadius: 6 }}
          >
            BACK TO THE TOP →
          </button>
        </section> */}
      </div>
    </div>
  );
}

// ── Small form field ────────────────────────────────────────

function FormField({ label, value, onChange, placeholder, onEnter }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onEnter: () => void;
}) {
  return (
    <div>
      <label style={{ display: "block", fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: "0.15em", color: "#64748b", marginBottom: 8 }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter()}
        placeholder={placeholder}
        style={{ width: "100%", background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#1e293b", padding: "13px 16px", fontFamily: "'Inter', sans-serif", fontSize: 15, outline: "none", borderRadius: 6, transition: "border-color 0.2s" }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "#3b82f680")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
      />
    </div>
  );
}
