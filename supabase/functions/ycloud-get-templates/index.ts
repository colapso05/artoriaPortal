import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar sesión del usuario
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { companyId } = await req.json();
    if (!companyId) {
      return new Response(JSON.stringify({ error: "companyId requerido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Obtener API key de la empresa con service role
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: company } = await admin
      .from("company_config")
      .select("ycloud_api_key")
      .eq("id", companyId)
      .single();

    if (!company?.ycloud_api_key) {
      return new Response(JSON.stringify({ error: "Empresa no encontrada o sin API key" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Obtener plantillas aprobadas de YCloud
    const res = await fetch(
      "https://api.ycloud.com/v2/whatsapp/templates?page[size]=100",
      { headers: { "X-API-Key": company.ycloud_api_key, "Accept": "application/json" } }
    );

    if (!res.ok) {
      throw new Error(`YCloud API error: ${res.status}`);
    }

    const data = await res.json();
    const allTemplates = data.items || data.data || [];

    // Solo plantillas aprobadas
    const templates = allTemplates.filter(
      (t: any) => (t.status || "").toUpperCase() === "APPROVED"
    );

    return new Response(JSON.stringify({ templates }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[ycloud-get-templates] Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
