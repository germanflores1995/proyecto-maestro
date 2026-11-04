import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

const ODOO_URL = "https://live.distribuidoramaestro.com";
const ODOO_DB = "live";
const ODOO_LOGIN = "expedicion";
const ODOO_PASSWORD = Deno.env.get("ODOO_API_KEY");

// Solo se trabajan presupuestos: "Presupuesto" (draft) y "Presupuesto enviado" (sent)
const ESTADOS_PERMITIDOS = ["draft", "sent"];
const DIAS_ATRAS = 90;
const MAX_RESULTADOS = 10;

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

// Odoo devuelve false cuando un campo está vacío y puede traer HTML en los textos
function limpiarTexto(valor: unknown): string {
  if (!valor || typeof valor !== "string") return "";
  return valor
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const textoOnull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

// "2026-10-16 20:50:24" (UTC) -> "2026-10-16T20:50:24Z"
const aIso = (v: unknown) =>
  typeof v === "string" && v ? v.replace(" ", "T") + "Z" : null;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return responder({ error: "Method not allowed" }, 405);
  }

  try {
    const { texto } = await req.json();

    const auth = await odooCall("common", "login", [ODOO_DB, ODOO_LOGIN, ODOO_PASSWORD]);
    const uid = auth.result;
    if (!uid) return responder({ error: "No se pudo autenticar en Odoo" }, 401);

    const ejecutar = (modelo: string, metodo: string, args: any[], kwargs: any = {}) =>
      odooCall("object", "execute_kw", [ODOO_DB, uid, ODOO_PASSWORD, modelo, metodo, args, kwargs]);

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

    if (!numeroCompleto) {
      dominio.push(["create_date", ">=", fechaLimite()]);
      dominio.push(["state", "in", ESTADOS_PERMITIDOS]);
    }

    const r = await ejecutar("sale.order", "search_read", [dominio], {
      fields: [
        "name", "partner_id", "amount_total", "create_date", "date_order",
        "state", "user_id", "comment",
      ],
      limit: MAX_RESULTADOS + 1,
      order: "create_date desc, id desc",
    });
    if (r.error) return responder({ error: r.error }, 400);

    const filas: any[] = r.result ?? [];
    const visibles = filas.slice(0, MAX_RESULTADOS);

    // Datos de contacto del cliente (si Odoo los tiene)
    const contactos: Record<number, { telefono: string | null; email: string | null }> = {};
    const idsPartner = [...new Set(visibles.map((o) => o.partner_id?.[0]).filter(Boolean))] as number[];
    if (idsPartner.length) {
      for (const campos of [["phone", "mobile", "email"], ["phone", "email"], ["email"]]) {
        const p = await ejecutar("res.partner", "read", [idsPartner], { fields: campos });
        if (!p.error && Array.isArray(p.result)) {
          for (const c of p.result) {
            contactos[c.id] = {
              telefono: textoOnull(c.mobile) ?? textoOnull(c.phone),
              email: textoOnull(c.email),
            };
          }
          break;
        }
      }
    }

    const resultados = visibles.map((o) => ({
      odoo_id: o.id,
      numero_pedido: o.name,
      cliente: o.partner_id?.[1] ?? "Desconocido",
      monto: o.amount_total,
      fecha_creacion: aIso(o.create_date) ?? aIso(o.date_order),
      estado_odoo: o.state,
      vendedor_odoo: o.user_id?.[1] ?? null,
      telefono: contactos[o.partner_id?.[0]]?.telefono ?? null,
      email: contactos[o.partner_id?.[0]]?.email ?? null,
      comentario: limpiarTexto(o.comment),
      cargable: ESTADOS_PERMITIDOS.includes(o.state),
    }));

    return responder({ resultados, hay_mas: filas.length > MAX_RESULTADOS });
  } catch (error) {
    return responder({ error: (error as Error).message }, 500);
  }
});
