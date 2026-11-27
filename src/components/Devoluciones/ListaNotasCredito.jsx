import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, History, LayoutGrid, List as ListIcon, RefreshCw, Search } from "lucide-react";
import { formatearFechaHora } from "../../utils/helpers";
import { limpiarCliente } from "../../utils/ordenar";
import { usePreferencia } from "../../hooks/usePreferencia";
import { cargarNotasCredito, pesos } from "../../lib/notasCredito";
import DetalleNotaCredito from "./DetalleNotaCredito";

// Lista de notas de crédito con el mismo formato que «Mis pedidos»:
// pestañas con contador, tabla (por defecto) o tarjetas, y el detalle se abre al tocar una nota.
//  modo "caja":    Pendientes / Realizadas. En el detalle: «Marcar como realizada».
//  modo "gestion": Pendientes / Realizadas / Anuladas. En el detalle: «Anular» (si está pendiente).

export const ESTADOS_NC = {
  pendiente: { label: "Pendiente", color: "var(--warning)", bg: "var(--warning-bg)" },
  realizada: { label: "Realizada", color: "var(--success)", bg: "var(--success-bg)" },
  anulada: { label: "Anulada", color: "var(--text-muted)", bg: "var(--surface-container)" },
};

const PESTANAS = [
  { key: "pendiente", label: "Pendientes", color: "#d97706", bg: "rgba(217, 119, 6, 0.14)" },
  { key: "realizada", label: "Realizadas", color: "#16a34a", bg: "rgba(22, 163, 74, 0.12)" },
  { key: "anulada", label: "Anuladas", color: "#64748b", bg: "rgba(100, 116, 139, 0.14)" },
];

// Fecha que importa en cada pestaña
const FECHA = {
  pendiente: { campo: "created_at", label: "Cargada" },
  realizada: { campo: "realizada_at", label: "Realizada" },
  anulada: { campo: "anulada_at", label: "Anulada" },
};

const COLUMNAS = [
  { key: "nc", label: "NC", ancho: 7, clase: "nc-col-nc" },
  { key: "pedido", label: "Pedido", ancho: 13, clase: "nc-col-pedido" },
  { key: "cliente", label: "Cliente", ancho: 30, clase: "" },
  { key: "fecha", label: "Fecha", ancho: 14, clase: "nc-col-fecha" },
  { key: "por", label: "Cargada por", ancho: 13, clase: "nc-col-por" },
  { key: "total", label: "Total", ancho: 12, derecha: true, clase: "" },
  { key: "estado", label: "Estado", ancho: 11, clase: "nc-col-estado" },
];
const TOTAL_ANCHO = COLUMNAS.reduce((a, c) => a + c.ancho, 0);

export const CSS_NC = `
.mp-pagina { padding: 20px 20px 60px; max-width: 1400px; margin: 0 auto; }
.mp-titulo { font-family: Montserrat, sans-serif; font-size: 24px; font-weight: 800; }
.mp-filtros { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 24px; }
.mp-espacio { flex: 1; }
.nc-vista { display: flex; gap: 2px; background: var(--surface-container); border: 1px solid var(--border); border-radius: 8px; padding: 3px; }
.nc-vista button { padding: 7px 9px; border-radius: 6px; border: none; background: transparent; color: var(--text-secondary); display: flex; cursor: pointer; }
.nc-vista button.activo { background: var(--surface); color: var(--primary); box-shadow: var(--shadow-sm); }
.nc-buscar { position: relative; flex: 0 1 320px; min-width: 200px; }
.nc-buscar input { width: 100%; padding-left: 34px; }
.nc-buscar svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
.nc-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 12px; overflow-x: auto; }
.nc-tab { display: inline-flex; align-items: center; padding: 10px 14px; background: transparent; border: none; border-bottom: 3px solid transparent; font-size: 14px; cursor: pointer; white-space: nowrap; font-family: inherit; }
.nc-tab span { margin-left: 8px; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
.nc-tabla { width: 100%; border-collapse: collapse; table-layout: fixed; }
.nc-tabla th { padding: 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); cursor: pointer; user-select: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-bottom: 1px solid var(--border); background: var(--surface-container); text-align: left; }
.nc-tabla th.activa { color: var(--primary); }
.nc-tabla td { padding: 10px; font-size: 13px; border-bottom: 1px solid var(--border); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nc-tabla tbody tr { cursor: pointer; }
.nc-tabla tbody tr:hover td { background: var(--primary-subtle); }
.nc-tabla tbody tr:last-child td { border-bottom: none; }
.nc-der { text-align: right !important; font-variant-numeric: tabular-nums; }
.nc-sub-movil { display: none; }
.nc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.nc-tarjeta { padding: 15px; cursor: pointer; transition: border-color .15s, box-shadow .15s; }
.nc-tarjeta:hover { border-color: var(--primary); box-shadow: var(--shadow-md); }
.nc-error { margin-bottom: 14px; padding: 11px 14px; border-radius: 10px; background: var(--danger-bg); color: var(--danger); font-size: 13px; }
.nc-ok { margin-bottom: 14px; padding: 11px 14px; border-radius: 10px; background: var(--success-bg); color: var(--success); font-size: 13px; font-weight: 600; }
.nc-vacio { padding: 30px 10px; text-align: center; color: var(--text-muted); font-size: 13px; }
@media (max-width: 640px) {
  .mp-pagina { padding: 12px 12px 40px !important; }
  .mp-titulo { font-size: 20px !important; }
  .mp-cabecera p { font-size: 12.5px !important; }
  .mp-filtros { gap: 8px !important; margin-bottom: 14px !important; }
  .mp-espacio { display: none; }
  .nc-vista { margin-left: auto; }
  .nc-buscar { flex: 1 1 100%; }
  .nc-col-por, .nc-col-estado, .nc-col-fecha, .nc-col-nc, .nc-col-pedido { display: none !important; }
  .nc-tabla { table-layout: auto; }
  .nc-tabla col { width: auto !important; }
  .nc-tabla td.nc-cli { white-space: normal; word-break: break-word; }
  .nc-sub-movil { display: block; font-size: 11px; font-weight: 400; color: var(--text-muted); white-space: normal; margin-top: 2px; }
  .nc-tabs { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); overflow: visible; border-bottom: none; }
  .nc-tab { justify-content: center; padding: 8px 6px; font-size: 12px; }
  .nc-tab span { margin-left: 6px; padding: 1px 6px; font-size: 10.5px; }
  .nc-tabla th, .nc-tabla td { padding: 8px 6px; font-size: 12px; }
  .nc-tabla th { font-size: 10px; letter-spacing: 0; }
}
`;

function valor(col, n, pestana) {
  switch (col) {
    case "nc":
      return n.id;
    case "pedido":
      return n.numero_pedido;
    case "cliente":
      return limpiarCliente(n.cliente).toLowerCase();
    case "fecha":
      return new Date(n[FECHA[pestana].campo] || n.created_at).getTime();
    case "por":
      return (n.creado_por_nombre || "").toLowerCase();
    case "total":
      return Number(n.total);
    default:
      return "";
  }
}

export default function ListaNotasCredito({ modo, recargarKey = 0 }) {
  const [notas, setNotas] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [pestana, setPestana] = useState("pendiente");
  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = usePreferencia(`notas_credito.${modo}.vista`, "lista");
  const [orden, setOrden] = useState(null); // { col, dir }
  const [abierta, setAbierta] = useState(null);

  const cargar = useCallback(async () => {
    setError("");
    try {
      setNotas(await cargarNotasCredito());
    } catch (e) {
      setError(e.message);
      setNotas((n) => n || []);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar, recargarKey]);

  const pestanas = modo === "caja" ? PESTANAS.slice(0, 2) : PESTANAS;

  // La búsqueda se aplica antes de contar: los números de las pestañas muestran las coincidencias
  const buscadas = useMemo(() => {
    const q = busqueda.trim().toLowerCase().replace(/^#/, "");
    if (!q) return notas || [];
    return (notas || []).filter(
      (n) => n.numero_pedido.toLowerCase().includes(q) || n.cliente.toLowerCase().includes(q) || String(n.id) === q,
    );
  }, [notas, busqueda]);

  const conteos = useMemo(() => {
    const c = {};
    buscadas.forEach((n) => {
      c[n.estado] = (c[n.estado] || 0) + 1;
    });
    return c;
  }, [buscadas]);

  const filas = useMemo(() => {
    const lista = buscadas.filter((n) => n.estado === pestana);
    if (orden?.col) {
      return [...lista].sort((a, b) => {
        const va = valor(orden.col, a, pestana);
        const vb = valor(orden.col, b, pestana);
        const r =
          typeof va === "number" && typeof vb === "number"
            ? va - vb
            : String(va).localeCompare(String(vb), "es", { numeric: true, sensitivity: "base" });
        return r * orden.dir;
      });
    }
    // Por defecto: pendientes, la más vieja primero (orden de llegada); el resto, la más reciente primero
    const campo = FECHA[pestana].campo;
    return [...lista].sort((a, b) =>
      pestana === "pendiente"
        ? new Date(a.created_at) - new Date(b.created_at)
        : new Date(b[campo] || b.created_at) - new Date(a[campo] || a.created_at),
    );
  }, [buscadas, pestana, orden]);

  const ordenar = (col) =>
    setOrden((o) => (o?.col !== col ? { col, dir: 1 } : o.dir === 1 ? { col, dir: -1 } : null));

  const alCambiar = async (mensaje) => {
    setAbierta(null);
    setAviso(mensaje);
    await cargar();
  };

  const etiquetaFecha = FECHA[pestana].label;

  return (
    <div>
      <div className="mp-filtros">
        <div className="nc-buscar">
          <Search size={15} />
          <input
            className="input"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar pedido, cliente o N° de NC"
            aria-label="Buscar nota de crédito"
          />
        </div>
        <div className="mp-espacio" />
        <button className="btn btn-ghost" onClick={cargar} title="Actualizar">
          <RefreshCw size={15} /> Actualizar
        </button>
        <div className="nc-vista">
          <button className={vista === "tarjetas" ? "activo" : ""} onClick={() => setVista("tarjetas")} title="Vista tarjetas">
            <LayoutGrid size={15} />
          </button>
          <button className={vista === "lista" ? "activo" : ""} onClick={() => setVista("lista")} title="Vista lista">
            <ListIcon size={15} />
          </button>
        </div>
      </div>

      {error && <div className="nc-error">{error}</div>}
      {aviso && <div className="nc-ok">{aviso}</div>}

      <div className="nc-tabs">
        {pestanas.map((t) => {
          const activa = pestana === t.key;
          return (
            <button
              key={t.key}
              className="nc-tab"
              onClick={() => setPestana(t.key)}
              style={{
                borderBottomColor: activa ? t.color : "transparent",
                color: activa ? t.color : "var(--text-secondary)",
                fontWeight: activa ? 700 : 600,
              }}
            >
              {t.label}
              <span style={{ background: t.bg, color: t.color }}>{conteos[t.key] || 0}</span>
            </button>
          );
        })}
      </div>

      {notas === null ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <span className="spinner" style={{ width: 24, height: 24 }} />
        </div>
      ) : vista === "lista" ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="nc-tabla">
            <colgroup>
              {COLUMNAS.map((c) => (
                <col key={c.key} className={c.clase} style={{ width: `${(c.ancho / TOTAL_ANCHO) * 100}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {COLUMNAS.map((c) => {
                  const activa = orden?.col === c.key;
                  return (
                    <th
                      key={c.key}
                      className={`${c.clase}${c.derecha ? " nc-der" : ""}${activa ? " activa" : ""}`}
                      onClick={() => c.key !== "estado" && ordenar(c.key)}
                      title={c.key !== "estado" ? "Tocá para ordenar" : undefined}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {c.key === "fecha" ? etiquetaFecha : c.label}
                        {activa && (orden.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filas.map((n) => {
                const est = ESTADOS_NC[n.estado];
                const cliente = limpiarCliente(n.cliente) || n.cliente;
                const fecha = n[FECHA[pestana].campo] || n.created_at;
                return (
                  <tr key={n.id} onClick={() => setAbierta(n)}>
                    <td className="nc-col-nc" style={{ fontWeight: 700, color: "var(--text-muted)" }}>#{n.id}</td>
                    <td className="nc-col-pedido" style={{ fontWeight: 600 }}>{n.numero_pedido}</td>
                    <td className="nc-cli" style={{ fontWeight: 600 }} title={n.cliente}>
                      {cliente}
                      <div className="nc-sub-movil">
                        #{n.numero_pedido} · NC #{n.id} · {formatearFechaHora(fecha)} · {n.items.length} {n.items.length === 1 ? "producto" : "productos"}
                      </div>
                    </td>
                    <td className="nc-col-fecha">{formatearFechaHora(fecha)}</td>
                    <td className="nc-col-por">{n.creado_por_nombre || "—"}</td>
                    <td className="nc-der" style={{ fontWeight: 700 }}>
                      {pesos(n.total)}
                    </td>
                    <td className="nc-col-estado">
                      <span className="badge" style={{ background: est.bg, color: est.color, fontSize: 11 }}>
                        {est.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filas.length === 0 && (
            <div className="nc-vacio">
              {busqueda.trim() ? "Ninguna nota de crédito coincide con la búsqueda." : "No hay notas de crédito en esta pestaña."}
            </div>
          )}
        </div>
      ) : filas.length === 0 ? (
        <div className="card nc-vacio">
          {busqueda.trim() ? "Ninguna nota de crédito coincide con la búsqueda." : "No hay notas de crédito en esta pestaña."}
        </div>
      ) : (
        <div className="nc-grid">
          {filas.map((n) => {
            const est = ESTADOS_NC[n.estado];
            const fecha = n[FECHA[pestana].campo] || n.created_at;
            return (
              <div key={n.id} className="card nc-tarjeta" onClick={() => setAbierta(n)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--primary)", opacity: 0.75 }}>
                      NC #{n.id} · #{n.numero_pedido}
                    </span>
                    <h4 style={{ fontFamily: "Montserrat, sans-serif", fontSize: 14.5, fontWeight: 700, marginTop: 2 }}>
                      {limpiarCliente(n.cliente) || n.cliente}
                    </h4>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
                      {n.creado_por_nombre || "—"} · {n.items.length} {n.items.length === 1 ? "producto" : "productos"}
                    </div>
                  </div>
                  <span className="badge" style={{ background: est.bg, color: est.color, fontSize: 10 }}>
                    {est.label}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
                    <History size={12} /> {etiquetaFecha} {formatearFechaHora(fecha)}
                  </span>
                  <span style={{ fontWeight: 800, fontSize: 15 }}>{pesos(n.total)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {abierta && (
        <DetalleNotaCredito nota={abierta} modo={modo} onClose={() => setAbierta(null)} onCambio={alCambiar} />
      )}
    </div>
  );
}
