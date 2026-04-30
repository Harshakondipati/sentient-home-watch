import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { callFn } from "@/lib/api";
import { toast } from "sonner";
import { SensorState } from "@/hooks/useSensorSimulation";
import { useSettings } from "@/hooks/useSettings";

interface Item { text: string; reason: string; done: boolean; }

interface Props { readings: SensorState; weatherCondition?: string; location?: string; }

export function ChecklistTab({ readings, weatherCondition, location }: Props) {
  const settings = useSettings();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const lastTemp = readings.temperature?.slice(-1)[0]?.value?.toFixed(1) ?? "?";
      const ctx = `Weather: ${weatherCondition ?? "unknown"}. Time: ${new Date().toLocaleTimeString()}. Indoor temperature: ${lastTemp}°C. Location: ${location ?? "unknown"}.`;
      const prompt = `Generate a personalized 7-item home security checklist for today.
Context: ${ctx}
Make each item specific and actionable. Return STRICT JSON ONLY, no markdown:
{ "items": [ { "text": "short action", "reason": "one-line why" } ] }`;
      const r = await callFn<{ content: string }>("guardian-chat", {
        messages: [{ role: "user", content: prompt }],
        location,
        temperature: settings.temperature,
        topP: settings.topP,
      });
      let parsed: { items: { text: string; reason: string }[] };
      try {
        const cleaned = r.content.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
        const m = cleaned.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(m ? m[0] : cleaned);
      } catch {
        parsed = { items: r.content.split("\n").filter(Boolean).slice(0, 7).map((t) => ({ text: t.replace(/^[\d.\-)\s]+/, ""), reason: "" })) };
      }
      setItems(parsed.items.map((it) => ({ ...it, done: false })));
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const toggle = (i: number) => setItems((p) => p.map((it, idx) => (idx === i ? { ...it, done: !it.done } : it)));
  const completedPct = items.length === 0 ? 0 : Math.round((items.filter((i) => i.done).length / items.length) * 100);

  return (
    <div className="space-y-6">
      <Card className="panel p-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-lg">Today's Security Checklist</h2>
          <p className="text-sm text-muted-foreground">Personalized to your weather, sensors, and time of day.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={generate} disabled={loading}>
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</> : items.length === 0 ? <><Sparkles className="h-4 w-4 mr-2" /> Generate</> : <><RefreshCw className="h-4 w-4 mr-2" /> Regenerate</>}
          </Button>
        </div>
      </Card>

      {items.length > 0 && (
        <>
          <Card className="panel p-4">
            <div className="flex items-center justify-between mb-2 text-sm font-mono">
              <span className="text-muted-foreground">PROGRESS</span>
              <span className="text-primary">{completedPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${completedPct}%` }} />
            </div>
          </Card>

          <Card className="panel p-2">
            <ul className="divide-y divide-border">
              {items.map((it, i) => (
                <li key={i} className="flex items-start gap-3 p-4">
                  <Checkbox checked={it.done} onCheckedChange={() => toggle(i)} className="mt-1" />
                  <div className="flex-1">
                    <div className={`font-medium ${it.done ? "line-through text-muted-foreground" : ""}`}>
                      {i + 1}. {it.text}
                    </div>
                    {it.reason && <div className="text-xs text-muted-foreground mt-0.5">{it.reason}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
