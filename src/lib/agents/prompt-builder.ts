import type { Agent, Skill } from "@/types/database";

export function buildSystemPrompt(agent: Agent, skills: Skill[]): string {
  let prompt = agent.system_prompt;

  // Date only - deliberately NOT the time of day.
  //
  // This string sits inside the cached prompt prefix. Including minutes meant
  // the prefix changed every 60 seconds and the cache never hit once, which is
  // most of the bill: a 3-word question was costing ~5,900 uncached input
  // tokens. The precise clock time is injected with the user's turn instead,
  // after the cache breakpoint, where changing it is free.
  const now = new Date();
  const israelDate = now.toLocaleDateString("en-IL", { timeZone: "Asia/Jerusalem", dateStyle: "full" });
  const isoDate = now.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" }); // YYYY-MM-DD
  prompt += `\n\nToday is ${israelDate} (${isoDate}), timezone Asia/Jerusalem. The current clock time is given with each message. Use these to resolve "tomorrow", "next week", etc.`;
  prompt = prompt.replace(
    "{{current_date}}",
    now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  );

  // Append active skill instructions
  const activeSkills = skills.filter((s) => s.is_active);
  if (activeSkills.length > 0) {
    prompt += "\n\n## Your Active Skills\n";
    for (const skill of activeSkills) {
      prompt += `\n### ${skill.display_name}\n${skill.description}`;
      if (skill.prompt_injection) {
        prompt += `\n${skill.prompt_injection}`;
      }
    }
  }

  return prompt;
}
