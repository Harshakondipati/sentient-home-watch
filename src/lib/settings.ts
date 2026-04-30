// Settings stored in localStorage (Telegram credentials + AI generation params)
const KEY = "guardian_settings_v1";

export interface GuardianSettings {
  telegramBotToken: string;
  telegramChatId: string;
  temperature: number;
  topP: number;
}

const defaults: GuardianSettings = {
  telegramBotToken: "",
  telegramChatId: "",
  temperature: 0.3,
  topP: 0.85,
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
