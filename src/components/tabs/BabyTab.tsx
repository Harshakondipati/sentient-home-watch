import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { callFn } from "@/lib/api";
import { toast } from "sonner";
import { useSettings } from "@/hooks/useSettings";

const AGES = [
  { v: "newborn", label: "Newborn" },
  { v: "0-6mo", label: "0-6 months" },
  { v: "6-12mo", label: "6-12 months" },
  { v: "1-2yr", label: "1-2 years" },
  { v: "2-3yr", label: "2-3 years" },
];
const ROOMS = ["Nursery", "Kitchen", "Bathroom", "Living room", "Stairs", "Garage"];
const SURFACES = ["crib", "bassinet", "co-sleeper", "other"];

export function BabyTab({ location }: { location?: string }) {
  const settings = useSettings();
  const [mode, setMode] = useState<"babyproof" | "sleep">("babyproof");
  const [age, setAge] = useState("0-6mo");
  const [rooms, setRooms] = useState<string[]>(["Nursery", "Living room"]);
  const [surface, setSurface] = useState("crib");
  const [setup, setSetup] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  const toggleRoom = (r: string) => setRooms((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));

  const run = async () => {
    setLoading(true); setResult("");
    try {
      const userPrompt = mode === "babyproof"
        ? `You are a certified childproofing expert. For a ${age} baby, audit these rooms: ${rooms.join(", ")}. For each room, list all hazards appropriate for this developmental stage (what can they reach, grab, put in mouth at this age?), explain the injury risk, and give a specific fix (product or action). Be thorough — include things parents commonly miss. Use ## room headings and tag each hazard with the injury type in brackets like [choking], [fall], [electric], [chemical], [entrapment].`
        : `You are a pediatric sleep safety expert. Audit this sleep setup for a ${age} baby on a ${surface}: "${setup || "(no description)"}". Check against current safe sleep guidelines (AAP recommendations). Start with **Overall Safety Rating: Safe / Caution / Unsafe**. List any risks, explain why each is dangerous, and give the corrected setup. Flag urgent risks clearly. Use markdown.`;
      const r = await callFn<{ content: string }>("guardian-chat", {
        messages: [{ role: "user", content: userPrompt }],
        location,
        temperature: settings.temperature,
        topP: settings.topP,
      });
      setResult(r.content);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <ModeButton active={mode === "babyproof"} onClick={() => setMode("babyproof")}>Babyproof my home</ModeButton>
        <ModeButton active={mode === "sleep"} onClick={() => setMode("sleep")}>Safe sleep checker</ModeButton>
      </div>

      <Card className="panel p-6">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Baby age</Label>
            <select className="w-full mt-2 h-10 rounded-md border bg-input px-3 text-sm" value={age} onChange={(e) => setAge(e.target.value)}>
              {AGES.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
            </select>
          </div>
          {mode === "babyproof" ? (
            <div className="md:col-span-2">
              <Label>Rooms to check</Label>
              <div className="flex flex-wrap gap-3 mt-2">
                {ROOMS.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={rooms.includes(r)} onCheckedChange={() => toggleRoom(r)} /> {r}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div>
                <Label>Sleep surface</Label>
                <select className="w-full mt-2 h-10 rounded-md border bg-input px-3 text-sm" value={surface} onChange={(e) => setSurface(e.target.value)}>
                  {SURFACES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <Label>Describe the sleep setup</Label>
                <Textarea value={setup} onChange={(e) => setSetup(e.target.value)} placeholder="e.g. Crib with fitted sheet, no blankets, room temp 20°C, baby on back…" rows={3} />
              </div>
            </>
          )}
        </div>

        <div className="mt-4">
          <Button onClick={run} disabled={loading}>
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing…</> : <><Sparkles className="h-4 w-4 mr-2" /> {mode === "babyproof" ? "Run Safety Check" : "Check Sleep Safety"}</>}
          </Button>
        </div>
      </Card>

      {result && (
        <Card className="panel p-6">
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{result}</ReactMarkdown>
          </div>
        </Card>
      )}
    </div>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex-1 px-4 py-3 rounded-md text-sm font-medium border transition ${active ? "bg-primary text-primary-foreground border-primary glow-primary" : "border-border hover:border-primary/50"}`}>
      {children}
    </button>
  );
}
