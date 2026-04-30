import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Loader2, Upload, Send, Sparkles } from "lucide-react";
import { callFn } from "@/lib/api";
import { toast } from "sonner";
import { severityClass } from "@/lib/threat";
import ReactMarkdown from "react-markdown";

interface Audit {
  risk_level: "Low" | "Medium" | "High";
  summary: string;
  findings: { issue: string; severity: string; recommendation: string }[];
}

export function PhotoAuditTab() {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [followInput, setFollowInput] = useState("");
  const [followLoading, setFollowLoading] = useState(false);
  const [followLog, setFollowLog] = useState<{ q: string; a: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Please upload an image."); return; }
    if (file.size > 4 * 1024 * 1024) { toast.error("Image must be under 4MB."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(reader.result as string);
      setAudit(null);
      setFollowLog([]);
    };
    reader.readAsDataURL(file);
  };

  const analyze = async () => {
    if (!imageDataUrl) return;
    setAnalyzing(true);
    try {
      const r = await callFn<{ audit: Audit }>("guardian-vision", { imageDataUrl });
      setAudit(r.audit);
    } catch (e: any) { toast.error(e.message); }
    finally { setAnalyzing(false); }
  };

  const ask = async () => {
    if (!imageDataUrl || !followInput.trim()) return;
    const q = followInput.trim();
    setFollowInput("");
    setFollowLoading(true);
    try {
      const r = await callFn<{ content: string }>("guardian-vision", { imageDataUrl, followUp: q });
      setFollowLog((p) => [...p, { q, a: r.content }]);
    } catch (e: any) { toast.error(e.message); }
    finally { setFollowLoading(false); }
  };

  return (
    <div className="space-y-6">
      <Card className="panel p-6">
        <h2 className="text-sm font-mono tracking-wider text-muted-foreground mb-4">PHOTO AUDIT</h2>

        {!imageDataUrl ? (
          <div
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-border hover:border-primary rounded-lg p-12 text-center cursor-pointer transition"
          >
            <Camera className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
            <div className="font-medium">Drop a photo here or click to upload</div>
            <div className="text-sm text-muted-foreground mt-1">A room, doorway, window, or entrance — any photo works.</div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <img src={imageDataUrl} alt="Upload preview" className="w-full rounded-lg border" />
              <div className="flex gap-2 mt-3">
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-1" /> Replace
                </Button>
                <Button onClick={analyze} disabled={analyzing}>
                  {analyzing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing…</> : <><Sparkles className="h-4 w-4 mr-2" /> Analyze Security</>}
                </Button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
              </div>
            </div>

            <div>
              {!audit && !analyzing && (
                <div className="text-sm text-muted-foreground">Click "Analyze Security" to run a Guardian audit on this photo.</div>
              )}
              {analyzing && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Guardian is inspecting your photo…</div>
              )}
              {audit && (
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`px-3 py-1 rounded font-mono text-xs border ${severityClass(audit.risk_level)}`}>
                      RISK: {audit.risk_level?.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm mb-3">{audit.summary}</p>
                  <div className="space-y-2">
                    {audit.findings?.map((f, i) => (
                      <div key={i} className="border border-border rounded-md p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-medium text-sm">{f.issue}</div>
                          <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-mono border ${severityClass(f.severity)}`}>{f.severity?.toUpperCase()}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">→ {f.recommendation}</div>
                      </div>
                    ))}
                    {(!audit.findings || audit.findings.length === 0) && (
                      <div className="text-sm text-safe">No major issues detected. ✓</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {audit && (
        <Card className="panel p-5">
          <h3 className="text-sm font-mono tracking-wider text-muted-foreground mb-3">ASK ABOUT THIS PHOTO</h3>
          <div className="space-y-3 mb-3">
            {followLog.map((l, i) => (
              <div key={i} className="space-y-1">
                <div className="text-sm font-medium text-primary">Q: {l.q}</div>
                <div className="prose prose-invert prose-sm max-w-none"><ReactMarkdown>{l.a}</ReactMarkdown></div>
              </div>
            ))}
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(); }}>
            <Input placeholder="e.g. How can I improve the lighting here?" value={followInput} onChange={(e) => setFollowInput(e.target.value)} disabled={followLoading} />
            <Button type="submit" disabled={followLoading || !followInput.trim()}>
              {followLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
