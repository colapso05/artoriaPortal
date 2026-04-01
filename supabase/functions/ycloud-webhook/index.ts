import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── FIX #1: Extractor universal de contenido para todos los tipos de mensaje ────
// YCloud puede enviar muchos tipos distintos. Antes solo se procesaba `text.body`
// y todo lo demás se guardaba como "[type]" que el frontend luego eliminaba → bubble vacío.
function extractContent(msg: any): { content: string; mediaUrl: string | null; messageType: string } {
  const type = msg.type || "text";

  switch (type) {
    case "text":
      return { content: msg.text?.body || "", mediaUrl: null, messageType: "text" };

    case "image":
      return {
        content: msg.image?.caption || "📷 Imagen",
        mediaUrl: msg.image?.url || null,
        messageType: "image",
      };

    case "video":
    case "short_video":
      return {
        content: msg.video?.caption || "🎥 Video",
        mediaUrl: msg.video?.url || null,
        messageType: "video",
      };

    case "audio":
      return {
        content: "🎵 Audio",
        mediaUrl: msg.audio?.url || null,
        messageType: "audio",
      };

    case "document":
      return {
        content: msg.document?.caption || msg.document?.filename || "📄 Documento",
        mediaUrl: msg.document?.url || null,
        messageType: "document",
      };

    case "sticker":
      return {
        content: "🏷️ Sticker",
        mediaUrl: msg.sticker?.url || null,
        messageType: "sticker",
      };

    case "location": {
      const locName = msg.location?.name || msg.location?.address || "";
      return {
        content: `📍 Ubicación${locName ? ": " + locName : ""}`,
        mediaUrl: null,
        messageType: "location",
      };
    }

    case "contacts": {
      const contactName = msg.contacts?.[0]?.name?.formatted_name || "";
      return {
        content: `👤 Contacto${contactName ? ": " + contactName : ""}`,
        mediaUrl: null,
        messageType: "contacts",
      };
    }

    // FIX CLAVE: respuestas de botón / lista interactiva del cliente
    // Antes se guardaban como "[interactive]" y desaparecían
    case "interactive": {
      const buttonTitle = msg.interactive?.buttonReply?.title;
      const listTitle = msg.interactive?.listReply?.title;
      const buttonId = msg.interactive?.buttonReply?.id;
      return {
        content: buttonTitle || listTitle || buttonId || "🔘 Respuesta interactiva",
        mediaUrl: null,
        messageType: "interactive",
      };
    }

    // Presión de botón de plantilla
    case "button":
      return {
        content: msg.button?.text || "🔘 Botón",
        mediaUrl: null,
        messageType: "button",
      };

    case "reaction":
      return {
        content: msg.reaction?.emoji || "👍",
        mediaUrl: null,
        messageType: "reaction",
      };

    case "order":
      return { content: "🛒 Pedido", mediaUrl: null, messageType: "order" };

    default:
      return { content: `[${type}]`, mediaUrl: null, messageType: type };
  }
}

async function resolveCompany(supabase: any, url: URL, payload: any) {
  const inboundTo = payload?.whatsappInboundMessage?.to;
  const inboundMeta = payload?.whatsappInboundMessage?.metadata?.display_phone_number;
  const outboundFrom = payload?.whatsappMessage?.from;

  const businessPhone = inboundTo || inboundMeta || outboundFrom;

  if (businessPhone) {
    const cleanPhone = businessPhone.replace(/^\+/, "");
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const url = new URL(req.url);
    const body = await req.json();
    console.log("[WEBHOOK] FULL PAYLOAD:", JSON.stringify(body, null, 2));

    const company = await resolveCompany(supabase, url, body);
    if (!company) {
      console.error("[WEBHOOK] EMPRESA NO ENCONTRADA");
      return new Response("No company found", { status: 404, headers: corsHeaders });
    }

    const companyId = company.id;

    // ─── MENSAJES INBOUND (cliente → portal) ────────────────────────────────────
    if (body.type === "whatsapp.inbound_message.received") {
      const msg = body.whatsappInboundMessage;
      const waId = msg.from;
      const profileName = msg.customerProfile?.name || waId;

      // FIX #1: usar extractContent para no perder contenido de ningun tipo de mensaje
      const { content, mediaUrl, messageType } = extractContent(msg);

      console.log(`[WEBHOOK] Inbound ${messageType} de ${waId} → ${company.company_name}`);

      // FIX #2: obtener unread_count actual para poder incrementarlo
      const { data: existingConv } = await supabase
        .from("conversations")
        .select("id, unread_count")
        .eq("wa_id", waId)
        .eq("company_id", companyId)
        .maybeSingle();

      let convId: string;
      if (existingConv) {
        convId = existingConv.id;
        await supabase
          .from("conversations")
          .update({
            last_message_at: new Date().toISOString(),
            last_message_preview: content.substring(0, 100),
            profile_name: profileName,
            // FIX #2: incrementar unread_count (antes nunca se incrementaba para convs existentes)
            unread_count: (existingConv.unread_count || 0) + 1,
          })
          .eq("id", convId);
      } else {
        const { data: nConv, error: insErr } = await supabase
          .from("conversations")
          .insert({
            wa_id: waId,
            company_id: companyId,
            last_message_preview: content.substring(0, 100),
            profile_name: profileName,
            unread_count: 1,
            is_agent_active: true,
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        convId = nConv.id;
      }

      // Guardar mensaje con tipo y media_url para que el frontend pueda mostrarlo correctamente
      await supabase.from("messages").insert({
        conversation_id: convId,
        company_id: companyId,
        content: content,
        direction: "inbound",
        sender_name: profileName,
        sender_type: "customer",
        wa_message_id: msg.id,
        message_type: messageType,
        media_url: mediaUrl,
      });

      // Sincronización de Estado por Etiquetas (Tags) — SOLO para el estado local, sin llamadas externas
      const tags: string[] = msg.customerProfile?.tags || [];
      if (tags.length > 0) {
        const isPaused = tags.includes("bot_pausado") || tags.includes("bot desactivado");
        const isActive = tags.includes("bot_activado") || tags.includes("bot activado");

        if (isPaused) {
          await supabase.from("conversations").update({ is_agent_active: false }).eq("id", convId);
        } else if (isActive) {
          await supabase.from("conversations").update({ is_agent_active: true }).eq("id", convId);
        }
      } else if (!existingConv) {
        // AUTO-TAG: Solo para conversaciones NUEVAS y de forma fire & forget (sin await).
        // CAUSA DEL BUG ORIGINAL: se ejecutaba en CADA mensaje y hacía 2 llamadas HTTP a YCloud
        // (GET contact + PATCH tags) → 7 mensajes rápidos = 14 llamadas HTTP concurrentes →
        // el webhook tardaba demasiado → YCloud descartaba los mensajes → se perdían.
        // Ahora solo se ejecuta una vez (conversación nueva) y sin bloquear la respuesta.
        (async () => {
          try {
            const { data: config } = await supabase
              .from("company_config")
              .select("ycloud_api_key")
              .eq("id", companyId)
              .single();
            if (config?.ycloud_api_key) {
              const getContactRes = await fetch(
                `https://api.ycloud.com/v2/contact/contacts?filter[phoneNumber]=${encodeURIComponent(waId)}&page[limit]=1`,
                { headers: { "X-API-Key": config.ycloud_api_key, Accept: "application/json" } }
              );
              if (getContactRes.ok) {
                const contactData = await getContactRes.json();
                const contact = contactData.data?.[0] || contactData.items?.[0];
                if (contact) {
                  await fetch(`https://api.ycloud.com/v2/contact/contacts/${contact.id}`, {
                    method: "PATCH",
                    headers: { "X-API-Key": config.ycloud_api_key, "Content-Type": "application/json" },
                    body: JSON.stringify({ tags: ["bot_activado"] }),
                  });
                }
              }
            }
          } catch (e) {
            console.error("Auto-tag error:", e);
          }
        })();
      }

      console.log(`[WEBHOOK] OK - Inbound guardado para ${company.company_name}`);
    }

    // ─── MENSAJES OUTBOUND VÍA API (bot / n8n / agente externo) ─────────────────
    if (body.type === "whatsapp.message.received") {
      const msg = body.whatsappMessage;
      if (msg && msg.direction === "outbound") {
        const waId = msg.to;
        const { content, mediaUrl, messageType } = extractContent(msg);

        console.log(`[WEBHOOK] Outbound ${messageType} → ${waId} (${company.company_name})`);

        // FIX #3: deduplicar por wa_message_id (igual que hace el handler de echo)
        // Sin esto, si YCloud dispara este evento Y el echo, el mensaje se duplica
        if (msg.id) {
          const { data: existing } = await supabase
            .from("messages")
            .select("id")
            .eq("wa_message_id", msg.id)
            .maybeSingle();
          if (existing) {
            console.log(`[OUTBOUND] Mensaje ya existe (wa_message_id: ${msg.id}), omitiendo`);
            return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
          }
        }

        const { data: conv } = await supabase
          .from("conversations")
          .select("id")
          .eq("wa_id", waId)
          .eq("company_id", companyId)
          .maybeSingle();

        if (conv) {
          await supabase.from("messages").insert({
            conversation_id: conv.id,
            company_id: companyId,
            content: content,
            direction: "outbound",
            sender_name: "Agente IA",
            sender_type: "agent",
            wa_message_id: msg.id,
            message_type: messageType,
            media_url: mediaUrl,
            status: msg.status || "sent",
          });

          await supabase
            .from("conversations")
            .update({
              last_message_at: new Date().toISOString(),
              last_message_preview: content.substring(0, 100),
            })
            .eq("id", conv.id);
        }
      }
    }

    // ─── ACTUALIZACIÓN DE ESTADO DE MENSAJE ─────────────────────────────────────
    if (body.type === "whatsapp.message.updated") {
      const msg = body.whatsappMessage;
      if (msg?.id && msg?.status) {
        await supabase
          .from("messages")
          .update({ status: msg.status })
          .eq("wa_message_id", msg.id);
      }
    }

    // ─── ECHO DE MENSAJES DEL BOT ────────────────────────────────────────────────
    if (body.type === "whatsapp.smb.message.echoes") {
      const msg = body.whatsappMessage;
      if (msg) {
        const waId = msg.to;
        const { content, mediaUrl, messageType } = extractContent(msg);

        // Agregar soporte de plantillas al contenido del echo
        const finalContent =
          messageType === "text" && !msg.text?.body && msg.template?.name
            ? `📋 Plantilla: ${msg.template.name}`
            : content;

        console.log(`[ECHO] Outbound ${messageType} → ${waId} (${company.company_name})`);

        // Deduplicar por wa_message_id
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
          const { data: nConv, error: insErr } = await supabase
            .from("conversations")
            .insert({
              wa_id: waId,
              company_id: companyId,
              last_message_preview: finalContent.substring(0, 100),
              profile_name: waId,
              is_agent_active: true,
            })
            .select("id")
            .single();
          if (insErr) {
            console.error("[ECHO] Error creando conversacion:", insErr);
            return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
          }
          convId = nConv.id;
        }

        await supabase.from("messages").insert({
          conversation_id: convId,
          company_id: companyId,
          content: finalContent,
          direction: "outbound",
          sender_name: "Agente IA",
          sender_type: "agent",
          wa_message_id: msg.id || null,
          status: msg.status || "sent",
          message_type: messageType,
          media_url: mediaUrl,
        });

        await supabase
          .from("conversations")
          .update({
            last_message_at: new Date().toISOString(),
            last_message_preview: finalContent.substring(0, 100),
          })
          .eq("id", convId);

        console.log(`[ECHO] Guardado mensaje del bot para ${waId}`);
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
  } catch (err: any) {
    console.error("[WEBHOOK ERROR]", err);
    return new Response(err.message, { status: 500, headers: corsHeaders });
  }
});
