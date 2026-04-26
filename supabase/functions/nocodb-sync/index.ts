import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const NOCODB_API_TOKEN = Deno.env.get("NOCODB_API_TOKEN");
    const NOCODB_BASE_URL = Deno.env.get("NOCODB_BASE_URL");
    const TABLE_ID = "vwsn7klnubyhgi92";

    if (!NOCODB_API_TOKEN || !NOCODB_BASE_URL) {
      throw new Error("NocoDB configuration missing");
    }

    const baseUrl = NOCODB_BASE_URL.replace(/\/$/, "");
    const nocoHeaders = {
      "xc-token": NOCODB_API_TOKEN,
      "Content-Type": "application/json",
    };

    const body = await req.json();
    const { action, conversationId, numeroCliente, rutCliente } = body;

    // ── CREATE: ticket escalado desde la bandeja ─────────────────────────────
    if (action === "create") {
      if (!numeroCliente) {
        return new Response(JSON.stringify({ error: "numeroCliente required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await fetch(`${baseUrl}/api/v2/tables/${TABLE_ID}/records`, {
        method: "POST",
        headers: nocoHeaders,
        body: JSON.stringify({
          numero_cliente: numeroCliente,
          rut_cliente: rutCliente || "",
          estado_derivado: "Derivado",
        }),
      });

      const data = await res.json();
      return new Response(JSON.stringify({ success: res.ok, data }), {
        status: res.ok ? 200 : res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CLOSE: ticket resuelto/cerrado ───────────────────────────────────────
    if (action === "close") {
      if (!conversationId && !numeroCliente) {
        return new Response(JSON.stringify({ error: "conversationId or numeroCliente required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Buscar registro por numero_cliente o conversationId
      const searchValue = numeroCliente || conversationId;
      const searchField = numeroCliente ? "numero_cliente" : "conversation_id";
      const whereClause = `(${searchField},eq,${searchValue})`;

      const searchRes = await fetch(
        `${baseUrl}/api/v2/tables/${TABLE_ID}/records?where=${encodeURIComponent(whereClause)}&limit=1`,
        { headers: nocoHeaders }
      );
      const searchData = await searchRes.json();
      const record = searchData?.list?.[0];

      if (!record) {
        // No hay registro en NocoDB — puede ser ticket manual sin sync previo, no es error crítico
        return new Response(JSON.stringify({ success: true, skipped: true, reason: "No record found" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Actualizar estado a Resuelto
      const updateRes = await fetch(`${baseUrl}/api/v2/tables/${TABLE_ID}/records`, {
        method: "PATCH",
        headers: nocoHeaders,
        body: JSON.stringify({ Id: record.Id, estado_derivado: "Resuelto" }),
      });

      const updateData = await updateRes.json();
      return new Response(JSON.stringify({ success: updateRes.ok, data: updateData }), {
        status: updateRes.ok ? 200 : updateRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use 'create' or 'close'" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[nocodb-sync] error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
