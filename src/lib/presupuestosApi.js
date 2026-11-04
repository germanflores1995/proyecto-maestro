import { supabase } from "./supabase";
import { CONFIG_DEFAULT, evaluarPresupuesto } from "../utils/presupuestos";

// Devuelve { clave: valor } con la configuración del admin (o los valores por defecto)
export async function cargarConfig() {
  const { data, error } = await supabase
    .from("presupuesto_config")
    .select("clave, valor");
  if (error || !data) return { ...CONFIG_DEFAULT };
  const cfg = { ...CONFIG_DEFAULT };
  data.forEach((c) => {
    cfg[c.clave] = Number(c.valor);
  });
  return cfg;
}

// Cantidad de presupuestos en alerta roja para el usuario (la base aplica los permisos)
export async function contarAlertas(cfg) {
  const { data, error } = await supabase
    .from("presupuesto_seguimientos")
    .select(
      "fecha_creacion_odoo, ultimo_contacto_efectivo_at, ultimo_intento_at, proximo_seguimiento_at, fecha_cierre, estado, importe_original",
    )
    .is("fecha_cierre", null)
    .limit(1000);
  if (error || !data) return 0;
  return data.filter((p) => evaluarPresupuesto(p, cfg).alerta).length;
}
