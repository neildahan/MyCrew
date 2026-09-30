import { NextResponse } from "next/server";

/**
 * Calendars.ReadBasic, not Calendars.Read.
 *
 * ReadBasic returns subject, time, location and attendees but NOT the event
 * body, attachments or extensions. For reminders that lose nothing, and the
 * body of a meeting invite usually carries far more client detail than its
 * title does. There is no narrower option: Microsoft has no free/busy-only
 * delegated scope, and getSchedule still returns subjects, so this is the
 * least the assistant can be given while still being useful.
 *
 * offline_access is what makes a refresh token come back at all.
 */
const SCOPES = [
  "offline_access",
  "openid",
  "email",
  "profile",
  "User.Read",
  "Calendars.ReadBasic",
].join(" ");

export async function GET() {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const tenant = process.env.MICROSOFT_TENANT ?? "common";
  const redirectUri =
    process.env.MICROSOFT_REDIRECT_URI ??
    "https://mycrew-app.vercel.app/api/auth/callback/microsoft";

  if (!clientId) {
    return NextResponse.json(
      { error: "MICROSOFT_CLIENT_ID not configured" },
      { status: 500 }
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: SCOPES,
    // Force the consent screen so the refresh token is reliably issued and the
    // granted scopes are visible to whoever is connecting.
    prompt: "consent",
  });

  return NextResponse.redirect(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`
  );
}
