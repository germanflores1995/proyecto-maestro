// Devoluciones: busca pedidos "Vendido" en Odoo y trae el detalle de sus líneas.
// Solo lee Odoo, no escribe nada.
// La pueden usar el administrador y el encargado de expedición.
//
// Acciones:
//   { accion: "buscar",  texto }    → pedidos vendidos del último año (número o cliente)
//   { accion: "detalle", odoo_id }  → cabecera y líneas del pedido (como la hoja impresa)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

const ODOO_URL = "https://live.distribuidoramaestro.com";
const ODOO_DB = "live";
const ODOO_LOGIN = "expedicion";
const ODOO_PASSWORD = Deno.env.get("ODOO_API_KEY");

const ESTADO_VENDIDO = "sold";
const DIAS_ATRAS = 365;
const MAX_RESULTADOS = 10;
const ROLES_PERMITIDOS = ["admin", "encargado_expedicion"];

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

function fechaLimite() {
  const d = new Date(Date.now() - DIAS_ATRAS * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

const fechaIso = (f: string | false) => (f ? f.replace(" ", "T") + "Z" : null);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return responder({ error: "Method not allowed" }, 405);

  try {
    // ---- 1) Permiso: admin o encargado de expedición ----
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return responder({ error: "Falta iniciar sesión." }, 401);

    const cliente = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: u, error: errUser } = await cliente.auth.getUser(jwt);
    if (errUser || !u?.user) return responder({ error: "Sesión inválida." }, 401);
    const { data: perfil } = await cliente
      .from("usuarios")
      .select("rol, activo")
      .eq("id", u.user.id)
      .single();
    if (!perfil || !perfil.activo || !ROLES_PERMITIDOS.includes(perfil.rol)) {
      return responder({ error: "Esta sección es solo para administración y encargado de expedición." }, 403);
    }

    // ---- 2) Odoo ----
    const { accion, texto, odoo_id } = await req.json();

    const auth = await odooCall("common", "login", [ODOO_DB, ODOO_LOGIN, ODOO_PASSWORD]);
    const uid = auth.result;
    if (!uid) return responder({ error: "No se pudo autenticar en Odoo" }, 401);

    const ejecutar = (modelo: string, metodo: string, args: any[], kwargs: any = {}) =>
      odooCall("object", "execute_kw", [ODOO_DB, uid, ODOO_PASSWORD, modelo, metodo, args, kwargs]);

    // ---------- Buscar pedidos vendidos ----------
    if (accion === "buscar") {
      const q = String(texto ?? "").trim();
      const numeroCompleto = /^\d{4}-\d{8}$/.test(q);
      const soloDigitos = /^\d+$/.test(q);
      const parteDeNumero = /^[\d-]+$/.test(q) && q.includes("-");

      let dominio: any[] = [];
      if (numeroCompleto) {
        dominio = [["name", "=", q]];
      } else if (soloDigitos) {
        if (q.length < 2) return responder({ error: "Escribí al menos 2 dígitos" }, 400);
        dominio = [["name", "=ilike", `%${q}`]];
      } else if (parteDeNumero) {
        if (q.length < 3) return responder({ error: "Escribí al menos 3 caracteres" }, 400);
        dominio = [["name", "ilike", q]];
      } else {
        if (q.length < 3) return responder({ error: "Escribí al menos 3 letras" }, 400);
        for (const palabra of q.split(/\s+/)) dominio.push(["partner_id", "ilike", palabra]);
      }
      // Con el número completo se muestra aunque no esté vendido (para avisar por qué no se puede elegir)
      if (!numeroCompleto) {
        dominio.push(["date_order", ">=", fechaLimite()]);
        dominio.push(["state", "=", ESTADO_VENDIDO]);
      }

      const r = await ejecutar("sale.order", "search_read", [dominio], {
        fields: ["name", "partner_id", "amount_total", "date_order", "state"],
        limit: MAX_RESULTADOS + 1,
        order: "date_order desc, id desc",
      });
      if (r.error) return responder({ error: r.error?.data?.message || "Error al buscar en Odoo" }, 400);

      const filas = r.result ?? [];
      const resultados = filas.slice(0, MAX_RESULTADOS).map((o: any) => ({
        odoo_id: o.id,
        numero_pedido: o.name,
        cliente: o.partner_id?.[1] ?? "Desconocido",
        monto: o.amount_total,
        fecha: fechaIso(o.date_order),
        estado_odoo: o.state,
        vendido: o.state === ESTADO_VENDIDO,
      }));
      return responder({ resultados, hay_mas: filas.length > MAX_RESULTADOS });
    }

    // ---------- Detalle de un pedido ----------
    if (accion === "detalle") {
      const id = Number(odoo_id);
      if (!Number.isInteger(id) || id <= 0) return responder({ error: "Pedido inválido." }, 400);

      const c = await ejecutar("sale.order", "read", [[id]], {
        fields: ["name", "partner_id", "amount_total", "date_order", "state", "order_line"],
      });
      if (c.error) return responder({ error: c.error?.data?.message || "Error al leer el pedido" }, 400);
      const pedido = c.result?.[0];
      if (!pedido) return responder({ error: "El pedido no está en Odoo." }, 404);
      if (pedido.state !== ESTADO_VENDIDO) {
        return responder({ error: `El pedido ${pedido.name} no está en estado «Vendido».` }, 400);
      }

      const l = await ejecutar("sale.order.line", "read", [pedido.order_line || []], {
        fields: [
          "product_id",
          "name",
          "product_uom_qty",
          "price_unit",
          "discount",
          "price_subtotal",
          "price_total",
          "display_type",
          "sequence",
        ],
      });
      if (l.error) return responder({ error: l.error?.data?.message || "Error al leer las líneas" }, 400);
      const lineas = (l.result ?? [])
        .filter((x: any) => !x.display_type && x.product_id && x.product_uom_qty > 0)
        .sort((a: any, b: any) => (a.sequence - b.sequence) || (a.id - b.id));

      // Código interno de cada producto
      const idsProductos = [...new Set(lineas.map((x: any) => x.product_id[0]))];
      const codigos: Record<number, string> = {};
      if (idsProductos.length) {
        const p = await ejecutar("product.product", "read", [idsProductos], { fields: ["default_code"] });
        (p.result ?? []).forEach((x: any) => {
          codigos[x.id] = x.default_code || "";
        });
      }

      // El nombre del artículo en la hoja: el de la línea sin el "[CODIGO] " del principio
      const limpiarNombre = (txt: string) => String(txt || "").replace(/^\[[^\]]*\]\s*/, "").trim();

      return responder({
        pedido: {
          odoo_id: pedido.id,
          numero_pedido: pedido.name,
          cliente: pedido.partner_id?.[1] ?? "Desconocido",
          monto: pedido.amount_total,
          fecha: fechaIso(pedido.date_order),
        },
        lineas: lineas.map((x: any) => ({
          linea_odoo_id: x.id,
          codigo: codigos[x.product_id[0]] || "",
          producto: limpiarNombre(x.name) || x.product_id[1],
          cantidad: x.product_uom_qty,
          precio_unitario: x.price_unit,
          descuento_pct: x.discount || 0,
          subtotal: x.price_subtotal, // sin impuestos
          total: x.price_total, // con impuestos
        })),
      });
    }

    return responder({ error: "Acción no válida." }, 400);
  } catch (error) {
    return responder({ error: (error as Error).message }, 500);
  }
});
