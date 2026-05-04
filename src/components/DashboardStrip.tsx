import { Card } from "@/components/ui/card";
import { ThreatBadge } from "@/components/ThreatBadge";
import { Sparkline } from "@/components/Sparkline";
import { SENSOR_LABELS, SENSOR_UNITS, SensorAlert, SensorKey, SensorState } from "@/hooks/useSensorSimulation";
import { Activity, DoorOpen, Flame, Thermometer, Wind, Waves } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ThreatLevel, severityClass } from "@/lib/threat";

const ICONS: Record<SensorKey, LucideIcon> = {
  temperature: Thermometer, smoke: Flame, co: Wind, flood: Waves, motion: Activity, door: DoorOpen,
};

interface Props {
  readings: SensorState;
  alerts: SensorAlert[];
  threat: ThreatLevel;
}

// Compact dashboard strip shown UNDER the chat panel.
export function DashboardStrip({ readings, alerts, threat }: Props) {
  const sensorKeys = Object.keys(SENSOR_LABELS) as SensorKey[];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xs font-mono tracking-wider text-muted-foreground">HOME STATUS</h2>
        <ThreatBadge level={threat} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {sensorKeys.map((k) => {
          const arr = readings[k] ?? [];
          const last = arr[arr.length - 1]?.value ?? 0;
          const Icon = ICONS[k];
          const isBinary = k === "flood" || k === "motion" || k === "door";
          const danger =
            (k === "smoke" && last >= 50) ||
            (k === "co" && last >= 35) ||
            (k === "temperature" && (last >= 40 || last <= 10)) ||
            (isBinary && last >= 1);
          return (
            <Card key={k} className="panel p-3">
              <div className="flex items-center justify-between mb-1">
                <Icon className={`h-4 w-4 ${danger ? "text-danger" : "text-primary"}`} />
                <div className={`h-2 w-2 rounded-full ${danger ? "bg-danger animate-blink" : "bg-safe glow-safe"}`} />
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{SENSOR_LABELS[k]}</div>
              <div className={`font-mono text-lg font-bold ${danger ? "text-danger" : ""}`}>
                {formatSensorValue(k, last)}
                {!isBinary && <span className="text-[10px] text-muted-foreground ml-1">{SENSOR_UNITS[k]}</span>}
              </div>
              <div className="h-6 mt-1">
                <Sparkline data={arr.slice(-15)} color={danger ? "hsl(var(--danger))" : "hsl(var(--primary))"} domain={sparklineDomain(k)} />
              </div>
            </Card>
          );
        })}
      </div>

      {alerts.length > 0 && (
        <Card className="panel p-4">
          <h3 className="text-xs font-mono tracking-wider text-muted-foreground mb-2">RECENT EVENTS</h3>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {alerts.slice(0, 5).map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-muted-foreground tabular-nums">{new Date(a.ts).toLocaleTimeString()}</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono border ${severityClass(a.level)}`}>{a.level.toUpperCase()}</span>
                <span className="truncate">{a.message}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function formatSensorValue(sensor: SensorKey, value: number) {
  if (sensor === "flood") return value >= 1 ? "FLOOD ALERT" : "NO ALERT";
  if (sensor === "motion") return value >= 1 ? "MOTION" : "IDLE";
  if (sensor === "door") return value >= 1 ? "OPEN" : "CLOSED";
  return value.toFixed(sensor === "temperature" ? 1 : 0);
}

function sparklineDomain(sensor: SensorKey): [number, number] {
  if (sensor === "temperature") return [0, 50];
  if (sensor === "smoke") return [0, 100];
  if (sensor === "co") return [0, 60];
  return [0, 1];
}
