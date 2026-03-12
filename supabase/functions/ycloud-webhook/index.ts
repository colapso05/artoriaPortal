import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function resolveCompany(supabase: any, url: URL, payload: any) {
  // 1. Extraer teléfonos posibles del payload
  const inboundTo = payload?.whatsappInboundMessage?.to;
  const inboundMeta = payload?.whatsappInboundMessage?.metadata?.display_phone_number;
  const outboundFrom = payload?.whatsappMessage?.from;

  const businessPhone = inboundTo || inboundMeta || outboundFrom;

  if (businessPhone) {
    const cleanPhone = businessPhone.replace(/^\+/, '');
    const { data } = await supabase
      .from("company_config")
      .select("id, company_name")
      .or(`ycloud_phone.eq.${businessPhone},ycloud_phone.eq.+${cleanPhone},ycloud_phone.eq.${cleanPhone},ycloud_phone.eq.+${businessPhone}`)
      .maybeSingle();

    if (data) {
      console.log(`[RESOLVE] MATCH POR TELÉFONO -> ${data.company_name} (ID: ${data.id})`);
      return data;
    }
  }

  // 2. Fallback por CID en la URL
  const cid = url.searchParams.get("cid");
  if (cid) {
    const { data } = await supabase
      .from("company_config")
      .select("id, company_name")
      .eq("webhook_id", cid)
      .maybeSingle();
    if (data) {
      console.log(`[RESOLVE] MATCH POR CID -> ${data.company_name}`);
      return data;
    }
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const url = new URL(req.url);
    const body = await req.json();
    console.log("[WEBHOOK] FULL PAYLOAD:", JSON.stringify(body, null, 2));

    const company = await resolveCompany(supabase, url, body);
    if (!company) {
      console.error("[WEBHOOK] EMPRESA NO ENCONTRADA");
      return new Response("No company found", { status: 404, headers: corsHeaders });
    }

    const companyId = company.id;

    if (body.type === "whatsapp.inbound_message.received") {
      const msg = body.whatsappInboundMessage;
      const waId = msg.from;
      const content = msg.text?.body || `[${msg.type}]`;
      const profileName = msg.customerProfile?.name || waId;

      console.log(`[WEBHOOK] Procesando mensaje de ${waId} para ${company.company_name} (Empresa ID: ${companyId})`);

      // 1. Upsert Conversation
      const { data: existingConv } = await supabase
        .from("conversations")
        .select("id")
        .eq("wa_id", waId)
        .eq("company_id", companyId)
        .maybeSingle();

      let convId: string;
      if (existingConv) {
        convId = existingConv.id;
        await supabase.from("conversations").update({
          last_message_at: new Date().toISOString(),
          last_message_preview: content.substring(0, 100),
          profile_name: profileName
        }).eq("id", convId);
      } else {
        const { data: nConv, error: insErr } = await supabase.from("conversations").insert({
          wa_id: waId,
          company_id: companyId,
          last_message_preview: content.substring(0, 100),
          profile_name: profileName,
          unread_count: 1,
          is_agent_active: true
        }).select("id").single();
        if (insErr) throw insErr;
        convId = nConv.id;
      }

      // 2. Insert Message
      await supabase.from("messages").insert({
        conversation_id: convId,
        company_id: companyId,
        content: content,
        direction: 'inbound',
        sender_name: profileName,
        wa_message_id: msg.id
      });

      // --- Sincronización de Estado por Etiquetas (Tags) ---
      // Si el perfil trae etiquetas, actualizamos is_agent_active
      const tags: string[] = msg.customerProfile?.tags || [];
      if (tags.length > 0) {
        const isPaused = tags.includes("bot_pausado") || tags.includes("bot desactivado");
        const isActive = tags.includes("bot_activado") || tags.includes("bot activado");

        if (isPaused) {
          await supabase.from("conversations").update({ is_agent_active: false }).eq("id", convId);
        } else if (isActive) {
          await supabase.from("conversations").update({ is_agent_active: true }).eq("id", convId);
        }
      } else {
        // Si no hay etiquetas y es nuevo, intentar activarlo en YCloud
        try {
          const { data: config } = await supabase.from("company_config").select("ycloud_api_key").eq("id", companyId).single();
          if (config?.ycloud_api_key) {
            // Intentamos obtener el ID del contacto en YCloud para poner la etiqueta por defecto
            const getContactRes = await fetch(
              `https://api.ycloud.com/v2/contact/contacts?filter[phoneNumber]=${encodeURIComponent(waId)}&page[limit]=1`,
              { headers: { "X-API-Key": config.ycloud_api_key, "Accept": "application/json" } }
            );
            if (getContactRes.ok) {
              const contactData = await getContactRes.json();
              const contact = contactData.data?.[0] || contactData.items?.[0];
              if (contact) {
                await fetch(`https://api.ycloud.com/v2/contact/contacts/${contact.id}`, {
                  method: "PATCH",
                  headers: { "X-API-Key": config.ycloud_api_key, "Content-Type": "application/json" },
                  body: JSON.stringify({ tags: ["bot_activado"] })
                });
              }
            }
          }
        } catch (e) { console.error("Auto-tag error:", e); }
      }

      console.log(`[WEBHOOK] OK - Sesión guardada en ${company.company_name}`);
    }

    // --- Soporte para Mensajes Outbound (Bot/IA externa que envía vía API) ---
    if (body.type === "whatsapp.message.received") {
      const msg = body.whatsappMessage;
      // Solo nos importan los outbound (enviados por nosotros/bot)
      if (msg && msg.direction === 'outbound') {
        const waId = msg.to;
        const content = msg.text?.body || `[${msg.type}]`;

        console.log(`[WEBHOOK] Procesando mensaje OUTBOUND para ${waId} (${company.company_name})`);

        // Resolve conversation
        const { data: conv } = await supabase
          .from("conversations")
          .select("id")
          .eq("wa_id", waId)
          .eq("company_id", companyId)
          .maybeSingle();

        if (conv) {
          // Si el mensaje viene de un bot, solemos detectarlo por el sender o simplemente lo marcamos como agent
          const senderType = 'agent';
          const senderName = 'Agente IA';

          await supabase.from("messages").insert({
            conversation_id: conv.id,
            company_id: companyId,
            content: content,
            direction: 'outbound',
            sender_name: senderName,
            sender_type: senderType,
            wa_message_id: msg.id,
            status: msg.status || 'sent'
          });

          await supabase.from("conversations").update({
            last_message_at: new Date().toISOString(),
            last_message_preview: content.substring(0, 100)
          }).eq("id", conv.id);
        }
      }
    }

    if (body.type === "whatsapp.message.updated") {
      const msg = body.whatsappMessage;
      if (msg?.id && msg?.status) {
        // Update status of known message
        await supabase
          .from("messages")
          .update({ status: msg.status })
          .eq("wa_message_id", msg.id);
      }
    }

    // --- Captura de Mensajes Echo (Bot/IA que envía via API de YCloud) ---
    // whatsapp.smb.message.echoes se dispara cuando el bot envia un mensaje
    if (body.type === "whatsapp.smb.message.echoes") {
      const msg = body.whatsappMessage;
      if (msg) {
        const waId = msg.to; // El cliente al que se le envia
        const content = msg.text?.body || (msg.template?.name ? `📋 Plantilla: ${msg.template.name}` : `[${msg.type}]`);

        console.log(`[ECHO] Mensaje outbound del bot hacia ${waId} en ${company.company_name}`);

        // Skip si ya existe (por wa_message_id)
        if (msg.id) {
          const { data: existing } = await supabase
            .from("messages")
            .select("id")
            .eq("wa_message_id", msg.id)
            .maybeSingle();
          if (existing) {
            console.log(`[ECHO] Mensaje ya existe, omitiendo`);
            return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
          }
        }

        // Resolver conversacion del cliente
        const { data: conv } = await supabase
          .from("conversations")
          .select("id")
          .eq("wa_id", waId)
          .eq("company_id", companyId)
          .maybeSingle();

        let convId: string;
        if (conv) {
          convId = conv.id;
        } else {
          // Crear conversacion si no existe
          const { data: nConv, error: insErr } = await supabase.from("conversations").insert({
            wa_id: waId,
            company_id: companyId,
            last_message_preview: content.substring(0, 100),
            profile_name: waId,
            is_agent_active: true
          }).select("id").single();
          if (insErr) {
            console.error("[ECHO] Error creando conversacion:", insErr);
            return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
          }
          convId = nConv.id;
        }

        await supabase.from("messages").insert({
          conversation_id: convId,
          company_id: companyId,
          content: content,
          direction: 'outbound',
          sender_name: 'Agente IA',
          sender_type: 'agent',
          wa_message_id: msg.id || null,
          status: msg.status || 'sent',
          message_type: msg.type || 'text'
        });

        await supabase.from("conversations").update({
          last_message_at: new Date().toISOString(),
          last_message_preview: content.substring(0, 100)
        }).eq("id", convId);

        console.log(`[ECHO] Guardado mensaje del bot para ${waId}`);
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
  } catch (err: any) {
    console.error("[WEBHOOK ERROR]", err);
    return new Response(err.message, { status: 500, headers: corsHeaders });
  }
});
