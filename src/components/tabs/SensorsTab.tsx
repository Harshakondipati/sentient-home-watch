import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkline } from "@/components/Sparkline";
import { SENSOR_LABELS, SENSOR_UNITS, SensorAlert, SensorKey, SensorState } from "@/hooks/useSensorSimulation";
import { Activity, DoorOpen, Flame, Send, Thermometer, Wind, Waves, Zap } from "lucide-react";
import { callFn } from "@/lib/api";
import { toast } from "sonner";
import { severityClass } from "@/lib/threat";
import { useSettings } from "@/hooks/useSettings";

const ICONS: Record<SensorKey, any> = {
  temperature: Thermometer, smoke: Flame, co: Wind, flood: Waves, motion: Activity, door: DoorOpen,
};

interface Props {
  readings: SensorState;
  alerts: SensorAlert[];
  trigger: {
    motion: () => void; smoke: () => void; co: () => void;
    flood: () => void; door: () => void; tempHigh: () => void;
  };
}

export function SensorsTab({ readings, alerts, trigger }: Props) {
  const settings = useSettings();
  const sentRef = useRef<Set<string>>(new Set());

  // Index.tsx already pushes Telegram alerts — but this tab still tracks dedup so the test button
  // doesn't compete. Auto-push lives in Index so it works regardless of which tab is active.
  useEffect(() => {
    alerts.forEach((a) => sentRef.current.add(a.id));
  }, [alerts]);

  const testTelegram = async () => {
    if (!settings.telegramChatId) {
      toast.error("Connect your Telegram in Settings first.");
      return;
    }
    try {
      await callFn("telegram-alert", {
        chatId: settings.telegramChatId,
        message: "✅ <b>Guardian AI</b>\nTest alert — your Telegram is connected.",
      });
      toast.success("Telegram test sent!");
    } catch (e: any) { toast.error(`Telegram: ${e.message}`); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-mono tracking-wider text-muted-foreground">LIVE SENSOR FEED · UPDATES EVERY 3s</h2>
        <Button variant="outline" size="sm" onClick={testTelegram}>
          <Send className="h-4 w-4 mr-1" /> Test Telegram
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(Object.keys(SENSOR_LABELS) as SensorKey[]).map((k) => {
          const arr = readings[k] ?? [];
          const last = arr[arr.length - 1]?.value ?? 0;
          const Icon = ICONS[k];
          const isBinary = k === "flood" || k === "motion" || k === "door";
          const danger = (k === "smoke" && last >= 50) || (k === "co" && last >= 35) || (k === "temperature" && (last >= 40 || last <= 10)) || (isBinary && last >= 1);
          return (
            <Card key={k} className="panel p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon className={`h-5 w-5 ${danger ? "text-danger" : "text-primary"}`} />
                  <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{SENSOR_LABELS[k]}</span>
                </div>
                <div className={`h-2.5 w-2.5 rounded-full ${danger ? "bg-danger animate-blink" : "bg-safe glow-safe"}`} />
              </div>
              <div className={`font-mono text-3xl font-bold ${danger ? "text-danger" : ""}`}>
                {isBinary ? (last >= 1 ? "ACTIVE" : "CLEAR") : last.toFixed(k === "temperature" ? 1 : 0)}
                {!isBinary && <span className="text-base text-muted-foreground ml-1">{SENSOR_UNITS[k]}</span>}
              </div>
              <div className="mt-3 h-12">
                <Sparkline data={arr.slice(-20)} color={danger ? "hsl(var(--danger))" : "hsl(var(--primary))"} />
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="panel p-5">
        <h3 className="text-sm font-mono tracking-wider text-muted-foreground mb-3">SIMULATE EVENTS</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={trigger.motion}><Activity className="h-4 w-4 mr-1" /> Trigger motion</Button>
          <Button variant="outline" size="sm" onClick={trigger.smoke}><Flame className="h-4 w-4 mr-1" /> Trigger smoke alarm</Button>
          <Button variant="outline" size="sm" onClick={trigger.co}><Wind className="h-4 w-4 mr-1" /> Trigger CO alert</Button>
          <Button variant="outline" size="sm" onClick={trigger.flood}><Waves className="h-4 w-4 mr-1" /> Trigger flood</Button>
          <Button variant="outline" size="sm" onClick={trigger.door}><DoorOpen className="h-4 w-4 mr-1" /> Toggle door</Button>
          <Button variant="outline" size="sm" onClick={trigger.tempHigh}><Zap className="h-4 w-4 mr-1" /> Spike temperature</Button>
        </div>
      </Card>

      <Card className="panel p-5">
        <h3 className="text-sm font-mono tracking-wider text-muted-foreground mb-3">EVENT LOG</h3>
        {alerts.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">No events yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-mono text-muted-foreground border-b">
                  <th className="py-2 pr-3">TIME</th>
                  <th className="py-2 pr-3">SENSOR</th>
                  <th className="py-2 pr-3">VALUE</th>
                  <th className="py-2 pr-3">LEVEL</th>
                  <th className="py-2">EVENT</th>
                </tr>
              </thead>
              <tbody>
                {alerts.slice(0, 25).map((a) => (
                  <tr key={a.id} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs text-muted-foreground tabular-nums">{new Date(a.ts).toLocaleTimeString()}</td>
                    <td className="py-2 pr-3">{SENSOR_LABELS[a.sensor]}</td>
                    <td className="py-2 pr-3 font-mono">{typeof a.value === "number" ? a.value.toFixed(1) : a.value}</td>
                    <td className="py-2 pr-3"><span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${severityClass(a.level)}`}>{a.level.toUpperCase()}</span></td>
                    <td className="py-2 text-xs">{a.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
