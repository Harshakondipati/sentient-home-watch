import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Shield, Loader2, Trash2, User, Image as ImageIcon, X, Dog, Baby, Home, ListChecks, Camera } from "lucide-react";
import { callFn } from "@/lib/api";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { useSettings } from "@/hooks/useSettings";

type ImageAttachment = { dataUrl: string; name: string };
type Msg = {
  role: "user" | "assistant";
  content: string;
  image?: string; // dataURL for display
};

const QUICK_ACTIONS = [
  { icon: Camera, label: "Audit a room", prompt: "I want to audit a room. I'll upload a photo of it next — please tell me what to capture (door, windows, locks visible)." },
  { icon: Dog, label: "Dog safety", prompt: "Help me make my home safer for my dog. Upload room photos and identify hazards (toxic plants, exposed wires, choking risks, escape points). Start by asking me about my dog." },
  { icon: Baby, label: "Baby-proofing", prompt: "Help me baby-proof my home. I'll send photos of each room. Identify outlets, sharp corners, choking hazards, fall risks. Start by asking my baby's age." },
  { icon: ListChecks, label: "Daily checklist", prompt: "Build me today's home security checklist based on my home profile and current weather." },
  { icon: Home, label: "Is my home secure?", prompt: "Give me a quick assessment of my home security based on my profile, then ask what areas I want to deep-dive into." },
];

interface Props {
  presetPrompt?: string | null;
  onPresetConsumed?: () => void;
  location?: string;
  weatherCondition?: string;
  presence?: "home" | "away";
}

export function ChatTab({ presetPrompt, onPresetConsumed, location, weatherCondition, presence }: Props) {
  const settings = useSettings();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<ImageAttachment | null>(null);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text: string, image?: ImageAttachment | null) => {
    const userMsg: Msg = { role: "user", content: text, image: image?.dataUrl };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setPendingImage(null);
    setLoading(true);

    try {
      // Build profile context for personalized advice
      const profile = [
        settings.homeName && `Home: ${settings.homeName}`,
        settings.city && `City: ${settings.city}`,
        location && `Detected location: ${location}`,
        weatherCondition && `Today's weather: ${weatherCondition}`,
        `Residents: ${settings.residents}`,
        settings.hasKids && `Has children`,
        settings.hasPets && `Has pets`,
        `Owner is currently ${(presence ?? settings.presence).toUpperCase()}`,
      ].filter(Boolean).join(" · ");

      // For vision: route through guardian-vision; for text: guardian-chat
      if (image) {
        // First message with image triggers structured audit + free-form follow-up
        const auditR = await callFn<{ audit: any; raw: string }>("guardian-vision", {
          imageDataUrl: image.dataUrl,
        });
        const a = auditR.audit;
        const findings = (a?.findings ?? []).map((f: any, i: number) =>
          `${i + 1}. **${f.severity || "Medium"} – ${f.issue}**\n   → ${f.recommendation}`
        ).join("\n");
        const checklist = (a?.findings ?? [])
          .filter((f: any) => (f.severity || "").toLowerCase() !== "low")
          .map((f: any) => `- [ ] ${f.recommendation}`)
          .join("\n");

        const reply = [
          `### 🔍 Photo Audit – Risk: **${a?.risk_level || "Medium"}**`,
          a?.summary || "",
          findings ? `\n**Findings:**\n${findings}` : "",
          checklist ? `\n**Your action checklist:**\n${checklist}` : "",
          text ? `\n*You also asked: "${text}"* — ask me follow-ups about this room and I'll guide you.` : `\nAsk me follow-up questions about this room, or upload another photo of a different area.`,
        ].filter(Boolean).join("\n");

        setMessages((p) => [...p, { role: "assistant", content: reply }]);
      } else {
        const sysExtra = profile ? `User profile: ${profile}.` : "";
        const r = await callFn<{ content: string }>("guardian-chat", {
          messages: [
            ...(sysExtra ? [{ role: "system" as const, content: sysExtra }] : []),
            ...next.map((m) => ({ role: m.role, content: m.content })),
          ],
          location,
        });
        setMessages((p) => [...p, { role: "assistant", content: r.content || "(no response)" }]);
      }
    } catch (e: any) {
      toast.error(e.message);
      setMessages((p) => [...p, { role: "assistant", content: `⚠️ ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  // Handle preset prompt from quick actions / external
  useEffect(() => {
    if (presetPrompt) {
      sendMessage(presetPrompt);
      onPresetConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetPrompt]);

  const onPickFile = (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image too large (max 8MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPendingImage({ dataUrl: reader.result as string, name: file.name });
    reader.readAsDataURL(file);
  };

  const submit = () => {
    if (loading) return;
    if (!input.trim() && !pendingImage) return;
    sendMessage(input.trim() || (pendingImage ? "Audit this photo for security issues." : ""), pendingImage);
  };

  return (
    <Card className="panel p-0 flex flex-col h-[calc(100vh-9rem)]">
      <div className="flex items-center justify-between px-5 py-3 border-b">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <span className="font-mono tracking-wider text-sm">GUARDIAN CHAT</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setMessages([])} disabled={messages.length === 0}>
          <Trash2 className="h-4 w-4 mr-1" /> Clear
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <Shield className="h-16 w-16 text-primary/30 mb-3" />
            <h3 className="text-lg font-bold mb-1">Hi, I'm Guardian.</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Ask me anything about home safety, or upload a photo of any room and I'll audit it for risks.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-w-2xl w-full">
              {QUICK_ACTIONS.map((q) => {
                const Icon = q.icon;
                return (
                  <button
                    key={q.label}
                    onClick={() => sendMessage(q.prompt)}
                    className="flex items-center gap-2 text-left px-3 py-2.5 rounded-md text-sm border border-border hover:border-primary hover:bg-primary/10 transition"
                  >
                    <Icon className="h-4 w-4 text-primary shrink-0" />
                    <span>{q.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "assistant" && (
              <div className="h-8 w-8 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center shrink-0">
                <Shield className="h-4 w-4 text-primary" />
              </div>
            )}
            <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
              {m.image && (
                <img src={m.image} alt="upload" className="rounded-lg mb-2 max-h-64 w-auto" />
              )}
              {m.role === "assistant" ? (
                <div className="prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              ) : m.content}
            </div>
            {m.role === "user" && (
              <div className="h-8 w-8 rounded-full bg-secondary border flex items-center justify-center shrink-0">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 justify-start">
            <div className="h-8 w-8 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center shrink-0">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <div className="bg-secondary rounded-2xl px-4 py-3 text-sm flex gap-1.5">
              <span className="h-2 w-2 bg-primary rounded-full animate-blink" style={{ animationDelay: "0ms" }} />
              <span className="h-2 w-2 bg-primary rounded-full animate-blink" style={{ animationDelay: "200ms" }} />
              <span className="h-2 w-2 bg-primary rounded-full animate-blink" style={{ animationDelay: "400ms" }} />
            </div>
          </div>
        )}
      </div>

      {pendingImage && (
        <div className="px-3 pt-2 flex items-center gap-2 border-t">
          <div className="relative">
            <img src={pendingImage.dataUrl} alt="" className="h-14 w-14 rounded object-cover border" />
            <button
              onClick={() => setPendingImage(null)}
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-danger text-danger-foreground flex items-center justify-center"
              aria-label="Remove image"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="text-xs text-muted-foreground">{pendingImage.name}</div>
        </div>
      )}

      <form className="border-t p-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickFile(f); e.currentTarget.value = ""; }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          title="Upload photo"
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
        <Input
          placeholder={pendingImage ? "Add a note (optional)…" : "Ask Guardian, or upload a photo to audit a room…"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <Button type="submit" disabled={loading || (!input.trim() && !pendingImage)}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </Card>
  );
}
