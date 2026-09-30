import { NextRequest, NextResponse } from "next/server";
import { saveTokens } from "@/lib/integrations/token-manager";

const GRAPH_ME_URL = "https://graph.microsoft.com/v1.0/me";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    // AADSTS65001 / consent_required here almost always means a work tenant
    // blocked user consent, which needs an IT admin rather than a retry.
    console.error("Microsoft OAuth error:", error, errorDescription);
    return NextResponse.redirect(
      new URL(`/integrations?error=oauth_denied&provider=microsoft`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/integrations?error=no_code&provider=microsoft", request.url)
    );
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenant = process.env.MICROSOFT_TENANT ?? "common";
  const redirectUri =
    process.env.MICROSOFT_REDIRECT_URI ??
    "https://mycrew-app.vercel.app/api/auth/callback/microsoft";

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/integrations?error=config_missing&provider=microsoft", request.url)
    );
  }

  try {
    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error("Microsoft token exchange failed:", errorBody);
      return NextResponse.redirect(
        new URL("/integrations?error=token_exchange&provider=microsoft", request.url)
      );
    }

    const tokens = await tokenResponse.json();

    if (!tokens.refresh_token) {
      // Without offline_access consent the connection would silently die in
      // about an hour, so fail loudly now instead.
      console.error("Microsoft returned no refresh_token; offline_access was not granted.");
      return NextResponse.redirect(
        new URL("/integrations?error=no_refresh_token&provider=microsoft", request.url)
      );
    }

    let email = "unknown";
    const meResponse = await fetch(GRAPH_ME_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (meResponse.ok) {
      const me = await meResponse.json();
      email = me.mail ?? me.userPrincipalName ?? "unknown";
    }

    await saveTokens("microsoft", {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      scope: tokens.scope ?? "",
      provider_account_id: email,
      metadata: { email },
    });

    return NextResponse.redirect(
      new URL("/integrations?success=true&provider=microsoft", request.url)
    );
  } catch (err) {
    console.error("Microsoft OAuth callback error:", err);
    return NextResponse.redirect(
      new URL("/integrations?error=unknown&provider=microsoft", request.url)
    );
  }
}
