import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const YCLOUD_BASE = "https://api.ycloud.com/v2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const { data: events, error } = await supabase.rpc("claim_webhook_events", { p_batch_size: 10 });
  if (error) { console.error("[Processor] claim error:", error.message); return new Response(JSON.stringify({ processed: 0 }), { status: 200 }); }
  if (!events?.length) return new Response(JSON.stringify({ processed: 0 }), { status: 200 });

  const results = await Promise.allSettled(events.map((ev: any) => processEvent(supabase, ev)));
  const processed = results.filter((r) => r.status === "fulfilled").length;
  console.log("[Processor]", processed + "/" + results.length + " ok");
  return new Response(JSON.stringify({ processed }), { status: 200 });
});

async function mirrorMedia(url: string, apiKey: string, supabase: any, folder: string): Promise<string | null> {
  try {
    console.log("[Mirror] Descargando:", url.substring(0, 60));
    const res = await fetch(url, { headers: { "X-API-Key": apiKey } });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const ext = contentType.split("/")[1]?.split(";")[0] || "bin";
    const fileName = `${folder.replace("+", "")}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("whatsapp_media").upload(fileName, arrayBuffer, {
      contentType, cacheControl: "3600", upsert: true
    });
    if (error) throw error;
    const publicUrl = `https://supabase.artoria.cl/storage/v1/object/public/whatsapp_media/${fileName}`;
    console.log("[Mirror] OK →", publicUrl);
    return publicUrl;
  } catch (err: any) {
    console.error("[Mirror] Error:", err.message);
    return null;
  }
}

// ─── FIX #1: extractMedia usaba .link pero YCloud envía .url ────────────────
// Además se agregó soporte para todos los tipos de mensaje que antes se perdían:
// interactive (respuestas de botón/lista), button (plantilla), location, contacts, reaction.
// Sin esto, cualquier mensaje que no fuera texto se guardaba como "[Multimedia]"
// y el frontend lo eliminaba → bubble completamente vacío.
function extractMedia(msg: any): { content: string; mediaUrl: string | null; mediaType: string | null } {
  if (!msg) return { content: "", mediaUrl: null, mediaType: null };

  const type = msg.type || "";

  // ── Texto plano ──────────────────────────────────────────────────────────────
  if (type === "text" || msg.text?.body) {
    return { content: msg.text?.body || "", mediaUrl: null, mediaType: null };
  }

  // ── Imagen ────────────────────────────────────────────────────────────────────
  // FIX: era msg.image?.link → correcto es msg.image?.url
  if (type === "image" || msg.image) {
    const url = msg.image?.url || msg.image?.link || null;
    return { content: msg.image?.caption || "📷 Imagen", mediaUrl: url, mediaType: msg.image?.mimeType || "image/jpeg" };
  }

  // ── Video ─────────────────────────────────────────────────────────────────────
  if (type === "video" || type === "short_video" || msg.video) {
    const url = msg.video?.url || msg.video?.link || null;
    return { content: msg.video?.caption || "🎥 Video", mediaUrl: url, mediaType: msg.video?.mimeType || "video/mp4" };
  }

  // ── Audio ─────────────────────────────────────────────────────────────────────
  if (type === "audio" || msg.audio) {
    const url = msg.audio?.url || msg.audio?.link || null;
    return { content: "🎵 Audio", mediaUrl: url, mediaType: msg.audio?.mimeType || "audio/ogg" };
  }

  // ── Documento ────────────────────────────────────────────────────────────────
  if (type === "document" || msg.document) {
    const url = msg.document?.url || msg.document?.link || null;
    return {
      content: msg.document?.caption || msg.document?.filename || "📄 Documento",
      mediaUrl: url,
      mediaType: msg.document?.mimeType || "application/octet-stream",
    };
  }

  // ── Sticker ──────────────────────────────────────────────────────────────────
  if (type === "sticker" || msg.sticker) {
    const url = msg.sticker?.url || msg.sticker?.link || null;
    return { content: "🏷️ Sticker", mediaUrl: url, mediaType: msg.sticker?.mimeType || "image/webp" };
  }

  // ── FIX #2: Mensajes interactivos (botones / listas) ────────────────────────
  // Cuando el cliente toca un botón de respuesta rápida o elige de una lista,
  // YCloud envía type="interactive". Antes no se manejaba → "[Multimedia]" → vacío.
  if (type === "interactive" || msg.interactive) {
    const buttonTitle = msg.interactive?.buttonReply?.title;
    const listTitle   = msg.interactive?.listReply?.title;
    const buttonId    = msg.interactive?.buttonReply?.id;
    return {
      content: buttonTitle || listTitle || buttonId || "🔘 Respuesta interactiva",
      mediaUrl: null,
      mediaType: "interactive",
    };
  }

  // ── Botón de plantilla presionado ────────────────────────────────────────────
  if (type === "button" || msg.button) {
    return { content: msg.button?.text || "🔘 Botón", mediaUrl: null, mediaType: "button" };
  }

  // ── Ubicación ────────────────────────────────────────────────────────────────
  if (type === "location" || msg.location) {
    const name = msg.location?.name || msg.location?.address || "";
    return { content: `📍 Ubicación${name ? ": " + name : ""}`, mediaUrl: null, mediaType: "location" };
  }

  // ── Contacto ─────────────────────────────────────────────────────────────────
  if (type === "contacts" || msg.contacts) {
    const name = msg.contacts?.[0]?.name?.formatted_name || "";
    return { content: `👤 Contacto${name ? ": " + name : ""}`, mediaUrl: null, mediaType: "contacts" };
  }

  // ── Reacción ─────────────────────────────────────────────────────────────────
  if (type === "reaction" || msg.reaction) {
    return { content: msg.reaction?.emoji || "👍", mediaUrl: null, mediaType: "reaction" };
  }

  // ── Plantilla (echo outbound) ────────────────────────────────────────────────
  if (type === "template" || msg.template) {
    return { content: `📋 Plantilla: ${msg.template?.name || ""}`, mediaUrl: null, mediaType: "template" };
  }

  // Fallback (tipo desconocido — al menos no guarda vacío ni "[Multimedia]")
  return { content: type ? `[${type}]` : "[Mensaje]", mediaUrl: null, mediaType: type || null };
}

async function processEvent(supabase: any, ev: any): Promise<void> {
  try {
    const { data: company } = await supabase
      .from("company_config").select("id, ycloud_api_key").eq("webhook_id", ev.cid).single();

    if (!company) { await markDone(supabase, ev.id, "no_company"); return; }

    if (ev.event_type === "whatsapp.message.updated") {
      await handleOutboundSent(supabase, company, ev.payload.whatsappMessage);
    } else if (
      ev.event_type === "whatsapp.inbound_message.received" ||
      ev.event_type === "whatsapp.smb.message.echoes" ||
      // FIX #4: manejar mensajes outbound de n8n / bots externos que usan este tipo
      ev.event_type === "whatsapp.message.received"
    ) {
      await handleInbound(supabase, company, ev.payload, ev.event_type);
    }
    await markDone(supabase, ev.id);
  } catch (e: any) {
    await markFailed(supabase, ev.id, e.message);
    throw e;
  }
}

async function handleOutboundSent(supabase: any, company: any, msg: any) {
  if (!msg?.id || msg.status !== "sent") return;

  const { data: conv } = await supabase
    .from("conversations").select("is_agent_active")
    .eq("wa_id", msg.to).eq("company_id", company.id).maybeSingle();

  const isBotActive = conv?.is_agent_active ?? false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(YCLOUD_BASE + "/whatsapp/messages/" + msg.id, {
      headers: { "X-API-Key": company.ycloud_api_key },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return;
    const fullMsg = await res.json();
    const { content, mediaUrl, mediaType } = extractMedia(fullMsg);

    await supabase.rpc("process_whatsapp_v15", {
      p_company_id: company.id,
      p_wa_id: msg.to,
      p_profile_name: msg.to,
      p_content: content,
      p_media_url: mediaUrl,
      p_direction: "outbound",
      p_sender_type: isBotActive ? "agent" : "specialist",
      p_sender_name: isBotActive ? "Agente IA" : "Especialista",
      p_wa_message_id: msg.id,
      p_is_bot_active: isBotActive,
    });
    console.log("[Processor] Outbound saved:", msg.id, "bot:", isBotActive);
  } catch {
    clearTimeout(timeout);
    throw new Error("YCloud fetch failed for " + msg.id);
  }
}

async function handleInbound(supabase: any, company: any, body: any, eventType: string) {
  const isInbound = eventType === "whatsapp.inbound_message.received";
  // whatsapp.message.received puede ser outbound (bot externo / n8n)
  const isOutboundReceived = eventType === "whatsapp.message.received";

  const msg = isInbound ? body.whatsappInboundMessage : body.whatsappMessage;
  const waId = (isInbound || isOutboundReceived) ? (msg.from ?? msg.to) : msg.to;

  // ─── FIX #3: Verificar estado del bot en la DB PRIMERO ──────────────────────
  // CAUSA DEL BUG ORIGINAL: checkYCloudBotStatus se llamaba para CADA mensaje inbound.
  // Con 7 mensajes rápidos = 7 llamadas HTTP concurrentes a la API de YCloud →
  // timeouts / rate-limiting → el procesador fallaba → mensajes se perdían.
  // Solución: consultar la DB local (< 10ms), solo llamar YCloud si es conversación nueva.
  let isBotActive = false;
  const { data: existingConv } = await supabase
    .from("conversations").select("is_agent_active, id")
    .eq("wa_id", waId).eq("company_id", company.id).maybeSingle();

  if (existingConv) {
    // Conversación conocida → usar valor de la DB (rápido, sin API externa)
    isBotActive = existingConv.is_agent_active ?? false;
  } else if (isInbound) {
    // Conversación NUEVA → consultar YCloud una sola vez para inicializar el estado
    isBotActive = await checkYCloudBotStatus(waId, company.ycloud_api_key);
    console.log("[Processor] Nueva conv — YCloud bot status for", waId, ":", isBotActive);
  }

  let { content, mediaUrl, mediaType } = extractMedia(msg);

  // Mirror de media a Supabase Storage para URLs permanentes (solo inbound)
  if (mediaUrl && isInbound) {
    const mirrored = await mirrorMedia(mediaUrl, company.ycloud_api_key, supabase, waId);
    if (mirrored) mediaUrl = mirrored;
  }

  // Determinar sender_type según el evento
  let direction: string;
  let senderType: string;
  let senderName: string;

  if (isInbound) {
    direction  = "inbound";
    senderType = "customer";
    senderName = msg.customerProfile?.name || waId;
  } else if (isOutboundReceived) {
    // n8n / bot externo enviando directo por API
    direction  = "outbound";
    senderType = isBotActive ? "agent" : "specialist";
    senderName = isBotActive ? "Agente IA" : "Especialista";
  } else {
    // echo (whatsapp.smb.message.echoes)
    direction  = "outbound";
    senderType = isBotActive ? "agent" : "specialist";
    senderName = isBotActive ? "Agente IA" : "Especialista";
  }

  const { error } = await supabase.rpc("process_whatsapp_v15", {
    p_company_id:    company.id,
    p_wa_id:         waId,
    p_profile_name:  msg.customerProfile?.name || waId,
    p_content:       content,
    p_media_url:     mediaUrl,
    p_direction:     direction,
    p_sender_type:   senderType,
    p_sender_name:   senderName,
    p_wa_message_id: msg.id,
    p_is_bot_active: isBotActive,
  });

  if (error) throw new Error(error.message);
  console.log("[Processor]", eventType, "saved:", msg.id, "bot:", isBotActive, "media:", mediaUrl ? "sí" : "no");
}

async function checkYCloudBotStatus(phone: string, apiKey: string): Promise<boolean> {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(
      YCLOUD_BASE + "/contact/contacts?filter.phoneNumber=" + encodeURIComponent(phone) + "&limit=1",
      { headers: { "X-API-Key": apiKey }, signal: controller.signal }
    );
    const json = await res.json();
    const contact = json.data?.[0] ?? json.items?.[0] ?? json[0];
    if (!contact) {
      console.warn("[Processor] No contact found in YCloud for", phone);
      return false;
    }
    const hasTag  = contact.tags?.includes("bot_activado");
    const hasAttr = contact.customAttributes?.bot === "on" ||
      (Array.isArray(contact.customAttributes) &&
        contact.customAttributes.find((a: any) => a.name === "bot")?.value?.includes("on"));
    return !!(hasTag || hasAttr);
  } catch (e) {
    console.warn("[Processor] YCloud contact check failed for", phone, e);
    return false;
  }
}

async function markDone(supabase: any, id: string, note?: string) {
  await supabase.from("webhook_queue")
    .update({ status: "done", processed_at: new Date().toISOString(), error: note ?? null }).eq("id", id);
}

async function markFailed(supabase: any, id: string, error: string) {
  await supabase.from("webhook_queue")
    .update({ status: "failed", processed_at: new Date().toISOString(), error }).eq("id", id);
}
