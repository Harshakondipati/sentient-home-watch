import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RotateCcw, Save, Send, MessageCircle, Trash2, ExternalLink, Home, LogOut } from "lucide-react";
import { loadSettings, saveSettings, GuardianSettings, TELEGRAM_BOT_USERNAME } from "@/lib/settings";
import { toast } from "sonner";
import { callFn } from "@/lib/api";

export function SettingsTab() {
  const [s, setS] = useState<GuardianSettings>(loadSettings());

  const update = <K extends keyof GuardianSettings>(k: K, v: GuardianSettings[K]) =>
    setS((p) => ({ ...p, [k]: v }));

  const persist = () => {
    saveSettings(s);
    toast.success("Settings saved.");
  };

  const reset = () => {
    localStorage.removeItem("guardian_settings_v2");
    setS(loadSettings());
    toast.success("Settings reset to defaults.");
  };

  const clearChatHistory = () => {
    // Chat is in-memory; this just confirms user intent. Future: clear localStorage if persisted.
    toast.success("Chat history cleared on next refresh.");
  };

  const testTelegram = async () => {
    if (!s.telegramChatId) {
      toast.error("Connect your Telegram first.");
      return;
    }
    try {
      await callFn("telegram-alert", {
        chatId: s.telegramChatId,
        message: `✅ <b>Guardian AI</b>\nTelegram is connected. You'll receive alerts here.`,
      });
      toast.success("Test message sent to Telegram!");
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* HOME PROFILE */}
      <Card className="panel p-6 space-y-4">
        <div>
          <h2 className="font-bold text-lg">🏠 Home Profile</h2>
          <p className="text-sm text-muted-foreground">Helps Guardian personalize advice for your home.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Home name</Label>
            <Input className="mt-2" value={s.homeName} onChange={(e) => update("homeName", e.target.value)} placeholder="My Home" />
          </div>
          <div>
            <Label>City</Label>
            <Input className="mt-2" value={s.city} onChange={(e) => update("city", e.target.value)} placeholder="(auto-detected if empty)" />
          </div>
          <div>
            <Label>Number of residents</Label>
            <Input className="mt-2" type="number" min={1} max={20} value={s.residents}
              onChange={(e) => update("residents", Math.max(1, parseInt(e.target.value || "1")))} />
          </div>
          <div className="flex items-center gap-6 pt-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={s.hasKids} onCheckedChange={(v) => update("hasKids", v)} />
              <span className="text-sm">Has children</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={s.hasPets} onCheckedChange={(v) => update("hasPets", v)} />
              <span className="text-sm">Has pets</span>
            </label>
          </div>
        </div>
      </Card>

      {/* NOTIFICATIONS */}
      <Card className="panel p-6 space-y-4">
        <div>
          <h2 className="font-bold text-lg">🔔 Notification Preferences</h2>
          <p className="text-sm text-muted-foreground">Choose which alerts get pushed to your Telegram.</p>
        </div>
        <div className="space-y-2">
          {(["low", "medium", "high"] as const).map((lvl) => (
            <label key={lvl} className="flex items-center gap-3 cursor-pointer">
              <Switch
                checked={s.notifyLevels[lvl]}
                onCheckedChange={(v) => update("notifyLevels", { ...s.notifyLevels, [lvl]: v })}
              />
              <span className="text-sm capitalize">{lvl} severity alerts</span>
            </label>
          ))}
        </div>
        <div className="border-t pt-4">
          <label className="flex items-center gap-3 cursor-pointer mb-3">
            <Switch checked={s.quietHoursEnabled} onCheckedChange={(v) => update("quietHoursEnabled", v)} />
            <span className="text-sm font-medium">Quiet hours (no notifications)</span>
          </label>
          {s.quietHoursEnabled && (
            <div className="grid grid-cols-2 gap-3 pl-12">
              <div>
                <Label className="text-xs">Start</Label>
                <Input type="time" value={s.quietStart} onChange={(e) => update("quietStart", e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">End</Label>
                <Input type="time" value={s.quietEnd} onChange={(e) => update("quietEnd", e.target.value)} className="mt-1" />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* TELEGRAM */}
      <Card className="panel p-6 space-y-4">
        <div>
          <h2 className="font-bold text-lg">💬 Connect Telegram</h2>
          <p className="text-sm text-muted-foreground">
            Chat with Guardian and receive alerts on your phone. You can do everything you do here, right from Telegram.
          </p>
        </div>

        {s.telegramChatId ? (
          <div className="p-3 rounded-md border border-safe/40 bg-safe/10 text-sm flex items-center justify-between">
            <div>
              <div className="font-medium text-safe">✓ Telegram connected</div>
              <div className="text-xs text-muted-foreground font-mono mt-1">Chat ID: {s.telegramChatId}</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={testTelegram}><Send className="h-3.5 w-3.5 mr-1" /> Test</Button>
              <Button size="sm" variant="ghost" onClick={() => update("telegramChatId", "")}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal pl-5">
              <li>Open our bot on Telegram and tap <span className="font-mono text-primary">/start</span>.</li>
              <li>The bot will reply with your <strong>chat ID</strong>.</li>
              <li>Paste it below and save.</li>
            </ol>
            <a
              href={`https://t.me/${TELEGRAM_BOT_USERNAME}?start=connect`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
            >
              <MessageCircle className="h-4 w-4" /> Open @{TELEGRAM_BOT_USERNAME}
              <ExternalLink className="h-3 w-3" />
            </a>
            <div>
              <Label>Your Telegram chat ID</Label>
              <Input className="mt-2" value={s.telegramChatId} onChange={(e) => update("telegramChatId", e.target.value)} placeholder="e.g. 123456789" />
            </div>
          </div>
        )}
      </Card>

      {/* APPEARANCE & PRIVACY */}
      <Card className="panel p-6 space-y-4">
        <div>
          <h2 className="font-bold text-lg">🎨 Appearance & Privacy</h2>
        </div>
        <div>
          <Label>Temperature units</Label>
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant={s.units === "metric" ? "default" : "outline"} onClick={() => update("units", "metric")}>°C (Metric)</Button>
            <Button size="sm" variant={s.units === "imperial" ? "default" : "outline"} onClick={() => update("units", "imperial")}>°F (Imperial)</Button>
          </div>
        </div>
        <div className="border-t pt-4">
          <Button variant="outline" size="sm" onClick={clearChatHistory}>
            <Trash2 className="h-4 w-4 mr-2" /> Clear chat history
          </Button>
          <p className="text-xs text-muted-foreground mt-2">Your photos and chat are never stored on a server — they live only in this browser.</p>
        </div>
      </Card>

      <div className="flex gap-2 sticky bottom-4">
        <Button onClick={persist}><Save className="h-4 w-4 mr-2" /> Save settings</Button>
        <Button variant="outline" onClick={reset}><RotateCcw className="h-4 w-4 mr-2" /> Reset</Button>
      </div>
    </div>
  );
}
