import type { Metadata } from "next";
import { getSupabase } from "@/lib/supabase";

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;

  const { data } = await getSupabase()
    .from("audits")
    .select("brand, category, overall_score, overall_verdict")
    .eq("id", id)
    .single();

  const base: Metadata = { robots: { index: false, follow: false } };

  if (!data || !data.brand) return base;

  const verdictText = data.overall_verdict && data.overall_verdict !== "pending"
    ? data.overall_verdict
    : "In Progress";

  const title = `${data.brand} LLM Visibility Audit — ${verdictText}`;
  const description = data.overall_score > 0
    ? `${data.brand} scored ${data.overall_score}/100 on the GEO Audit LLM visibility test across GPT-4o, Perplexity, Claude, and Gemini. See how AI models know, describe, and recommend this brand.`
    : `LLM visibility audit for ${data.brand} in the ${data.category} space. See awareness, positioning, and recommendation scores across 4 AI models.`;

  return {
    ...base,
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default function AuditLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
