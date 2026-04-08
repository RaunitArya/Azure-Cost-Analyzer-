import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bell,
  Mail,
  AlertTriangle,
  Loader2,
  IndianRupeeIcon,
  Target,
  Settings2,
  History,
  MoreHorizontal,
  PowerOff,
  Clock,
  ShieldCheck,
} from "lucide-react";
import {
  AnomalySettings,
  AlertEvent,
  AnomalyLogEntry,
  AlertThreshold,
  AzureService,
  PeriodType,
} from "@/lib/types";
import {
  getAlertSettings,
  updateAlertSettings,
  getAlertEvents,
  getAlertThresholds,
  getAlertServices,
  createAlertThreshold,
  updateAlertThreshold,
  deactivateAlertThreshold,
  evaluateAlerts,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(v);

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const statusBadge = (status: AlertEvent["status"]) => {
  if (status === "open")
    return (
      <Badge variant="destructive" className="text-[10px]">
        open
      </Badge>
    );
  if (status === "resolved")
    return (
      <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-700">
        resolved
      </Badge>
    );
  return (
    <Badge variant="secondary" className="text-[10px]">
      acknowledged
    </Badge>
  );
};

const maskEmail = (email: string) => {
  if (!email) return "";
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "";
  const maskedLocal = localPart.charAt(0) + "***";
  return `${maskedLocal}@${domain}`;
};

export default function Budget() {
  const queryClient = useQueryClient();

  const { data: alertSettings, isLoading: isLoadingSettings } = useQuery<AnomalySettings>({
    queryKey: ["alert-settings"],
    queryFn: getAlertSettings,
    staleTime: 30_000,
  });

  const { data: services = [] } = useQuery<AzureService[]>({
    queryKey: ["alert-services"],
    queryFn: getAlertServices,
    staleTime: 300_000,
  });

  const { data: thresholds = [] } = useQuery<AlertThreshold[]>({
    queryKey: ["alert-thresholds"],
    queryFn: () => getAlertThresholds({ active_only: false }),
    staleTime: 30_000,
  });

  const { data: activeAlerts = [], isLoading: isLoadingActive } = useQuery<AlertEvent[]>({
    queryKey: ["alert-events-open"],
    queryFn: () => getAlertEvents({ status: "open", limit: 50 }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const { data: alertHistory = [], isLoading: isLoadingHistory } = useQuery<AlertEvent[]>({
    queryKey: ["alert-events-history"],
    queryFn: () => getAlertEvents({ limit: 100 }),
    staleTime: 30_000,
  });

  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [selectedPeriodType, setSelectedPeriodType] = useState<PeriodType>("monthly");
  const [absoluteThreshold, setAbsoluteThreshold] = useState<string>("");
  const [savingThreshold, setSavingThreshold] = useState(false);

  const [receiverEmail, setReceiverEmail] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  const [kValue, setKValue] = useState<string>("2.0");
  const [pctBuffer, setPctBuffer] = useState<string>("50");
  const [historyDays, setHistoryDays] = useState<string>("30");
  const [historyMonths, setHistoryMonths] = useState<string>("3");
  const [globalCooldown, setGlobalCooldown] = useState<string>("120");
  const [savingDetection, setSavingDetection] = useState(false);

  const [deactivatingId, setDeactivatingId] = useState<number | null>(null);

  useEffect(() => {
    if (!alertSettings) return;
    setReceiverEmail(alertSettings.receiver_email ?? "");
    setEmailEnabled(alertSettings.email_enabled);
    setKValue(String(alertSettings.k_value));
    setPctBuffer(((alertSettings.percentage_buffer - 1) * 100).toFixed(2));
    setHistoryDays(String(alertSettings.alert_history_days));
    setHistoryMonths(String(alertSettings.alert_history_months));
    setGlobalCooldown(String(alertSettings.cooldown_minutes));
  }, [alertSettings]);

  const handleCreateThreshold = async () => {
    if (!selectedServiceId) {
      toast({
        title: "Service required",
        description: "Select an Azure service.",
        variant: "destructive",
      });
      return;
    }
    const amount = parseFloat(absoluteThreshold);
    if (isNaN(amount) || amount < 0) {
      toast({
        title: "Invalid amount",
        description: "Enter a valid budget threshold.",
        variant: "destructive",
      });
      return;
    }

    setSavingThreshold(true);
    try {
      const svcId = parseInt(selectedServiceId);
      const existing = thresholds.find(
        (t) => t.service_id === svcId && t.period_type === selectedPeriodType,
      );
      if (existing) {
        await updateAlertThreshold(existing.id, {
          absolute_threshold: amount,
          is_active: true,
        });
        toast({
          title: "✓ Threshold updated",
          description: `Budget updated for ${existing.service_name}`,
        });
      } else {
        await createAlertThreshold({
          service_id: svcId,
          period_type: selectedPeriodType,
          absolute_threshold: amount,
        });
        const svcName = services.find((s) => s.id === svcId)?.name ?? `service #${svcId}`;
        toast({
          title: "✓ Alert created",
          description: `Budget threshold set for ${svcName}`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["alert-thresholds"] });
      try {
        await evaluateAlerts(selectedPeriodType);
        queryClient.invalidateQueries({ queryKey: ["alert-events-open"] });
        queryClient.invalidateQueries({ queryKey: ["anomaly-logs"] });
      } catch {
        // non-fatal
      }
      setAbsoluteThreshold("");
    } catch (err) {
      toast({
        title: "Failed to save threshold",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSavingThreshold(false);
    }
  };

  const handleSaveEmailSettings = async () => {
    if (emailEnabled && !receiverEmail) {
      toast({
        title: "Email required",
        description: "Enter a recipient email address.",
        variant: "destructive",
      });
      return;
    }
    setSavingEmail(true);
    try {
      await updateAlertSettings({
        receiver_email: receiverEmail || null,
        email_enabled: emailEnabled,
      });
      queryClient.invalidateQueries({ queryKey: ["alert-settings"] });
      toast({
        title: "✓ Settings saved",
        description: emailEnabled
          ? `Alerts will be sent to ${receiverEmail}`
          : "Email notifications disabled.",
      });
    } catch (err) {
      toast({
        title: "Failed to save settings",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSaveDetection = async () => {
    const k = parseFloat(kValue);
    const pb = parseFloat(pctBuffer);
    const hd = parseInt(historyDays);
    const hm = parseInt(historyMonths);
    const cd = parseInt(globalCooldown);
    if ([k, pb, hd, hm, cd].some(isNaN) || k <= 0 || pb <= 0 || hd <= 0 || hm <= 0 || cd <= 0) {
      toast({
        title: "Invalid values",
        description: "All detection settings must be positive numbers.",
        variant: "destructive",
      });
      return;
    }
    setSavingDetection(true);
    try {
      await updateAlertSettings({
        k_value: k,
        percentage_buffer: 1 + pb / 100,
        alert_history_days: hd,
        alert_history_months: hm,
        cooldown_minutes: cd,
      });
      queryClient.invalidateQueries({ queryKey: ["alert-settings"] });
      toast({ title: "✓ Detection settings saved" });
    } catch (err) {
      toast({
        title: "Failed to save detection settings",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSavingDetection(false);
    }
  };

  const handleDeactivate = async (id: number) => {
    setDeactivatingId(id);
    try {
      await deactivateAlertThreshold(id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["alert-thresholds"] }),
        queryClient.invalidateQueries({ queryKey: ["alert-events-open"] }),
        queryClient.invalidateQueries({ queryKey: ["alert-events-history"] }),
      ]);
      toast({
        title: "✓ Threshold deactivated",
        description: "Any open incident for this service has been resolved.",
      });
    } catch (err) {
      toast({
        title: "Failed to deactivate",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeactivatingId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Budget Alerts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage budget thresholds and email notifications
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left stack (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Set Budget Threshold */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="h-4 w-4 text-primary" />
                Set Budget Threshold
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="service-select" className="text-sm">
                  Azure Service
                </Label>
                <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                  <SelectTrigger id="service-select" className="w-full">
                    <SelectValue placeholder="Select a service…" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        No services available
                      </SelectItem>
                    ) : (
                      services.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                          {s.service_category && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({s.service_category})
                            </span>
                          )}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Period Type</Label>
                  <Select
                    value={selectedPeriodType}
                    onValueChange={(v) => setSelectedPeriodType(v as PeriodType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="budget-amount" className="text-sm">
                    Budget Amount
                  </Label>
                  <div className="relative">
                    <IndianRupeeIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="budget-amount"
                      type="number"
                      min={0}
                      placeholder="Enter amount"
                      value={absoluteThreshold}
                      onChange={(e) => setAbsoluteThreshold(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
              </div>

              <Button
                onClick={handleCreateThreshold}
                disabled={savingThreshold}
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-medium"
              >
                {savingThreshold && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Create Alert
              </Button>

              {thresholds.length > 0 && (
                <div className="pt-4 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Configured Thresholds
                  </p>
                  <div className="space-y-2">
                    {thresholds.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
                      >
                        <div>
                          <span className="font-medium text-foreground">{t.service_name}</span>
                          <span className="ml-2 text-xs text-muted-foreground capitalize">
                            {t.period_type}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-foreground">
                            {t.absolute_threshold != null
                              ? formatCurrency(t.absolute_threshold)
                              : "—"}
                          </span>
                          <Badge
                            variant={t.is_active ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {t.is_active ? "active" : "inactive"}
                          </Badge>
                          {t.is_active && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                  disabled={deactivatingId === t.id}
                                >
                                  {deactivatingId === t.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <MoreHorizontal className="h-3 w-3" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive gap-2 cursor-pointer"
                                  onClick={() => handleDeactivate(t.id)}
                                >
                                  <PowerOff className="h-3.5 w-3.5" />
                                  Deactivate
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Email Alert Settings */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4 text-primary" />
                Email Alert Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingSettings ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 rounded" />
                  ))}
                </div>
              ) : (
                <>
                  {alertSettings?.receiver_email && (
                    <div className="rounded-md bg-muted/40 px-3 py-2 text-sm">
                      <p className="text-xs text-muted-foreground mb-1">Current Email Address</p>
                      <p className="font-medium text-foreground">
                        {maskEmail(alertSettings.receiver_email)}
                      </p>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="receiver-email" className="text-sm">
                      {alertSettings?.receiver_email ? "Update Email Address" : "Email Address"}
                    </Label>
                    <Input
                      id="receiver-email"
                      type="email"
                      placeholder="admin@company.com"
                      onChange={(e) => setReceiverEmail(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="email-enabled"
                      checked={emailEnabled}
                      onChange={(e) => setEmailEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                    />
                    <Label htmlFor="email-enabled" className="text-sm cursor-pointer">
                      Enable email notifications
                    </Label>
                  </div>
                  <Button
                    onClick={handleSaveEmailSettings}
                    disabled={savingEmail}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                  >
                    {savingEmail && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Save Settings
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Detection Settings */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-4 w-4 text-primary" />
                Detection Settings
              </CardTitle>
              <CardDescription className="text-xs">
                Controls the statistical anomaly detection engine and notification cooldown.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingSettings ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 rounded" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="pct-buffer" className="text-sm">
                        Alert Buffer
                        <span className="ml-1 text-xs text-muted-foreground">% above avg</span>
                      </Label>
                      <Input
                        id="pct-buffer"
                        type="number"
                        min={1}
                        value={pctBuffer}
                        onChange={(e) => setPctBuffer(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="k-value" className="text-sm">
                        Statistical Sensitivity
                        <span className="ml-1 text-xs text-muted-foreground">k (σ multiplier)</span>
                      </Label>
                      <Input
                        id="k-value"
                        type="number"
                        step={0.1}
                        min={0.1}
                        value={kValue}
                        onChange={(e) => setKValue(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="history-days" className="text-sm">
                        Daily History Window
                        <span className="ml-1 text-xs text-muted-foreground">days</span>
                      </Label>
                      <Input
                        id="history-days"
                        type="number"
                        min={1}
                        value={historyDays}
                        onChange={(e) => setHistoryDays(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="history-months" className="text-sm">
                        Monthly History Window
                        <span className="ml-1 text-xs text-muted-foreground">months</span>
                      </Label>
                      <Input
                        id="history-months"
                        type="number"
                        min={1}
                        value={historyMonths}
                        onChange={(e) => setHistoryMonths(e.target.value)}
                      />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label htmlFor="global-cooldown" className="text-sm">
                        Global Cooldown
                        <span className="ml-1 text-xs text-muted-foreground">
                          minutes between repeat emails for the same incident
                        </span>
                      </Label>
                      <div className="relative">
                        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="global-cooldown"
                          type="number"
                          min={1}
                          value={globalCooldown}
                          onChange={(e) => setGlobalCooldown(e.target.value)}
                          className="pl-8"
                        />
                      </div>
                    </div>
                  </div>
                  <Button
                    onClick={handleSaveDetection}
                    disabled={savingDetection}
                    variant="outline"
                    className="w-full"
                  >
                    {savingDetection && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Save Detection Settings
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column (1/3)*/}
        <div className="space-y-6">
          {/* Active Incidents */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary" />
                  Active Incidents
                </span>
                {activeAlerts.length > 0 && (
                  <Badge variant="destructive" className="text-xs tabular-nums">
                    {activeAlerts.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingActive ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 rounded" />
                  ))}
                </div>
              ) : activeAlerts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No active incidents.
                </p>
              ) : (
                <div className="space-y-3">
                  {activeAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="rounded-md border border-border bg-muted/30 p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {alert.service_name}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {alert.period_type} · started {formatDateTime(alert.breach_started_at)}
                          </p>
                        </div>
                        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span>
                          <span className="text-destructive font-semibold">
                            {formatCurrency(alert.current_cost)}
                          </span>
                          <span className="text-muted-foreground">
                            {" "}
                            / {formatCurrency(alert.computed_threshold)}
                          </span>
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {alert.winning_component}
                        </Badge>
                      </div>

                      {/* Notification count + cooldown info */}
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ShieldCheck className="h-3 w-3" />
                        <span>
                          {alert.notification_count} notification
                          {alert.notification_count !== 1 ? "s" : ""} sent
                        </span>
                        <span>·</span>
                        <Clock className="h-3 w-3" />
                        <span>{alert.cooldown_minutes}m cooldown</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Incident History */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" />
            Alert History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingHistory ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded" />
              ))}
            </div>
          ) : alertHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No alert history yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-semibold">STARTED</TableHead>
                  <TableHead className="text-xs font-semibold">SERVICE</TableHead>
                  <TableHead className="text-xs font-semibold">PERIOD</TableHead>
                  <TableHead className="text-xs font-semibold">RULE</TableHead>
                  <TableHead className="text-xs font-semibold text-right">COST</TableHead>
                  <TableHead className="text-xs font-semibold text-right">THRESHOLD</TableHead>
                  <TableHead className="text-xs font-semibold text-center">NOTIFICATIONS</TableHead>
                  <TableHead className="text-xs font-semibold text-center">STATUS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alertHistory.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="text-sm">
                      {formatDateTime(event.breach_started_at)}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{event.service_name}</TableCell>
                    <TableCell className="text-sm capitalize">{event.period_type}</TableCell>
                    <TableCell className="text-sm">
                      {event.winning_component === "absolute"
                        ? "Budget Ceiling"
                        : event.winning_component === "statistical"
                          ? "Statistical"
                          : "Percentage"}
                    </TableCell>
                    <TableCell className="text-sm text-right text-destructive font-medium">
                      {formatCurrency(event.current_cost)}
                    </TableCell>
                    <TableCell className="text-sm text-right">
                      {formatCurrency(event.computed_threshold)}
                    </TableCell>
                    <TableCell className="text-sm text-center tabular-nums">
                      {event.notification_count}
                    </TableCell>
                    <TableCell className="text-center">
                      {event.status === "open" ? (
                        <Badge variant="destructive" className="text-xs">
                          open
                        </Badge>
                      ) : event.status === "resolved" ? (
                        <Badge
                          variant="secondary"
                          className="text-xs bg-emerald-100 text-emerald-700"
                        >
                          resolved
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-500">
                          deactivated
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
