import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return new Response(JSON.stringify({ error: "No Authorization" }), {
                status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_ANON_KEY")!,
            { global: { headers: { Authorization: authHeader } } }
        );

        const token = authHeader.replace("Bearer ", "");
        const { data: authData, error: authError } = await supabase.auth.getUser(token);
        if (authError || !authData?.user) {
            return new Response(JSON.stringify({ error: "Sesion expirada" }), {
                status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const body = await req.json();
        const { conversationId, action } = body; // action: 'activate_bot' | 'deactivate_bot'
        if (!conversationId || !action) throw new Error("Missing parameters");

        const adminSupabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        const { data: convData } = await adminSupabase.from("conversations").select("wa_id, company_id").eq("id", conversationId).single();
        if (!convData?.wa_id) throw new Error("Conversation not found");

        let YCLOUD_API_KEY = Deno.env.get("YCLOUD_API_KEY") || "";
        if (convData.company_id) {
            const { data: companyData } = await adminSupabase.from("company_config").select("ycloud_api_key").eq("id", convData.company_id).single();
            if (companyData) YCLOUD_API_KEY = companyData.ycloud_api_key;
        }

        if (!YCLOUD_API_KEY) throw new Error("API Key not found");

        const phoneNumber = convData.wa_id;

        // 1. Obtener ID del contacto
        const getRes = await fetch(
            `https://api.ycloud.com/v2/contact/contacts?filter[phoneNumber]=${encodeURIComponent(phoneNumber)}&page[limit]=1`,
            { headers: { "X-API-Key": YCLOUD_API_KEY, "Accept": "application/json" } }
        );
        if (!getRes.ok) throw new Error("Failed to fetch contact");
        const getData = await getRes.json();
        const contact = getData?.data?.[0] || getData?.items?.[0];

        if (!contact) throw new Error("Contact not found in YCloud");
        const contactId = contact.id;

        const botON = action === 'activate_bot';

        let currentTags = contact.tags || [];
        if (botON) {
            currentTags = [...currentTags.filter((t: string) => t !== "bot_pausado" && t !== "bot desactivado"), "bot_activado"];
        } else {
            currentTags = [...currentTags.filter((t: string) => t !== "bot_activado" && t !== "bot activado"), "bot desactivado"];
        }

        // 2. Patch del contacto
        const patchBody = {
            tags: currentTags
        };

        const patchRes = await fetch(`https://api.ycloud.com/v2/contact/contacts/${contactId}`, {
            method: "PATCH",
            headers: {
                "X-API-Key": YCLOUD_API_KEY,
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(patchBody)
        });

        if (!patchRes.ok) throw new Error("Error updating contact in YCloud");

        // 3. Update conversation in DB to reflect changes immediately
        const { error: dbError } = await adminSupabase.from("conversations")
            .update({ is_agent_active: botON })
            .eq("id", conversationId);

        if (dbError) throw new Error("Error DB: " + dbError.message);

        return new Response(JSON.stringify({ success: true, is_agent_active: botON }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    } catch (error: any) {
        console.error("❌ Toggle bot error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});
