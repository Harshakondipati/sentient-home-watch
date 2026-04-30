import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Eye, EyeOff, RotateCcw, Save } from "lucide-react";
import { loadSettings, saveSettings } from "@/lib/settings";
import { toast } from "sonner";

export function SettingsTab() {
  const [s, setS] = useState(loadSettings());
  const [showToken, setShowToken] = useState(false);

  const update = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((p) => ({ ...p, [k]: v }));

  const persist = () => {
    saveSettings(s);
    toast.success("Settings saved.");
  };

  const reset = () => {
    const def = { telegramBotToken: "", telegramChatId: "", temperature: 0.3, topP: 0.85 };
    setS(def);
    saveSettings(def);
    toast.success("Settings reset to defaults.");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Card className="panel p-6 space-y-4">
        <div>
          <h2 className="font-bold text-lg">Telegram Notifications</h2>
          <p className="text-sm text-muted-foreground">Get sensor alerts pushed to your phone via a Telegram bot.</p>
        </div>
        <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal pl-5">
          <li>Open Telegram → message <span className="font-mono text-primary">@BotFather</span> → <span className="font-mono">/newbot</span> → copy the bot token.</li>
          <li>Message your new bot at least once.</li>
          <li>Open <span className="font-mono text-primary">https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</span> in a browser → find <span className="font-mono">"chat":&#123;"id": 123…&#125;</span>.</li>
          <li>Paste both values here, save, and use the "Test Telegram" button on the Sensors tab.</li>
        </ol>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Bot Token</Label>
            <div className="flex gap-2 mt-2">
              <Input type={showToken ? "text" : "password"} value={s.telegramBotToken} onChange={(e) => update("telegramBotToken", e.target.value)} placeholder="123456:ABC-DEF…" />
              <Button type="button" variant="outline" size="icon" onClick={() => setShowToken((v) => !v)}>
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div>
            <Label>Chat ID</Label>
            <Input value={s.telegramChatId} onChange={(e) => update("telegramChatId", e.target.value)} placeholder="123456789" className="mt-2" />
          </div>
        </div>
      </Card>

      <Card className="panel p-6 space-y-4">
        <div>
          <h2 className="font-bold text-lg">AI Generation Parameters</h2>
          <p className="text-sm text-muted-foreground">Lower temperature = more consistent security advice. Higher = more creative responses.</p>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Temperature</Label>
            <span className="font-mono text-sm text-primary">{s.temperature.toFixed(2)}</span>
          </div>
          <Slider value={[s.temperature]} min={0} max={1} step={0.05} onValueChange={(v) => update("temperature", v[0])} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Top-p</Label>
            <span className="font-mono text-sm text-primary">{s.topP.toFixed(2)}</span>
          </div>
          <Slider value={[s.topP]} min={0} max={1} step={0.05} onValueChange={(v) => update("topP", v[0])} />
        </div>
        <div className="text-xs text-muted-foreground border border-border rounded-md p-3 bg-muted/40">
          <strong className="text-foreground">Default: 0.3 / 0.85.</strong> These values were chosen for the security domain so Guardian gives factual, consistent, deterministic advice rather than creative variations.
        </div>
      </Card>

      <Card className="panel p-6">
        <h2 className="font-bold text-lg mb-2">AI Provider</h2>
        <p className="text-sm text-muted-foreground mb-2">All AI calls (chat, vision, summaries, audits) run through the secured backend using Lovable AI / Gemini. No API keys needed in the browser — your conversation never exposes credentials.</p>
        <div className="text-xs font-mono text-primary">model: google/gemini-2.5-flash</div>
      </Card>

      <div className="flex gap-2">
        <Button onClick={persist}><Save className="h-4 w-4 mr-2" /> Save Settings</Button>
        <Button variant="outline" onClick={reset}><RotateCcw className="h-4 w-4 mr-2" /> Reset to defaults</Button>
      </div>
    </div>
  );
}
