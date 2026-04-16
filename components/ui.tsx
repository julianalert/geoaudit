"use client";

import React from "react";

export function ScoreRing({ score, size = 88, stroke = 7 }: { score: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 70 ? "#3b82f6" : score >= 45 ? "#fbbf24" : "#f87171";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", position: "absolute", inset: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
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

export function ModelBadge({ model, status }: { model: string; status: string }) {
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

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: "'Space Mono', monospace", fontSize: 10,
        letterSpacing: "0.2em", color: "#64748b", marginBottom: 10,
      }}
    >
      {children}
    </p>
  );
}

export function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "#ffffff", border: "1px solid #e2e8f0",
        borderRadius: 10, padding: "24px 28px", ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  icon, title, description, score, label, color,
}: {
  icon: string; title: string; description: string; score: number; label: string; color: string;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 16,
        marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid #e2e8f0",
      }}
    >
      <div style={{ fontSize: 22, opacity: 0.9, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#1e293b" }}>{title}</span>
          <span
            style={{
              fontSize: 11, padding: "2px 8px", borderRadius: 4,
              background: `${color}18`, color, fontWeight: 500,
            }}
          >
            {label}
          </span>
        </div>
        <div style={{ fontSize: 13, color: "#64748b" }}>{description}</div>
      </div>
      <ScoreRing score={score} size={52} stroke={5} />
    </div>
  );
}

export function InsightBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 16, padding: "12px 16px",
        background: "#f1f5f9", border: "1px solid #3b82f620",
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
      <p style={{ fontSize: 13, color: "#475569", margin: 0, lineHeight: 1.6 }}>{children}</p>
    </div>
  );
}

export function PaywallGate({
  onUnlock,
  checkingOut,
  teasers,
}: {
  onUnlock: () => void;
  checkingOut: boolean;
  teasers: { title: string; body: string }[];
}) {
  return (
    <div
      style={{
        position: "relative", overflow: "hidden",
        padding: "36px 32px", marginBottom: 28,
        background: "linear-gradient(135deg, #ffffff 0%, #fffbeb 100%)",
        border: "1px solid #fbbf2440",
        borderRadius: 12,
        boxShadow: "0 0 40px #fbbf2410",
      }}
    >
      <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, #fbbf2418 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", textAlign: "center" }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 14 }}>
          <rect x="3" y="11" width="18" height="11" rx="2" stroke="#fbbf24" strokeWidth="2" />
          <path d="M7 11V7a5 5 0 0 1 9.9-1" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(20px, 3vw, 26px)", fontWeight: 800, color: "#0f172a", marginBottom: 6, lineHeight: 1.2 }}>
          Your free audit showed the score.<br />
          <span style={{ color: "#fbbf24" }}>The full report shows what to do.</span>
        </div>
        <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 auto 22px", lineHeight: 1.5 }}>
          $1. No subscription, no upsell.
        </p>

        {teasers.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 480, margin: "0 auto 26px", textAlign: "left" }}>
            {teasers.map((t, i) => (
              <div key={i} style={{ padding: "14px 16px", background: "#fbbf2408", border: "1px solid #fbbf2425", borderRadius: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 5 }}>
                  <span style={{ color: "#fbbf24", fontSize: 13, flexShrink: 0, marginTop: 1 }}>🔒</span>
                  <span style={{ fontSize: 13, color: "#0f172a", fontWeight: 700, lineHeight: 1.4 }}>{t.title}</span>
                </div>
                <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 0 21px", lineHeight: 1.6 }}>{t.body}</p>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onUnlock}
          disabled={checkingOut}
          style={{
            background: checkingOut ? "#64748b" : "#fbbf24", color: "#1e293b", border: "none",
            padding: "15px 40px", fontFamily: "'Space Mono', monospace",
            fontSize: 13, fontWeight: 700, letterSpacing: "1.5px",
            cursor: checkingOut ? "not-allowed" : "pointer", borderRadius: 6,
            transition: "background 0.2s, transform 0.15s, box-shadow 0.2s",
          }}
          onMouseEnter={(e) => { if (!checkingOut) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 28px #fbbf2450"; } }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
        >
          {checkingOut ? "REDIRECTING…" : "SEE MY FULL REPORT ($1) →"}
        </button>
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 10, fontFamily: "'Space Mono', monospace", letterSpacing: "0.05em" }}>
          One-time payment · Instant access · No account needed
        </div>
      </div>
    </div>
  );
}
