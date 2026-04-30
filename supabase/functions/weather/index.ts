import { generateGeminiText } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const OPENWEATHER_API_KEY = Deno.env.get("OPENWEATHER_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    const { city, country, lat, lon } = await req.json().catch(() => ({}));
    if (!OPENWEATHER_API_KEY) return json({ error: "Weather API key not configured" }, 500);

    let weatherUrl: string;
    if (typeof lat === "number" && typeof lon === "number") {
      weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OPENWEATHER_API_KEY}`;
    } else if (city) {
      const q = country ? `${city},${country}` : city;
      weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(q)}&units=metric&appid=${OPENWEATHER_API_KEY}`;
    } else {
      return json({ error: "Provide city or lat/lon" }, 400);
    }

    const wResp = await fetch(weatherUrl);
    if (!wResp.ok) return json({ error: `Weather API error (${wResp.status}): ${await wResp.text()}` }, 502);

    const w = await wResp.json();
    const weather = {
      city: w.name,
      country: w.sys?.country,
      temp: w.main?.temp,
      feels_like: w.main?.feels_like,
      humidity: w.main?.humidity,
      wind_speed: w.wind?.speed,
      condition: w.weather?.[0]?.main,
      description: w.weather?.[0]?.description,
      icon: w.weather?.[0]?.icon,
    };

    let tip = "";
    if (GEMINI_API_KEY) {
      try {
        tip = await generateGeminiText({
          apiKey: GEMINI_API_KEY,
          model: ["gemini-2.5-flash-lite", "gemini-2.0-flash"],
          system: "You are Guardian, a home security AI.",
          messages: [
            { role: "user", content: `Weather: ${weather.condition} (${weather.description}), ${weather.temp} C, wind ${weather.wind_speed} m/s in ${weather.city}. Give ONE concise home-security tip (max 2 sentences) tied to this weather.` },
          ],
          temperature: 0.4,
          maxOutputTokens: 120,
        });
      } catch (e) {
        console.error("weather tip error:", e);
      }
    }

    return json({ weather, tip });
  } catch (e) {
    console.error("weather error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
