import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { after } from "next/server";
import { getSupabase } from "@/lib/supabase";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

// Stripe requires the raw body for signature verification — disable body parsing
export const dynamic = "force-dynamic";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms)
    ),
  ]);
}

async function generatePremiumContent(auditId: string, brand: string, category: string, result: any) {
  const auditSummary = `
Brand: ${brand}
Category: ${category}
Overall verdict: ${result?.overallVerdict ?? ""}
Awareness score: ${result?.awareness?.score ?? 0}/100
Positioning score: ${result?.positioning?.score ?? 0}/100
Recommendation rank score: ${result?.recommendation?.score ?? 0}/100
Competitive score: ${result?.competitive?.score ?? 0}/100
Competitive wins: ${(result?.competitive?.wins ?? []).join(", ") || "none identified"}
Competitive losses: ${(result?.competitive?.losses ?? []).join(", ") || "none identified"}
Positioning insight: ${result?.positioning?.insight ?? ""}
Recommendation insight: ${result?.recommendation?.insight ?? ""}
`.trim();

  let sourceAttribution = null;
  try {
    const saRes = await withTimeout(
      getAnthropic().messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
        messages: [{
          role: "user",
          content: `You are analyzing an LLM visibility audit for "${brand}" in the "${category}" space.

${auditSummary}

Based on this data, identify the most important citation sources that influence how LLMs perceive brands in this space, and assess ${brand}'s likely presence on each.

Return JSON only, no markdown:
{
  "sources": [
    {
      "domain": "source name (e.g. G2, Reddit, Capterra, LinkedIn, YouTube, etc.)",
      "status": "strong" | "weak" | "missing",
      "note": "one sentence on why this source matters and what it means for ${brand}",
      "priority": "high" | "medium" | "low"
    }
  ],
  "insight": "one sharp sentence identifying the single biggest source gap for ${brand}"
}

Return exactly 6 sources ranked by importance for LLM training data in the ${category} space.`,
        }],
      }),
      30_000
    );
    const text = saRes.content[0]?.type === "text" ? saRes.content[0].text : "{}";
    sourceAttribution = JSON.parse(text.replace(/```json\s*/g, "").replace(/```/g, "").trim());
  } catch (e) {
    console.error("Source attribution generation failed:", e);
  }

  let roadmap = null;
  try {
    const rmRes = await withTimeout(
      getAnthropic().messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `You are creating a personalized 30-day LLM visibility action plan for "${brand}" in the "${category}" space.

${auditSummary}

Create a week-by-week action plan that directly addresses the specific gaps found in this audit. Be concrete and actionable — no generic advice.

Return JSON only, no markdown:
{
  "weeks": [
    {
      "week": "WEEK 1",
      "actions": [
        {
          "action": "specific, actionable task (max 15 words)",
          "impact": "High" | "Medium" | "Low",
          "category": "awareness" | "positioning" | "recommendation" | "attribution"
        }
      ]
    }
  ],
  "insight": "one sentence on the single highest-leverage action for ${brand} right now"
}

Return exactly 4 weeks (WEEK 1 through WEEK 4), 2 actions per week. Sequence from quick wins (week 1) to deeper structural fixes (week 4).`,
        }],
      }),
      30_000
    );
    const text = rmRes.content[0]?.type === "text" ? rmRes.content[0].text : "{}";
    roadmap = JSON.parse(text.replace(/```json\s*/g, "").replace(/```/g, "").trim());
  } catch (e) {
    console.error("Roadmap generation failed:", e);
  }

  await getSupabase()
    .from("audits")
    .update({ result: { ...result, sourceAttribution, roadmap } })
    .eq("id", auditId);
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = getStripe().webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const auditId = session.metadata?.audit_id;
    const stripePaymentId = session.payment_intent as string | undefined;

    if (!auditId) {
      console.error("Webhook: no audit_id in session metadata");
      return NextResponse.json({ error: "Missing audit_id in metadata" }, { status: 400 });
    }

    // Fetch audit for brand/category/result context
    const { data: audit } = await getSupabase()
      .from("audits")
      .select("id, brand, category, result")
      .eq("id", auditId)
      .single();

    if (!audit) {
      console.error("Webhook: audit not found:", auditId);
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    // Mark as unlocked immediately
    await getSupabase()
      .from("audits")
      .update({
        unlocked: true,
        unlocked_at: new Date().toISOString(),
        ...(stripePaymentId ? { stripe_payment_id: stripePaymentId } : {}),
      })
      .eq("id", auditId);

    // Generate premium content in background
    after(async () => {
      try {
        await generatePremiumContent(auditId, audit.brand, audit.category, audit.result);
      } catch (err) {
        console.error("Premium content generation failed:", err);
      }
    });
  }

  return NextResponse.json({ received: true });
}
