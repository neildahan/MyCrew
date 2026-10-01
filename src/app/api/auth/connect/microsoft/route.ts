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
    // Report which of the expected variables are visible - names only, never
    // values - so a scope or spelling mistake in the dashboard is diagnosable
    // without dashboard access.
    const expected = [
      "MICROSOFT_CLIENT_ID",
      "MICROSOFT_CLIENT_SECRET",
      "MICROSOFT_TENANT",
      "MICROSOFT_REDIRECT_URI",
    ];
    const seen = Object.keys(process.env).filter((k) => k.toUpperCase().includes("MICROSOFT"));
    return NextResponse.json(
      {
        error: "MICROSOFT_CLIENT_ID not configured",
        present: expected.filter((k) => !!process.env[k]),
        missing: expected.filter((k) => !process.env[k]),
        similar_names_seen: seen,
        environment: process.env.VERCEL_ENV ?? "unknown",
      },
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
