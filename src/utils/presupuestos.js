// Utilidades del módulo Presupuestos (zona horaria de Buenos Aires)

export const TZ = "America/Argentina/Buenos_Aires";

// Valores por defecto. Los reales están en presupuesto_config y los edita el admin.
export const CONFIG_DEFAULT = {
  importe_alto: 1000000,
  dias_nuevo_sin_gestionar: 1,
  dias_sin_contacto_aviso: 7,
  dias_sin_contacto_critico: 14,
  dias_antiguedad_aviso: 10,
  dias_antiguedad_critico: 15,
};

const COLORES_ESTADO = {
  nuevo: { color: "#1d4ed8", fondo: "#dbeafe" },
  en_seguimiento: { color: "#4338ca", fondo: "#e0e7ff" },
  en_negociacion: { color: "#b45309", fondo: "#fef3c7" },
  pendiente_aprobacion: { color: "#6d28d9", fondo: "#ede9fe" },
  aceptado_pend_formalizacion: { color: "#0f766e", fondo: "#ccfbf1" },
  confirmado: { color: "#15803d", fondo: "#dcfce7" },
  perdido: { color: "#b91c1c", fondo: "#fee2e2" },
  cerrado_sin_resultado: { color: "#475569", fondo: "#e2e8f0" },
};

const COLOR_NEUTRO = { color: "#475569", fondo: "#e2e8f0" };

export function colorEstado(clave) {
  return COLORES_ESTADO[clave] || COLOR_NEUTRO;
}

export const COLOR_TONO = {
  rojo: { color: "#b91c1c", fondo: "#fee2e2" },
  naranja: { color: "#b45309", fondo: "#fef3c7" },
  azul: { color: "#1d4ed8", fondo: "#dbeafe" },
  gris: { color: "#475569", fondo: "#e2e8f0" },
  verde: { color: "#15803d", fondo: "#dcfce7" },
};

export function formatearMonto(n, decimales = 0) {
  return (
    "$" +
    Number(n || 0).toLocaleString("es-AR", {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    })
  );
}

export function fechaCorta(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function horaCorta(iso) {
  return new Date(iso).toLocaleTimeString("es-AR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Fecha como yyyy-mm-dd en zona Buenos Aires
function claveDia(fecha) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

// Días calendario entre hoy y una fecha: negativo = pasado, 0 = hoy, 1 = mañana
export function diferenciaDias(iso) {
  const hoy = new Date(claveDia(new Date()) + "T00:00:00Z");
  const fecha = new Date(claveDia(new Date(iso)) + "T00:00:00Z");
  return Math.round((fecha - hoy) / 86400000);
}

// Días calendario transcurridos desde una fecha (0 = hoy)
export function diasDesde(iso) {
  if (!iso) return 0;
  return -diferenciaDias(iso);
}

// "hoy", "ayer" o "hace N d". Vacío = "—"
export function textoHace(iso) {
  if (!iso) return "—";
  const d = diasDesde(iso);
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  return `hace ${d} d`;
}

// Próximo seguimiento: texto y tono de color
export function estadoProximo(iso) {
  if (!iso) return { texto: "Sin programar", tono: "gris" };
  const d = diferenciaDias(iso);
  if (d < 0) return { texto: `Vencido · hace ${-d} d`, tono: "rojo" };
  if (d === 0) return { texto: `Hoy ${horaCorta(iso)}`, tono: "naranja" };
  if (d === 1) return { texto: "Mañana", tono: "azul" };
  return {
    texto: new Date(iso).toLocaleDateString("es-AR", {
      timeZone: TZ,
      day: "2-digit",
      month: "2-digit",
    }),
    tono: "azul",
  };
}

// Fecha y hora local -> ISO para guardar; vacío = null
export function aIsoOpcional(valorLocal) {
  return valorLocal ? new Date(valorLocal).toISOString() : null;
}

// ISO -> valor para <input type="datetime-local"> en hora de Buenos Aires
export function aValorLocal(iso) {
  if (!iso) return "";
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const v = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day}T${v.hour === "24" ? "00" : v.hour}:${v.minute}`;
}

// Evalúa las alertas de un presupuesto según la configuración
export function evaluarPresupuesto(p, configuracion = {}) {
  const c = { ...CONFIG_DEFAULT, ...configuracion };
  const abierto = !p.fecha_cierre;
  const dias = diasDesde(p.fecha_creacion_odoo);
  const diasSinContacto = diasDesde(p.ultimo_contacto_efectivo_at || p.fecha_creacion_odoo);
  const dProximo = p.proximo_seguimiento_at ? diferenciaDias(p.proximo_seguimiento_at) : null;

  const vencido = abierto && dProximo !== null && dProximo < 0;
  const hoy = abierto && dProximo === 0;
  const sinContactoAviso = abierto && diasSinContacto >= c.dias_sin_contacto_aviso;
  const sinContactoCritico = abierto && diasSinContacto >= c.dias_sin_contacto_critico;
  const antiguedadCritica = abierto && dias >= c.dias_antiguedad_critico;
  const nuevoSinGestionar =
    abierto && p.estado === "nuevo" && !p.ultimo_intento_at && dias >= c.dias_nuevo_sin_gestionar;

  return {
    dias,
    diasSinContacto,
    importeAlto: Number(p.importe_original) >= c.importe_alto,
    vencido,
    hoy,
    sinContactoAviso,
    sinContactoCritico,
    antiguedadCritica,
    nuevoSinGestionar,
    // Rojo: seguimiento vencido o sin contacto crítico
    alerta: vencido || sinContactoCritico,
    // Amarillo: para hoy, sin contacto de aviso, antigüedad o nuevo sin gestionar
    aviso:
      !(vencido || sinContactoCritico) &&
      (hoy || sinContactoAviso || antiguedadCritica || nuevoSinGestionar),
  };
}

// Color de un contador según umbrales (verde, amarillo o rojo)
export function tonoDias(dias, aviso, critico) {
  if (dias >= critico) return "rojo";
  if (dias >= aviso) return "naranja";
  return "verde";
}

export const FILTROS = [
  { key: "activos", label: "Activos" },
  { key: "vencidos", label: "Vencidos" },
  { key: "hoy", label: "Para hoy" },
  { key: "sin_contacto", label: "Sin contacto" },
  { key: "nuevos", label: "Nuevos" },
  { key: "confirmados", label: "Confirmados" },
  { key: "perdidos", label: "Perdidos" },
  { key: "todos", label: "Todos" },
];

// cierraEstado: { clave: true/false } de presupuesto_estados
// flags: { [id]: evaluarPresupuesto(...) }
export function filtrarPresupuestos(lista, filtro, cierraEstado = {}, flags = {}) {
  const f = (p) => flags[p.id] || {};
  switch (filtro) {
    case "activos":
      return lista.filter((p) => !cierraEstado[p.estado]);
    case "vencidos":
      return lista.filter((p) => f(p).vencido);
    case "hoy":
      return lista.filter((p) => f(p).hoy);
    case "sin_contacto":
      return lista.filter((p) => f(p).sinContactoAviso && !cierraEstado[p.estado]);
    case "nuevos":
      return lista.filter((p) => p.estado === "nuevo");
    case "confirmados":
      return lista.filter((p) => p.estado === "confirmado");
    case "perdidos":
      return lista.filter((p) => p.estado === "perdido");
    default:
      return lista;
  }
}

// Prioridad: rojo primero, después amarillo, después el resto
export function rangoPrioridad(ev) {
  if (ev?.alerta) return 0;
  if (ev?.aviso) return 1;
  return 2;
}

export const COLOR_ANTIGUEDAD = {
  ok: { color: "#475569", fondo: "#f1f5f9" },
  aviso: { color: "#b45309", fondo: "#fef3c7" },
  critico: { color: "#b91c1c", fondo: "#fee2e2" },
};

export function claseAntiguedad(dias, cfg = {}) {
  const c = { ...CONFIG_DEFAULT, ...cfg };
  if (dias >= c.dias_antiguedad_critico) return "critico";
  if (dias >= c.dias_antiguedad_aviso) return "aviso";
  return "ok";
}

// Estado de Odoo (sale.order.state) en texto legible
export const ESTADO_ODOO = {
  draft: "Presupuesto",
  sent: "Presupuesto enviado",
};

// Importe para mostrar en un campo de texto: 2233231 -> "2.233.231,00"
export function formatearImporteCampo(n) {
  if (n === "" || n == null || Number.isNaN(Number(n))) return "";
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Lee lo escrito en el campo: "2.233.231,00" -> 2233231 (también acepta "2233231.5")
export function leerImporte(texto) {
  let s = String(texto ?? "").trim().replace(/\$/g, "").replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (!/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
