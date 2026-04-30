import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { generateGeminiText } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_RUNTIME_MS = 50_000;
const MIN_REMAINING_MS = 5_000;

const SYSTEM_PROMPT = "You are Guardian, an expert home security AI assistant. Give specific, concise, actionable advice in 2-4 sentences. Always prioritize safety. If a situation is genuinely dangerous, recommend calling emergency services. Use the provided Telegram session and audit context first; do not ask for information that is already present. If live web-app sensor logs are not available to Telegram, say that clearly and answer from the stored Telegram audits/history. Telegram supports basic HTML; reply in plain text or simple markdown.";

const VISION_PROMPT = `Analyze this photo for home security issues: locks, windows, lighting, hazards, choking risks, exposed wires, visible valuables, and fall risks.

Return STRICT JSON ONLY:
{
  "risk_level": "Low" | "Medium" | "High",
  "summary": "one sentence",
  "findings": [{ "issue": "...", "severity": "Low"|"Medium"|"High", "recommendation": "..." }]
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startTime = Date.now();
  const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!TELEGRAM_BOT_TOKEN || !GEMINI_API_KEY || !SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: "Missing required env vars" }, 500);
  }

  const supa = createClient(SUPABASE_URL, SERVICE_KEY);
  const tgApi = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

  const { data: state, error: stateErr } = await supa
    .from("telegram_bot_state")
    .select("update_offset")
    .eq("id", 1)
    .single();
  if (stateErr) return json({ error: stateErr.message }, 500);

  let currentOffset: number = state.update_offset;
  let processed = 0;

  while (true) {
    const remaining = MAX_RUNTIME_MS - (Date.now() - startTime);
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
        await handleUpdate(u, supa, tgApi, TELEGRAM_BOT_TOKEN, GEMINI_API_KEY);
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

  return json({ ok: true, processed, offset: currentOffset });
});

async function handleUpdate(update: any, supa: any, tgApi: string, telegramToken: string, geminiKey: string) {
  const msg = update.message;
  if (!msg) return;

  const chatId: number = msg.chat.id;
  const text: string | undefined = msg.text;
  const photo: any[] | undefined = msg.photo;

  await supa.from("telegram_sessions").upsert({
    chat_id: chatId,
    username: msg.from?.username || null,
    first_name: msg.from?.first_name || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "chat_id" });

  if (text && text.trim().startsWith("/start")) {
    const first = msg.from?.first_name || "there";
    await tgSend(tgApi, chatId, `<b>Hi ${escapeHtml(first)}, I'm Guardian.</b>\n\nI'm your AI home security assistant. Ask me about home safety, send room photos for audits, or receive sensor alerts.\n\n<b>Your chat ID:</b> <code>${chatId}</code>\nPaste this in the web app's Settings > Connect Telegram.`);
    return;
  }

  if (text && text.trim().startsWith("/help")) {
    await tgSend(tgApi, chatId, "Chat normally, send a photo for a security audit, or use /reset to clear conversation history.");
    return;
  }

  if (text && text.trim().startsWith("/reset")) {
    await supa.from("telegram_sessions").update({ history: [] }).eq("chat_id", chatId);
    await tgSend(tgApi, chatId, "Conversation history cleared.");
    return;
  }

  if (photo && photo.length > 0) {
    await handlePhoto(msg, supa, tgApi, telegramToken, geminiKey, chatId, photo);
    return;
  }

  if (text) {
    await handleText(supa, tgApi, geminiKey, chatId, text);
  }
}

async function handlePhoto(msg: any, supa: any, tgApi: string, telegramToken: string, geminiKey: string, chatId: number, photo: any[]) {
  await tgSend(tgApi, chatId, "Analyzing your photo. Give me a few seconds.");

  const fileId = photo[photo.length - 1].file_id;
  const fileR = await fetch(`${tgApi}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  const fileJ = await fileR.json();
  if (!fileJ.ok) {
    await tgSend(tgApi, chatId, "Couldn't fetch your photo. Please try again.");
    return;
  }

  const filePath = fileJ.result.file_path;
  const imgR = await fetch(`https://api.telegram.org/file/bot${telegramToken}/${filePath}`);
  const buf = await imgR.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  const mime = filePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  const dataUrl = `data:${mime};base64,${b64}`;
  const captionExtra = msg.caption ? `\n\nUser note: "${msg.caption}"` : "";

  let content = "";
  try {
    content = await generateGeminiText({
      apiKey: geminiKey,
      model: ["gemini-2.5-flash", "gemini-2.0-flash"],
      system: "You are Guardian, a home security expert AI.",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: VISION_PROMPT + captionExtra },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      }],
      temperature: 0.3,
      topP: 0.85,
      maxOutputTokens: 1500,
    });
  } catch (e) {
    console.error("vision error:", e);
    await tgSend(tgApi, chatId, "Audit failed. Try a different photo.");
    return;
  }

  let audit: any = {};
  try {
    const cleaned = content.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    audit = JSON.parse(m ? m[0] : cleaned);
  } catch {
    audit = { risk_level: "Medium", summary: content.slice(0, 200), findings: [] };
  }

  await supa.from("telegram_audits").insert({
    chat_id: chatId,
    risk_level: audit.risk_level,
    summary: audit.summary,
    findings: audit.findings,
  });

  let reply = `<b>Photo Audit - Risk: ${escapeHtml(audit.risk_level || "Medium")}</b>\n\n${escapeHtml(audit.summary || "")}\n`;
  if (Array.isArray(audit.findings) && audit.findings.length > 0) {
    reply += "\n<b>Findings:</b>\n";
    audit.findings.forEach((f: any, i: number) => {
      reply += `\n${i + 1}. <b>${escapeHtml(f.severity || "Medium")}</b> - ${escapeHtml(f.issue || "")}\n   Recommendation: ${escapeHtml(f.recommendation || "")}`;
    });
  }
  reply += "\n\nSend another photo or ask me a follow-up question.";
  await tgSend(tgApi, chatId, reply);
}

async function handleText(supa: any, tgApi: string, geminiKey: string, chatId: number, text: string) {
  const { data: sess } = await supa.from("telegram_sessions")
    .select("history,first_name,location,has_kids,has_pets")
    .eq("chat_id", chatId)
    .single();
  const { data: audits } = await supa.from("telegram_audits")
    .select("risk_level,summary,findings,created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(5);

  const history: { role: "user" | "assistant"; content: string }[] = Array.isArray(sess?.history) ? sess.history : [];
  const trimmed = history.slice(-10);
  const context = {
    profile: {
      firstName: sess?.first_name ?? null,
      location: sess?.location ?? null,
      hasKids: sess?.has_kids ?? null,
      hasPets: sess?.has_pets ?? null,
    },
    recentTelegramPhotoAudits: Array.isArray(audits) ? audits : [],
    availableDataNote: "Telegram has access to this chat history and stored Telegram photo audit summaries. Live browser sensor readings are only available in the web app unless they are sent or persisted to Supabase.",
  };

  let reply = "";
  try {
    reply = await generateGeminiText({
      apiKey: geminiKey,
      model: ["gemini-2.5-flash", "gemini-2.0-flash"],
      system: `${SYSTEM_PROMPT}\n\nTELEGRAM CONTEXT JSON:\n${JSON.stringify(context, null, 2)}`,
      messages: [...trimmed, { role: "user", content: text }],
      temperature: 0.3,
      topP: 0.85,
      maxOutputTokens: 800,
    });
  } catch (e) {
    console.error("chat error:", e);
    await tgSend(tgApi, chatId, "Couldn't reach Guardian right now.");
    return;
  }

  const newHistory = [...trimmed, { role: "user", content: text }, { role: "assistant", content: reply }].slice(-20);
  await supa.from("telegram_sessions").update({
    history: newHistory,
    updated_at: new Date().toISOString(),
  }).eq("chat_id", chatId);

  await tgSend(tgApi, chatId, reply || "(no response)");
}

async function tgSend(tgApi: string, chatId: number, text: string) {
  const safe = text.length > 4000 ? text.slice(0, 4000) + "..." : text;
  const r = await fetch(`${tgApi}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: safe, parse_mode: "HTML" }),
  });
  if (!r.ok) {
    await fetch(`${tgApi}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: safe.replace(/<[^>]+>/g, "") }),
    });
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
