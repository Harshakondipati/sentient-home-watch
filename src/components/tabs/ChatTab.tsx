import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Shield, Loader2, Trash2, User } from "lucide-react";
import { callFn } from "@/lib/api";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { useSettings } from "@/hooks/useSettings";

type Msg = { role: "user" | "assistant"; content: string };

const QUICK_PROMPTS = [
  "Is my home secure right now?",
  "How do I secure my front door?",
  "What are signs of a break-in attempt?",
  "Create a security routine for me",
];

export interface ChatTabHandle { ask: (q: string) => void; }

interface Props {
  presetPrompt?: string | null;
  onPresetConsumed?: () => void;
  location?: string;
}

export function ChatTab({ presetPrompt, onPresetConsumed, location }: Props) {
  const settings = useSettings();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    const msg: Msg = { role: "user", content: text };
    const next = [...messages, msg];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      // Send last 10 messages as context (history is auto-trimmed server-side too).
      const r = await callFn<{ content: string }>("guardian-chat", {
        messages: next.map((m) => ({ role: m.role, content: m.content })),
        location,
        temperature: settings.temperature,
        topP: settings.topP,
      });
      setMessages((p) => [...p, { role: "assistant", content: r.content || "(no response)" }]);
    } catch (e: any) {
      toast.error(e.message);
      setMessages((p) => [...p, { role: "assistant", content: `⚠️ ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  // Handle preset prompt from Dashboard
  useEffect(() => {
    if (presetPrompt) {
      send(presetPrompt);
      onPresetConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetPrompt]);

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
            <h3 className="text-lg font-bold mb-1">Ask Guardian anything about home security</h3>
            <p className="text-sm text-muted-foreground mb-6">I remember the last 10 messages of our conversation.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-xl">
              {QUICK_PROMPTS.map((q) => (
                <button key={q} onClick={() => send(q)}
                  className="text-left px-3 py-2 rounded-md text-sm border border-border hover:border-primary hover:bg-primary/10 transition">
                  {q}
                </button>
              ))}
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
            <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
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

      <form className="border-t p-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (input.trim() && !loading) send(input.trim()); }}>
        <Input
          placeholder="Ask Guardian about home security…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <Button type="submit" disabled={loading || !input.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </Card>
  );
}
