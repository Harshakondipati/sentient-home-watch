import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { callFn } from "@/lib/api";
import { toast } from "sonner";
import { useSettings } from "@/hooks/useSettings";

const ROOMS = ["Kitchen", "Bathroom", "Garden", "Garage", "Living room", "Bedroom"];

export function DogTab({ location }: { location?: string }) {
  const settings = useSettings();
  const [mode, setMode] = useState<"hazards" | "asset">("hazards");

  // Mode A
  const [breed, setBreed] = useState("");
  const [age, setAge] = useState<"puppy" | "adult" | "senior">("adult");
  const [home, setHome] = useState("");
  const [rooms, setRooms] = useState<string[]>(["Kitchen", "Living room"]);
  // Mode B
  const [training, setTraining] = useState<"untrained" | "basic" | "advanced">("basic");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");

  const toggleRoom = (r: string) =>
    setRooms((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));

  const run = async () => {
    setLoading(true); setResult("");
    try {
      const userPrompt = mode === "hazards"
        ? `You are a veterinary safety expert. Based on the dog breed "${breed || "mixed"}", age "${age}", and home description "${home || "(no description)"}", identify all potential hazards in these rooms: ${rooms.join(", ")}. For each hazard: name it, explain the specific risk to this breed/age, and give a concrete fix. Organize by room using ## headings.`
        : `As a home security consultant, advise how to use a "${breed || "mixed-breed"}" dog with "${training}" training as part of a home security system. Cover: ideal alert positions in the home, behavioral cues to watch for, how to interpret the dog's reactions, training tips to reinforce security behavior, and limitations of relying on a dog. Use markdown headings and bullets.`;
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
        <ModeButton active={mode === "hazards"} onClick={() => setMode("hazards")}>Protect my dog</ModeButton>
        <ModeButton active={mode === "asset"} onClick={() => setMode("asset")}>Use as security asset</ModeButton>
      </div>

      <Card className="panel p-6">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Dog breed</Label>
            <Input value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="e.g. Labrador" />
          </div>
          <div>
            <Label>Age</Label>
            <select className="w-full mt-2 h-10 rounded-md border bg-input px-3 text-sm" value={age} onChange={(e) => setAge(e.target.value as any)}>
              <option value="puppy">Puppy</option>
              <option value="adult">Adult</option>
              <option value="senior">Senior</option>
            </select>
          </div>
          {mode === "hazards" ? (
            <>
              <div className="md:col-span-2">
                <Label>Home description</Label>
                <Textarea value={home} onChange={(e) => setHome(e.target.value)} placeholder="e.g. small apartment, hardwood floors, balcony…" rows={3} />
              </div>
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
            </>
          ) : (
            <div className="md:col-span-2">
              <Label>Training level</Label>
              <select className="w-full mt-2 h-10 rounded-md border bg-input px-3 text-sm" value={training} onChange={(e) => setTraining(e.target.value as any)}>
                <option value="untrained">Untrained</option>
                <option value="basic">Basic</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
          )}
        </div>

        <div className="mt-4">
          <Button onClick={run} disabled={loading}>
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing…</> : <><Sparkles className="h-4 w-4 mr-2" /> {mode === "hazards" ? "Analyze Hazards" : "Get Security Advice"}</>}
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
