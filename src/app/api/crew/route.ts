import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { sendTextMessage } from "@/lib/whatsapp/client";

export const maxDuration = 60;

const AGENT_EMOJIS: Record<string, string> = {
  yarden: "\ud83d\udccb",
  dana: "\ud83d\udcf1",
  james: "\ud83d\udcbc",
};

const AGENT_NAMES: Record<string, string> = {
  yarden: "Yarden (Secretary)",
  dana: "Dana (Marketing)",
  james: "Yoav (Business Advisor)",
};

export async function POST(request: NextRequest) {
  const { text, senderId, secret } = await request.json();

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "No API key" }, { status: 500 });
  }

  try {
    const client = new GoogleGenAI({ apiKey });

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{
          text: `You are simulating a team meeting with 3 team members. Each gives a SHORT reply (2-3 sentences).

Team:
1. YARDEN - Personal Secretary, warm & organized
2. DANA - Marketing Specialist, creative & bold
3. JAMES - Business Advisor, strategic & direct

Format EXACTLY like this:
---YARDEN---
[response]
---DANA---
[response]
---JAMES---
[response]

User: "${text}"`
        }]
      }],
      config: {
        temperature: 0.8,
        maxOutputTokens: 512,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const fullText = response.text || "";
    const parts = fullText.split(/---(?:YARDEN|DANA|JAMES)---/).filter((p: string) => p.trim());

    const agents = ["yarden", "dana", "james"];
    for (let i = 0; i < agents.length; i++) {
      const slug = agents[i];
      const emoji = AGENT_EMOJIS[slug];
      const name = AGENT_NAMES[slug];
      const agentText = parts[i]?.trim() || "Let me think about this.";
      await sendTextMessage(senderId, `${emoji} *${name}:*\n\n${agentText}`);
    }

    return NextResponse.json({ status: "ok", count: 3 });
  } catch (error: any) {
    console.error("Crew API error:", error?.message || error);
    await sendTextMessage(senderId, "Sorry, the crew encountered an error. Please try again.");
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
