import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options);
      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.log(`Attempt ${attempt + 1}/${retries} failed: ${lastError.message}`);
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }
  throw lastError || new Error("All retries failed");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const NOCODB_API_TOKEN = Deno.env.get("NOCODB_API_TOKEN");
    const NOCODB_BASE_URL = Deno.env.get("NOCODB_BASE_URL");
    if (!NOCODB_API_TOKEN || !NOCODB_BASE_URL) {
      throw new Error("NocoDB configuration missing");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, tableId, baseId, rowId, data, query } = body;

    // Input validation helpers
    const SAFE_IDENTIFIER = /^[a-zA-Z0-9_\-\s\u00C0-\u024F]+$/;
    const MAX_PARAM_LENGTH = 500;

    function validateIdentifier(value: string, name: string): void {
      if (typeof value !== "string" || value.length > MAX_PARAM_LENGTH) {
        throw new Error(`Invalid ${name}: too long or wrong type`);
      }
      // Allow NocoDB filter syntax: field names, operators, values with parentheses and commas
      const SAFE_FILTER = /^[a-zA-Z0-9_\-\s\u00C0-\u024F(),~%.!=<>|&]+$/;
      if (!SAFE_FILTER.test(value)) {
        throw new Error(`Invalid ${name}: contains disallowed characters`);
      }
    }

    function validateSort(value: string): void {
      if (typeof value !== "string" || value.length > MAX_PARAM_LENGTH) {
        throw new Error("Invalid sort: too long or wrong type");
      }
      // Sort format: -fieldName or fieldName, comma-separated
      const SAFE_SORT = /^-?[a-zA-Z0-9_\u00C0-\u024F]+(,-?[a-zA-Z0-9_\u00C0-\u024F]+)*$/;
      if (!SAFE_SORT.test(value)) {
        throw new Error("Invalid sort: contains disallowed characters");
      }
    }

    function validateFields(value: string): void {
      if (typeof value !== "string" || value.length > MAX_PARAM_LENGTH) {
        throw new Error("Invalid fields: too long or wrong type");
      }
      const SAFE_FIELDS = /^[a-zA-Z0-9_\u00C0-\u024F]+(,[a-zA-Z0-9_\u00C0-\u024F]+)*$/;
      if (!SAFE_FIELDS.test(value)) {
        throw new Error("Invalid fields: contains disallowed characters");
      }
    }

    const baseUrl = NOCODB_BASE_URL.replace(/\/$/, "");
    let url = "";
    let method = "GET";
    let fetchBody: string | undefined;

    switch (action) {
      case "list": {
        const params = new URLSearchParams();
        const limit = Math.min(Math.max(parseInt(String(query?.limit || 10), 10) || 10, 1), 100);
        params.set("limit", String(limit));
        if (query?.offset) {
          const offset = Math.max(parseInt(String(query.offset), 10) || 0, 0);
          params.set("offset", String(offset));
        }
        if (query?.where) {
          validateIdentifier(query.where, "where");
          params.set("where", query.where);
        }
        if (query?.sort) {
          validateSort(query.sort);
          params.set("sort", query.sort);
        }
        if (query?.fields) {
          validateFields(query.fields);
          params.set("fields", query.fields);
        }
        url = `${baseUrl}/api/v2/tables/${tableId}/records?${params.toString()}`;
        break;
      }
      case "read":
        url = `${baseUrl}/api/v2/tables/${tableId}/records/${rowId}`;
        break;
      case "create":
        url = `${baseUrl}/api/v2/tables/${tableId}/records`;
        method = "POST";
        fetchBody = JSON.stringify(data);
        break;
      case "update":
        url = `${baseUrl}/api/v2/tables/${tableId}/records`;
        method = "PATCH";
        fetchBody = JSON.stringify(data);
        break;
      case "delete":
        url = `${baseUrl}/api/v2/tables/${tableId}/records`;
        method = "DELETE";
        fetchBody = JSON.stringify(data);
        break;
      case "meta":
        url = `${baseUrl}/api/v2/meta/tables/${tableId}`;
        break;
      case "list-tables":
        url = `${baseUrl}/api/v2/meta/bases/${baseId}/tables`;
        break;
      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const fetchOptions: RequestInit = {
      method,
      headers: {
        "xc-token": NOCODB_API_TOKEN,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Connection": "close",
      },
      ...(fetchBody ? { body: fetchBody } : {}),
    };

    const nocoResponse = await fetchWithRetry(url, fetchOptions);

    // Read as text first to handle potential partial JSON
    const responseText = await nocoResponse.text();
    
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid response from NocoDB", raw: responseText.substring(0, 200) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!nocoResponse.ok) {
      return new Response(JSON.stringify({ error: `NocoDB error [${nocoResponse.status}]`, details: responseData }), {
        status: nocoResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("nocodb-proxy error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
