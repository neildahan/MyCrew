/**
 * Wall-clock-to-UTC helpers.
 *
 * The naive approach — new Date(d.toLocaleString("en-US", { timeZone })) —
 * reads the right wall-clock NUMBERS but produces a Date anchored to the
 * SERVER's offset. Reading fields off it is fine; converting back to an
 * instant is not. That is correct on a machine already in Israel and three
 * hours wrong on Vercel's UTC runtime, so the offset is measured and removed
 * explicitly here rather than re-derived at each call site.
 */

export const DEFAULT_TIMEZONE = "Asia/Jerusalem";

/** How far ahead `timeZone` is of the server, at a given instant, in ms. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const inZone = new Date(at.toLocaleString("en-US", { timeZone }));
  const inServer = new Date(at.toLocaleString("en-US"));
  return inZone.getTime() - inServer.getTime();
}

/** Wall-clock fields in `timeZone`, as a Date whose LOCAL fields hold them. */
export function wallClockIn(at: Date, timeZone: string): Date {
  return new Date(at.toLocaleString("en-US", { timeZone }));
}

/** Hour of day (0-23) in `timeZone`. */
export function hourIn(at: Date, timeZone: string): number {
  return wallClockIn(at, timeZone).getHours();
}

/** Day of week (0 = Sunday) in `timeZone`. */
export function dayOfWeekIn(at: Date, timeZone: string): number {
  return wallClockIn(at, timeZone).getDay();
}

/** The instant at which it is 23:59:59.999 on `at`'s date in `timeZone`. */
export function endOfDayUtc(at: Date, timeZone: string): Date {
  const end = wallClockIn(at, timeZone);
  end.setHours(23, 59, 59, 999);
  return new Date(end.getTime() - zoneOffsetMs(at, timeZone));
}

/** The instant at which it is 00:00 on `YYYY-MM-DD` in `timeZone`. */
export function startOfDayUtc(dateIso: string, timeZone: string): Date {
  const naive = new Date(`${dateIso}T00:00:00`);
  return new Date(naive.getTime() - zoneOffsetMs(naive, timeZone));
}
