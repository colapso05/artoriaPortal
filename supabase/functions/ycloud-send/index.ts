import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { to, message, conversationId, mediaUrl, mediaType } = body;

    if (!to || (!message && !mediaUrl) || !conversationId) {
      return new Response(
        JSON.stringify({ error: "Missing to, message/media, or conversationId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const phoneRegex = /^\+?[0-9]{7,15}$/;
    if (!phoneRegex.test(to)) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Lookup conversation
    const { data: convData } = await adminSupabase
      .from("conversations")
      .select("company_id")
      .eq("id", conversationId)
      .single();

    let YCLOUD_API_KEY = Deno.env.get("YCLOUD_API_KEY") || "";
    let fromPhone = "+56976956196";

    if (convData?.company_id) {
      const { data: companyData } = await adminSupabase
        .from("company_config")
        .select("ycloud_api_key, ycloud_phone")
        .eq("id", convData.company_id)
        .single();

      if (companyData) {
        YCLOUD_API_KEY = companyData.ycloud_api_key;
        fromPhone = companyData.ycloud_phone;
      }
    }

    if (!YCLOUD_API_KEY) throw new Error("YCLOUD_API_KEY not configured");

    // Build YCloud request body
    const yBody: any = {
      from: fromPhone,
      to,
      type: mediaUrl ? mediaType : "text",
    };

    if (mediaUrl) {
      yBody[mediaType] = { url: mediaUrl };
      if (message) yBody[mediaType].caption = message;
    } else {
      yBody.text = { body: message };
    }

    // Send via YCloud API
    const yResponse = await fetch("https://api.ycloud.com/v2/whatsapp/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": YCLOUD_API_KEY,
      },
      body: JSON.stringify(yBody),
    });

    const yData = await yResponse.json();
    if (!yResponse.ok) {
      throw new Error(`YCloud API error: ${JSON.stringify(yData)}`);
    }

    // Save outbound message
    const msgData: any = {
      conversation_id: conversationId,
      wa_message_id: yData.id || null,
      direction: "outbound",
      content: message || `Archivo ${mediaType}`,
      message_type: mediaType || "text",
      media_url: mediaUrl || null,
      media_type: mediaType || null,
      status: "sent",
      sender_name: "Plataforma",
      sender_type: "platform",
    };
    if (convData?.company_id) msgData.company_id = convData.company_id;

    await adminSupabase.from("messages").insert(msgData);

    await adminSupabase
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: message ? message.substring(0, 100) : `Envió ${mediaType}`,
      })
      .eq("id", conversationId);

    return new Response(JSON.stringify({ success: true, messageId: yData.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Send error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
