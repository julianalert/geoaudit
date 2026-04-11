"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit() {
    if (!brand.trim() || !category.trim() || !websiteUrl.trim() || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/run-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: brand.trim(), category: category.trim(), websiteUrl: websiteUrl.trim() }),
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
        background: "#0a0a0f",
        color: "#e2e8f0",
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

      {/* Scanline */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          height: "1px",
          background:
            "linear-gradient(90deg, transparent, #3b82f615, transparent)",
          animation: "scanline 10s linear infinite",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
      {/* Grid bg */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          opacity: 0.025,
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
        {/* Header badge */}
        <div
          className="fade"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 28,
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              background: "#3b82f6",
              borderRadius: "50%",
              boxShadow: "0 0 8px #3b82f6",
              animation: "pulse-dot 2.5s ease infinite",
            }}
          />
          <h1
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 10,
              letterSpacing: "0.2em",
              color: "#6b7a99",
              fontWeight: "normal",
              margin: 0,
            }}
          >
            FREE GEO AUDIT TOOL v1.0
          </h1>
        </div>

        {/* Display heading */}
        <p
          className="fade"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: "clamp(32px, 5vw, 52px)",
            fontWeight: 800,
            letterSpacing: "-1.5px",
            color: "#f0f4ff",
            lineHeight: 1.08,
            marginBottom: 16,
          }}
        >
          ARE YOU SHOWING UP
          <span style={{ color: "#3b82f6" }}> IN AI ANSWERS? </span>
        </p>

        {/* Subheading */}
        <p
          className="fade"
          style={{
            fontSize: 15,
            color: "#8892aa",
            lineHeight: 1.6,
            maxWidth: 860,
            marginBottom: 40,
          }}
        >
          Find out if AI models know your brand, describe you accurately, and
          recommend you when buyers ask.
        </p>

        {/* Inputs */}
        <div className="fade" style={{ marginBottom: 18 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
              marginBottom: 14,
            }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.15em",
                  color: "#6b7a99",
                  marginBottom: 8,
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
                  width: "100%",
                  background: "#12121a",
                  border: "1px solid #2a2a40",
                  color: "#e2e8f0",
                  padding: "13px 16px",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 15,
                  outline: "none",
                  borderRadius: 6,
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "#3b82f680")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "#2a2a40")
                }
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.15em",
                  color: "#6b7a99",
                  marginBottom: 8,
                }}
              >
                PRODUCT CATEGORY
              </label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="e.g. project management, CRM, analytics"
                style={{
                  width: "100%",
                  background: "#12121a",
                  border: "1px solid #2a2a40",
                  color: "#e2e8f0",
                  padding: "13px 16px",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 15,
                  outline: "none",
                  borderRadius: 6,
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "#3b82f680")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "#2a2a40")
                }
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: "block",
                fontFamily: "'Space Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.15em",
                color: "#6b7a99",
                marginBottom: 8,
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
                width: "100%",
                background: "#12121a",
                border: "1px solid #2a2a40",
                color: "#e2e8f0",
                padding: "13px 16px",
                fontFamily: "'Inter', sans-serif",
                fontSize: 15,
                outline: "none",
                borderRadius: 6,
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#3b82f680")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a40")}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading || !brand.trim() || !category.trim() || !websiteUrl.trim()}
            style={{
              background: loading ? "#1e1e30" : "#3b82f6",
              color: loading ? "#6b7a99" : "#0a0a0f",
              border: "none",
              padding: "14px 36px",
              fontFamily: "'Space Mono', monospace",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "1.5px",
              cursor: loading ? "not-allowed" : "pointer",
              borderRadius: 6,
              transition: "background 0.2s, transform 0.15s, box-shadow 0.2s",
              opacity: !brand.trim() || !category.trim() ? 0.35 : 1,
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
            {loading ? "LAUNCHING AUDIT..." : "RUN AUDIT FOR FREE →"}
          </button>
        </div>

        {/* Trust signals */}
        <div
          className="fade"
          style={{
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
            marginTop: 32,
          }}
        >
          {[
            "GPT, Claude, Gemini & Perplexity",
            "Real responses, not simulated",
            "Shareable report URL",
          ].map((t) => (
            <div
              key={t}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ color: "#3b82f6", fontSize: 11 }}>✓</span>
              <span
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 11,
                  color: "#6b7a99",
                  letterSpacing: "0.05em",
                }}
              >
                {t}
              </span>
            </div>
          ))}
        </div>

        {/* Empty state */}
        <div
          className="fade"
          style={{
            marginTop: 56,
            border: "1px dashed #1e1e30",
            borderRadius: 10,
            padding: "56px 32px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.15 }}>◈</div>
          <div
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.2em",
              color: "#3a4060",
            }}
          >
            ENTER A BRAND TO BEGIN SCAN
          </div>
        </div>
      </div>
    </div>
  );
}
