import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Mail, Loader2, Bell, BellOff, Send } from "lucide-react";
import { AlertSettings, AlertTrigger } from "@/lib/types";
import { saveAlertSettings, sendTestAlert } from "@/lib/api";
import { config } from "@/lib/config";
import { toast } from "@/hooks/use-toast";

const TRIGGER_LABELS: Record<AlertTrigger, string> = {
  exceeded: "When exceeded",
  at_80: "At 80%",
  at_90: "At 90%",
  at_100: "At 100%",
};

function loadAlertSettings(): AlertSettings {
  try {
    const raw = localStorage.getItem("azure-alert-settings");
    if (raw) return JSON.parse(raw) as AlertSettings;
  } catch (_err) {
    // localStorage unavailable or JSON malformed — use defaults
  }
  return {
    email: "",
    budgetThreshold: Number(localStorage.getItem("azure-budget")) || 0,
    trigger: "exceeded",
    enabled: false,
  };
}

export default function Settings() {
  const apiUrl = config.apiUrl;

  const [settings, setSettings] = useState<AlertSettings>(loadAlertSettings);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  // Sync the dashboard budget into the threshold field on first mount.
  // The functional-update form of setSettings receives latest state as `s`,
  // so this effect never reads settings directly — empty deps is correct.
  useEffect(() => {
    const budget = Number(localStorage.getItem("azure-budget")) || 0;
    if (budget > 0) {
      setSettings((s) =>
        s.budgetThreshold === 0 ? { ...s, budgetThreshold: budget } : s,
      );
    }
  }, []);

  const update = <K extends keyof AlertSettings>(
    key: K,
    value: AlertSettings[K],
  ) => setSettings((s) => ({ ...s, [key]: value }));

  const handleSave = async () => {
    if (!settings.email) {
      toast({
        title: "Email required",
        description: "Enter an email address for alerts.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      await saveAlertSettings(settings);
      localStorage.setItem("azure-alert-settings", JSON.stringify(settings));
      toast({
        title: "✓ Alert settings saved",
        description: `Alerts will be sent to ${settings.email}`,
      });
    } catch (err) {
      toast({
        title: "Failed to save settings",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestAlert = async () => {
    if (!settings.email) {
      toast({
        title: "Email required",
        description: "Enter an email address first.",
        variant: "destructive",
      });
      return;
    }
    setSendingTest(true);
    try {
      await sendTestAlert(settings.email);
      toast({
        title: "✓ Test email sent",
        description: `Check inbox at ${settings.email}`,
      });
    } catch {
      toast({
        title: "Failed to send alert email",
        description: "Check your configuration.",
        variant: "destructive",
      });
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="flex items-center justify-between px-6 py-4">
        <h2 className="text-lg font-semibold">Settings</h2>
      </div>

      <div className="mx-auto max-w-2xl space-y-6 px-6 pb-6">
        {/* Alert Configuration */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-primary" strokeWidth={1.5} />
              Alert Configuration
            </CardTitle>
            <CardDescription className="text-xs">
              Configure email notifications for budget alerts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Enable toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <div className="flex items-center gap-3">
                {settings.enabled ? (
                  <Bell className="h-4 w-4 text-primary" strokeWidth={1.5} />
                ) : (
                  <BellOff
                    className="h-4 w-4 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                )}
                <div>
                  <p className="text-sm font-medium">Email alerts</p>
                  <p className="text-xs text-muted-foreground">
                    {settings.enabled
                      ? "Alerts are active"
                      : "Alerts are disabled"}
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(v) => update("enabled", v)}
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label className="text-xs">Email Address</Label>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  strokeWidth={1.5}
                />
                <Input
                  type="email"
                  placeholder="alerts@company.com"
                  value={settings.email}
                  onChange={(e) => update("email", e.target.value)}
                  className="h-9 pl-9 text-xs"
                />
              </div>
            </div>

            {/* Budget threshold */}
            <div className="space-y-1.5">
              <Label className="text-xs">Budget Threshold (INR)</Label>
              <Input
                type="number"
                placeholder="10000"
                value={settings.budgetThreshold || ""}
                onChange={(e) =>
                  update("budgetThreshold", Number(e.target.value))
                }
                className="h-9 text-xs"
              />
            </div>

            {/* Trigger */}
            <div className="space-y-1.5">
              <Label className="text-xs">Alert Trigger</Label>
              <Select
                value={settings.trigger}
                onValueChange={(v) => update("trigger", v as AlertTrigger)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Save */}
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full gap-2"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Bell className="h-4 w-4" strokeWidth={1.5} />
              )}
              Save Alert Settings
            </Button>

            {/* Test */}
            <Button
              variant="outline"
              onClick={handleTestAlert}
              disabled={sendingTest}
              className="w-full gap-2"
            >
              {sendingTest ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" strokeWidth={1.5} />
              )}
              Send Test Alert
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
