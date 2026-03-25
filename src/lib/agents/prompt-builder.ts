import type { Agent, Skill } from "@/types/database";

export function buildSystemPrompt(agent: Agent, skills: Skill[]): string {
  let prompt = agent.system_prompt;

  // Add current date/time context
  const now = new Date();
  const israelTime = now.toLocaleString("en-IL", { timeZone: "Asia/Jerusalem", dateStyle: "full", timeStyle: "short" });
  const isoDate = now.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" }); // YYYY-MM-DD
  prompt += `\n\nCurrent date and time: ${israelTime} (${isoDate}). Use this to calculate dates like "tomorrow", "next week", etc.`;
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
