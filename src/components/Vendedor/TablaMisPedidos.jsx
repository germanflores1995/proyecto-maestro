import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { ESTADOS } from "../../utils/constants";
import { formatearMonto, formatearFechaHora } from "../../utils/helpers";
import { limpiarCliente } from "../../utils/ordenar";

// Columnas con ancho proporcional. La tabla ocupa todo el ancho sin scroll horizontal.
// En celular se oculta "Vendedor" para que entren las demás.
const COLUMNAS = [
  { key: "numero", label: "Pedido", ancho: 11, clase: "" },
  { key: "cliente", label: "Cliente", ancho: 33, clase: "" },
  { key: "vendedor", label: "Vendedor", ancho: 13, clase: "mp-col-vend" },
  { key: "entrega", label: "Entrega", ancho: 13, clase: "" },
  { key: "monto", label: "Monto", ancho: 12, derecha: true, clase: "" },
  { key: "estado", label: "Estado", ancho: 18, clase: "" },
];
const TOTAL_ANCHO = COLUMNAS.reduce((acc, c) => acc + c.ancho, 0);

// Pestañas, igual que en Expedición
const PESTANAS = [
  { key: "para_armar", label: "Para armar", color: "#2563eb", bg: "rgba(37, 99, 235, 0.12)" },
  { key: "listos", label: "Listos para entregar", color: "#16a34a", bg: "rgba(22, 163, 74, 0.12)" },
  { key: "entregados", label: "Entregados", color: "#0d9488", bg: "rgba(13, 148, 136, 0.12)" },
  { key: "cancelados", label: "Cancelados", color: "#dc2626", bg: "rgba(220, 38, 38, 0.12)" },
];

const CSS = `
.mp-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 12px; overflow-x: auto; }
.mp-tab { display: inline-flex; align-items: center; }
.mp-tabla { width: 100%; border-collapse: collapse; table-layout: fixed; }

@media (max-width: 640px) {
  .mp-tabs { display: grid !important; grid-template-columns: 1fr 1fr; gap: 4px; overflow: visible !important; border-bottom: none; margin-bottom: 10px; }
  .mp-tab { display: inline-flex !important; align-items: center; justify-content: center; flex-wrap: wrap; white-space: normal !important; text-align: center; padding: 8px 6px !important; font-size: 12px !important; line-height: 1.25; }
  .mp-tab span { margin-left: 6px !important; padding: 1px 6px !important; font-size: 10.5px !important; }
  .mp-col-vend { display: none !important; }
  .mp-tabla th, .mp-tabla td { padding: 8px 6px !important; font-size: 12px !important; }
  .mp-tabla th { font-size: 10px !important; letter-spacing: 0 !important; }
  .mp-tabla .badge { font-size: 10px !important; padding: 2px 6px !important; }
}
`;

const tiempo = (fecha) => (fecha ? new Date(fecha).getTime() : 0);

const enGrupo = {
  para_armar: (p) => !["listo_para_entregar", "entregado", "cancelado"].includes(p.estado),
  listos: (p) => p.estado === "listo_para_entregar",
  entregados: (p) => p.estado === "entregado",
  cancelados: (p) => p.estado === "cancelado",
};

function valorColumna(key, p, usuariosMap) {
  switch (key) {
    case "numero":
      return p.numero_pedido || "";
    case "cliente":
      return limpiarCliente(p.cliente_nombre).toLowerCase();
    case "vendedor":
      return (usuariosMap[p.vendedor_id]?.nombre || "").toLowerCase();
    case "entrega":
      return tiempo(p.entregado_at);
    case "monto":
      return Number(p.monto || 0);
    case "estado":
      return (ESTADOS[p.estado]?.label || "").toLowerCase();
    default:
      return "";
  }
}

// Orden por defecto: activos como vienen; entregados y cancelados, el más reciente primero
function ordenPorDefecto(lista, pestana) {
  if (pestana === "para_armar" || pestana === "listos") return lista;
  const fecha = pestana === "entregados" ? (p) => tiempo(p.entregado_at) : (p) => tiempo(p.created_at);
  return [...lista].sort((a, b) => fecha(b) - fecha(a));
}

export default function TablaMisPedidos({ pedidos, usuariosMap, orden, onOrdenar, onSelect }) {
  const [pestana, setPestana] = useState("para_armar");

  const conteos = useMemo(
    () => Object.fromEntries(PESTANAS.map((t) => [t.key, pedidos.filter(enGrupo[t.key]).length])),
    [pedidos],
  );

  const filas = useMemo(() => {
    let lista = ordenPorDefecto(pedidos.filter(enGrupo[pestana]), pestana);
    if (orden?.col) {
      lista = [...lista].sort((a, b) => {
        const va = valorColumna(orden.col, a, usuariosMap);
        const vb = valorColumna(orden.col, b, usuariosMap);
        let r;
        if (typeof va === "number" && typeof vb === "number") r = va - vb;
        else r = String(va).localeCompare(String(vb), "es", { numeric: true, sensitivity: "base" });
        return r * orden.dir;
      });
    }
    return lista;
  }, [pedidos, pestana, usuariosMap, orden]);

  return (
    <div>
      <style>{CSS}</style>

      {/* Pestañas */}
      <div className="mp-tabs">
        {PESTANAS.map((t) => {
          const activa = pestana === t.key;
          return (
            <button
              key={t.key}
              className="mp-tab"
              onClick={() => setPestana(t.key)}
              style={{
                padding: "10px 14px",
                background: "transparent",
                border: "none",
                borderBottom: `3px solid ${activa ? t.color : "transparent"}`,
                color: activa ? t.color : "var(--text-secondary)",
                fontWeight: activa ? 700 : 600,
                fontSize: 14,
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontFamily: "inherit",
              }}
            >
              {t.label}
              <span
                style={{
                  marginLeft: 8,
                  background: t.bg,
                  color: t.color,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                {conteos[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="mp-tabla">
          <colgroup>
            {COLUMNAS.map((c) => (
              <col key={c.key} className={c.clase} style={{ width: `${(c.ancho / TOTAL_ANCHO) * 100}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ background: "var(--surface-container, #f1f5f9)" }}>
              {COLUMNAS.map((c) => {
                const activa = orden?.col === c.key;
                return (
                  <th
                    key={c.key}
                    onClick={() => onOrdenar(c.key)}
                    title="Tocá para ordenar"
                    className={c.clase}
                    style={{
                      padding: "10px 10px",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      textAlign: c.derecha ? "right" : "left",
                      color: activa ? "var(--primary)" : "var(--text-muted)",
                      cursor: "pointer",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {c.label}
                      {activa && (orden.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filas.map((p) => (
              <Fila key={p.id} pedido={p} usuariosMap={usuariosMap} onSelect={onSelect} />
            ))}
          </tbody>
        </table>

        {filas.length === 0 && (
          <div style={{ padding: "30px 10px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            No hay pedidos en esta pestaña.
          </div>
        )}
      </div>
    </div>
  );
}

const celda = {
  padding: "10px 10px",
  fontSize: 13,
  borderBottom: "1px solid var(--border)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

function Fila({ pedido: p, usuariosMap, onSelect }) {
  const estado = ESTADOS[p.estado];
  const vendedor = usuariosMap[p.vendedor_id]?.nombre || "—";
  const cliente = limpiarCliente(p.cliente_nombre) || "—";
  return (
    <tr onClick={() => onSelect(p)} style={{ cursor: "pointer" }}>
      <td style={{ ...celda, fontWeight: 700, color: "var(--text-muted)" }}>#{p.numero_pedido}</td>
      <td style={{ ...celda, fontWeight: 600 }} title={cliente}>{cliente}</td>
      <td className="mp-col-vend" style={celda} title={vendedor}>{vendedor}</td>
      <td style={celda}>{p.entregado_at ? formatearFechaHora(p.entregado_at) : "—"}</td>
      <td style={{ ...celda, textAlign: "right", fontWeight: 700 }}>
        {p.monto != null ? formatearMonto(p.monto) : "—"}
      </td>
      <td style={celda}>
        {estado && (
          <span
            className="badge"
            style={{
              background: estado.bg,
              color: estado.color,
              fontSize: 11,
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "inline-block",
            }}
          >
            {estado.label}
          </span>
        )}
      </td>
    </tr>
  );
}
