/**
 * The crew is the small, fixed set of people allowed to use the assistant.
 * Everything here is driven by env so there is exactly one place to change
 * who is in, and no way for a message to add someone.
 *
 * CREW_WHATSAPP_NUMBERS=972500000000,972510000000
 * CREW_NAMES=Neil,Inbal            (optional, positional, for readable output)
 */

export function getCrewNumbers(): string[] {
  return (process.env.CREW_WHATSAPP_NUMBERS ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}

function getCrewNames(): string[] {
  return (process.env.CREW_NAMES ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}

export function isCrewMember(whatsappUserId: string): boolean {
  const crew = getCrewNumbers();
  // An empty allowlist denies everyone. Failing closed matters more here than
  // convenience: the alternative is a stranger spending your Anthropic key.
  if (crew.length === 0) return false;
  return crew.includes(whatsappUserId);
}

/** Display name for a number, falling back to the number itself. */
export function getCrewName(whatsappUserId: string): string {
  const index = getCrewNumbers().indexOf(whatsappUserId);
  const names = getCrewNames();
  if (index >= 0 && names[index]) return names[index];
  return whatsappUserId;
}

/**
 * The other crew member, for a two-person crew. Returns null if the crew is
 * not exactly two people, since "the other one" stops being well defined.
 */
export function getOtherMember(whatsappUserId: string): string | null {
  const crew = getCrewNumbers();
  if (crew.length !== 2) return null;
  const other = crew.find((n) => n !== whatsappUserId);
  return other ?? null;
}
