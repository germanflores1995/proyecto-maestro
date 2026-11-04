// Ordenamientos de listas de pedidos (no dependen de helpers.js)
// "FORTIS SRL - [FORTIS SRL]" -> "FORTIS SRL" (para mostrar en listas)
export const limpiarCliente = (nombre) => {
  const n = nombre || "";
  const i = n.indexOf(" - [");
  return (i > 0 ? n.slice(0, i) : n).trim();
};

const comparar = (a, b) =>
  (a || "").localeCompare(b || "", "es", { sensitivity: "base", numeric: true });

const porFecha = (a, b) => new Date(a.created_at) - new Date(b.created_at);

export const OPCIONES_ORDEN = [
  { value: "prioridad", label: "Ordenar: Prioridad" },
  { value: "fecha_desc", label: "Fecha: más recientes primero" },
  { value: "fecha_asc", label: "Fecha: más antiguos primero" },
  { value: "cliente_az", label: "Cliente: A → Z" },
  { value: "cliente_za", label: "Cliente: Z → A" },
  { value: "vendedor", label: "Vendedor: A → Z" },
  { value: "numero", label: "N° de pedido" },
];

// Devuelve la lista ordenada, o null si el criterio es "prioridad"
// (en ese caso cada pantalla aplica su orden propio).
export function ordenarLista(lista, orden, usuariosMap = {}) {
  const copia = [...lista];
  switch (orden) {
    case "fecha_desc":
      return copia.sort((a, b) => porFecha(b, a));
    case "fecha_asc":
      return copia.sort(porFecha);
    case "cliente_az":
      return copia.sort((a, b) =>
        comparar(limpiarCliente(a.cliente_nombre), limpiarCliente(b.cliente_nombre)),
      );
    case "cliente_za":
      return copia.sort((a, b) =>
        comparar(limpiarCliente(b.cliente_nombre), limpiarCliente(a.cliente_nombre)),
      );
    case "vendedor":
      return copia.sort(
        (a, b) =>
          comparar(
            usuariosMap[a.vendedor_id]?.nombre,
            usuariosMap[b.vendedor_id]?.nombre,
          ) || porFecha(b, a),
      );
    case "numero":
      return copia.sort((a, b) => comparar(b.numero_pedido, a.numero_pedido));
    default:
      return null;
  }
}
