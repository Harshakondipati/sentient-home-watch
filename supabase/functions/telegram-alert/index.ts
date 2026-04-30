// Guardian AI - Telegram alert proxy
// Sends a message to a Telegram bot using credentials supplied by the client (saved in Settings).
// We accept the bot token + chat_id from the client because user provides them in-app.
import { corsHeaders } from "@supabase/supabase-js/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { botToken, chatId, message } = await req.json();
    if (!botToken || !chatId || !message) {
      return new Response(JSON.stringify({ error: "botToken, chatId and message required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tResp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
    });
    const data = await tResp.json();
    if (!tResp.ok || !data.ok) {
      return new Response(JSON.stringify({ error: data.description ?? "Telegram error", raw: data }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, message_id: data.result?.message_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("telegram-alert error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
