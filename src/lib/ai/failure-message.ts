/**
 * What the user is told when a request fails.
 *
 * "משהו השתבש" is right for a transient glitch and useless for a problem only
 * the account owner can fix. An empty Anthropic balance looked exactly like a
 * bug for hours - the assistant apologised and suggested retrying, which could
 * never work. Where the cause is knowable and actionable, say it.
 */

const GENERIC = "סליחה, משהו השתבש אצלי. נסה שוב עוד רגע. 🙏";

export function failureMessage(error: unknown): string {
  const text = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();

  if (text.includes("credit balance") || text.includes("billing")) {
    return (
      "נגמר הקרדיט בחשבון ה-API שלי 💳\n" +
      "צריך להוסיף קרדיט ב-console.anthropic.com → Plans & Billing, ואני חוזרת."
    );
  }

  if (text.includes("authentication_error") || text.includes("api key")) {
    return "מפתח ה-API שלי לא תקף. צריך לעדכן אותו ואז אני חוזרת. 🔑";
  }

  if (text.includes("rate_limit") || text.includes("429")) {
    return "יש עומס על המערכת רגע. תן לי דקה ותנסה שוב. ⏳";
  }

  if (text.includes("overloaded") || text.includes("529")) {
    return "השרת עמוס כרגע. נסה שוב עוד רגע. ⏳";
  }

  return GENERIC;
}
