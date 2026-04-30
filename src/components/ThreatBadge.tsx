import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { ThreatLevel, threatGlow } from "@/lib/threat";

interface Props {
  level: ThreatLevel;
  size?: "sm" | "lg";
  reason?: string;
}

export function ThreatBadge({ level, size = "sm", reason }: Props) {
  const Icon = level === "SECURE" ? ShieldCheck : level === "CAUTION" ? ShieldAlert : ShieldX;
  const colorClass =
    level === "SECURE" ? "bg-safe text-safe-foreground" :
    level === "CAUTION" ? "bg-caution text-caution-foreground" :
    "bg-danger text-danger-foreground";
  const text = level;

  if (size === "lg") {
    return (
      <div className={`inline-flex flex-col items-center gap-3 px-8 py-6 rounded-2xl ${colorClass} ${threatGlow(level)}`}>
        <div className="flex items-center gap-3">
          <Icon className="h-10 w-10" />
          <span className="font-mono font-bold text-3xl tracking-widest">{text}</span>
        </div>
        {reason && <span className="text-sm opacity-90 font-medium">{reason}</span>}
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md ${colorClass} ${threatGlow(level)}`}>
      <Icon className="h-4 w-4" />
      <span className="font-mono font-bold text-xs tracking-wider">{text}</span>
    </div>
  );
}
