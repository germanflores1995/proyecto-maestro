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

// Estados de Odoo que se pueden cargar en la app
const ESTADOS_PERMITIDOS: string[] | null = [
  "draft",
  "sent",
  "sale",
  "sale_control",
  "in_deposit",
];
const DIAS_ATRAS = 60;
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

// El campo "Comentario" de Odoo puede venir vacío (false) o con formato HTML
function limpiarComentario(valor: unknown): string {
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return responder({ error: "Method not allowed" }, 405);
  }

  try {
    const { accion, texto, valor } = await req.json();

    const auth = await odooCall("common", "login", [
      ODOO_DB,
      ODOO_LOGIN,
      ODOO_PASSWORD,
    ]);
    const uid = auth.result;
    if (!uid) return responder({ error: "No se pudo autenticar en Odoo" }, 401);

    const ejecutar = (modelo: string, metodo: string, args: any[], kwargs: any = {}) =>
      odooCall("object", "execute_kw", [
        ODOO_DB,
        uid,
        ODOO_PASSWORD,
        modelo,
        metodo,
        args,
        kwargs,
      ]);

    // Prueba: lista los estados que existen en Odoo
    if (accion === "estados") {
      const r = await ejecutar("sale.order", "fields_get", [["state"]], {
        attributes: ["string", "type", "selection"],
      });
      return responder(r.result ?? r);
    }

    // Diagnóstico: busca en qué campo del pedido está guardado un texto (ej: "op1")
    if (accion === "campos") {
      const pedidoNum = String(texto ?? "").trim();
      const buscado = String(valor ?? "op1").toLowerCase();
      const f = await ejecutar("sale.order", "fields_get", [], {
        attributes: ["string", "type"],
      });
      const defs: Record<string, any> = f.result ?? {};
      const textuales = Object.keys(defs).filter((k) =>
        ["char", "text", "html"].includes(defs[k]?.type),
      );
      const ids = await ejecutar("sale.order", "search", [[["name", "=", pedidoNum]]], {
        limit: 1,
      });
      const id = ids.result?.[0];
      if (!id) return responder({ error: "Pedido no encontrado" }, 404);
      const rec = await ejecutar("sale.order", "read", [[id]], {
        fields: textuales,
      });
      if (rec.error) return responder({ error: rec.error }, 400);
      const fila: Record<string, any> = rec.result?.[0] ?? {};
      const coincidencias = Object.keys(fila)
        .filter((k) => {
          const v = typeof fila[k] === "string" ? fila[k] : "";
          return (
            v.toLowerCase().includes(buscado) ||
            /coment|nota|observ|note|comment/i.test(`${k} ${defs[k]?.string ?? ""}`)
          );
        })
        .map((k) => ({
          campo: k,
          etiqueta: defs[k]?.string,
          tipo: defs[k]?.type,
          valor: fila[k],
        }));
      return responder({ coincidencias });
    }

    const q = String(texto ?? "").trim();
    const numeroCompleto = /^\d{4}-\d{8}$/.test(q);
    const soloDigitos = /^\d+$/.test(q);
    const parteDeNumero = /^[\d-]+$/.test(q) && q.includes("-");

    let dominio: any[] = [];
    if (numeroCompleto) {
      dominio = [["name", "=", q]];
    } else if (soloDigitos) {
      if (q.length < 2) {
        return responder({ error: "Escribí al menos 2 dígitos" }, 400);
      }
      dominio = [["name", "=ilike", `%${q}`]];
    } else if (parteDeNumero) {
      if (q.length < 3) {
        return responder({ error: "Escribí al menos 3 caracteres" }, 400);
      }
      dominio = [["name", "ilike", q]];
    } else {
      if (q.length < 3) {
        return responder({ error: "Escribí al menos 3 letras" }, 400);
      }
      for (const palabra of q.split(/\s+/)) {
        dominio.push(["partner_id", "ilike", palabra]);
      }
    }

    if (!numeroCompleto) {
      dominio.push(["date_order", ">=", fechaLimite()]);
      if (ESTADOS_PERMITIDOS) dominio.push(["state", "in", ESTADOS_PERMITIDOS]);
    }

    const r = await ejecutar("sale.order", "search_read", [dominio], {
      fields: ["name", "partner_id", "amount_total", "date_order", "state", "comment"],
      limit: MAX_RESULTADOS + 1,
      order: "date_order desc, id desc",
    });
    if (r.error) return responder({ error: r.error }, 400);

    const filas = r.result ?? [];
    const resultados = filas.slice(0, MAX_RESULTADOS).map((o: any) => ({
      numero_pedido: o.name,
      cliente: o.partner_id?.[1] ?? "Desconocido",
      monto: o.amount_total,
      fecha: o.date_order ? o.date_order.replace(" ", "T") + "Z" : null,
      estado_odoo: o.state,
      comentario: limpiarComentario(o.comment),
      cargable: ESTADOS_PERMITIDOS ? ESTADOS_PERMITIDOS.includes(o.state) : true,
    }));

    return responder({ resultados, hay_mas: filas.length > MAX_RESULTADOS });
  } catch (error) {
    return responder({ error: (error as Error).message }, 500);
  }
});
