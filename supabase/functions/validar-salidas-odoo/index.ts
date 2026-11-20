// Validar salidas de mercadería (Odoo).
// Solo la puede usar un usuario con rol "admin" de la app.
//
// Acciones:
//   { accion: "listar",  numeros: [...] }                  → SOLO LECTURA (hasta 60 pedidos)
//   { accion: "validar", numeros: [...], simular: true }   → simulación: no escribe nada en Odoo (hasta 10)
//   { accion: "validar", numeros: [...], simular: false }  → valida de verdad (hasta 10)
//
// Cómo valida (por pedido):
//   1) Comprueba disponibilidad en Odoo (el botón «Comprobar disponibilidad» de la entrega).
//   2) Si TODOS los productos quedaron reservados → valida la entrega (se completa el pedido entero).
//   3) Si falta stock en cualquier producto → NO fuerza nada: lo deja pendiente para hacerlo a mano.
//   Un pedido que falla no frena a los demás. Solo se tocan pedidos que en la app figuran como «entregado».
//
// Salida: { simulado, resultados: [{ numero, estado_odoo, clasificacion, entregas, faltantes, accion, detalle? }] }
//   clasificacion (estado de la entrega en Odoo, DESPUÉS de la acción):
//     validada | pendiente | sin_stock | borrador | sin_entrega | cancelada | no_encontrado
//   accion (solo en "validar"):
//     validada       → se validó ahora
//     se_validaria   → (simulación) está lista y se validaría
//     se_comprobaria → (simulación) no tiene stock reservado: se comprobaría la disponibilidad y se validaría si alcanza
//     sin_stock      → se comprobó la disponibilidad y sigue faltando stock: queda pendiente para hacerlo a mano
//     sin_cambios    → no había nada para hacer (ya validada, sin entrega, cancelada, no está entregado en la app…)
//     error          → falló; "detalle" tiene el motivo
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

const MAX_LISTAR = 60;
const MAX_VALIDAR = 10;

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

// Mensaje legible de un error de Odoo
function mensajeOdoo(r: any, accion = "leer las entregas"): string {
  const msg: string = r?.error?.data?.message || r?.error?.message || "Error de Odoo";
  if (/access|acceso|permission|permiso/i.test(msg)) {
    return `El usuario de Odoo «${ODOO_LOGIN}» no tiene permiso para ${accion}. (${msg})`;
  }
  return msg;
}

// ==== NUCLEO (lógica pura: se prueba por separado) ====
const TOLERANCIA = 0.0001;

type Entrega = { id: number; name: string; state: string };
type Faltante = { producto: string; faltan: number };
type Clasificada = { clasificacion: string; entregas: Entrega[]; faltantes: Faltante[] };

// Función que ejecuta un método en Odoo: devuelve la respuesta JSON-RPC completa ({result} o {error})
type Ejecutar = (modelo: string, metodo: string, args: any[], kwargs?: Record<string, unknown>) => Promise<any>;

// Decide en qué situación está un pedido, a partir de sus entregas y movimientos
function clasificar(orden: any | null, entregas: any[], movimientos: any[]): Clasificada {
  if (!orden) return { clasificacion: "no_encontrado", entregas: [], faltantes: [] };

  const salida = entregas.filter((p) => p.picking_type_code === "outgoing");
  const lista: Entrega[] = salida.map((p) => ({ id: p.id, name: p.name, state: p.state }));
  const vigentes = salida.filter((p) => p.state !== "cancel");

  if (!vigentes.length) {
    return {
      clasificacion: salida.length ? "cancelada" : "sin_entrega",
      entregas: lista,
      faltantes: [],
    };
  }

  const pendientes = vigentes.filter((p) => p.state !== "done");
  if (!pendientes.length) return { clasificacion: "validada", entregas: lista, faltantes: [] };

  // Stock que falta reservar en las entregas pendientes
  const idsPend = new Set(pendientes.map((p) => p.id));
  const faltantes: Faltante[] = [];
  for (const m of movimientos) {
    if (!idsPend.has(m.picking_id?.[0])) continue;
    if (m.state === "done" || m.state === "cancel") continue;
    const falta = Number(m.product_uom_qty || 0) - Number(m.reserved_availability || 0);
    if (falta > TOLERANCIA) {
      faltantes.push({ producto: m.product_id?.[1] ?? "Producto", faltan: Math.round(falta * 100) / 100 });
    }
  }

  if (pendientes.some((p) => p.state === "draft")) {
    return { clasificacion: "borrador", entregas: lista, faltantes };
  }
  if (faltantes.length || pendientes.some((p) => ["waiting", "confirmed"].includes(p.state))) {
    return { clasificacion: "sin_stock", entregas: lista, faltantes };
  }
  return { clasificacion: "pendiente", entregas: lista, faltantes: [] };
}

// Lee entregas y movimientos de los ids de entrega indicados
async function leerEntregas(ex: Ejecutar, ids: number[]) {
  if (!ids.length) return { entregas: [] as any[], movimientos: [] as any[], error: null as any };
  const rEnt = await ex("stock.picking", "search_read", [[["id", "in", ids]]], {
    fields: ["name", "state", "picking_type_code"],
  });
  if (rEnt.error) return { entregas: [], movimientos: [], error: mensajeOdoo(rEnt) };
  const rMov = await ex("stock.move", "search_read", [[["picking_id", "in", ids]]], {
    fields: ["picking_id", "product_id", "product_uom_qty", "reserved_availability", "state"],
  });
  if (rMov.error) return { entregas: [], movimientos: [], error: mensajeOdoo(rMov) };
  return { entregas: rEnt.result ?? [], movimientos: rMov.result ?? [], error: null };
}

// Valida UNA entrega en Odoo (botón «Validar»), resolviendo el asistente de "transferencia inmediata"
async function validarEntrega(ex: Ejecutar, id: number) {
  const permiso = "validar entregas";
  const r = await ex("stock.picking", "button_validate", [[id]]);
  if (r.error) throw new Error(mensajeOdoo(r, permiso));
  const res = r.result;
  if (res === true || res === null || res === undefined) return;

  if (res && typeof res === "object" && res.res_model === "stock.immediate.transfer") {
    const ctx = res.context ?? {};
    const rc = await ex("stock.immediate.transfer", "create", [{}], { context: ctx });
    if (rc.error) throw new Error(mensajeOdoo(rc, permiso));
    const rp = await ex("stock.immediate.transfer", "process", [[rc.result]], { context: ctx });
    if (rp.error) throw new Error(mensajeOdoo(rp, permiso));
    if (rp.result === true || rp.result === null || rp.result === undefined) return;
    throw new Error("Odoo pidió un paso adicional al validar (" + (rp.result?.res_model ?? "desconocido") + "). No se validó.");
  }
  throw new Error("Odoo pidió un paso adicional al validar (" + (res?.res_model ?? "desconocido") + "). No se validó.");
}

type Resultado = Clasificada & { numero: string; estado_odoo: string | null; accion?: string; detalle?: string };

// Procesa UN pedido: comprueba disponibilidad y valida si está todo. Nunca fuerza.
async function validarPedido(
  ex: Ejecutar,
  numero: string,
  orden: any | null,
  entregasIniciales: any[],
  movimientosIniciales: any[],
  simular: boolean,
  enApp: boolean,
): Promise<Resultado> {
  const inicial = clasificar(orden, entregasIniciales, movimientosIniciales);
  const base = { numero, estado_odoo: orden?.state ?? null };

  if (!enApp) {
    return { ...base, ...inicial, accion: "sin_cambios", detalle: "En la app no figura como entregado." };
  }
  if (!["pendiente", "sin_stock"].includes(inicial.clasificacion)) {
    return { ...base, ...inicial, accion: "sin_cambios" };
  }

  if (simular) {
    return {
      ...base,
      ...inicial,
      accion: inicial.clasificacion === "pendiente" ? "se_validaria" : "se_comprobaria",
    };
  }

  try {
    const idsEntregas: number[] = orden.picking_ids ?? [];
    const idsPendientes = entregasIniciales
      .filter((p) => p.picking_type_code === "outgoing" && !["done", "cancel", "draft"].includes(p.state))
      .map((p) => p.id);

    // 1) Comprobar disponibilidad (reserva el stock que haya)
    const rA = await ex("stock.picking", "action_assign", [idsPendientes]);
    if (rA.error) throw new Error(mensajeOdoo(rA, "comprobar la disponibilidad"));

    // 2) Releer cómo quedó
    const l1 = await leerEntregas(ex, idsEntregas);
    if (l1.error) throw new Error(l1.error);
    const tras = clasificar(orden, l1.entregas, l1.movimientos);

    if (tras.clasificacion !== "pendiente") {
      // Falta stock (o cambió algo): se deja como está, sin forzar
      return {
        ...base,
        ...tras,
        accion: tras.clasificacion === "sin_stock" ? "sin_stock" : "sin_cambios",
      };
    }

    // 3) Está todo reservado: validar las entregas pendientes
    const aValidar = l1.entregas
      .filter((p) => p.picking_type_code === "outgoing" && p.state === "assigned")
      .map((p) => p.id);
    for (const id of aValidar) await validarEntrega(ex, id);

    // 4) Confirmar que quedó hecha
    const l2 = await leerEntregas(ex, idsEntregas);
    if (l2.error) throw new Error(l2.error);
    const final = clasificar(orden, l2.entregas, l2.movimientos);
    if (final.clasificacion !== "validada") {
      return {
        ...base,
        ...final,
        accion: "error",
        detalle: "Se intentó validar pero la entrega no quedó hecha en Odoo. Revisala a mano.",
      };
    }
    return { ...base, ...final, accion: "validada" };
  } catch (e) {
    return { ...base, ...inicial, accion: "error", detalle: (e as Error).message };
  }
}
// ==== FIN NUCLEO ====

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return responder({ error: "Method not allowed" }, 405);

  try {
    // ---- 1) Solo administradores ----
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
    if (!perfil || perfil.rol !== "admin" || !perfil.activo) {
      return responder({ error: "Esta sección es solo para el administrador." }, 403);
    }

    // ---- 2) Datos de entrada ----
    const { accion, numeros, simular } = await req.json();
    if (accion !== "listar" && accion !== "validar") return responder({ error: "Acción no válida." }, 400);
    if (!Array.isArray(numeros) || numeros.length === 0) return responder({ resultados: [] });
    const lista = [...new Set(numeros.map((n: unknown) => String(n).trim()).filter(Boolean))];
    const maximo = accion === "listar" ? MAX_LISTAR : MAX_VALIDAR;
    if (lista.length > maximo) {
      return responder({ error: `Se pueden procesar hasta ${maximo} pedidos por vez.` }, 400);
    }
    // Para escribir en Odoo hay que pedirlo de forma explícita: cualquier otro valor simula
    const soloSimular = accion === "validar" && simular !== false;

    // ---- 3) Odoo ----
    const auth = await odooCall("common", "login", [ODOO_DB, ODOO_LOGIN, ODOO_PASSWORD]);
    const uid = auth.result;
    if (!uid) return responder({ error: "No se pudo autenticar en Odoo." }, 401);

    const ex: Ejecutar = (modelo, metodo, args, kwargs = {}) =>
      odooCall("object", "execute_kw", [ODOO_DB, uid, ODOO_PASSWORD, modelo, metodo, args, kwargs]);

    const rOrdenes = await ex("sale.order", "search_read", [[["name", "in", lista]]], {
      fields: ["name", "state", "picking_ids"],
    });
    if (rOrdenes.error) return responder({ error: mensajeOdoo(rOrdenes) }, 400);
    const ordenes: any[] = rOrdenes.result ?? [];

    const idsEntregas = [...new Set(ordenes.flatMap((o) => o.picking_ids ?? []))] as number[];
    const lectura = await leerEntregas(ex, idsEntregas);
    if (lectura.error) return responder({ error: lectura.error }, 400);

    // Para validar: solo pedidos que en la app figuran como entregados
    let entregadosEnApp = new Set<string>();
    if (accion === "validar") {
      const { data: enApp, error: errApp } = await cliente
        .from("pedidos")
        .select("numero_pedido")
        .in("numero_pedido", lista)
        .eq("estado", "entregado");
      if (errApp) return responder({ error: `No se pudo comprobar los pedidos en la app: ${errApp.message}` }, 500);
      entregadosEnApp = new Set((enApp ?? []).map((p: any) => p.numero_pedido));
    }

    const resultados: Resultado[] = [];
    for (const numero of lista) {
      const orden = ordenes.find((o) => o.name === numero) ?? null;
      const idsDeOrden = new Set(orden?.picking_ids ?? []);
      const entregasDeOrden = lectura.entregas.filter((p) => idsDeOrden.has(p.id));
      const movsDeOrden = lectura.movimientos.filter((m) => idsDeOrden.has(m.picking_id?.[0]));

      if (accion === "listar") {
        resultados.push({
          numero,
          estado_odoo: orden?.state ?? null,
          ...clasificar(orden, entregasDeOrden, movsDeOrden),
        });
      } else {
        // De a uno: si uno falla, los demás siguen
        resultados.push(
          await validarPedido(
            ex,
            numero,
            orden,
            entregasDeOrden,
            movsDeOrden,
            soloSimular,
            entregadosEnApp.has(numero),
          ),
        );
      }
    }

    return responder(accion === "validar" ? { simulado: soloSimular, resultados } : { resultados });
  } catch (error) {
    return responder({ error: (error as Error).message }, 500);
  }
});
