// User-facing settings stored in localStorage (no server, no auth).
const KEY = "guardian_settings_v2";

export interface GuardianSettings {
  // Home profile
  homeName: string;
  city: string;
  residents: number;
  hasKids: boolean;
  hasPets: boolean;
  // Notification prefs
  notifyLevels: { low: boolean; medium: boolean; high: boolean };
  quietHoursEnabled: boolean;
  quietStart: string; // "22:00"
  quietEnd: string;   // "07:00"
  // Appearance
  units: "metric" | "imperial";
  // Presence — when "home", motion/door alerts are suppressed (owner is moving around)
  presence: "home" | "away";
  // Telegram link (chatId stored after user runs /start with our shared bot)
  telegramChatId: string;
}

const defaults: GuardianSettings = {
  homeName: "My Home",
  city: "",
  residents: 1,
  hasKids: false,
  hasPets: false,
  notifyLevels: { low: false, medium: true, high: true },
  quietHoursEnabled: false,
  quietStart: "22:00",
  quietEnd: "07:00",
  units: "metric",
  presence: "home",
  telegramChatId: "",
};

export function loadSettings(): GuardianSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export function saveSettings(s: GuardianSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent("guardian-settings-changed"));
}

// Public bot username (safe to expose)
export const TELEGRAM_BOT_USERNAME = "guardiannaibot";
