import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body?.prompt) {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  const maxRetries = 4;
  let lastErr: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 1000 * 2 ** attempt)); // 2s, 4s, 8s
    }
    try {
      const message = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: `You are simulating how a large language model would respond to queries about software brands.
Respond naturally and honestly. If you don't have confident knowledge about a brand, say so clearly.
Don't hedge excessively — be direct like a knowledgeable advisor would be.`,
        messages: [{ role: "user", content: body.prompt }],
      });

      const text = message.content[0]?.type === "text" ? message.content[0].text : "No response";
      return NextResponse.json({ text });
    } catch (err: any) {
      lastErr = err;
      if (err?.status !== 529) break; // only retry on overload
    }
  }

  console.error("Anthropic API error:", lastErr);
  return NextResponse.json({ error: "API request failed" }, { status: 500 });
}
