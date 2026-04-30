import { useEffect, useState } from "react";
import { ThreatBadge } from "./ThreatBadge";
import { ThreatLevel } from "@/lib/threat";
import { Shield } from "lucide-react";

export function GuardianHeader({ threat, location }: { threat: ThreatLevel; location?: string }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

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
      <div className="flex items-center gap-4">
        <ThreatBadge level={threat} />
        <div className="font-mono text-sm text-muted-foreground tabular-nums">
          {now.toLocaleTimeString()}
        </div>
      </div>
    </header>
  );
}
