import { supabase } from "./supabase.js";

export async function obtenerPedidoDeOdoo(numeroPedido) {
  try {
    const { data, error } = await supabase.functions.invoke(
      "obtener-monto-odoo",
      {
        body: { numero_pedido: numeroPedido },
      },
    );

    if (error) {
      console.error("Error al consultar Odoo:", error);
      return null;
    }

    return {
      numero_pedido: data.numero_pedido,
      monto: data.monto,
      cliente: data.cliente,
    };
  } catch (error) {
    console.error("Error en obtenerPedidoDeOdoo:", error);
    return null;
  }
}

export async function buscarPedidosOdoo(texto) {
  try {
    const { data, error } = await supabase.functions.invoke(
      "buscar-pedidos-odoo",
      { body: { accion: "buscar", texto } },
    );
    if (error) {
      let mensaje = "No se pudo consultar Odoo.";
      try {
        const cuerpo = await error.context.json();
        if (typeof cuerpo?.error === "string") mensaje = cuerpo.error;
      } catch {}
      return { error: mensaje };
    }
    return data;
  } catch {
    return { error: "No se pudo consultar Odoo." };
  }
}

export async function buscarPresupuestosOdoo(texto) {
  try {
    const { data, error } = await supabase.functions.invoke(
      "buscar-presupuestos-odoo",
      { body: { texto } },
    );
    if (error) {
      let mensaje = "No se pudo consultar Odoo.";
      try {
        const cuerpo = await error.context.json();
        if (typeof cuerpo?.error === "string") mensaje = cuerpo.error;
      } catch {}
      return { error: mensaje };
    }
    return data;
  } catch {
    return { error: "No se pudo consultar Odoo." };
  }
}
