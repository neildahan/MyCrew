import { NextResponse } from "next/server";
import { getMicrosoftConfig, getMicrosoftConfigStatus } from "@/lib/integrations/microsoft-config";

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
 * Tasks.ReadWrite covers Planner: read the plans this person belongs to, and
 * create, complete and assign tasks in them. It is the least privileged scope
 * for plannerTask and, unlike Group.Read.All, needs no tenant admin. That is
 * why plans are discovered through /me/planner/plans rather than by walking
 * the groups that own them.
 *
 * Mail.Read, not Mail.ReadWrite or Mail.Send. Reading is what makes the
 * assistant useful ("did the counterparty reply yet?"); sending from a
 * lawyer's address is a different kind of decision and is not taken here. The
 * scope was already on the token from an earlier consent but was missing from
 * this list, so the next re-consent would have silently dropped it.
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
  "Tasks.ReadWrite",
  "Mail.Read",
].join(" ");

export async function GET() {
  const { clientId, tenant, redirectUri } = await getMicrosoftConfig();

  if (!clientId) {
    return NextResponse.json(
      {
        error: "Microsoft is not configured",
        status: await getMicrosoftConfigStatus(),
        hint: "Set microsoft_client_id and microsoft_client_secret in the settings table.",
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
