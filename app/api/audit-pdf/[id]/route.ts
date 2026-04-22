import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { renderActionKitPdf } from "@/lib/action-kit-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Streams the full AI Visibility Action Kit as a PDF. Only available once
// an audit is unlocked - the free report is already viewable online.

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { data: audit, error } = await getSupabase()
    .from("audits")
    .select("id, brand, website_url, unlocked, result")
    .eq("id", id)
    .single();

  if (error || !audit) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }
  if (!audit.unlocked) {
    return NextResponse.json({ error: "Action Kit is locked - unlock the full report first." }, { status: 402 });
  }
  if (!audit.result) {
    return NextResponse.json({ error: "Audit is still processing. Try again in a moment." }, { status: 425 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://notanothermarketer.com";
  const auditUrl = `${appUrl}/audit/${id}`;
  const stream = await renderActionKitPdf(audit.result, audit.website_url || "", auditUrl);
  const safeBrand = audit.brand.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();

  return new NextResponse(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeBrand}-action-kit.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
