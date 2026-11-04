// Orden de prioridad definitivo (acordado con el cliente)
export const ESTADOS = {
  en_espera: {
    key: "en_espera",
    label: "En espera",
    icono: "⚡",
    color: "var(--st-en-espera)",
    bg: "var(--st-en-espera-bg)",
    priority: 1,
    descripcion: "Cliente presente esperando su pedido",
  },
  en_camino: {
    key: "en_camino",
    label: "En camino",
    icono: "🚗",
    color: "var(--st-en-camino)",
    bg: "var(--st-en-camino-bg)",
    priority: 2,
    descripcion: "Cliente en camino, próximo a retirar",
  },
  viene_hoy: {
    key: "viene_hoy",
    label: "Viene hoy",
    icono: "📅",
    color: "var(--st-viene-hoy)",
    bg: "var(--st-viene-hoy-bg)",
    priority: 3,
    descripcion: "Confirmado que viene hoy",
  },
  retira_manana: {
    key: "retira_manana",
    label: "Retira mañana",
    icono: "📆",
    color: "var(--st-retira-manana)",
    bg: "var(--st-retira-manana-bg)",
    priority: 4,
    descripcion: "Confirmado para mañana",
  },
  listo_para_entregar: {
    key: "listo_para_entregar",
    label: "Listo para entregar",
    icono: "✅",
    color: "var(--st-listo)",
    bg: "var(--st-listo-bg)",
    priority: 5,
    descripcion: "Expedición controló el pedido",
  },
  retira_otro_dia: {
    key: "retira_otro_dia",
    label: "Retira otro día",
    icono: "📋",
    color: "var(--st-retira-otro)",
    bg: "var(--st-retira-otro-bg)",
    priority: 6,
    descripcion: "Sin fecha definida",
  },
  entregado: {
    key: "entregado",
    label: "Entregado",
    icono: "📦",
    color: "var(--st-entregado)",
    bg: "var(--st-entregado-bg)",
    priority: 7,
    descripcion: "Retirado por el cliente",
  },
  cancelado: {
    key: "cancelado",
    label: "Cancelado",
    icono: "❌",
    color: "#EF4444",
    bg: "rgba(239, 68, 68, 0.12)",
    priority: 8,
    descripcion: "Pedido cancelado",
  },
};

// Estados que puede asignar un vendedor (no incluye listo_para_entregar ni entregado)
export const ESTADOS_VENDEDOR = [
  "en_espera",
  "en_camino",
  "viene_hoy",
  "retira_manana",
  "retira_otro_dia",
];

// Todos los estados activos ordenados por prioridad (sin "entregado")
export const ESTADOS_ACTIVOS_ORDENADOS = Object.values(ESTADOS)
  .filter((e) => e.key !== "entregado")
  .sort((a, b) => a.priority - b.priority);

export const TODOS_ESTADOS_ORDENADOS = Object.values(ESTADOS).sort(
  (a, b) => a.priority - b.priority,
);

export const ROLES = {
  admin: { label: "Administrador", icono: "🛡️" },
  expedicion: { label: "Expedición", icono: "📦" },
  vendedor: { label: "Vendedor", icono: "🧑‍💼" },
  caja: { label: "Caja", icono: "💳" },
};

export const MOTIVOS_DEVOLUCION = {
  nota_credito: { label: "Nota de crédito", icono: "🧾" },
  cambio: { label: "Cambio", icono: "🔄" },
};

export const ESTADOS_DEVOLUCION = {
  pendiente: {
    label: "Pendiente",
    color: "var(--warning)",
    bg: "var(--warning-bg)",
  },
  procesada: {
    label: "Procesada",
    color: "var(--success)",
    bg: "var(--success-bg)",
  },
};
