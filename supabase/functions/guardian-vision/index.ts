import { generateGeminiText, type GeminiMessage } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VISION_PROMPT = `Analyze this photo for home security issues. Look for unlocked windows or doors, poor lighting, missing door chain/deadbolt, exposed wires, visible valuables, unsecured entry points, fire/electrical risks, child or pet hazards, trip/fall hazards, and anything that affects emergency readiness.

Return STRICT JSON ONLY with this exact shape, no markdown and no fences:
{
  "risk_level": "Low" | "Medium" | "High",
  "summary": "2-3 sentence overview of the room's safety posture",
  "visible_observations": ["specific thing visible in the image", "..."],
  "positive_signals": ["what looks safe or well maintained", "..."],
  "findings": [
    { "area": "Door / Windows / Electrical / Visibility / General", "issue": "...", "severity": "Low" | "Medium" | "High", "recommendation": "...", "why_it_matters": "..." }
  ],
  "priority_actions": ["highest priority action", "..."],
  "follow_up_checks": ["what the user should inspect manually because it is not visible", "..."],
  "confidence": "Low" | "Medium" | "High"
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const { imageDataUrl, followUp, history } = await req.json();
    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return json({ error: "imageDataUrl required" }, 400);
    }

    const userContent = followUp
      ? [
          { type: "text" as const, text: followUp },
          { type: "image_url" as const, image_url: { url: imageDataUrl } },
        ]
      : [
          { type: "text" as const, text: VISION_PROMPT },
          { type: "image_url" as const, image_url: { url: imageDataUrl } },
        ];

    const messages: GeminiMessage[] = [
      ...(Array.isArray(history) ? history.slice(-6) : []),
      { role: "user", content: userContent },
    ];

    const content = await generateGeminiText({
      apiKey: GEMINI_API_KEY,
      model: "gemini-2.5-flash",
      system: "You are Guardian, a home security expert AI.",
      messages,
      temperature: 0.3,
      topP: 0.85,
      maxOutputTokens: 1500,
    });

    if (followUp) return json({ content });

    const audit = parseAudit(content);

    return json({ audit, raw: content });
  } catch (e) {
    console.error("guardian-vision error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseAudit(content: string) {
  const cleaned = stripMarkdownFence(content);
  const candidates = [
    cleaned,
    extractJsonObject(cleaned),
    stripMarkdownFence(unquoteJsonString(cleaned)),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      return normalizeAudit(parsed);
    } catch {
      // Try next representation.
    }
  }

  return normalizeAudit({
    risk_level: inferRiskLevel(cleaned),
    summary: cleaned.replace(/\s+/g, " ").slice(0, 600),
    visible_observations: [],
    positive_signals: [],
    findings: [],
    priority_actions: ["Review the image manually; the AI response could not be parsed into a structured audit."],
    follow_up_checks: ["Check door/window lock status, electrical outlets, smoke/CO detector placement, and escape path clearance."],
    confidence: "Low",
  });
}

function normalizeAudit(raw: any) {
  const findings = Array.isArray(raw?.findings) ? raw.findings : [];
  return {
    risk_level: normalizeRisk(raw?.risk_level),
    summary: typeof raw?.summary === "string" ? raw.summary : "Audit completed. Review the sections below for visible risks and follow-up checks.",
    visible_observations: toStringArray(raw?.visible_observations),
    positive_signals: toStringArray(raw?.positive_signals),
    findings: findings.map((finding: any) => ({
      area: typeof finding?.area === "string" ? finding.area : "General",
      issue: typeof finding?.issue === "string" ? finding.issue : "Potential safety concern",
      severity: normalizeRisk(finding?.severity),
      recommendation: typeof finding?.recommendation === "string" ? finding.recommendation : "Inspect this area more closely.",
      why_it_matters: typeof finding?.why_it_matters === "string" ? finding.why_it_matters : "This may affect home safety or emergency readiness.",
    })),
    priority_actions: toStringArray(raw?.priority_actions),
    follow_up_checks: toStringArray(raw?.follow_up_checks),
    confidence: normalizeConfidence(raw?.confidence),
  };
}

function stripMarkdownFence(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function unquoteJsonString(value: string) {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
}

function extractJsonObject(value: string) {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  return start >= 0 && end > start ? value.slice(start, end + 1) : "";
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function normalizeRisk(value: unknown) {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (normalized === "high") return "High";
  if (normalized === "low") return "Low";
  return "Medium";
}

function normalizeConfidence(value: unknown) {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (normalized === "high") return "High";
  if (normalized === "low") return "Low";
  return "Medium";
}

function inferRiskLevel(value: string) {
  const match = value.match(/"risk_level"\s*:\s*"([^"]+)"/i);
  return normalizeRisk(match?.[1]);
}
