"use client";

import { useEffect, useState, type ReactNode } from "react";
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

interface ProviderConfig {
  provider: string;
  name: string;
  description: string;
  iconBg: string;
  icon: ReactNode;
  /** Capability badges shown once connected. */
  capabilities: string[];
  connectedBlurb: string;
  disconnectedBlurb: string;
}

const GoogleIcon = (
  <svg className="h-6 w-6" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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
);

const MicrosoftIcon = (
  <svg className="h-6 w-6" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
    <path fill="#f35325" d="M1 1h10v10H1z" />
    <path fill="#81bc06" d="M12 1h10v10H12z" />
    <path fill="#05a6f0" d="M1 12h10v10H1z" />
    <path fill="#ffba08" d="M12 12h10v10H12z" />
  </svg>
);

const PROVIDERS: ProviderConfig[] = [
  {
    provider: "google",
    name: "Google",
    description: "Calendar and Gmail access for your agents",
    iconBg: "bg-blue-50",
    icon: GoogleIcon,
    capabilities: ["Google Calendar", "Gmail (Read)", "Gmail (Send)"],
    connectedBlurb:
      "Yarden can now read your calendar, create events, and send emails on your behalf.",
    disconnectedBlurb:
      "Connect your Google account to let Yarden manage your calendar and send emails.",
  },
  {
    provider: "microsoft",
    name: "Microsoft",
    description: "Outlook calendar access, read-only",
    iconBg: "bg-orange-50",
    icon: MicrosoftIcon,
    capabilities: ["Outlook Calendar (Read-only)"],
    connectedBlurb:
      "Yarden can read your Outlook calendar so reminders land relative to real meetings. The scope requested is Calendars.ReadBasic, which excludes event bodies and attachments — it cannot create, edit or delete anything.",
    disconnectedBlurb:
      "Connect Outlook so reminders can take your actual meetings into account. Read-only: the assistant never writes to your calendar. On a work tenant, your IT admin may need to approve this.",
  },
];

function IntegrationCard({
  config,
  integration,
  onDisconnect,
  disconnecting,
}: {
  config: ProviderConfig;
  integration?: IntegrationInfo;
  onDisconnect: (provider: string) => void;
  disconnecting: boolean;
}) {
  const isConnected = !!integration?.is_active;
  const connectedEmail =
    (integration?.metadata?.email as string) ||
    integration?.provider_account_id ||
    null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${config.iconBg}`}
            >
              {config.icon}
            </div>
            <div>
              <CardTitle>{config.name}</CardTitle>
              <CardDescription>{config.description}</CardDescription>
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
              {config.capabilities.map((c) => (
                <Badge key={c} variant="outline">
                  {c}
                </Badge>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{config.connectedBlurb}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDisconnect(config.provider)}
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
              <span>No {config.name} account connected</span>
            </div>
            <p className="text-sm text-muted-foreground">{config.disconnectedBlurb}</p>
            <a href={`/api/auth/connect/${config.provider}`}>
              <Button>
                <Plug className="h-4 w-4 mr-2" />
                Connect {config.name} Account
              </Button>
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  microsoft: "Microsoft",
};

export default function IntegrationsPage() {
  const { addToast } = useToast();
  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  useEffect(() => {
    fetchIntegrations();

    // Check for success/error query params
    const params = new URLSearchParams(window.location.search);
    // The OAuth callbacks report which provider they were, so the toast can
    // name the right one instead of always saying Google.
    const provider = params.get("provider");
    const label = (provider && PROVIDER_LABELS[provider]) || "Account";

    if (params.get("success") === "true") {
      addToast({ title: `${label} connected successfully!`, variant: "success" });
      window.history.replaceState({}, "", "/integrations");
    }
    if (params.get("error")) {
      addToast({
        title: `${label} connection failed: ${params.get("error")}`,
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

  async function disconnect(provider: string) {
    setDisconnecting(provider);
    try {
      const res = await fetch(`/api/integrations/${provider}`, { method: "DELETE" });
      if (res.ok) {
        addToast({
          title: `${PROVIDER_LABELS[provider] ?? provider} disconnected`,
          variant: "success",
        });
        setIntegrations((prev) => prev.filter((i) => i.provider !== provider));
      } else {
        addToast({ title: "Failed to disconnect", variant: "destructive" });
      }
    } finally {
      setDisconnecting(null);
    }
  }

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

      <div className="space-y-4">
        {PROVIDERS.map((config) => (
          <IntegrationCard
            key={config.provider}
            config={config}
            integration={integrations.find((i) => i.provider === config.provider)}
            onDisconnect={disconnect}
            disconnecting={disconnecting === config.provider}
          />
        ))}
      </div>
    </div>
  );
}
