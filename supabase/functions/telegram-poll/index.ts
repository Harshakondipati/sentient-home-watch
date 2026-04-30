// Telegram bot poller - long-polls getUpdates and processes incoming messages.
// Triggered every minute by pg_cron. Handles:
//  - /start: welcomes user, replies with their chat_id (so they can paste it into the web Settings)
//  - text: chats with Guardian AI (Lovable AI Gemini) using rolling per-chat memory
//  - photo: downloads, runs structured security audit via guardian-vision logic
//
// Rationale for splitting from guardian-chat/guardian-vision: the bot needs side effects
// (DB writes, Telegram replies, file downloads), so it's cleaner to keep it self-contained
// rather than calling sister functions over HTTP.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_RUNTIME_MS = 50_000;
const MIN_REMAINING_MS = 5_000;

const SYSTEM_PROMPT = `You are Guardian, an expert home security AI assistant. Give specific, concise, actionable advice (2-4 sentences). Always prioritize safety. If a situation is genuinely dangerous, recommend calling emergency services. Format with markdown. Telegram supports basic HTML; reply in plain text or simple markdown.`;

const VISION_PROMPT = `Analyze this photo for home security issues (locks, windows, lighting, hazards, choking risks, exposed wires, valuables visible, fall risks).

Return STRICT JSON ONLY (no markdown fences):
{
  "risk_level": "Low" | "Medium" | "High",
  "summary": "one sentence",
  "findings": [{ "issue": "...", "severity": "Low"|"Medium"|"High", "recommendation": "..." }]
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startTime = Date.now();
  const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!TELEGRAM_BOT_TOKEN || !LOVABLE_API_KEY || !SUPABASE_URL || !SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Missing required env vars" }), { status: 500 });
  }

  const supa = createClient(SUPABASE_URL, SERVICE_KEY);
  const tgApi = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

  // Read current offset
  const { data: state, error: stateErr } = await supa
    .from("telegram_bot_state").select("update_offset").eq("id", 1).single();
  if (stateErr) {
    console.error("offset read error:", stateErr);
    return new Response(JSON.stringify({ error: stateErr.message }), { status: 500 });
  }
  let currentOffset: number = state.update_offset;
  let processed = 0;

  while (true) {
    const elapsed = Date.now() - startTime;
    const remaining = MAX_RUNTIME_MS - elapsed;
    if (remaining < MIN_REMAINING_MS) break;
    const timeout = Math.min(45, Math.floor(remaining / 1000) - 5);
    if (timeout < 1) break;

    const r = await fetch(`${tgApi}/getUpdates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offset: currentOffset, timeout, allowed_updates: ["message"] }),
    });
    const j = await r.json();
    if (!r.ok || !j.ok) {
      console.error("getUpdates failed:", j);
      break;
    }
    const updates: any[] = j.result ?? [];
    if (updates.length === 0) continue;

    for (const u of updates) {
      try {
        await handleUpdate(u, supa, tgApi, LOVABLE_API_KEY);
      } catch (e) {
        console.error("handleUpdate failed:", e);
      }
    }
    processed += updates.length;
    const newOffset = Math.max(...updates.map((u) => u.update_id)) + 1;
    await supa.from("telegram_bot_state")
      .update({ update_offset: newOffset, updated_at: new Date().toISOString() })
      .eq("id", 1);
    currentOffset = newOffset;
  }

  return new Response(JSON.stringify({ ok: true, processed, offset: currentOffset }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function handleUpdate(update: any, supa: any, tgApi: string, aiKey: string) {
  const msg = update.message;
  if (!msg) return;
  const chatId: number = msg.chat.id;
  const text: string | undefined = msg.text;
  const photo: any[] | undefined = msg.photo;

  // Ensure session row
  await supa.from("telegram_sessions").upsert({
    chat_id: chatId,
    username: msg.from?.username || null,
    first_name: msg.from?.first_name || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "chat_id" });

  // /start command — onboard
  if (text && text.trim().startsWith("/start")) {
    const first = msg.from?.first_name || "there";
    const welcome = `🛡️ <b>Hi ${first}, I'm Guardian!</b>\n\nI'm your AI home security assistant. You can:\n• Ask me anything about home safety\n• Send me photos of any room → I'll audit it for risks\n• Get alerts when sensors trigger\n\n<b>Your chat ID:</b> <code>${chatId}</code>\nPaste this in the web app's Settings → Connect Telegram to receive sensor alerts here.\n\nTry sending me a photo of your front door 📸`;
    await tgSend(tgApi, chatId, welcome);
    return;
  }

  if (text && text.trim().startsWith("/help")) {
    await tgSend(tgApi, chatId, "💬 Just chat normally, or send a photo of any room to audit it. Use /reset to clear our conversation history.");
    return;
  }

  if (text && text.trim().startsWith("/reset")) {
    await supa.from("telegram_sessions").update({ history: [] }).eq("chat_id", chatId);
    await tgSend(tgApi, chatId, "✓ Conversation history cleared.");
    return;
  }

  // Photo audit
  if (photo && photo.length > 0) {
    await tgSend(tgApi, chatId, "🔍 Analyzing your photo… give me a few seconds.");
    // Largest photo size = last entry
    const fileId = photo[photo.length - 1].file_id;
    const fileR = await fetch(`${tgApi}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    const fileJ = await fileR.json();
    if (!fileJ.ok) {
      await tgSend(tgApi, chatId, "⚠️ Couldn't fetch your photo. Please try again.");
      return;
    }
    const filePath = fileJ.result.file_path;
    const dlUrl = `https://api.telegram.org/file/bot${Deno.env.get("TELEGRAM_BOT_TOKEN")}/${filePath}`;
    const imgR = await fetch(dlUrl);
    const buf = await imgR.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const mime = filePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    const dataUrl = `data:${mime};base64,${b64}`;

    const captionExtra = msg.caption ? `\n\nUser note: "${msg.caption}"` : "";

    // Vision call
    const vResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are Guardian, a home security expert AI." },
          { role: "user", content: [
            { type: "text", text: VISION_PROMPT + captionExtra },
            { type: "image_url", image_url: { url: dataUrl } },
          ]},
        ],
        temperature: 0.3, top_p: 0.85, max_tokens: 1500,
      }),
    });

    if (!vResp.ok) {
      const t = await vResp.text();
      console.error("vision error:", vResp.status, t);
      await tgSend(tgApi, chatId, vResp.status === 429
        ? "⚠️ Too many requests right now. Try again in a minute."
        : vResp.status === 402
          ? "⚠️ AI credits exhausted. Please ask the admin to top up."
          : "⚠️ Audit failed. Try a different photo.");
      return;
    }
    const vJ = await vResp.json();
    const content: string = vJ?.choices?.[0]?.message?.content ?? "";
    let audit: any = {};
    try {
      const cleaned = content.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
      const m = cleaned.match(/\{[\s\S]*\}/);
      audit = JSON.parse(m ? m[0] : cleaned);
    } catch {
      audit = { risk_level: "Medium", summary: content.slice(0, 200), findings: [] };
    }

    // Save
    await supa.from("telegram_audits").insert({
      chat_id: chatId,
      risk_level: audit.risk_level,
      summary: audit.summary,
      findings: audit.findings,
    });

    // Pretty Telegram reply
    const emoji = audit.risk_level === "High" ? "🔴" : audit.risk_level === "Low" ? "🟢" : "🟡";
    let reply = `${emoji} <b>Photo Audit — Risk: ${escapeHtml(audit.risk_level || "Medium")}</b>\n\n${escapeHtml(audit.summary || "")}\n`;
    if (Array.isArray(audit.findings) && audit.findings.length > 0) {
      reply += "\n<b>Findings:</b>\n";
      audit.findings.forEach((f: any, i: number) => {
        reply += `\n${i + 1}. <b>${escapeHtml(f.severity || "Medium")}</b> — ${escapeHtml(f.issue || "")}\n   → ${escapeHtml(f.recommendation || "")}`;
      });
      const checklist = audit.findings.filter((f: any) => (f.severity || "").toLowerCase() !== "low");
      if (checklist.length > 0) {
        reply += "\n\n<b>✅ Action checklist:</b>";
        checklist.forEach((f: any) => { reply += `\n☐ ${escapeHtml(f.recommendation || "")}`; });
      }
    }
    reply += "\n\nSend another photo or ask me a follow-up question.";
    await tgSend(tgApi, chatId, reply);
    return;
  }

  // Plain text → chat with Guardian
  if (text) {
    const { data: sess } = await supa.from("telegram_sessions")
      .select("history,first_name").eq("chat_id", chatId).single();
    const history: { role: string; content: string }[] = Array.isArray(sess?.history) ? sess.history : [];
    const trimmed = history.slice(-10);
    const userName = sess?.first_name ? `User's name is ${sess.first_name}.` : "";

    const cResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `${SYSTEM_PROMPT} ${userName}` },
          ...trimmed,
          { role: "user", content: text },
        ],
        temperature: 0.3, top_p: 0.85, max_tokens: 800,
      }),
    });

    if (!cResp.ok) {
      console.error("chat error:", cResp.status, await cResp.text());
      await tgSend(tgApi, chatId, cResp.status === 429
        ? "⚠️ Too many requests right now. Try again in a minute."
        : cResp.status === 402
          ? "⚠️ AI credits exhausted."
          : "⚠️ Couldn't reach Guardian right now.");
      return;
    }
    const cJ = await cResp.json();
    const reply = cJ?.choices?.[0]?.message?.content ?? "(no response)";

    // Persist updated history
    const newHistory = [...trimmed, { role: "user", content: text }, { role: "assistant", content: reply }].slice(-20);
    await supa.from("telegram_sessions").update({
      history: newHistory, updated_at: new Date().toISOString(),
    }).eq("chat_id", chatId);

    await tgSend(tgApi, chatId, reply);
    return;
  }
}

async function tgSend(tgApi: string, chatId: number, text: string) {
  // Telegram message limit is 4096 chars
  const safe = text.length > 4000 ? text.slice(0, 4000) + "…" : text;
  const r = await fetch(`${tgApi}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: safe, parse_mode: "HTML" }),
  });
  if (!r.ok) {
    // Retry without parse_mode in case HTML escaping is off
    await fetch(`${tgApi}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: safe.replace(/<[^>]+>/g, "") }),
    });
  }
}

function escapeHtml(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
