import { NextRequest, NextResponse } from "next/server";
import { saveTokens } from "@/lib/integrations/token-manager";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    console.error("Google OAuth error:", error);
    return NextResponse.redirect(
      new URL("/integrations?error=oauth_denied&provider=google", request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/integrations?error=no_code&provider=google", request.url)
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ??
    "https://mycrew-app.vercel.app/api/auth/callback/google";

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/integrations?error=config_missing&provider=google", request.url)
    );
  }

  try {
    // Exchange authorization code for tokens
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error("Token exchange failed:", errorBody);
      return NextResponse.redirect(
        new URL("/integrations?error=token_exchange&provider=google", request.url)
      );
    }

    const tokens = await tokenResponse.json();

    // Get user info to store the connected email
    const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    let email = "unknown";
    if (userInfoResponse.ok) {
      const userInfo = await userInfoResponse.json();
      email = userInfo.email ?? "unknown";
    }

    // Save tokens to the integrations table
    await saveTokens("google", {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      scope: tokens.scope,
      provider_account_id: email,
      metadata: { email },
    });

    return NextResponse.redirect(
      new URL("/integrations?success=true&provider=google", request.url)
    );
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return NextResponse.redirect(
      new URL("/integrations?error=unknown&provider=google", request.url)
    );
  }
}
