// Guardian AI - Weather edge function
// Fetches current weather from OpenWeatherMap and asks Gemini for a security tip.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const OPENWEATHER_API_KEY = Deno.env.get("OPENWEATHER_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const { city, country, lat, lon } = await req.json().catch(() => ({}));

    let weatherUrl: string;
    if (typeof lat === "number" && typeof lon === "number") {
      weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OPENWEATHER_API_KEY}`;
    } else if (city) {
      const q = country ? `${city},${country}` : city;
      weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(q)}&units=metric&appid=${OPENWEATHER_API_KEY}`;
    } else {
      return new Response(JSON.stringify({ error: "Provide city or lat/lon" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!OPENWEATHER_API_KEY) {
      return new Response(JSON.stringify({ error: "Weather API key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const wResp = await fetch(weatherUrl);
    if (!wResp.ok) {
      const t = await wResp.text();
      return new Response(JSON.stringify({ error: `Weather API error (${wResp.status}): ${t}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
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

    // Ask Gemini for a security tip based on weather
    let tip = "";
    if (LOVABLE_API_KEY) {
      try {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: "You are Guardian, a home security AI." },
              { role: "user", content: `Weather: ${weather.condition} (${weather.description}), ${weather.temp}°C, wind ${weather.wind_speed} m/s in ${weather.city}. Give ONE concise home-security tip (max 2 sentences) tied to this weather.` },
            ],
            temperature: 0.4,
            max_tokens: 120,
          }),
        });
        if (aiResp.ok) {
          const d = await aiResp.json();
          tip = d?.choices?.[0]?.message?.content ?? "";
        }
      } catch (e) { console.error("weather tip error:", e); }
    }

    return new Response(JSON.stringify({ weather, tip }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("weather error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
