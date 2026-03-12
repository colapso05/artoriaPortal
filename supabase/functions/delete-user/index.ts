import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (!caller) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin");

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Not admin" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const userId = body.user_id || body.company_id || body.id;

    console.log("[Delete User] ID recibido:", userId);

    if (!userId) {
      return new Response(JSON.stringify({ error: "Se requiere el ID de la empresa para proceder." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent self-deletion
    if (userId === caller.id) {
      return new Response(JSON.stringify({ error: "No puedes eliminar tu propia cuenta de administrador." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete related data first in a specific order to avoid FK issues
    console.log(`[Delete User] Iniciando limpieza para: ${userId}`);

    // 1. Company links and configs
    const { error: err1 } = await supabaseAdmin.from("company_users").delete().eq("user_id", userId);
    const { error: err2 } = await supabaseAdmin.from("company_config").delete().eq("user_id", userId);

    // 2. Modules and roles
    const { error: err3 } = await supabaseAdmin.from("user_modules").delete().eq("user_id", userId);
    const { error: err4 } = await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error: err5 } = await supabaseAdmin.from("user_toggles").delete().eq("user_id", userId);

    // 3. Profiles (The record the UI actually shows)
    const { error: err6 } = await supabaseAdmin.from("profiles").delete().eq("user_id", userId);

    if (err6) console.error("[Delete User] Error eliminando perfil:", err6);

    // 4. Delete auth user (This is the final step)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("[Delete User] Error en Auth Admin:", deleteError);
      return new Response(JSON.stringify({ error: `Error en Auth: ${deleteError.message}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Delete User] Usuario ${userId} eliminado con éxito.`);

    return new Response(
      JSON.stringify({ success: true, message: "Empresa y todos sus datos eliminados correctamente" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
