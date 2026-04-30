import { generateGeminiText, type GeminiMessage } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VISION_PROMPT = `Analyze this photo for home security issues. Look for unlocked windows or doors, poor lighting, missing door chain/deadbolt, exposed wires, visible valuables, unsecured entry points, and safety hazards.

Return STRICT JSON ONLY with this exact shape, no markdown and no fences:
{
  "risk_level": "Low" | "Medium" | "High",
  "summary": "one sentence overview",
  "findings": [
    { "issue": "...", "severity": "Low" | "Medium" | "High", "recommendation": "..." }
  ]
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

    let audit: unknown = null;
    try {
      const cleaned = content.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      audit = JSON.parse(match ? match[0] : cleaned);
    } catch {
      audit = { risk_level: "Medium", summary: content.slice(0, 200), findings: [] };
    }

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
