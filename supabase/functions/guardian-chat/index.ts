import { generateGeminiText, type GeminiMessage } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are Guardian, an expert home security AI assistant. You have deep knowledge of physical security, child safety, pet safety, intruder prevention, environmental hazards, and emergency response.

Rules:
- Always give specific, actionable advice. Never vague responses.
- Use the provided home context first. If the user asks whether the home is safe, answer from the sensor readings, alert log, profile, weather, presence, and photo audit summaries you were given. Do not ask the user for data that already exists in context.
- If important data is missing from context, state exactly what is missing after giving the best assessment from available data.
- Prioritize safety above all else.
- When analyzing sensor data or photos, be precise about what you see and what the risk level is (Low / Medium / High).
- Keep responses concise: 2-4 sentences for chat, bullet points for audits.
- If a situation is genuinely dangerous, say so clearly and recommend calling emergency services.
- You remember the conversation history within this session.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const { messages, location, homeContext, temperature = 0.3, topP = 0.85 } = await req.json();
    if (!Array.isArray(messages)) {
      return json({ error: "messages must be an array" }, 400);
    }

    const baseSystem = location
      ? `${SYSTEM_PROMPT}\n\nThe user is located in ${location}. Tailor advice to that region when relevant.`
      : SYSTEM_PROMPT;
    const sysContent = homeContext
      ? `${baseSystem}\n\nCURRENT HOME CONTEXT JSON:\n${JSON.stringify(homeContext, null, 2)}`
      : baseSystem;

    const content = await generateGeminiText({
      apiKey: GEMINI_API_KEY,
      model: "gemini-2.5-flash",
      system: sysContent,
      messages: messages.slice(-10) as GeminiMessage[],
      temperature,
      topP,
      maxOutputTokens: 1000,
    });

    return json({ content });
  } catch (e) {
    console.error("guardian-chat error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
