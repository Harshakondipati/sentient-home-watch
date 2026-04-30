// Guardian AI - Safety news edge function
// Fetches recent home-security news from NewsAPI and optionally summarizes with Gemini.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const NEWS_API_KEY = Deno.env.get("NEWS_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!NEWS_API_KEY) {
      return new Response(JSON.stringify({ error: "News API key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { summarize, location } = await req.json().catch(() => ({}));

    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent("home security OR break-in OR burglary OR home safety")}&sortBy=publishedAt&language=en&pageSize=8&apiKey=${NEWS_API_KEY}`;
    const nResp = await fetch(url);
    if (!nResp.ok) {
      const t = await nResp.text();
      return new Response(JSON.stringify({ error: `News API error (${nResp.status}): ${t}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await nResp.json();
    const articles = (data.articles ?? []).map((a: any) => ({
      title: a.title,
      description: a.description,
      url: a.url,
      source: a.source?.name,
      publishedAt: a.publishedAt,
      urlToImage: a.urlToImage,
    }));

    let summary = "";
    if (summarize && LOVABLE_API_KEY && articles.length > 0) {
      const headlines = articles.map((a: any, i: number) => `${i + 1}. ${a.title}`).join("\n");
      try {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "You are Guardian, a home security AI." },
              { role: "user", content: `Headlines${location ? ` (user in ${location})` : ""}:\n${headlines}\n\nGive a 3-bullet summary of main threats and 2 specific things to check or do at home today. Use markdown bullets.` },
            ],
            temperature: 0.3,
            top_p: 0.85,
            max_tokens: 400,
          }),
        });
        if (aiResp.ok) {
          const d = await aiResp.json();
          summary = d?.choices?.[0]?.message?.content ?? "";
        }
      } catch (e) { console.error("news summary error:", e); }
    }

    return new Response(JSON.stringify({ articles, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("safety-news error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
