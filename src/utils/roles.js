// Nombres lindos de los roles para mostrar en pantalla
export const ETIQUETAS_ROL = {
  admin: "Administrador",
  vendedor: "Ventas",
  encargado_ventas: "Encargado de Ventas",
  expedicion: "Expedición",
  encargado_expedicion: "Encargado de Expedición",
  caja: "Caja",
};

export const etiquetaRol = (rol) => ETIQUETAS_ROL[rol] || rol || "";
