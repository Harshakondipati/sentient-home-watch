// Guardian AI - Vision edge function
// Sends an image (base64 data URL) to Gemini via Lovable AI Gateway for security analysis.
// temperature 0.3 keeps the audit consistent and factual.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VISION_PROMPT = `Analyze this photo for home security issues. Look for: unlocked windows or doors, poor lighting, no door chain/deadbolt visible, exposed wires, valuables left visible, unsecured entry points, anything that could be a safety hazard.

Return your analysis as STRICT JSON ONLY with this exact shape (no markdown, no fences):
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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { imageDataUrl, followUp, history } = await req.json();
    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return new Response(JSON.stringify({ error: "imageDataUrl required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build messages — initial audit OR follow-up Q&A
    const userContent = followUp
      ? [
          { type: "text", text: followUp },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ]
      : [
          { type: "text", text: VISION_PROMPT },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ];

    const messages = [
      { role: "system", content: "You are Guardian, a home security expert AI." },
      ...(Array.isArray(history) ? history.slice(-6) : []),
      { role: "user", content: userContent },
    ];

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        temperature: 0.3,
        top_p: 0.85,
        max_tokens: 1500,
      }),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached. Try again shortly." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const t = await resp.text();
      console.error("Vision gateway error:", resp.status, t);
      return new Response(JSON.stringify({ error: `AI gateway error (${resp.status})` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "";

    if (followUp) {
      return new Response(JSON.stringify({ content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try to extract JSON for the audit
    let audit: unknown = null;
    try {
      const cleaned = content.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      audit = JSON.parse(match ? match[0] : cleaned);
    } catch {
      audit = { risk_level: "Medium", summary: content.slice(0, 200), findings: [] };
    }
    return new Response(JSON.stringify({ audit, raw: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("guardian-vision error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
