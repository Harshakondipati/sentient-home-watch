import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThreatBadge } from "@/components/ThreatBadge";
import { Sparkline } from "@/components/Sparkline";
import { SENSOR_LABELS, SENSOR_UNITS, SensorAlert, SensorKey, SensorState, ThreatLevelComputed } from "@/hooks/useSensorSimulation";
import { Cloud, Wind, Droplets, Thermometer, AlertCircle, Flame, Wind as WindIcon, Waves, Activity, DoorOpen, Sparkles, Loader2 } from "lucide-react";
import { callFn } from "@/lib/api";
import { toast } from "sonner";
import { severityClass } from "@/lib/threat";
import ReactMarkdown from "react-markdown";

const SENSOR_ICONS: Record<SensorKey, any> = {
  temperature: Thermometer, smoke: Flame, co: WindIcon, flood: Waves, motion: Activity, door: DoorOpen,
};

interface Props {
  readings: SensorState;
  alerts: SensorAlert[];
  threat: ThreatLevelComputed;
  location?: string;
  lat?: number;
  lon?: number;
  onAskChat: (prompt: string) => void;
}

export function DashboardTab({ readings, alerts, threat, location, lat, lon, onAskChat }: Props) {
  const [weather, setWeather] = useState<any>(null);
  const [weatherTip, setWeatherTip] = useState<string>("");
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [explaining, setExplaining] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!lat || !lon) return;
    setWeatherLoading(true);
    callFn<{ weather: any; tip: string }>("weather", { lat, lon })
      .then((d) => { setWeather(d.weather); setWeatherTip(d.tip); })
      .catch((e) => toast.error(`Weather: ${e.message}`))
      .finally(() => setWeatherLoading(false));
  }, [lat, lon]);

  const explainAlert = async (a: SensorAlert) => {
    setExplaining(a.id);
    try {
      const r = await callFn<{ content: string }>("guardian-chat", {
        messages: [{ role: "user", content: `Explain this security alert in plain English in 2 sentences and what I should do: ${a.message}` }],
        location,
      });
      setExplanations((p) => ({ ...p, [a.id]: r.content }));
    } catch (e: any) { toast.error(e.message); }
    finally { setExplaining(null); }
  };

  const reason =
    threat === "ALERT" ? "Active high-severity sensor alert" :
    threat === "CAUTION" ? "Recent sensor activity detected" :
    "All sensors within safe range";

  return (
    <div className="space-y-6">
      {/* Threat widget */}
      <Card className="panel p-8 flex flex-col items-center text-center">
        <div className="text-xs font-mono tracking-[0.3em] text-muted-foreground mb-4">CURRENT THREAT LEVEL</div>
        <ThreatBadge level={threat} size="lg" reason={reason} />
      </Card>

      {/* Sensor summary */}
      <div>
        <h2 className="text-sm font-mono tracking-wider text-muted-foreground mb-3">SENSOR SUMMARY</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {(Object.keys(SENSOR_LABELS) as SensorKey[]).map((k) => {
            const arr = readings[k] ?? [];
            const last = arr[arr.length - 1]?.value ?? 0;
            const Icon = SENSOR_ICONS[k];
            const isBinary = k === "flood" || k === "motion" || k === "door";
            const danger = (k === "smoke" && last >= 50) || (k === "co" && last >= 35) || (k === "temperature" && (last >= 40 || last <= 10)) || (isBinary && last >= 1);
            const color = danger ? "hsl(var(--danger))" : "hsl(var(--primary))";
            return (
              <Card key={k} className="panel p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${danger ? "text-danger" : "text-primary"}`} />
                    <span className="text-xs font-mono uppercase text-muted-foreground">{SENSOR_LABELS[k]}</span>
                  </div>
                  <div className={`h-2 w-2 rounded-full ${danger ? "bg-danger animate-blink" : "bg-safe"}`} />
                </div>
                <div className={`font-mono text-2xl font-bold ${danger ? "text-danger" : "text-foreground"}`}>
                  {isBinary ? (last >= 1 ? "ON" : "OFF") : last.toFixed(k === "temperature" ? 1 : 0)}
                  <span className="text-sm text-muted-foreground ml-1">{SENSOR_UNITS[k]}</span>
                </div>
                <div className="mt-2 h-10">
                  <Sparkline data={arr.slice(-15)} color={color} />
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-mono tracking-wider text-muted-foreground mb-3">QUICK ACTIONS</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            "Run a full security audit of my home",
            "What should I check right now?",
            "Motion was detected — what should I do?",
            "Are there weather threats I should worry about?",
          ].map((q) => (
            <Button key={q} variant="outline" className="h-auto py-3 text-xs font-medium border-primary/30 hover:border-primary hover:bg-primary/10" onClick={() => onAskChat(q)}>
              {q}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent alerts */}
        <Card className="panel p-5">
          <h2 className="text-sm font-mono tracking-wider text-muted-foreground mb-3">RECENT ALERTS</h2>
          {alerts.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No alerts. All systems nominal.
            </div>
          ) : (
            <ul className="space-y-3">
              {alerts.slice(0, 5).map((a) => (
                <li key={a.id} className="border-l-2 border-primary/40 pl-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-xs text-muted-foreground">
                      {new Date(a.ts).toLocaleTimeString()}
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${severityClass(a.level)}`}>{a.level.toUpperCase()}</span>
                  </div>
                  <div className="text-sm mt-1">{a.message}</div>
                  {explanations[a.id] ? (
                    <div className="mt-2 text-xs text-muted-foreground prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>{explanations[a.id]}</ReactMarkdown>
                    </div>
                  ) : (
                    <Button variant="ghost" size="sm" className="h-7 mt-1 text-xs text-primary hover:text-primary" disabled={explaining === a.id} onClick={() => explainAlert(a)}>
                      {explaining === a.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />} Explain this
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Weather */}
        <Card className="panel p-5">
          <h2 className="text-sm font-mono tracking-wider text-muted-foreground mb-3 flex items-center gap-2"><Cloud className="h-4 w-4" /> WEATHER</h2>
          {weatherLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : weather ? (
            <div>
              <div className="flex items-baseline gap-3">
                <div className="font-mono text-4xl font-bold">{Math.round(weather.temp)}°</div>
                <div className="text-sm text-muted-foreground capitalize">{weather.description}</div>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{weather.city}{weather.country ? `, ${weather.country}` : ""}</div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                <div className="flex items-center gap-1"><Droplets className="h-3 w-3" />{weather.humidity}%</div>
                <div className="flex items-center gap-1"><Wind className="h-3 w-3" />{weather.wind_speed} m/s</div>
                <div className="flex items-center gap-1"><Thermometer className="h-3 w-3" />feels {Math.round(weather.feels_like)}°</div>
              </div>
              {weatherTip && (
                <div className="mt-4 p-3 rounded-md bg-primary/10 border border-primary/30 text-sm">
                  <div className="flex items-center gap-1 text-xs font-mono text-primary mb-1"><AlertCircle className="h-3 w-3" /> SECURITY TIP</div>
                  {weatherTip}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Detecting your location…</div>
          )}
        </Card>
      </div>
    </div>
  );
}
