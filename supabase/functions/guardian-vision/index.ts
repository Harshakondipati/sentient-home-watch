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
}

Keep the response compact:
- visible_observations: max 5 items
- positive_signals: max 4 items
- findings: max 4 items
- priority_actions: max 4 items
- follow_up_checks: max 4 items`;

const ROOM_MEMORY_PROMPT = `Analyze this room image so Guardian can remember the house layout for future home-safety decisions.

Return STRICT JSON ONLY with this exact shape:
{
  "summary": "2-3 sentence summary of the room and what stands out",
  "observed_features": ["major furniture, appliances, windows, doors, stairs, valuables, pet areas, etc"],
  "entry_points": ["doors, windows, balcony access, garage access, or empty if none visible"],
  "typical_risks": ["likely safety or security concerns to monitor in this room over time"],
  "person_visible": true | false,
  "confidence": "Low" | "Medium" | "High"
}`;

const MOTION_DEMO_PROMPT = `You are comparing two images from the same house for a motion-detection demo.

Image 1 is the saved baseline room photo.
Image 2 is the current room photo.

Return STRICT JSON ONLY with this exact shape:
{
  "room_match": true | false,
  "person_detected": true | false,
  "should_alert": true | false,
  "summary": "2-3 sentence explanation of what changed",
  "evidence": ["clear visual reason 1", "clear visual reason 2"],
  "recommended_action": "one concise action",
  "confidence": "Low" | "Medium" | "High"
}

Set should_alert to true only if the current image appears to show a person or meaningful motion-related occupancy change in the same room.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let requestedMode = "audit";
  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const {
      imageDataUrl,
      followUp,
      history,
      analysisMode,
      referenceImageDataUrl,
      roomName,
      roomTags,
      roomNotes,
    } = await req.json();
    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return json({ error: "imageDataUrl required" }, 400);
    }

    const mode = analysisMode === "motion_demo" || analysisMode === "room_memory" ? analysisMode : "audit";
    requestedMode = mode;
    if (mode === "motion_demo" && (!referenceImageDataUrl || typeof referenceImageDataUrl !== "string")) {
      return json({ error: "referenceImageDataUrl required for motion_demo" }, 400);
    }

    const userContent = buildUserContent({
      mode,
      followUp,
      imageDataUrl,
      referenceImageDataUrl,
      roomName,
      roomTags,
      roomNotes,
    });

    const messages: GeminiMessage[] = [
      ...(Array.isArray(history) ? history.slice(-6) : []),
      { role: "user", content: userContent },
    ];

    const content = await generateGeminiText({
      apiKey: GEMINI_API_KEY,
      model: ["gemini-2.5-flash", "gemini-2.0-flash"],
      system: "You are Guardian, a home security expert AI.",
      messages,
      temperature: 0.3,
      topP: 0.85,
      maxOutputTokens: 1500,
    });

    if (mode === "motion_demo") {
      return json({ motionDemo: parseMotionDemo(content), raw: content });
    }

    if (mode === "room_memory") {
      return json({ roomMemory: parseRoomMemory(content), raw: content });
    }

    if (followUp) return json({ content });

    const audit = parseAudit(content);

    return json({ audit, raw: content });
  } catch (e) {
    console.error("guardian-vision error:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message.includes("Gemini API error")) {
      if (requestedMode === "motion_demo") {
        return json({ motionDemo: buildProviderUnavailableMotion(message), raw: "" });
      }
      if (requestedMode === "room_memory") {
        return json({ roomMemory: buildProviderUnavailableRoomMemory(message), raw: "" });
      }
      return json({ audit: buildProviderUnavailableAudit(message), raw: "" });
    }
    return json({ error: message }, 500);
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

  return parsePartialAudit(cleaned);
}

function parseRoomMemory(content: string) {
  const parsed = parseStructuredContent(content);
  return {
    summary: typeof parsed?.summary === "string" ? parsed.summary : "Room saved for future context, but the AI summary could not be fully parsed.",
    observed_features: toStringArray(parsed?.observed_features),
    entry_points: toStringArray(parsed?.entry_points),
    typical_risks: toStringArray(parsed?.typical_risks),
    person_visible: toBoolean(parsed?.person_visible),
    confidence: normalizeConfidence(parsed?.confidence),
  };
}

function parseMotionDemo(content: string) {
  const parsed = parseStructuredContent(content);
  return {
    room_match: toBoolean(parsed?.room_match),
    person_detected: toBoolean(parsed?.person_detected),
    should_alert: toBoolean(parsed?.should_alert),
    summary: typeof parsed?.summary === "string" ? parsed.summary : "Motion demo completed, but the AI explanation could not be fully parsed.",
    evidence: toStringArray(parsed?.evidence),
    recommended_action: typeof parsed?.recommended_action === "string" ? parsed.recommended_action : "Review the room feed and verify whether motion is expected.",
    confidence: normalizeConfidence(parsed?.confidence),
  };
}

function parseStructuredContent(content: string) {
  const cleaned = stripMarkdownFence(content);
  const candidates = [
    cleaned,
    extractJsonObject(cleaned),
    stripMarkdownFence(unquoteJsonString(cleaned)),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try next representation.
    }
  }

  return {};
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

function parsePartialAudit(content: string) {
  return normalizeAudit({
    risk_level: extractStringField(content, "risk_level"),
    summary: extractStringField(content, "summary") || "Audit completed, but the structured response was only partially recovered.",
    visible_observations: extractArrayField(content, "visible_observations"),
    positive_signals: extractArrayField(content, "positive_signals"),
    findings: extractFindings(content),
    priority_actions: extractArrayField(content, "priority_actions"),
    follow_up_checks: extractArrayField(content, "follow_up_checks"),
    confidence: extractStringField(content, "confidence"),
  });
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

function extractStringField(value: string, field: string) {
  const match = value.match(new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`));
  return match?.[1] ?? "";
}

function extractArrayField(value: string, field: string) {
  const startMatch = value.match(new RegExp(`"${field}"\\s*:\\s*\\[`));
  if (!startMatch?.index && startMatch?.index !== 0) return [];
  const start = startMatch.index + startMatch[0].length;
  const end = value.indexOf("]", start);
  const slice = end >= 0 ? value.slice(start, end) : value.slice(start);
  return [...slice.matchAll(/"([^"]+)"/g)].map((match) => match[1]).slice(0, 6);
}

function extractFindings(value: string) {
  const findingsStart = value.match(/"findings"\s*:\s*\[/);
  if (!findingsStart?.index && findingsStart?.index !== 0) return [];
  const start = findingsStart.index + findingsStart[0].length;
  const end = value.indexOf("]", start);
  const slice = end >= 0 ? value.slice(start, end) : value.slice(start);
  const objectMatches = slice.match(/\{[\s\S]*?\}/g) ?? [];

  return objectMatches.slice(0, 4).map((chunk) => ({
    area: extractStringField(chunk, "area") || "General",
    issue: extractStringField(chunk, "issue") || "Potential safety concern",
    severity: extractStringField(chunk, "severity") || "Medium",
    recommendation: extractStringField(chunk, "recommendation") || "Inspect this area more closely.",
    why_it_matters: extractStringField(chunk, "why_it_matters") || "This may affect home safety or emergency readiness.",
  }));
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

function toBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "yes";
  }
  return false;
}

function buildUserContent({
  mode,
  followUp,
  imageDataUrl,
  referenceImageDataUrl,
  roomName,
  roomTags,
  roomNotes,
}: {
  mode: "audit" | "room_memory" | "motion_demo";
  followUp?: string;
  imageDataUrl: string;
  referenceImageDataUrl?: string;
  roomName?: string;
  roomTags?: string[];
  roomNotes?: string;
}) {
  if (mode === "motion_demo") {
    return [
      {
        type: "text" as const,
        text: [
          MOTION_DEMO_PROMPT,
          roomName ? `Room label: ${roomName}` : "",
          Array.isArray(roomTags) && roomTags.length ? `Room tags: ${roomTags.join(", ")}` : "",
          roomNotes ? `Room notes: ${roomNotes}` : "",
        ].filter(Boolean).join("\n"),
      },
      { type: "image_url" as const, image_url: { url: referenceImageDataUrl! } },
      { type: "image_url" as const, image_url: { url: imageDataUrl } },
    ];
  }

  if (mode === "room_memory") {
    return [
      {
        type: "text" as const,
        text: [
          ROOM_MEMORY_PROMPT,
          roomName ? `Room label: ${roomName}` : "",
          Array.isArray(roomTags) && roomTags.length ? `Room tags: ${roomTags.join(", ")}` : "",
          roomNotes ? `Room notes from user: ${roomNotes}` : "",
        ].filter(Boolean).join("\n"),
      },
      { type: "image_url" as const, image_url: { url: imageDataUrl } },
    ];
  }

  return followUp
    ? [
        { type: "text" as const, text: followUp },
        { type: "image_url" as const, image_url: { url: imageDataUrl } },
      ]
    : [
        { type: "text" as const, text: VISION_PROMPT },
        { type: "image_url" as const, image_url: { url: imageDataUrl } },
      ];
}

function buildProviderUnavailableAudit(message: string) {
  const isQuota = message.includes("(429)");
  const isUnavailable = message.includes("(503)");
  const summary = isQuota
    ? "I could not complete the photo audit because the configured Gemini API key has hit its current quota or rate limit. The image was received, but Guardian needs an active Gemini quota to inspect the room visually."
    : isUnavailable
      ? "I could not complete the photo audit because Gemini reported temporary high demand. The image was received, but the AI model was unavailable at the moment of analysis."
      : "I could not complete the photo audit because the AI vision provider returned an error. The image was received, but Guardian could not inspect it visually.";

  return normalizeAudit({
    risk_level: "Medium",
    summary,
    visible_observations: [
      "The image upload reached the Guardian vision backend.",
      "A visual security audit could not be generated until Gemini accepts the request.",
    ],
    positive_signals: [
      "The app, Supabase function, and image upload path are responding.",
      "The failure is isolated to the external Gemini model/quota response.",
    ],
    findings: [
      {
        area: "AI Provider",
        issue: isQuota ? "Gemini quota or rate limit exceeded" : "Gemini model temporarily unavailable",
        severity: "Medium",
        recommendation: isQuota
          ? "Use a Gemini key with available quota or enable billing/increase quota for the current key."
          : "Try again after a short wait; if it repeats, switch to a Gemini key with stable quota.",
        why_it_matters: "Photo audit depends on Gemini vision. Without a successful model response, Guardian cannot identify room-specific hazards.",
      },
    ],
    priority_actions: [
      isQuota
        ? "Check the Gemini API quota/billing status for the configured key."
        : "Retry the photo audit after a short wait.",
      "After quota is available, upload the photo again to get room-specific observations and recommendations.",
    ],
    follow_up_checks: [
      "Manually check door and window locks.",
      "Look for exposed wires, overloaded outlets, blocked exits, valuables visible from outside, and missing smoke/CO detectors.",
      "Upload another angle once Gemini quota is available.",
    ],
    confidence: "Low",
  });
}

function buildProviderUnavailableRoomMemory(message: string) {
  const summary = message.includes("(429)")
    ? "The room image upload worked, but Gemini quota is currently exhausted, so Guardian could not generate a room-memory summary."
    : "The room image upload worked, but the AI provider was unavailable, so Guardian could not generate a room-memory summary.";

  return {
    summary,
    observed_features: [],
    entry_points: [],
    typical_risks: [],
    person_visible: false,
    confidence: "Low",
  };
}

function buildProviderUnavailableMotion(message: string) {
  const summary = message.includes("(429)")
    ? "The motion demo request reached Guardian, but the configured Gemini key is currently quota limited."
    : "The motion demo request reached Guardian, but the AI provider was temporarily unavailable.";

  return {
    room_match: false,
    person_detected: false,
    should_alert: false,
    summary,
    evidence: ["No vision comparison result was available from the AI provider."],
    recommended_action: "Retry the motion demo after the Gemini key is available.",
    confidence: "Low",
  };
}
