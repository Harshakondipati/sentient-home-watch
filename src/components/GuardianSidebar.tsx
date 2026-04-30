import { LucideIcon, Shield, MessageSquare, Camera, Activity, Dog, Baby, Newspaper, ListChecks, Settings as SettingsIcon } from "lucide-react";

export type TabKey = "dashboard" | "chat" | "photo" | "sensors" | "dog" | "baby" | "news" | "checklist" | "settings";

export const NAV: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "dashboard", label: "Dashboard", icon: Shield },
  { key: "chat", label: "Chat", icon: MessageSquare },
  { key: "photo", label: "Photo Audit", icon: Camera },
  { key: "sensors", label: "Sensors & Alerts", icon: Activity },
  { key: "dog", label: "Dog Safety", icon: Dog },
  { key: "baby", label: "Baby Safety", icon: Baby },
  { key: "news", label: "Safety News", icon: Newspaper },
  { key: "checklist", label: "Daily Checklist", icon: ListChecks },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

interface Props { active: TabKey; onChange: (k: TabKey) => void; }

export function GuardianSidebar({ active, onChange }: Props) {
  return (
    <aside className="w-60 shrink-0 border-r border-sidebar-border bg-sidebar h-screen sticky top-0 flex flex-col">
      <div className="px-5 py-5 border-b border-sidebar-border flex items-center gap-2">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <div className="font-mono font-bold text-sm tracking-widest text-primary">GUARDIAN</div>
          <div className="text-[10px] text-muted-foreground tracking-[0.3em]">AI · v1.0</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {NAV.map(({ key, label, icon: Icon }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all
                ${isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"}`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
      <div className="p-4 border-t border-sidebar-border">
        <div className="text-[10px] text-muted-foreground font-mono">
          INT428 · AI Essentials
        </div>
      </div>
    </aside>
  );
}
