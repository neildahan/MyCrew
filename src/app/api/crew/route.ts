import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/ai/provider-registry";
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

function getCrewProvider() {
  if (process.env.ANTHROPIC_API_KEY) {
    return getProvider("anthropic", "claude-sonnet-4-6");
  }
  return getProvider("gemini", "gemini-2.5-flash");
}

const CREW_SYSTEM_PROMPT = `You are simulating a team meeting. You MUST respond with exactly 3 sections, one per team member. Each section is 2-3 sentences.

Team members:
- YARDEN: Personal Secretary, warm & organized
- DANA: Marketing Specialist, creative & bold
- JAMES: Business Advisor, strategic & direct

You MUST use this EXACT format with these EXACT markers (no variations, no markdown, no extra text before/after):

---YARDEN---
[Yarden's response here]
---DANA---
[Dana's response here]
---JAMES---
[James's response here]

CRITICAL: Start your response with ---YARDEN--- immediately. Do not add any preamble.`;

// Robust extraction: tries multiple patterns to find an agent's response
function extractAgentResponse(fullText: string, agentName: string, index: number): string {
  const markerRegex = new RegExp(
    `---\\s*${agentName}\\s*---\\s*([\\s\\S]*?)(?=---\\s*(?:YARDEN|DANA|JAMES)\\s*---|$)`,
    "i"
  );
  const markerMatch = fullText.match(markerRegex);
  if (markerMatch && markerMatch[1].trim()) {
    return markerMatch[1].trim();
  }

  const headerRegex = new RegExp(
    `(?:\\*\\*${agentName}\\*\\*|${agentName}\\s*:)\\s*([\\s\\S]*?)(?=(?:\\*\\*(?:YARDEN|DANA|JAMES)\\*\\*|(?:YARDEN|DANA|JAMES)\\s*:)|$)`,
    "i"
  );
  const headerMatch = fullText.match(headerRegex);
  if (headerMatch && headerMatch[1].trim()) {
    return headerMatch[1].trim();
  }

  const fallbackParts = fullText
    .split(/---\s*\w+\s*---|(?:\*\*\w+\*\*|\b(?:YARDEN|DANA|JAMES)\b\s*:)/i)
    .filter((p) => p.trim());
  if (fallbackParts[index]) {
    return fallbackParts[index].trim();
  }

  return "";
}

export async function POST(request: NextRequest) {
  const { text, senderId, secret } = await request.json();

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const provider = getCrewProvider();

    const response = await provider.generateResponse({
      systemPrompt: CREW_SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
      config: { temperature: 0.8, maxTokens: 512 },
    });

    const fullText = response.content || "";
    console.log("Crew API raw response:", fullText.substring(0, 800));

    const agents = ["yarden", "dana", "james"];
    for (let i = 0; i < agents.length; i++) {
      const slug = agents[i];
      const emoji = AGENT_EMOJIS[slug];
      const name = AGENT_NAMES[slug];
      const agentText = extractAgentResponse(fullText, slug.toUpperCase(), i) || "Let me think about this.";
      await sendTextMessage(senderId, `${emoji} *${name}:*\n\n${agentText}`);
    }

    return NextResponse.json({ status: "ok", count: 3 });
  } catch (error: any) {
    console.error("Crew API error:", error?.message || error);
    await sendTextMessage(senderId, "Sorry, the crew encountered an error. Please try again.");
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
