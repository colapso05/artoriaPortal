import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is admin
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
    const { email, password, company_name, ycloud_api_key, phone_number } = body;

    // Validation
    if (!company_name || !ycloud_api_key || !phone_number) {
      return new Response(JSON.stringify({ error: "Campos faltantes: company_name, ycloud_api_key, phone_number" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: password || "TempPass123!",
      email_confirm: true,
      user_metadata: {
        display_name: company_name, // Direct profile name initialization
        company_name: company_name
      },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = newUser.user!.id;

    // Assign user role
    await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role: "user",
    });

    // Mark password reset required
    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true, display_name: company_name })
      .eq("user_id", userId);

    // Create Company Config (Strict requirement)
    const { error: configError } = await supabaseAdmin.from("company_config").insert({
      user_id: userId,
      company_name: company_name,
      ycloud_api_key: ycloud_api_key,
      ycloud_phone: phone_number,
    });

    if (configError) {
      // In case of error in config, it's better to report it and maybe even delete the user to keep consistency
      console.error("Error creating company_config:", configError);
      return new Response(JSON.stringify({ error: `Configuración fallida: ${configError.message}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Assign as Admin of the new company via company_users
    const { data: createdConfig } = await supabaseAdmin
      .from("company_config")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (createdConfig) {
      await supabaseAdmin.from("company_users").insert({
        company_id: createdConfig.id,
        user_id: userId,
        role: "administrador"
      });
    }

    return new Response(
      JSON.stringify({ user: { id: userId, email } }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
