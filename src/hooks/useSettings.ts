import { useEffect, useState } from "react";
import { GuardianSettings, loadSettings } from "@/lib/settings";

export function useSettings() {
  const [settings, setSettings] = useState<GuardianSettings>(() => loadSettings());
  useEffect(() => {
    const handler = () => setSettings(loadSettings());
    window.addEventListener("guardian-settings-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("guardian-settings-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);
  return settings;
}
