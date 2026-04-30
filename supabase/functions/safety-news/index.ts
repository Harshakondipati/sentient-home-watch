import { generateGeminiText } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type NewsArticle = {
  title?: string;
  description?: string;
  url?: string;
  source?: { name?: string };
  publishedAt?: string;
  urlToImage?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const NEWS_API_KEY = Deno.env.get("NEWS_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!NEWS_API_KEY) return json({ error: "News API key not configured" }, 500);

    const { summarize, location } = await req.json().catch(() => ({}));
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent("home security OR break-in OR burglary OR home safety")}&sortBy=publishedAt&language=en&pageSize=8&apiKey=${NEWS_API_KEY}`;
    const nResp = await fetch(url);
    if (!nResp.ok) return json({ error: `News API error (${nResp.status}): ${await nResp.text()}` }, 502);

    const data = await nResp.json();
    const articles = (data.articles ?? []).map((a: NewsArticle) => ({
      title: a.title,
      description: a.description,
      url: a.url,
      source: a.source?.name,
      publishedAt: a.publishedAt,
      urlToImage: a.urlToImage,
    }));

    let summary = "";
    if (summarize && GEMINI_API_KEY && articles.length > 0) {
      const headlines = articles.map((a: { title?: string }, i: number) => `${i + 1}. ${a.title}`).join("\n");
      try {
        summary = await generateGeminiText({
          apiKey: GEMINI_API_KEY,
          model: ["gemini-2.5-flash", "gemini-2.0-flash"],
          system: "You are Guardian, a home security AI.",
          messages: [
            { role: "user", content: `Headlines${location ? ` (user in ${location})` : ""}:\n${headlines}\n\nGive a 3-bullet summary of main threats and 2 specific things to check or do at home today. Use markdown bullets.` },
          ],
          temperature: 0.3,
          topP: 0.85,
          maxOutputTokens: 400,
        });
      } catch (e) {
        console.error("news summary error:", e);
      }
    }

    return json({ articles, summary });
  } catch (e) {
    console.error("safety-news error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
