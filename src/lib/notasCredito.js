import { supabase } from "./supabase";

// Llama a la función de Odoo para devoluciones (solo lectura)
export async function llamarDevolucionesOdoo(body) {
  const { data, error } = await supabase.functions.invoke("devoluciones-odoo", { body });
  if (error) {
    let mensaje = "No se pudo consultar Odoo.";
    if (error.context?.status === 404) {
      mensaje = "La función «devoluciones-odoo» todavía no está instalada en Supabase.";
    }
    try {
      const cuerpo = await error.context.json();
      if (typeof cuerpo?.error === "string") mensaje = cuerpo.error;
    } catch {
      /* se deja el mensaje general */
    }
    throw new Error(mensaje);
  }
  if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "Error de Odoo");
  return data;
}

export const buscarPedidosVendidos = (texto) => llamarDevolucionesOdoo({ accion: "buscar", texto });
export const detallePedidoOdoo = (odoo_id) => llamarDevolucionesOdoo({ accion: "detalle", odoo_id });

// Lista de notas de crédito con sus productos
export async function cargarNotasCredito() {
  const { data, error } = await supabase
    .from("notas_credito")
    .select("*, items:notas_credito_items(*)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(`No se pudieron leer las notas de crédito: ${error.message}`);
  return (data || []).map((n) => ({
    ...n,
    items: [...(n.items || [])].sort((a, b) => a.id - b.id),
  }));
}

// Cuánto ya se devolvió de cada línea de un pedido (sin contar notas anuladas)
export async function devueltoPorLinea(pedidoOdooId) {
  const { data, error } = await supabase
    .from("notas_credito")
    .select("id, estado, items:notas_credito_items(linea_odoo_id, cantidad)")
    .eq("pedido_odoo_id", pedidoOdooId)
    .neq("estado", "anulada");
  if (error) throw new Error(`No se pudieron leer las devoluciones anteriores: ${error.message}`);
  const mapa = {};
  (data || []).forEach((n) =>
    (n.items || []).forEach((i) => {
      mapa[i.linea_odoo_id] = (mapa[i.linea_odoo_id] || 0) + Number(i.cantidad);
    }),
  );
  return { mapa, notasAnteriores: (data || []).length };
}

export async function crearNotaCredito({ pedido, items }) {
  const { data, error } = await supabase.rpc("crear_nota_credito", {
    p_pedido_odoo_id: pedido.odoo_id,
    p_numero_pedido: pedido.numero_pedido,
    p_cliente: pedido.cliente,
    p_items: items,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function marcarNotaRealizada(id) {
  const { error } = await supabase.rpc("marcar_nota_credito_realizada", { p_id: id });
  if (error) throw new Error(error.message);
}

export async function anularNotaCredito(id) {
  const { error } = await supabase.rpc("anular_nota_credito", { p_id: id });
  if (error) throw new Error(error.message);
}

// Cálculo de una línea devuelta, igual que la hoja de Odoo:
// Desc. = P.U. × cantidad × % descuento ; Total = total de la línea (con IVA) proporcional a la cantidad
export function calcularLinea(linea, cantidad) {
  const proporcion = linea.cantidad ? cantidad / linea.cantidad : 0;
  return {
    descuento: redondear((linea.precio_unitario * cantidad * (linea.descuento_pct || 0)) / 100),
    total: redondear(linea.total * proporcion),
  };
}

export const redondear = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const fmtPesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export const pesos = (n) => (n === null || n === undefined ? "—" : fmtPesos.format(Number(n)));

// Precio unitario con hasta 4 decimales, como lo imprime Odoo
const fmtUnitario = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
export const pesosUnitario = (n) => (n === null || n === undefined ? "—" : fmtUnitario.format(Number(n)));

export const cantidadTexto = (n) =>
  Number(n).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
