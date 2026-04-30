// Guardian AI - Chat edge function
// Calls Lovable AI Gateway (google/gemini-2.5-flash) with full conversation history.
// We use temperature 0.3 + top_p 0.85 for factual, consistent security advice.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are Guardian, an expert home security AI assistant. You have deep knowledge of physical security, child safety, pet safety, intruder prevention, environmental hazards, and emergency response.

Rules:
- Always give specific, actionable advice. Never vague responses.
- Prioritize safety above all else.
- When analyzing sensor data or photos, be precise about what you see and what the risk level is (Low / Medium / High).
- Keep responses concise — 2-4 sentences for chat, bullet points for audits.
- If a situation is genuinely dangerous, say so clearly and recommend calling emergency services.
- You remember the conversation history within this session.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { messages, location, temperature = 0.3, topP = 0.85 } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages must be an array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sysContent = location
      ? `${SYSTEM_PROMPT}\n\nThe user is located in ${location}. Tailor advice to that region when relevant.`
      : SYSTEM_PROMPT;

    // Keep last 10 messages for memory
    const trimmed = messages.slice(-10);

    // Lovable AI request — temperature 0.3 (low) for deterministic security advice;
    // top_p 0.85 keeps moderate vocabulary range.
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: sysContent }, ...trimmed],
        temperature,
        top_p: topP,
        max_tokens: 1000,
      }),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached. Please wait and try again." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds to your Lovable workspace." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const t = await resp.text();
      console.error("Gateway error:", resp.status, t);
      return new Response(JSON.stringify({ error: `AI gateway error (${resp.status})` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("guardian-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
