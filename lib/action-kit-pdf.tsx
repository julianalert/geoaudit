// ── Action Kit PDF renderer ───────────────────────────────────
// Server-only. Uses @react-pdf/renderer to produce a shareable PDF of
// the full Action Kit once an audit is unlocked.

import { Document, Page, Text, View, StyleSheet, renderToStream } from "@react-pdf/renderer";
import { Fragment } from "react";
import type { AuditResult } from "@/lib/types";

const colors = {
  bg: "#f8fafc",
  card: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
  muted: "#64748b",
  body: "#475569",
  primary: "#3b82f6",
  warn: "#fbbf24",
  danger: "#f87171",
};

const styles = StyleSheet.create({
  page: { padding: 42, fontSize: 10, color: colors.text, fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderColor: colors.border, paddingBottom: 14, marginBottom: 18 },
  kicker: { fontSize: 8, color: colors.muted, letterSpacing: 1.2 },
  h1: { fontSize: 22, fontWeight: 800, marginTop: 4, color: colors.text },
  sub: { fontSize: 10, color: colors.body, marginTop: 2 },
  sectionTitle: { fontSize: 8, color: colors.primary, letterSpacing: 1.5, marginTop: 18, marginBottom: 6 },
  sectionH: { fontSize: 14, fontWeight: 700, color: colors.text, marginBottom: 10 },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 12, marginBottom: 10 },
  row: { flexDirection: "row", gap: 10, marginBottom: 6 },
  col: { flex: 1 },
  label: { fontSize: 8, color: colors.muted, letterSpacing: 1 },
  valueNum: { fontSize: 22, fontWeight: 800, marginTop: 2 },
  bodyText: { fontSize: 10, color: colors.body, lineHeight: 1.55 },
  mono: { fontFamily: "Courier", fontSize: 9, color: colors.body, backgroundColor: "#f1f5f9", padding: 8, borderRadius: 4, lineHeight: 1.4 },
  bullet: { fontSize: 10, color: colors.body, marginBottom: 3 },
  badge: { fontSize: 7, color: colors.primary, padding: "2 6", borderRadius: 2, backgroundColor: "#3b82f622", alignSelf: "flex-start", letterSpacing: 0.5 },
  weekHeader: { fontSize: 9, color: colors.warn, letterSpacing: 1.2, marginTop: 12, marginBottom: 6 },
  footer: { position: "absolute", bottom: 24, left: 42, right: 42, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: colors.muted, paddingTop: 8, borderTopWidth: 1, borderColor: colors.border },
});

function ActionKitDoc({ result, websiteUrl, auditUrl }: { result: AuditResult; websiteUrl: string; auditUrl: string }) {
  const opp = result.opportunityCalculator;
  const pos = result.positioningBrief;
  const op = result.onlinePresence || result.sourceAttribution;
  const cg = result.contentGapMap;
  const rm = result.roadmap;

  return (
    <Document title={`${result.brand} - AI Visibility Action Kit`}>
      <Page size="A4" style={styles.page} wrap>
        {/* Header */}
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.kicker}>AI VISIBILITY ACTION KIT</Text>
            <Text style={styles.h1}>{result.brand}</Text>
            <Text style={styles.sub}>{result.category} - {result.auditDate}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.kicker}>OVERALL SCORE</Text>
            <Text style={{ fontSize: 28, fontWeight: 800, color: colors.primary }}>{result.overallScore}<Text style={{ fontSize: 12, color: colors.muted }}> / 100</Text></Text>
            <Text style={styles.sub}>{result.overallVerdict}</Text>
          </View>
        </View>

        {/* Opportunity */}
        {opp && (
          <>
            <Text style={styles.sectionTitle}>01 - HOW MUCH MONEY YOU&apos;RE LOSING</Text>
            <Text style={styles.sectionH}>The dollar value of deals going to competitors every month</Text>
            <View style={styles.row}>
              <View style={[styles.card, styles.col]}>
                <Text style={styles.label}>MONTHLY AI QUERIES</Text>
                <Text style={[styles.valueNum, { color: colors.muted }]}>{opp.monthlyCategoryQueries.toLocaleString()}</Text>
              </View>
              <View style={[styles.card, styles.col]}>
                <Text style={styles.label}>CAPTURE RATE</Text>
                <Text style={[styles.valueNum, { color: colors.warn }]}>{opp.currentCaptureRate}%</Text>
              </View>
              <View style={[styles.card, styles.col]}>
                <Text style={styles.label}>AVG DEAL VALUE</Text>
                <Text style={[styles.valueNum, { color: colors.muted }]}>${opp.assumedAvgDealValue.toLocaleString()}</Text>
              </View>
              <View style={[styles.card, styles.col]}>
                <Text style={styles.label}>MONTHLY LOSS</Text>
                <Text style={[styles.valueNum, { color: colors.danger }]}>${opp.estimatedMonthlyLoss.toLocaleString()}</Text>
              </View>
            </View>
            <Text style={styles.bodyText}>{opp.note}</Text>
          </>
        )}

        {/* Positioning Brief */}
        {pos && (
          <>
            <Text style={styles.sectionTitle}>02 - NEW WEBSITE COPY AI WILL UNDERSTAND</Text>
            <Text style={styles.sectionH}>Paste these rewrites onto your site</Text>
            <View style={styles.card}>
              <Text style={styles.label}>AI UNDERSTANDS YOU AS</Text>
              <Text style={[styles.bodyText, { marginTop: 4 }]}>{pos.llmUnderstanding}</Text>
              <Text style={[styles.label, { marginTop: 8 }]}>YOUR SITE SAYS</Text>
              <Text style={[styles.bodyText, { marginTop: 4 }]}>{pos.siteStatement}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.label}>HERO REWRITE</Text>
              <Text style={[styles.bodyText, { marginTop: 4, fontSize: 12, color: colors.text }]}>{pos.heroRewrite}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.label}>META DESCRIPTION</Text>
              <Text style={[styles.bodyText, { marginTop: 4 }]}>{pos.metaRewrite}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.label}>ABOUT PARAGRAPH</Text>
              <Text style={[styles.bodyText, { marginTop: 4 }]}>{pos.aboutRewrite}</Text>
            </View>
            <View style={styles.card} wrap={false}>
              <Text style={styles.label}>JSON-LD (PASTE IN &lt;head&gt;)</Text>
              <Text style={[styles.mono, { marginTop: 6 }]}>{pos.jsonLd.slice(0, 1400)}</Text>
            </View>
          </>
        )}

        {/* Citation Source Map */}
        {op && (
          <>
            <Text style={styles.sectionTitle} break>03 - WHERE AI READS ABOUT YOU</Text>
            <Text style={styles.sectionH}>The actual websites AI uses to learn about your brand</Text>
            {op.sources.slice(0, 10).map((s, i) => (
              <View key={i} style={styles.card} wrap={false}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 11, fontWeight: 700, color: colors.text }}>{s.domain}</Text>
                  <Text style={{ fontSize: 8, color: s.status === "strong" ? colors.primary : s.status === "weak" ? colors.warn : colors.danger, letterSpacing: 1 }}>
                    {s.status.toUpperCase()} · {s.priority.toUpperCase()} PRIORITY
                  </Text>
                </View>
                <Text style={[styles.bodyText, { marginTop: 4 }]}>{s.note}</Text>
              </View>
            ))}
            {op.competitorGaps && op.competitorGaps.length > 0 && (
              <>
                <Text style={[styles.label, { marginTop: 10, marginBottom: 6 }]}>COMPETITOR CITATION GAPS</Text>
                {op.competitorGaps.map((g, i) => (
                  <View key={i} style={[styles.card, { borderColor: "#f8717140" }]} wrap={false}>
                    <Text style={{ fontSize: 9, color: colors.danger, letterSpacing: 1 }}>
                      {g.platform.toUpperCase()} - {(g.competitors ?? []).join(", ")} listed. You're not.
                    </Text>
                    <Text style={[styles.bodyText, { marginTop: 4 }]}>{g.suggestion}</Text>
                  </View>
                ))}
              </>
            )}
            <Text style={[styles.bodyText, { marginTop: 6, fontStyle: "italic" }]}>{op.insight}</Text>
          </>
        )}

        {/* Content Gap Map */}
        {cg && cg.briefs.length > 0 && (
          <>
            <Text style={styles.sectionTitle} break>04 - {cg.briefs.length} PAGES YOU SHOULD WRITE NEXT</Text>
            <Text style={styles.sectionH}>Article ideas for the exact questions you&apos;re missing from</Text>
            {cg.briefs.map((b, i) => (
              <View key={i} style={styles.card} wrap={false}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: 700, color: colors.text, flex: 1 }}>{b.title}</Text>
                  <Text style={styles.badge}>{b.format}</Text>
                </View>
                <Text style={{ fontSize: 9, color: colors.muted, marginBottom: 4, fontStyle: "italic" }}>Targets: &ldquo;{b.targetQuery}&rdquo;</Text>
                {b.outline.map((o, oi) => (
                  <Text key={oi} style={styles.bullet}>• {o}</Text>
                ))}
              </View>
            ))}
            <Text style={[styles.bodyText, { marginTop: 6, fontStyle: "italic" }]}>{cg.insight}</Text>
          </>
        )}

        {/* 30-Day Plan */}
        {rm && rm.weeks.length > 0 && (
          <>
            <Text style={styles.sectionTitle} break>05 - YOUR 30-DAY PLAN</Text>
            <Text style={styles.sectionH}>Week by week, with copy-paste templates</Text>
            {rm.weeks.map((w, wi) => (
              <Fragment key={wi}>
                <Text style={styles.weekHeader}>{w.week}</Text>
                {w.actions.map((a, ai) => (
                  <View key={ai} style={styles.card} wrap={false}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                      <Text style={{ fontSize: 11, fontWeight: 700, color: colors.text, flex: 1 }}>{a.action}</Text>
                      <Text style={[styles.badge, { color: a.impact === "High" ? colors.danger : a.impact === "Medium" ? colors.warn : colors.muted, backgroundColor: "transparent", borderWidth: 1, borderColor: a.impact === "High" ? colors.danger : a.impact === "Medium" ? colors.warn : colors.muted }]}>
                        {a.impact.toUpperCase()}
                      </Text>
                    </View>
                    {a.where && <Text style={{ fontSize: 9, color: colors.muted, marginBottom: 4 }}>WHERE: <Text style={{ color: colors.body }}>{a.where}</Text></Text>}
                    {a.scoreImpact && <Text style={{ fontSize: 9, color: colors.primary, marginBottom: 4 }}>{a.scoreImpact}</Text>}
                    {a.template && (
                      <>
                        <Text style={[styles.label, { marginTop: 4 }]}>TEMPLATE</Text>
                        <Text style={[styles.bodyText, { marginTop: 4, fontSize: 9 }]}>{a.template}</Text>
                      </>
                    )}
                  </View>
                ))}
              </Fragment>
            ))}
            <Text style={[styles.bodyText, { marginTop: 6, fontStyle: "italic" }]}>{rm.insight}</Text>
          </>
        )}

        <View style={styles.footer} fixed>
          <Text>{websiteUrl}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          <Text>{auditUrl}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderActionKitPdf(
  result: AuditResult,
  websiteUrl: string,
  auditUrl: string
): Promise<NodeJS.ReadableStream> {
  return renderToStream(<ActionKitDoc result={result} websiteUrl={websiteUrl} auditUrl={auditUrl} />);
}
