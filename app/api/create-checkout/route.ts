import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabase } from "@/lib/supabase";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export async function POST(req: NextRequest) {
  let body: { auditId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { auditId } = body;
  if (!auditId) {
    return NextResponse.json({ error: "Missing auditId" }, { status: 400 });
  }

  // Verify the audit exists and is complete
  const { data: audit, error } = await getSupabase()
    .from("audits")
    .select("id, brand, unlocked, status")
    .eq("id", auditId)
    .single();

  if (error || !audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  if (audit.unlocked) {
    return NextResponse.json({ error: "Audit already unlocked" }, { status: 400 });
  }

  if (audit.status !== "complete") {
    return NextResponse.json({ error: "Audit not yet complete" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: 3900, // $39.00 - AI Visibility Action Kit
          product_data: {
            name: `AI Visibility Action Kit - ${audit.brand}`,
            description: `Five plain-English deliverables for ${audit.brand}: how much money you're losing to competitors each month, new website copy AI will understand, the sites AI reads to learn about you, 8 pages you should write next, and a 30-day plan with copy-paste templates.`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      audit_id: auditId,
    },
    success_url: `${appUrl}/audit/${auditId}?payment=success`,
    cancel_url: `${appUrl}/audit/${auditId}?payment=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}
