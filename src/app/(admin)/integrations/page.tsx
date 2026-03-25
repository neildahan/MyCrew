"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { useToast } from "@/components/ui/toast";
import { CheckCircle, XCircle, Plug, Trash2 } from "lucide-react";

interface IntegrationInfo {
  provider: string;
  provider_account_id: string;
  is_active: boolean;
  scopes: string[];
  metadata: Record<string, unknown>;
}

export default function IntegrationsPage() {
  const { addToast } = useToast();
  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    fetchIntegrations();

    // Check for success/error query params
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "true") {
      addToast({ title: "Google account connected successfully!", variant: "success" });
      // Clean up URL
      window.history.replaceState({}, "", "/integrations");
    }
    if (params.get("error")) {
      addToast({
        title: `Connection failed: ${params.get("error")}`,
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/integrations");
    }
  }, []);

  async function fetchIntegrations() {
    try {
      const res = await fetch("/api/integrations");
      if (res.ok) {
        const data = await res.json();
        setIntegrations(data);
      }
    } finally {
      setLoading(false);
    }
  }

  async function disconnectGoogle() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/integrations/google", { method: "DELETE" });
      if (res.ok) {
        addToast({ title: "Google account disconnected", variant: "success" });
        setIntegrations((prev) => prev.filter((i) => i.provider !== "google"));
      } else {
        addToast({ title: "Failed to disconnect", variant: "destructive" });
      }
    } finally {
      setDisconnecting(false);
    }
  }

  const googleIntegration = integrations.find((i) => i.provider === "google");
  const isConnected = !!googleIntegration?.is_active;
  const connectedEmail =
    (googleIntegration?.metadata?.email as string) ||
    googleIntegration?.provider_account_id ||
    null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Connect external services to give your agents real-world capabilities"
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                <svg
                  className="h-6 w-6"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              </div>
              <div>
                <CardTitle>Google</CardTitle>
                <CardDescription>
                  Calendar and Gmail access for your agents
                </CardDescription>
              </div>
            </div>
            <div>
              {isConnected ? (
                <Badge variant="success">Connected</Badge>
              ) : (
                <Badge variant="secondary">Not connected</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isConnected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span>
                  Connected as <strong>{connectedEmail}</strong>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Google Calendar</Badge>
                <Badge variant="outline">Gmail (Read)</Badge>
                <Badge variant="outline">Gmail (Send)</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Yarden can now read your calendar, create events, and send
                emails on your behalf.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={disconnectGoogle}
                disabled={disconnecting}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                {disconnecting ? "Disconnecting..." : "Disconnect"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <XCircle className="h-4 w-4" />
                <span>No Google account connected</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Connect your Google account to let Yarden manage your calendar
                and send emails.
              </p>
              <a href="/api/auth/connect/google">
                <Button>
                  <Plug className="h-4 w-4 mr-2" />
                  Connect Google Account
                </Button>
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
