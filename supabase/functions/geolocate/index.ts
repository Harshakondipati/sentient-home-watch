// Guardian AI - Geolocation edge function
// Uses ip-api.com to detect the user's approximate city/country from their IP.
import { corsHeaders } from "@supabase/supabase-js/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Best-effort client IP (Supabase edge runtime forwards via x-forwarded-for)
    const fwd = req.headers.get("x-forwarded-for") ?? "";
    const ip = fwd.split(",")[0].trim();

    const url = ip ? `http://ip-api.com/json/${ip}` : `http://ip-api.com/json/`;
    const r = await fetch(url);
    const data = await r.json();
    if (data.status !== "success") {
      return new Response(JSON.stringify({ error: data.message ?? "geolocation failed" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      city: data.city,
      region: data.regionName,
      country: data.country,
      countryCode: data.countryCode,
      lat: data.lat,
      lon: data.lon,
      timezone: data.timezone,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("geolocate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
