import { useEffect, useState } from "react";
import { GuardianSidebar, TabKey } from "@/components/GuardianSidebar";
import { GuardianHeader } from "@/components/GuardianHeader";
import { useSensorSimulation } from "@/hooks/useSensorSimulation";
import { DashboardTab } from "@/components/tabs/DashboardTab";
import { ChatTab } from "@/components/tabs/ChatTab";
import { PhotoAuditTab } from "@/components/tabs/PhotoAuditTab";
import { SensorsTab } from "@/components/tabs/SensorsTab";
import { DogTab } from "@/components/tabs/DogTab";
import { BabyTab } from "@/components/tabs/BabyTab";
import { NewsTab } from "@/components/tabs/NewsTab";
import { ChecklistTab } from "@/components/tabs/ChecklistTab";
import { SettingsTab } from "@/components/tabs/SettingsTab";
import { callFn } from "@/lib/api";
import { useSettings } from "@/hooks/useSettings";
import { toast } from "sonner";

interface Geo { city?: string; country?: string; lat?: number; lon?: number; }

const Index = () => {
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [geo, setGeo] = useState<Geo>({});
  const [weatherCondition, setWeatherCondition] = useState<string | undefined>();
  const [chatPreset, setChatPreset] = useState<string | null>(null);
  const settings = useSettings();

  // Telegram alert dispatcher (also used by SensorsTab — both can fire; dedup is via id)
  const handleAlert = (a: any) => {
    if (!settings.telegramBotToken || !settings.telegramChatId) return;
    callFn("telegram-alert", {
      botToken: settings.telegramBotToken,
      chatId: settings.telegramChatId,
      message: `🚨 <b>Guardian AI</b>\n${a.message}\nLevel: ${a.level}\n${new Date(a.ts).toLocaleTimeString()}`,
    }).catch(() => {});
  };

  const { readings, alerts, threat, trigger } = useSensorSimulation(handleAlert);

  // Detect approximate location once on load
  useEffect(() => {
    callFn<Geo>("geolocate")
      .then(setGeo)
      .catch(() => { /* silent — non-critical */ });
  }, []);

  // Fetch weather condition once we have coords (used by Checklist)
  useEffect(() => {
    if (!geo.lat || !geo.lon) return;
    callFn<{ weather: any }>("weather", { lat: geo.lat, lon: geo.lon })
      .then((d) => setWeatherCondition(d.weather?.description))
      .catch(() => {});
  }, [geo.lat, geo.lon]);

  const askChat = (prompt: string) => {
    setChatPreset(prompt);
    setTab("chat");
  };

  const locationLabel = geo.city ? `${geo.city}${geo.country ? ", " + geo.country : ""}` : undefined;

  return (
    <div className="min-h-screen flex w-full">
      <GuardianSidebar active={tab} onChange={setTab} />
      <div className="flex-1 flex flex-col min-w-0">
        <GuardianHeader threat={threat} location={locationLabel} />
        <main className="flex-1 px-6 py-6 overflow-x-hidden">
          {tab === "dashboard" && (
            <DashboardTab readings={readings} alerts={alerts} threat={threat} location={locationLabel} lat={geo.lat} lon={geo.lon} onAskChat={askChat} />
          )}
          {tab === "chat" && (
            <ChatTab presetPrompt={chatPreset} onPresetConsumed={() => setChatPreset(null)} location={locationLabel} />
          )}
          {tab === "photo" && <PhotoAuditTab />}
          {tab === "sensors" && <SensorsTab readings={readings} alerts={alerts} trigger={trigger} />}
          {tab === "dog" && <DogTab location={locationLabel} />}
          {tab === "baby" && <BabyTab location={locationLabel} />}
          {tab === "news" && <NewsTab location={locationLabel} />}
          {tab === "checklist" && <ChecklistTab readings={readings} weatherCondition={weatherCondition} location={locationLabel} />}
          {tab === "settings" && <SettingsTab />}
        </main>
      </div>
    </div>
  );
};

export default Index;
