// Edge Function: validar-entregas-odoo
// Acciones:
//   { accion: "estado", numeros: ["S00123", ...] }  -> estado de los albaranes de salida (solo lectura)
//   { accion: "validar", numero_pedido, dia }       -> valida el albarán si está listo; si no, lo deja pendiente
// Solo admin y encargado de expedición. Nunca marca nada como validado si Odoo no lo confirma.
// Secretos: ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY (mismos que usa obtener-monto-odoo).

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Nombres de campos según la versión MAYOR de Odoo.
// Para una versión nueva, se agrega una línea acá. No hace falta tocar el resto.
const MAPA_CAMPOS: Record<string, { cantidad_hecha: string }> = {
  "14": { cantidad_hecha: "quantity_done" },
  "15": { cantidad_hecha: "quantity_done" },
  "16": { cantidad_hecha: "quantity_done" },
  "17": { cantidad_hecha: "quantity" },
  "18": { cantidad_hecha: "quantity" },
};

const ODOO_URL = Deno.env.get("ODOO_URL")!;
const ODOO_DB = Deno.env.get("ODOO_DB")!;
const ODOO_USER = Deno.env.get("ODOO_USER")!;
const ODOO_API_KEY = Deno.env.get("ODOO_API_KEY")!;

class ErrorOdoo extends Error {}

function json(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Llamada JSON-RPC cruda a Odoo
async function rpc(service: string, method: string, args: unknown[]) {
  const r = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args } }),
  });
  const j = await r.json();
  if (j.error) throw new ErrorOdoo(j.error.data?.message || j.error.message || "Error de Odoo");
  return j.result;
}

let uidCache: number | null = null;
async function uid(): Promise<number> {
  if (!uidCache) {
    uidCache = await rpc("common", "authenticate", [ODOO_DB, ODOO_USER, ODOO_API_KEY, {}]);
    if (!uidCache) throw new ErrorOdoo("No se pudo autenticar en Odoo");
  }
  return uidCache;
}

// Llamada a un modelo (execute_kw)
async function llamar(modelo: string, metodo: string, args: unknown[] = [], kwargs: Record<string, unknown> = {}) {
  return rpc("object", "execute_kw", [ODOO_DB, await uid(), ODOO_API_KEY, modelo, metodo, args, kwargs]);
}

// Albaranes de salida de un conjunto de pedidos
async function albaranesDe(numeros: string[]) {
  return (await llamar(
    "stock.picking",
    "search_read",
    [[["origin", "in", numeros], ["picking_type_code", "=", "outgoing"]]],
    { fields: ["id", "name", "state", "origin"] },
  )) as { id: number; name: string; state: string; origin: string }[];
}

function esErrorDeCampo(msg: string) {
  return /Invalid field|no existe el campo|does not exist/i.test(msg);
}

async function registrarEstado(sb: any, ok: boolean, mensaje: string | null, version: string | null) {
  await sb
    .from("integracion_odoo_estado")
    .update({ ok, mensaje, version, actualizado_at: new Date().toISOString() })
    .eq("id", 1);
}

// Guarda o actualiza la fila de un albarán (una por picking)
async function guardarFila(sb: any, fila: Record<string, unknown>) {
  const ahora = new Date().toISOString();
  const datos = { ...fila, updated_at: ahora };
  if (fila.picking_id) {
    const { data } = await sb
      .from("validaciones_odoo")
      .select("id")
      .eq("picking_id", fila.picking_id)
      .maybeSingle();
    if (data) {
      const { error } = await sb.from("validaciones_odoo").update(datos).eq("id", data.id);
      if (error) throw error;
      return;
    }
  }
  const { error } = await sb.from("validaciones_odoo").insert(datos);
  if (error) throw error;
}

// Estado de los albaranes (no modifica nada en Odoo)
async function consultarEstado(numeros: string[]) {
  const albaranes = numeros.length ? await albaranesDe(numeros) : [];
  const por: Record<string, { picking_id: number; name: string; state: string }[]> = {};
  for (const a of albaranes) {
    (por[a.origin] ||= []).push({ picking_id: a.id, name: a.name, state: a.state });
  }
  return { pedidos: numeros.map((n) => ({ numero_pedido: n, albaranes: por[n] || [] })) };
}

// Valida el albarán de un pedido si está listo. Cada resultado se guarda en la tabla.
async function validarPedido(sb: any, userId: string, numero: string, dia: string, campos: { cantidad_hecha: string }) {
  const albaranes = await albaranesDe([numero]);
  const resultados: { picking_id: number | null; name: string | null; estado: string; motivo: string | null }[] = [];

  if (albaranes.length === 0) {
    const motivo = "No se encontró albarán de salida en Odoo";
    await guardarFila(sb, {
      numero_pedido: numero, picking_id: null, picking_name: null, dia,
      estado: "pendiente", estado_odoo: null, motivo,
    });
    return { numero_pedido: numero, resultados: [{ picking_id: null, name: null, estado: "pendiente", motivo }] };
  }

  for (const alb of albaranes) {
    let estadoFinal = alb.state;
    let estado: "pendiente" | "validado_odoo" = "pendiente";
    let motivo: string | null = null;

    try {
      if (alb.state === "done") {
        estado = "validado_odoo";
      } else if (alb.state === "cancel") {
        motivo = "El albarán está cancelado en Odoo";
      } else if (alb.state !== "assigned") {
        motivo = `No está listo para validar (estado en Odoo: ${alb.state})`;
      } else {
        // Listo: cargar la cantidad de cada línea igual a lo pedido y validar
        const lineas = (await llamar(
          "stock.move",
          "search_read",
          [[["picking_id", "=", alb.id]]],
          { fields: ["id", "product_uom_qty"] },
        )) as { id: number; product_uom_qty: number }[];

        if (lineas.length === 0) {
          motivo = "El albarán no tiene líneas";
        } else {
          for (const l of lineas) {
            await llamar("stock.move", "write", [[l.id], { [campos.cantidad_hecha]: l.product_uom_qty }]);
          }
          const res = await llamar("stock.picking", "button_validate", [[alb.id]]);

          // Odoo puede pedir una confirmación extra (transferencia inmediata). Solo esa se confirma.
          // Si pide crear un albarán de resto (entrega parcial), no se hace: queda para revisar a mano.
          if (res && typeof res === "object" && res.res_model) {
            if (res.res_model === "stock.immediate.transfer") {
              const idAsistente = await llamar(res.res_model, "create", [{ pick_ids: [[6, 0, [alb.id]]] }], { context: res.context || {} });
              await llamar(res.res_model, "process", [[idAsistente]], { context: res.context || {} });
            } else {
              motivo = `Odoo pide una confirmación que la app no hace (${res.res_model}). Validar a mano`;
            }
          }

          if (!motivo) {
            const [ahora] = await albaranesDe([numero]).then((lista) => lista.filter((x) => x.id === alb.id));
            estadoFinal = ahora?.state || "desconocido";
            if (estadoFinal === "done") estado = "validado_odoo";
            else motivo = `Odoo no completó la validación (estado: ${estadoFinal})`;
          }
        }
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (esErrorDeCampo(msg)) throw e; // lo maneja el handler general (integración)
      motivo = `Error de Odoo: ${msg}`;
    }

    if (estado === "validado_odoo") {
      await guardarFila(sb, {
        numero_pedido: numero, picking_id: alb.id, picking_name: alb.name, dia,
        estado, estado_odoo: estadoFinal, motivo: null,
        validado_por: userId, validado_at: new Date().toISOString(),
      });
    } else {
      await guardarFila(sb, {
        numero_pedido: numero, picking_id: alb.id, picking_name: alb.name, dia,
        estado: "pendiente", estado_odoo: estadoFinal, motivo,
      });
    }
    resultados.push({ picking_id: alb.id, name: alb.name, estado, motivo });
  }

  return { numero_pedido: numero, resultados };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  // 1) Quién llama y si tiene permiso
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: "No autenticado" }, 401);

  const { data: perfil } = await sb.from("usuarios").select("rol").eq("id", user.id).maybeSingle();
  if (!["admin", "encargado_expedicion"].includes(perfil?.rol ?? "")) {
    return json({ error: "Sin permiso para validar entregas" }, 403);
  }

  const body = await req.json().catch(() => ({}));

  try {
    // 2) Versión de Odoo y mapa de campos
    const version = String((await rpc("common", "version", []))?.server_version ?? "");
    const mayor = version.split(".")[0];
    const campos = MAPA_CAMPOS[mayor];
    if (!campos) {
      await registrarEstado(sb, false, `Versión de Odoo sin mapa de campos: ${version}`, version);
      return json({ error: "odoo_version_no_soportada", version }, 422);
    }

    // 3) Acción
    if (body.accion === "estado") {
      const numeros = Array.isArray(body.numeros) ? body.numeros.slice(0, 200) : [];
      const res = await consultarEstado(numeros);
      await registrarEstado(sb, true, null, version);
      return json(res);
    }

    if (body.accion === "validar") {
      const numero = String(body.numero_pedido ?? "");
      const dia = String(body.dia ?? "");
      if (!numero || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return json({ error: "Datos incompletos" }, 400);
      const res = await validarPedido(sb, user.id, numero, dia, campos);
      await registrarEstado(sb, true, null, version);
      return json(res);
    }

    return json({ error: "Acción no válida" }, 400);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (esErrorDeCampo(msg)) {
      await registrarEstado(sb, false, `Campo de Odoo no encontrado: ${msg}`, null);
      return json({ error: "campo_odoo_invalido", mensaje: msg }, 422);
    }
    return json({ error: "odoo", mensaje: msg }, 502);
  }
});
