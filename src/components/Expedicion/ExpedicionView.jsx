import { useState, useMemo, useRef } from "react";
import {
  LayoutGrid,
  List as ListIcon,
  Download,
  PackageSearch,
  Plus,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useAppData } from "../../hooks/useAppData";
import { ESTADOS, ESTADOS_ACTIVOS_ORDENADOS } from "../../utils/constants";
import {
  coincideNumero,
  ordenarPorPrioridad,
  ordenarPorHora,
  ordenarPorCliente,
  ordenarPorVendedor,
  esHoy,
  formatearMonto,
  formatearFechaCorta,
  formatearFechaHora,
} from "../../utils/helpers";
import DetallePedido from "../Pedidos/DetallePedido";
import ExportarEntregasModal from "./ExportarEntregasModal";
import { useAuth } from "../../contexts/AuthContext";
import { ordenarConHorario, formatearHoraDesde } from "../../utils/horarios";
import { exportarEntregadosHoy } from "../../lib/exportExcel";
import {
  ordenarLista,
  OPCIONES_ORDEN,
  limpiarCliente,
} from "../../utils/ordenar";

const CSS = `
.exp-pagina { padding: 20px 20px 60px; max-width: 1500px; margin: 0 auto; }
.exp-encabezado { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 22px; }
.exp-derecha { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.exp-kpis { display: flex; gap: 12px; flex-wrap: wrap; }
.exp-acciones { display: flex; gap: 12px; flex-wrap: wrap; }
.exp-kpi { padding: 11px 18px; min-width: 120px; }
.exp-kpi-etiqueta { font-size: 10.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 3px; }
.exp-kpi-valor { font-family: Montserrat, sans-serif; font-size: 20px; font-weight: 800; color: var(--primary); }

.exp-tabs { display: flex; gap: 4px; border-bottom: 2px solid var(--border); margin-bottom: 16px; flex-wrap: wrap; }
.exp-tab { display: flex; align-items: center; }
.exp-filtros { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 18px; }
.exp-select { width: auto; }
.exp-espacio { flex: 1; }
.exp-cuenta { font-size: 12px; color: var(--text-muted); }
.exp-vista { display: flex; gap: 2px; background: var(--surface-container); border: 1px solid var(--border); border-radius: 8px; padding: 3px; }
.exp-tabla { overflow: hidden; }
.exp-tarjetas { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.exp-tarjeta { padding: 14px; cursor: pointer; }
.exp-num { font-weight: 700; font-size: 13.5px; }
.exp-nombre { font-weight: 600; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.exp-sub { font-size: 11.5px; color: var(--text-muted); }

@media (max-width: 640px) {
  .exp-pagina { padding: 12px 12px 40px !important; }
  .exp-encabezado { flex-direction: column; align-items: stretch; gap: 10px; margin-bottom: 14px; }
  .exp-encabezado h2 { font-size: 20px !important; }
  .exp-encabezado p { font-size: 12px !important; }
  .exp-derecha { flex-direction: column; align-items: stretch; gap: 8px; width: 100%; }
  .exp-kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .exp-kpi { min-width: 0 !important; padding: 8px 10px !important; }
  .exp-kpi-etiqueta { font-size: 9.5px !important; margin-bottom: 2px !important; }
  .exp-kpi-valor { font-size: 15px !important; }
  .exp-acciones { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .exp-acciones .btn { justify-content: center; font-size: 12px; padding: 8px 10px; }

  .exp-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; border-bottom: none; margin-bottom: 10px; }
  .exp-tab { justify-content: center; flex-wrap: wrap; padding: 8px 6px !important; font-size: 12.5px !important; text-align: center; border-bottom-width: 2px !important; }
  .exp-tab span { margin-left: 6px !important; padding: 0 6px !important; }

  .exp-filtros { gap: 8px; margin-bottom: 12px; }
  .exp-select { flex: 1 1 calc(50% - 4px) !important; width: auto !important; min-width: 0 !important; font-size: 13px !important; padding: 8px 10px !important; }
  .exp-select-orden { flex-basis: 100% !important; }
  .exp-espacio { display: none; }
  .exp-cuenta { flex: 1; font-size: 11.5px; }
  .exp-vista { margin-left: auto; }

  .exp-thead { display: none !important; }
  .exp-manija { display: none !important; }
  .exp-fila {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: "orden monto" "cliente cliente" "estado pago" "comentario comentario";
    gap: 5px 10px !important;
    padding: 10px 12px !important;
  }
  .exp-col { flex: none !important; width: auto !important; min-width: 0 !important; }
  .exp-c-orden { grid-area: orden; }
  .exp-c-cliente { grid-area: cliente; }
  .exp-c-estado { grid-area: estado; }
  .exp-c-pago { grid-area: pago; }
  .exp-c-comentario { grid-area: comentario; font-size: 11.5px !important; }
  .exp-c-comentario:empty { display: none !important; }
  .exp-c-monto { grid-area: monto; text-align: right !important; font-size: 12.5px !important; }
  .exp-num { font-size: 12px !important; }
  .exp-nombre { font-size: 13px !important; }
  .exp-sub { font-size: 11px !important; }
  .exp-fila .badge { font-size: 10px !important; padding: 2px 6px !important; }
  .exp-c-pago span { font-size: 10px !important; }

  .exp-tarjetas { grid-template-columns: 1fr !important; gap: 8px; }
  .exp-tarjeta { padding: 10px !important; }
}
`;

export default function ExpedicionView({ busqueda, notifActivas, onNuevoPedido }) {
  const [filtroVendedor, setFiltroVendedor] = useState("todos");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [tab, setTab] = useState("armar");
  const [filtroFecha, setFiltroFecha] = useState("todos");
  const [orden, setOrden] = useState("prioridad");
  const [vista, setVista] = useState("lista");
  const [pedidoDetalle, setPedidoDetalle] = useState(null);
  const [mostrarExportar, setMostrarExportar] = useState(false);
  const { puedeExportarExcel, perfil, esVendedor, esEncargadoVentas } =
    useAuth();
  const esEncargadoVentasPuro = perfil?.rol === "encargado_ventas";

  const {
    pedidos,
    clientes,
    usuarios,
    clientesMap,
    usuariosMap,
    loading,
    refetch,
  } = useAppData();

  // Un vendedor ve todos los pedidos en curso, pero de los ya listos,
  // entregados o cancelados solo ve los suyos. Encargados y admin ven todo.
  const soloPropios = esVendedor && !esEncargadoVentas;
  const pedidosVisibles = useMemo(
    () =>
      soloPropios
        ? pedidos.filter(
            (p) =>
              !["listo_para_entregar", "entregado", "cancelado"].includes(
                p.estado,
              ) || p.vendedor_id === perfil?.id,
          )
        : pedidos,
    [pedidos, soloPropios, perfil?.id],
  );
  const cantArmar = pedidosVisibles.filter(
    (p) => p.activo && p.estado !== "listo_para_entregar",
  ).length;
  const cantListos = pedidosVisibles.filter(
    (p) => p.activo && p.estado === "listo_para_entregar",
  ).length;

  // Vendedores = quienes tienen al menos un pedido cargado
  const vendedores = useMemo(() => {
    const ids = new Set(pedidos.map((p) => p.vendedor_id));
    return usuarios
      .filter((u) => ids.has(u.id))
      .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
  }, [pedidos, usuarios]);

  const filtrados = useMemo(() => {
    let lista = pedidosVisibles;

    if (tab === "armar")
      lista = lista.filter(
        (p) => p.activo && p.estado !== "listo_para_entregar",
      );
    else if (tab === "listos")
      lista = lista.filter((p) => p.estado === "listo_para_entregar");
    else if (filtroEstado === "activos") lista = lista.filter((p) => p.activo);
    else if (filtroEstado !== "todos")
      lista = lista.filter((p) => p.estado === filtroEstado);

    if (filtroVendedor !== "todos")
      lista = lista.filter((p) => p.vendedor_id === filtroVendedor);

    if (filtroFecha === "hoy")
      lista = lista.filter((p) => esHoy(p.created_at) || esHoy(p.entregado_at));

    if (busqueda) {
      lista = lista.filter(
        (p) =>
          coincideNumero(p.numero_pedido, busqueda) ||
          p.cliente_nombre?.toLowerCase().includes(busqueda.toLowerCase()),
      );
    }

    const ordenada = ordenarLista(lista, orden, usuariosMap);
    lista = ordenada || ordenarConHorario(ordenarPorPrioridad(lista));

    return lista;
  }, [
    pedidosVisibles,
    tab,
    filtroEstado,
    filtroVendedor,
    filtroFecha,
    busqueda,
    orden,
    clientesMap,
    usuariosMap,
  ]);

  const entregadosHoy = pedidosVisibles.filter(
    (p) => p.estado === "entregado" && esHoy(p.entregado_at),
  );
  const montoTotalHoy = entregadosHoy.reduce(
    (acc, p) => acc + (p.monto || 0),
    0,
  );

  const handleExportar = () =>
    exportarEntregadosHoy(pedidos, clientesMap, usuariosMap);

  return (
    <div className="exp-pagina">
      <style>{CSS}</style>

      <div className="exp-encabezado">
        <div>
          <h2
            style={{
              fontFamily: "Montserrat, sans-serif",
              fontSize: 24,
              fontWeight: 800,
            }}
          >
            Expedición
          </h2>
          <p
            style={{
              color: "var(--text-secondary)",
              fontSize: 13.5,
              marginTop: 3,
            }}
          >
            Monitoreo en tiempo real de salidas de almacén.
          </p>
        </div>

        <div className="exp-derecha">
          <div className="exp-kpis">
            {!esEncargadoVentasPuro && (
              <>
                <KpiCard label="Entregados hoy" value={entregadosHoy.length} />
                <KpiCard label="Monto total" value={formatearMonto(montoTotalHoy)} />
              </>
            )}
          </div>
          <div className="exp-acciones">
            {onNuevoPedido && (
              <button className="btn btn-primary" onClick={onNuevoPedido}>
                <Plus size={15} /> Nuevo Pedido
              </button>
            )}
            {puedeExportarExcel && (
              <button
                className="btn btn-ghost"
                onClick={() => setMostrarExportar(true)}
              >
                <Download size={15} /> Exportar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Pestañas */}
      <div className="exp-tabs" style={styles.tabs}>
        {[
          { key: "armar", label: "Para armar", n: cantArmar, color: "var(--primary)", bg: "var(--primary-subtle)" },
          { key: "listos", label: "Listos para entregar", n: cantListos, color: "var(--st-listo, #1a9d5a)", bg: "var(--st-listo-bg, rgba(26,157,90,0.12))" },
        ].map((t) => {
          const activa = tab === t.key;
          return (
            <button
              key={t.key}
              className="exp-tab"
              onClick={() => setTab(t.key)}
              style={{
                ...styles.tabBtn,
                color: activa || t.key === "listos" ? t.color : "var(--text-secondary)",
                borderBottom: `3px solid ${activa ? t.color : "transparent"}`,
                fontWeight: activa ? 700 : 600,
              }}
            >
              {t.label}
              {t.n !== null && (
                <span
                  style={{
                    marginLeft: 8,
                    background: t.bg,
                    color: t.color,
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "1px 8px",
                    borderRadius: 999,
                  }}
                >
                  {t.n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="exp-filtros">
        <select
          className="input exp-select"
          style={{ width: "auto" }}
          value={filtroVendedor}
          onChange={(e) => setFiltroVendedor(e.target.value)}
        >
          <option value="todos">Vendedor: Todos</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nombre}
            </option>
          ))}
        </select>

        <select
          className="input exp-select"
          style={{ width: "auto" }}
          value={filtroFecha}
          onChange={(e) => setFiltroFecha(e.target.value)}
        >
          <option value="todos">Fecha: Todas</option>
          <option value="hoy">Fecha: Hoy</option>
        </select>

        <select
          className="input exp-select exp-select-orden"
          style={{ width: "auto" }}
          value={orden}
          onChange={(e) => setOrden(e.target.value)}
        >
          {OPCIONES_ORDEN.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <div className="exp-espacio" />
        <span className="exp-cuenta">
          {filtrados.length} pedido{filtrados.length !== 1 ? "s" : ""}
        </span>

        <div className="exp-vista" style={styles.viewToggle}>
          <button
            onClick={() => setVista("lista")}
            style={{
              ...styles.viewBtn,
              ...(vista === "lista" ? styles.viewBtnActive : {}),
            }}
            aria-label="Vista lista"
          >
            <ListIcon size={15} />
          </button>
          <button
            onClick={() => setVista("tarjetas")}
            style={{
              ...styles.viewBtn,
              ...(vista === "tarjetas" ? styles.viewBtnActive : {}),
            }}
            aria-label="Vista tarjetas"
          >
            <LayoutGrid size={15} />
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <span className="spinner" style={{ width: 24, height: 24 }} />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="empty-state">
          <PackageSearch size={36} />
          <p style={{ fontSize: 14, fontWeight: 600 }}>
            {tab === "armar"
              ? "No hay pedidos para armar"
              : tab === "listos"
                ? "No hay pedidos listos para entregar"
                : "No hay pedidos"}
          </p>
          <p style={{ fontSize: 12.5 }}>
            {busqueda ? "Probá con otra búsqueda o ajustá los filtros." : "Probá ajustando los filtros."}
          </p>
        </div>
      ) : vista === "lista" ? (
        <TablaPedidos
          pedidos={filtrados}
          clientesMap={clientesMap}
          usuariosMap={usuariosMap}
          miId={esVendedor ? perfil?.id : null}
          onSelect={setPedidoDetalle}
        />
      ) : (
        <div className="exp-tarjetas">
          {filtrados.map((p) => (
            <TarjetaCompacta
              key={p.id}
              pedido={p}
              cliente={clientesMap[p.cliente_id]}
              vendedor={usuariosMap[p.vendedor_id]}
              onClick={() => setPedidoDetalle(p)}
            />
          ))}
        </div>
      )}
      {mostrarExportar && (
        <ExportarEntregasModal
          pedidos={pedidos}
          usuariosMap={usuariosMap}
          onClose={() => setMostrarExportar(false)}
        />
      )}
      {pedidoDetalle && (
        <DetallePedido
          pedido={pedidoDetalle}
          cliente={clientesMap[pedidoDetalle.cliente_id]}
          vendedor={usuariosMap[pedidoDetalle.vendedor_id]}
          onClose={() => setPedidoDetalle(null)}
          onActualizado={refetch}
          onEntregado={refetch}
        />
      )}
    </div>
  );
}

function KpiCard({ label, value }) {
  return (
    <div className="card exp-kpi">
      <div className="exp-kpi-etiqueta">{label}</div>
      <div className="exp-kpi-valor">{value}</div>
    </div>
  );
}

// Columnas de la tabla (el ancho se puede cambiar arrastrando el borde del título)
const COLUMNAS = [
  { key: "orden", label: "Orden / Fecha", min: 110, def: 150 },
  { key: "cliente", label: "Cliente / Vendedor", min: 150, def: 250 },
  { key: "estado", label: "Estado", min: 120, def: 200 },
  { key: "comentario", label: "Comentario", min: 110, def: 230 },
  { key: "pago", label: "Pago / Fac.", min: 90, def: 120 },
  { key: "monto", label: "Monto", min: 90, def: 120, derecha: true },
];
const ANCHOS_DEF = Object.fromEntries(COLUMNAS.map((c) => [c.key, c.def]));
const CLAVE_ANCHOS = "maestro_anchos_expedicion_v2";

function leerAnchos() {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE_ANCHOS) || "null");
    if (g && typeof g === "object") return { ...ANCHOS_DEF, ...g };
  } catch {
    /* sin almacenamiento: se usan los anchos por defecto */
  }
  return ANCHOS_DEF;
}

function TablaPedidos({ pedidos, clientesMap, usuariosMap, miId, onSelect }) {
  const [anchos, setAnchos] = useState(leerAnchos);
  const anchosRef = useRef(anchos);
  anchosRef.current = anchos;

  const guardar = (a) => {
    try {
      localStorage.setItem(CLAVE_ANCHOS, JSON.stringify(a));
    } catch {
      /* ignorar */
    }
  };

  const iniciarArrastre = (e, col) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const w0 = anchosRef.current[col.key];
    const mover = (ev) => {
      const w = Math.max(col.min, Math.min(700, w0 + ev.clientX - x0));
      setAnchos((a) => ({ ...a, [col.key]: w }));
    };
    const soltar = () => {
      window.removeEventListener("mousemove", mover);
      window.removeEventListener("mouseup", soltar);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      guardar(anchosRef.current);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", soltar);
  };

  const restablecer = (col) => {
    const a = { ...anchosRef.current, [col.key]: col.def };
    setAnchos(a);
    guardar(a);
  };

  // Las columnas reparten el ancho de la pantalla según su tamaño (sin scroll horizontal)
  const w = (key) => ({
    flex: `${anchos[key]} 1 0px`,
    minWidth: COLUMNAS.find((c) => c.key === key).min,
  });

  // Orden al tocar un título: asc -> desc -> orden original
  const [orden, setOrden] = useState({ col: null, dir: 1 });
  const ordenarPor = (key) =>
    setOrden((o) => {
      if (o.col !== key) return { col: key, dir: 1 };
      if (o.dir === 1) return { col: key, dir: -1 };
      return { col: null, dir: 1 };
    });

  const valorOrden = (key, p) => {
    switch (key) {
      case "orden":
        return p.numero_pedido || "";
      case "cliente":
        return limpiarCliente(p.cliente_nombre).toLowerCase();
      case "estado":
        return (ESTADOS[p.estado]?.label || "").toLowerCase();
      case "comentario":
        return (p.observaciones || "").toLowerCase();
      case "pago":
        return (p.pago || "") + (p.facturado ? "1" : "0");
      case "monto":
        return Number(p.monto || 0);
      default:
        return "";
    }
  };

  const pedidosOrdenados = useMemo(() => {
    if (!orden.col) return pedidos;
    return [...pedidos].sort((a, b) => {
      const va = valorOrden(orden.col, a);
      const vb = valorOrden(orden.col, b);
      let r;
      if (typeof va === "number" && typeof vb === "number") r = va - vb;
      else r = String(va).localeCompare(String(vb), "es", { numeric: true, sensitivity: "base" });
      return r * orden.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidos, orden]);

  return (
    <div className="card exp-tabla">
      <div style={{ width: "100%" }}>
        <div className="tabla-header exp-thead" style={styles.tablaHeader}>
          {COLUMNAS.map((col) => {
            const activa = orden.col === col.key;
            return (
              <div
                key={col.key}
                className={`exp-col exp-c-${col.key}`}
                onClick={() => ordenarPor(col.key)}
                title="Tocá para ordenar"
                style={{
                  ...w(col.key),
                  position: "relative",
                  textAlign: col.derecha ? "right" : "left",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  userSelect: "none",
                  color: activa ? "var(--primary)" : undefined,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: col.derecha ? "flex-end" : "flex-start",
                  gap: 4,
                }}
              >
                {col.label}
                {activa && (orden.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                <span
                  className="exp-manija"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => iniciarArrastre(e, col)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    restablecer(col);
                  }}
                  title="Arrastrá para cambiar el ancho (doble clic: restablecer)"
                  style={styles.manijaColumna}
                  onMouseEnter={(e) =>
                    (e.currentTarget.firstChild.style.background =
                      "var(--primary)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.firstChild.style.background =
                      "var(--border-strong, #cbd2e0)")
                  }
                >
                  <span style={styles.lineaManija} />
                </span>
              </div>
            );
          })}
        </div>
        <div>
          {pedidosOrdenados.map((p, i) => {
            const estado = ESTADOS[p.estado];
            const vendedor = usuariosMap[p.vendedor_id];
            return (
              <div
                key={p.id}
                onClick={() => onSelect(p)}
                className="tabla-fila exp-fila"
                style={{
                  ...styles.tablaFila,
                  borderBottom:
                    i < pedidos.length - 1
                      ? "1px solid var(--border)"
                      : "none",
                  background:
                    p.estado === "en_espera"
                      ? "rgba(255, 59, 48, 0.08)"
                      : "transparent",
                  boxShadow:
                    miId && p.vendedor_id === miId
                      ? "inset 3px 0 0 var(--primary)"
                      : "none",
                }}
              >
                <div className="exp-col exp-c-orden" style={w("orden")}>
                  <div className="exp-num">#{p.numero_pedido}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                    {formatearFechaHora(p.created_at)}
                  </div>
                </div>
                <div className="exp-col exp-c-cliente" style={{ ...w("cliente"), minWidth: 0 }}>
                  <div className="exp-nombre" title={p.cliente_nombre || ""}>
                    {limpiarCliente(p.cliente_nombre) || "—"}
                  </div>
                  <div className="exp-sub">{vendedor?.nombre || "—"}</div>
                </div>
                <div
                  className="exp-col exp-c-estado"
                  style={{
                    ...w("estado"),
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    className="badge"
                    style={{ background: estado.bg, color: estado.color }}
                  >
                    {estado.icono} {estado.label}
                  </span>
                  {p.hora_desde && (
                    <span
                      className="badge"
                      style={{
                        background: "var(--surface-container)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      🕓 {formatearHoraDesde(p.hora_desde)}
                    </span>
                  )}
                </div>
                <div
                  className="exp-col exp-c-comentario"
                  title={p.observaciones || ""}
                  style={{
                    ...w("comentario"),
                    minWidth: 0,
                    fontSize: 12,
                    lineHeight: 1.35,
                    color: "var(--text-secondary)",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    wordBreak: "break-word",
                  }}
                >
                  {p.observaciones || ""}
                </div>
                <div
                  className="exp-col exp-c-pago"
                  style={{
                    ...w("pago"),
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {p.pago === "paga_ahora" ? "💵 PAGA AHORA" : "🔖 RETIRA"}
                  </span>
                  <span
                    style={{
                      fontSize: 10.5,
                      color: p.facturado
                        ? "var(--primary)"
                        : "var(--text-muted)",
                      fontWeight: 600,
                    }}
                  >
                    {p.facturado ? "🧾 Facturado" : "Sin facturar"}
                  </span>
                </div>
                <div
                  className="exp-col exp-c-monto"
                  style={{
                    ...w("monto"),
                    textAlign: "right",
                    fontSize: 13,
                    fontWeight: 600,
                    color: p.monto ? "var(--text)" : "var(--text-muted)",
                  }}
                >
                  {p.monto ? formatearMonto(p.monto) : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TarjetaCompacta({ pedido, cliente, vendedor, onClick }) {
  const estado = ESTADOS[pedido.estado];
  return (
    <div
      onClick={onClick}
      className="card exp-tarjeta"
      style={{ borderLeft: `3px solid ${estado.color}` }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span
          style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)" }}
        >
          #{pedido.numero_pedido}
        </span>
        <span
          className="badge"
          style={{ background: estado.bg, color: estado.color, fontSize: 9.5 }}
        >
          {estado.icono} {estado.label}
        </span>
        {pedido.hora_desde && (
          <span
            className="badge"
            style={{
              marginLeft: 6,
              background: "var(--surface-container)",
              color: "var(--text-secondary)",
              fontSize: 9.5,
            }}
          >
            🕓 {formatearHoraDesde(pedido.hora_desde)}
          </span>
        )}
      </div>
      <div
        title={pedido.cliente_nombre || ""}
        style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 3 }}
      >
        {limpiarCliente(pedido.cliente_nombre) || "—"}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {vendedor?.nombre || "—"}
      </div>
      {pedido.observaciones && (
        <div
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            marginTop: 6,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={pedido.observaciones}
        >
          💬 {pedido.observaciones}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 }}>
        {formatearFechaHora(pedido.created_at)}
      </div>
    </div>
  );
}

const styles = {
  manijaColumna: {
    position: "absolute",
    top: -13,
    bottom: -13,
    right: -12,
    width: 16,
    cursor: "col-resize",
    display: "flex",
    justifyContent: "center",
  },
  lineaManija: {
    width: 2,
    height: "100%",
    background: "var(--border-strong, #cbd2e0)",
    borderRadius: 2,
    transition: "background 0.12s",
  },
  tabs: {
    borderBottom: "2px solid var(--border)",
  },
  tabBtn: {
    background: "transparent",
    border: "none",
    padding: "10px 16px",
    fontSize: 13.5,
    cursor: "pointer",
    marginBottom: -2,
    display: "flex",
    alignItems: "center",
  },
  viewToggle: {
    display: "flex",
    gap: 2,
    background: "var(--surface-container)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 3,
  },
  viewBtn: {
    padding: "7px 9px",
    borderRadius: 6,
    border: "none",
    background: "transparent",
    color: "var(--text-secondary)",
    display: "flex",
  },
  viewBtnActive: {
    background: "var(--surface)",
    color: "var(--primary)",
    boxShadow: "var(--shadow-sm)",
  },
  tablaHeader: {
    display: "flex",
    gap: 16,
    padding: "13px 18px",
    background: "var(--surface-container)",
    borderBottom: "1px solid var(--border)",
    fontSize: 10.5,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  tablaFila: {
    display: "flex",
    gap: 16,
    padding: "13px 18px",
    alignItems: "center",
    cursor: "pointer",
    transition: "background 0.1s",
  },
};
