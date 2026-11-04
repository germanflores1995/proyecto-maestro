import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, x-client-info, apikey",
};

const ODOO_URL = "https://live.distribuidoramaestro.com";
const ODOO_DB = "live";
const ODOO_LOGIN = "expedicion";
const ODOO_PASSWORD = Deno.env.get("ODOO_API_KEY");

async function odooCall(service: string, method: string, args: any[]) {
  const res = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: Math.floor(Math.random() * 1000),
    }),
  });
  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const { numero_pedido } = await req.json();

    if (!numero_pedido) {
      return new Response(
        JSON.stringify({ error: "numero_pedido is required" }),
        {
          status: 400,
          headers: corsHeaders,
        },
      );
    }

    // Paso 1: autenticar para obtener el uid
    const authData = await odooCall("common", "login", [
      ODOO_DB,
      ODOO_LOGIN,
      ODOO_PASSWORD,
    ]);
    console.log("Auth response:", JSON.stringify(authData));

    const uid = authData.result;

    if (!uid) {
      return new Response(
        JSON.stringify({
          error: "No se pudo autenticar en Odoo",
          detalle: authData,
        }),
        {
          status: 401,
          headers: corsHeaders,
        },
      );
    }

    // Paso 2: buscar el pedido usando el uid ya autenticado
    const odooData = await odooCall("object", "execute_kw", [
      ODOO_DB,
      uid,
      ODOO_PASSWORD,
      "sale.order",
      "search_read",
      [[["name", "=", numero_pedido]]],
      { fields: ["name", "amount_total", "partner_id"], limit: 1 },
    ]);

    console.log("Odoo response:", JSON.stringify(odooData));

    if (odooData.error) {
      return new Response(JSON.stringify({ error: odooData.error }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const result = odooData.result[0];

    if (!result) {
      return new Response(
        JSON.stringify({ error: "Pedido no encontrado en Odoo" }),
        {
          status: 404,
          headers: corsHeaders,
        },
      );
    }

    return new Response(
      JSON.stringify({
        numero_pedido: result.name,
        monto: result.amount_total,
        cliente: result.partner_id[1] || "Desconocido",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
