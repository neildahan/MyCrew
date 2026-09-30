"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import { useToast } from "@/components/ui/toast";
import { Save, Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";

interface SettingField {
  key: string;
  label: string;
  placeholder: string;
  is_secret: boolean;
  group: string;
}

const settingFields: SettingField[] = [
  // WhatsApp
  { key: "whatsapp_phone_number_id", label: "Phone Number ID", placeholder: "Your WhatsApp phone number ID", is_secret: false, group: "whatsapp" },
  { key: "whatsapp_access_token", label: "Access Token", placeholder: "Your WhatsApp access token", is_secret: true, group: "whatsapp" },
  { key: "whatsapp_verify_token", label: "Verify Token", placeholder: "Your webhook verify token", is_secret: true, group: "whatsapp" },
  { key: "whatsapp_app_secret", label: "App Secret", placeholder: "Your Facebook app secret", is_secret: true, group: "whatsapp" },
  // AI
  { key: "gemini_api_key", label: "Gemini API Key", placeholder: "Your Google Gemini API key", is_secret: true, group: "ai" },
  { key: "openai_api_key", label: "OpenAI API Key (optional)", placeholder: "Your OpenAI API key", is_secret: true, group: "ai" },
  { key: "anthropic_api_key", label: "Anthropic API Key (optional)", placeholder: "Your Anthropic API key", is_secret: true, group: "ai" },
];

export default function SettingsPage() {
  const { addToast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((settings: Array<{ key: string; value: string }>) => {
        const vals: Record<string, string> = {};
        settings.forEach((s) => {
          vals[s.key] = s.value;
        });
        setValues(vals);
      })
      .finally(() => setLoading(false));
  }, []);

  async function saveSetting(field: SettingField) {
    setSaving(field.key);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: field.key,
          value: values[field.key] ?? "",
          is_secret: field.is_secret,
        }),
      });
      if (res.ok) {
        addToast({ title: `${field.label} saved`, variant: "success" });
      } else {
        addToast({ title: "Failed to save", variant: "destructive" });
      }
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  }

  const whatsappFields = settingFields.filter((f) => f.group === "whatsapp");
  const aiFields = settingFields.filter((f) => f.group === "ai");

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Configure API keys and integrations"
      />

      {/* WhatsApp Configuration */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>WhatsApp Business API</CardTitle>
              <CardDescription>Configure your Meta WhatsApp Cloud API credentials</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {values.whatsapp_access_token && values.whatsapp_access_token !== "--------" ? (
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" /> Configured
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <XCircle className="h-4 w-4" /> Not configured
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {whatsappFields.map((field) => (
            <div key={field.key} className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-sm font-medium">{field.label}</label>
                <div className="flex gap-2">
                  <Input
                    type={field.is_secret && !showSecrets[field.key] ? "password" : "text"}
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                  />
                  {field.is_secret && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setShowSecrets({ ...showSecrets, [field.key]: !showSecrets[field.key] })
                      }
                    >
                      {showSecrets[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => saveSetting(field)}
                disabled={saving === field.key}
              >
                <Save className="h-3 w-3 mr-1" />
                {saving === field.key ? "Saving..." : "Save"}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* AI API Keys */}
      <Card>
        <CardHeader>
          <CardTitle>AI Provider API Keys</CardTitle>
          <CardDescription>
            Configure API keys for your AI providers. Supports Gemini, Anthropic (Claude), and OpenAI.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {aiFields.map((field) => (
            <div key={field.key} className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-sm font-medium">{field.label}</label>
                <div className="flex gap-2">
                  <Input
                    type={field.is_secret && !showSecrets[field.key] ? "password" : "text"}
                    value={values[field.key] ?? ""}
                    onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                  />
                  {field.is_secret && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setShowSecrets({ ...showSecrets, [field.key]: !showSecrets[field.key] })
                      }
                    >
                      {showSecrets[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => saveSetting(field)}
                disabled={saving === field.key}
              >
                <Save className="h-3 w-3 mr-1" />
                {saving === field.key ? "Saving..." : "Save"}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
