import { Activity, MessageSquare, Newspaper, Settings, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabKey = "chat" | "sensors" | "news" | "settings";

const ITEMS: { key: TabKey; label: string; icon: any }[] = [
  { key: "chat", label: "Guardian", icon: MessageSquare },
  { key: "sensors", label: "Sensors", icon: Activity },
  { key: "news", label: "News", icon: Newspaper },
  { key: "settings", label: "Settings", icon: Settings },
];

interface Props {
  active: TabKey;
  onChange: (k: TabKey) => void;
}

export function GuardianSidebar({ active, onChange }: Props) {
  return (
    <aside className="w-60 shrink-0 border-r border-border bg-sidebar flex flex-col">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <div className="h-9 w-9 rounded-lg bg-primary/15 border border-primary/40 flex items-center justify-center">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div>
          <div className="font-bold tracking-tight">Guardian AI</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Home Security</div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {ITEMS.map((it) => {
          const Icon = it.icon;
          const isActive = active === it.key;
          return (
            <button
              key={it.key}
              onClick={() => onChange(it.key)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent"
              )}
            >
              <Icon className="h-4 w-4" />
              {it.label}
            </button>
          );
        })}
      </nav>
      <div className="px-4 py-3 border-t border-border text-[10px] text-muted-foreground font-mono">
        v2 · INT428 Project
      </div>
    </aside>
  );
}
