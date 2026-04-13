import { NextRequest, NextResponse, after } from "next/server";
import Stripe from "stripe";
import { getSupabase } from "@/lib/supabase";
import { generatePremiumContent } from "@/lib/generate-premium-content";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
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

    const { data: audit } = await getSupabase()
      .from("audits")
      .select("id, brand, category, result")
      .eq("id", auditId)
      .single();

    if (!audit) {
      console.error("Webhook: audit not found:", auditId);
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    await getSupabase()
      .from("audits")
      .update({
        unlocked: true,
        unlocked_at: new Date().toISOString(),
        ...(stripePaymentId ? { stripe_payment_id: stripePaymentId } : {}),
      })
      .eq("id", auditId);

    console.log(`[stripe-webhook] Unlocked audit ${auditId}, scheduling content generation`);

    after(async () => {
      try {
        await generatePremiumContent(auditId, audit.brand, audit.category, audit.result);
      } catch (err) {
        console.error("[stripe-webhook] Premium content generation failed:", err);
      }
    });
  }

  return NextResponse.json({ received: true });
}
