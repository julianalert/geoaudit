"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [brand, setBrand] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  async function handleSubmit() {
    if (!brand.trim() || !websiteUrl.trim() || loading) return;
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
      const data = await res.json();
      if (data.id) {
        router.push(`/audit/${data.id}`);
      } else {
        setLoading(false);
        alert("Something went wrong. Please try again.");
      }
    } catch {
      setLoading(false);
      alert("Network error. Please try again.");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        color: "#1e293b",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes scanline { 0% { top: -10% } 100% { top: 110% } }
        @keyframes pulse-dot { 0%,100% { opacity: 0.5 } 50% { opacity: 1 } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        .fade { animation: fadeUp 0.5s ease both; }
      `}</style>

      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          height: "1px",
          background: "linear-gradient(90deg, transparent, #3b82f615, transparent)",
          animation: "scanline 10s linear infinite",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
      <div
        style={{
          position: "fixed",
          inset: 0,
          opacity: 0.05,
          backgroundImage:
            "linear-gradient(#3b82f6 1px, transparent 1px), linear-gradient(90deg, #3b82f6 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          maxWidth: 920,
          margin: "0 auto",
          padding: "80px 24px 60px",
          position: "relative",
          zIndex: 2,
        }}
      >
        <div
          className="fade"
          style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}
        >
          <div
            style={{
              width: 7, height: 7, background: "#3b82f6", borderRadius: "50%",
              boxShadow: "0 0 8px #3b82f6", animation: "pulse-dot 2.5s ease infinite",
            }}
          />
          <h1
            style={{
              fontFamily: "'Space Mono', monospace", fontSize: 10,
              letterSpacing: "0.2em", color: "#64748b", fontWeight: "normal", margin: 0,
            }}
          >
            FREE GEO AUDIT TOOL v2.0
          </h1>
        </div>

        <p
          className="fade"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: "clamp(32px, 5vw, 52px)",
            fontWeight: 800, letterSpacing: "-1.5px",
            color: "#0f172a", lineHeight: 1.08, marginBottom: 16,
          }}
        >
          ARE YOU <span style={{ color: "#3b82f6" }}> SHOWING UP </span> IN AI ANSWERS?
        </p>

        <p
          className="fade"
          style={{
            fontSize: 15, color: "#475569", lineHeight: 1.6,
            maxWidth: 860, marginBottom: 40,
          }}
        >
          Find out if AI models know your brand, describe you accurately, and
          recommend you when buyers ask. <br /> Get a tailored action plan to improve your visibility across AI search.
        </p>

        <div className="fade" style={{ marginBottom: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label
                style={{
                  display: "block", fontFamily: "'Space Mono', monospace",
                  fontSize: 10, letterSpacing: "0.15em", color: "#64748b", marginBottom: 8,
                }}
              >
                BRAND / PRODUCT NAME
              </label>
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="e.g. Notion, Linear, Loom"
                style={{
                  width: "100%", background: "#f1f5f9", border: "1px solid #cbd5e1",
                  color: "#1e293b", padding: "13px 16px", fontFamily: "'Inter', sans-serif",
                  fontSize: 15, outline: "none", borderRadius: 6, transition: "border-color 0.2s",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#3b82f680")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
              />
            </div>
            <div>
              <label
                style={{
                  display: "block", fontFamily: "'Space Mono', monospace",
                  fontSize: 10, letterSpacing: "0.15em", color: "#64748b", marginBottom: 8,
                }}
              >
                WEBSITE URL
              </label>
              <input
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="e.g. https://yoursite.com"
                style={{
                  width: "100%", background: "#f1f5f9", border: "1px solid #cbd5e1",
                  color: "#1e293b", padding: "13px 16px", fontFamily: "'Inter', sans-serif",
                  fontSize: 15, outline: "none", borderRadius: 6, transition: "border-color 0.2s",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#3b82f680")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
              />
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading || !brand.trim() || !websiteUrl.trim()}
            style={{
              background: loading ? "#e2e8f0" : "#3b82f6",
              color: loading ? "#64748b" : "#f8fafc",
              border: "none", padding: "14px 36px",
              fontFamily: "'Space Mono', monospace", fontSize: 13,
              fontWeight: 700, letterSpacing: "1.5px",
              cursor: loading ? "not-allowed" : "pointer",
              borderRadius: 6,
              transition: "background 0.2s, transform 0.15s, box-shadow 0.2s",
              opacity: !brand.trim() || !websiteUrl.trim() ? 0.35 : 1,
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 6px 24px #3b82f640";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {loading ? "LAUNCHING AUDIT..." : "GET MY SCORE FOR FREE →"}
          </button>
        </div>

        <div
          className="fade"
          style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 32 }}
        >
          {[
            "GPT-4o, Perplexity, Claude & Gemini",
            "Real responses, not simulated",
            "Shareable report URL",
          ].map((t) => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#3b82f6", fontSize: 11 }}>✓</span>
              <span
                style={{
                  fontFamily: "'Space Mono', monospace", fontSize: 11,
                  color: "#64748b", letterSpacing: "0.05em",
                }}
              >
                {t}
              </span>
            </div>
          ))}
        </div>

        <div
          className="fade"
          style={{
            marginTop: 56, border: "1px dashed #e2e8f0",
            borderRadius: 10, padding: "56px 32px", textAlign: "center",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.15 }}>◈</div>
          <div
            style={{
              fontFamily: "'Space Mono', monospace", fontSize: 11,
              letterSpacing: "0.2em", color: "#94a3b8",
            }}
          >
            ENTER A BRAND TO BEGIN SCAN
          </div>
        </div>
      </div>
    </div>
  );
}
