import { createAdminClient } from "@/lib/supabase/admin";
import type { Integration } from "@/types/database";

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

/**
 * Get a valid access token for a provider, refreshing if needed.
 */
export async function getValidToken(provider: string): Promise<string | null> {
  const supabase = createAdminClient();

  const { data: integration, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("provider", provider)
    .eq("is_active", true)
    .single();

  if (error || !integration) {
    return null;
  }

  // Check if token is still valid (with buffer)
  const expiresAt = new Date(integration.token_expires_at).getTime();
  const now = Date.now();

  if (expiresAt - now > TOKEN_REFRESH_BUFFER_MS) {
    return integration.access_token;
  }

  // Token expired or about to expire — refresh it
  if (provider === "google") {
    return refreshGoogleToken(integration);
  }

  if (provider === "microsoft") {
    return refreshMicrosoftToken(integration);
  }

  return null;
}

/**
 * Refresh a Microsoft identity platform access token.
 *
 * Microsoft rotates the refresh token on every exchange, so the new one must
 * be stored or the connection dies at the next refresh.
 */
async function refreshMicrosoftToken(
  integration: Integration
): Promise<string | null> {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenant = process.env.MICROSOFT_TENANT ?? "common";

  if (!clientId || !clientSecret) {
    console.error("Missing MICROSOFT_CLIENT_ID or MICROSOFT_CLIENT_SECRET");
    return null;
  }

  try {
    const response = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: integration.refresh_token,
          grant_type: "refresh_token",
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Microsoft token refresh failed:", errorBody);
      return null;
    }

    const data = await response.json();

    const supabase = createAdminClient();
    await supabase
      .from("integrations")
      .update({
        access_token: data.access_token,
        // Microsoft may return a rotated refresh token; keep the old one only
        // if it did not.
        refresh_token: data.refresh_token ?? integration.refresh_token,
        token_expires_at: new Date(
          Date.now() + data.expires_in * 1000
        ).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id);

    return data.access_token;
  } catch (error) {
    console.error("Error refreshing Microsoft token:", error);
    return null;
  }
}

/**
 * Refresh a Google OAuth access token using the refresh token.
 */
async function refreshGoogleToken(
  integration: Integration
): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
    return null;
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: integration.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Google token refresh failed:", errorBody);
      return null;
    }

    const data = await response.json();

    const supabase = createAdminClient();
    await supabase
      .from("integrations")
      .update({
        access_token: data.access_token,
        token_expires_at: new Date(
          Date.now() + data.expires_in * 1000
        ).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id);

    return data.access_token;
  } catch (error) {
    console.error("Error refreshing Google token:", error);
    return null;
  }
}

/**
 * Save or update tokens for a provider in the integrations table.
 */
export async function saveTokens(
  provider: string,
  tokens: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
    provider_account_id: string;
    metadata?: Record<string, unknown>;
  }
) {
  const supabase = createAdminClient();

  const tokenExpiresAt = new Date(
    Date.now() + tokens.expires_in * 1000
  ).toISOString();

  const scopes = tokens.scope.split(" ").filter(Boolean);

  // Upsert based on provider
  const { data: existing } = await supabase
    .from("integrations")
    .select("id")
    .eq("provider", provider)
    .single();

  if (existing) {
    await supabase
      .from("integrations")
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: tokenExpiresAt,
        scopes,
        provider_account_id: tokens.provider_account_id,
        metadata: tokens.metadata ?? {},
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("integrations").insert({
      provider,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: tokenExpiresAt,
      scopes,
      provider_account_id: tokens.provider_account_id,
      metadata: tokens.metadata ?? {},
      is_active: true,
    });
  }
}

/**
 * Check if a provider integration is connected and active.
 */
export async function isIntegrationConnected(
  provider: string
): Promise<boolean> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("integrations")
    .select("id")
    .eq("provider", provider)
    .eq("is_active", true)
    .single();

  return !!data;
}
