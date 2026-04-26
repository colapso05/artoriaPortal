import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* ─── Ray-casting point-in-polygon ──────────────────────── */
function pointInPolygon(lat: number, lng: number, polygon: number[][]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { lat, lng, company_id } = await req.json();

    if (typeof lat !== "number" || typeof lng !== "number") {
      return new Response(
        JSON.stringify({ error: "lat and lng are required numbers" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch the global company config first
    let globalActive = false;
    let globalMessage: string | null = null;
    
    if (company_id) {
      const { data: configData } = await supabase
        .from("company_config")
        .select("alert_active, alert_message")
        .eq("id", company_id)
        .single();
        
      if (configData) {
        globalActive = configData.alert_active;
        globalMessage = configData.alert_message;
      }
    }

    // Fetch active alert zones (optionally filtered by company)
    let query = supabase
      .from("alert_zones")
      .select("id, name, description, polygon, alert_message, company_id")
      .eq("active", true);

    if (company_id) {
      query = query.eq("company_id", company_id);
    }

    const { data: zones, error } = await query;

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check each zone
    const matchedZones = [];
    for (const zone of zones || []) {
      if (!Array.isArray(zone.polygon) || zone.polygon.length < 3) continue;
      if (pointInPolygon(lat, lng, zone.polygon)) {
        matchedZones.push({
          id: zone.id,
          name: zone.name,
          description: zone.description,
          alert_message: zone.alert_message || globalMessage,
          company_id: zone.company_id,
        });
      }
    }

    const inside = matchedZones.length > 0;

    return new Response(
      JSON.stringify({
        inside,
        zones: matchedZones,
        // Convenience: first matched zone's message
        alert_message: matchedZones[0]?.alert_message ?? null,
        zone_name: matchedZones[0]?.name ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
