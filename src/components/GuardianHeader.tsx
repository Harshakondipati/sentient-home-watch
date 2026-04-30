import { useEffect, useState } from "react";
import { ThreatBadge } from "./ThreatBadge";
import { ThreatLevel } from "@/lib/threat";
import { Shield, Home, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  threat: ThreatLevel;
  location?: string;
  presence: "home" | "away";
  onTogglePresence: () => void;
}

export function GuardianHeader({ threat, location, presence, onTogglePresence }: Props) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const isHome = presence === "home";

  return (
    <header className="sticky top-0 z-30 panel border-b backdrop-blur-md bg-card/70 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Shield className="h-5 w-5 text-primary" />
        <div>
          <h1 className="font-bold text-lg leading-none">Guardian AI</h1>
          <div className="text-[10px] text-muted-foreground font-mono mt-1 tracking-wider">
            HOME SECURITY ASSISTANT {location ? `· ${location.toUpperCase()}` : ""}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant={isHome ? "default" : "outline"}
          onClick={onTogglePresence}
          className={isHome ? "" : "border-warning/50 text-warning hover:text-warning"}
          title={isHome ? "You're home — motion/door alerts suppressed" : "You're away — full monitoring active"}
        >
          {isHome ? <Home className="h-4 w-4 mr-1.5" /> : <LogOut className="h-4 w-4 mr-1.5" />}
          {isHome ? "Home" : "Away"}
        </Button>
        <ThreatBadge level={threat} />
        <div className="font-mono text-sm text-muted-foreground tabular-nums hidden sm:block">
          {now.toLocaleTimeString()}
        </div>
      </div>
    </header>
  );
}
