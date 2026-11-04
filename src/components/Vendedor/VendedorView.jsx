import { useState, useMemo } from "react";
import { LayoutGrid, List as ListIcon, History } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useAppData } from "../../hooks/useAppData";
import { ESTADOS } from "../../utils/constants";
import {
  coincideNumero,
  ordenarPorPrioridad,
  ordenarPorHora,
  ordenarPorCliente,
  esHoy,
  tiempoTranscurrido,
  formatearHora,
  formatearFechaHora,
} from "../../utils/helpers";
import DetallePedido from "../Pedidos/DetallePedido";
import TablaMisPedidos from "./TablaMisPedidos";
import { usePreferencia } from "../../hooks/usePreferencia";
import {
  ordenarLista,
  OPCIONES_ORDEN,
  limpiarCliente,
} from "../../utils/ordenar";

const GRUPOS = [
  { key: "todos", label: "Todos" },
  { key: "pendientes", label: "Pendientes" },
  { key: "listos", label: "Listos" },
  { key: "retirados", label: "Retirados" },
  { key: "cancelados", label: "Cancelados" },
];

const CSS = `
.mp-pagina { padding: 20px 20px 60px; max-width: 1400px; margin: 0 auto; }
.mp-filtros { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 24px; }
.mp-espacio { flex: 1; }
.mp-vista { display: flex; gap: 2px; background: var(--surface-container); border: 1px solid var(--border); border-radius: 8px; padding: 3px; }
.mp-segmento { display: flex; gap: 2px; background: var(--surface-container); border: 1px solid var(--border); border-radius: 8px; padding: 3px; }
.mp-seg-btn { border: none; background: transparent; color: var(--text-secondary); cursor: pointer; }
.mp-tarjeta { cursor: pointer; transition: all 0.15s; }
.mp-titulo { font-family: Montserrat, sans-serif; font-size: 24px; font-weight: 800; margin: 0; }

@media (max-width: 900px) {
  .kanban-grid { grid-template-columns: 1fr !important; }
}

@media (max-width: 640px) {
  .mp-pagina { padding: 12px 12px 40px !important; }
  .mp-titulo { font-size: 20px !important; }
  .mp-cabecera p { font-size: 12.5px !important; }
  .mp-filtros { gap: 8px !important; margin-bottom: 14px !important; }
  .mp-filtros select { flex: 1 1 calc(50% - 4px) !important; width: auto !important; min-width: 0 !important; font-size: 13px !important; padding: 8px 10px !important; }
  .mp-orden { flex-basis: 100% !important; }
  .mp-filtro-caja { flex: 1 1 100% !important; justify-content: space-between !important; padding: 7px 10px !important; }
  .mp-espacio { display: none; }
  .mp-vista { margin-left: auto; }
  .mp-segmento { flex: 1 1 100%; flex-wrap: wrap; order: 10; }
  .mp-seg-btn { flex: 1 1 auto; padding: 6px 8px !important; font-size: 11.5px !important; }
  .mp-tarjeta { padding: 12px !important; }
  .mp-tarjeta h4 { font-size: 13px !important; }
  .mp-tarjeta .badge { font-size: 9.5px !important; }
  .kanban-grid { gap: 14px !important; }
}
`;

export default function VendedorView({ busqueda }) {
  const { perfil, esEncargadoVentas, esEncargadoExpedicion } = useAuth();
  // Encargados (de ventas o de expedición) y admin pueden ver los pedidos de todos
  const puedeVerTodos = esEncargadoVentas || esEncargadoExpedicion;
  const [soloMios, setSoloMios] = useState(true);
  const [filtroVendedor, setFiltroVendedor] = useState("todos");
  const [grupo, setGrupo] = useState("todos");
  // Vista y orden se guardan por usuario
  const [vista, setVista] = usePreferencia("mis_pedidos.vista", "lista");
  const [ordenTabla, setOrdenTabla] = usePreferencia("mis_pedidos.orden_tabla", null);
  const [orden, setOrden] = useState("prioridad");
  const [pedidoDetalle, setPedidoDetalle] = useState(null);

  const { pedidos, usuarios, clientesMap, usuariosMap, loading, refetch } =
    useAppData();

  // Vendedores con al menos un pedido cargado (para el filtro del encargado)
  const vendedores = useMemo(() => {
    const ids = new Set(pedidos.map((p) => p.vendedor_id));
    return (usuarios || [])
      .filter((u) => ids.has(u.id))
      .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
  }, [pedidos, usuarios]);

  const base = useMemo(() => {
    let lista = pedidos;
    // Un vendedor solo ve lo suyo. El encargado puede ver todo, lo suyo o un vendedor.
    if (!puedeVerTodos || soloMios)
      lista = lista.filter((p) => p.vendedor_id === perfil.id);
    else if (filtroVendedor !== "todos")
      lista = lista.filter((p) => p.vendedor_id === filtroVendedor);
    if (busqueda)
      lista = lista.filter(
        (p) =>
          coincideNumero(p.numero_pedido, busqueda) ||
          p.cliente_nombre?.toLowerCase().includes(busqueda.toLowerCase()),
      );
    return lista;
  }, [
    pedidos,
    soloMios,
    filtroVendedor,
    puedeVerTodos,
    busqueda,
    perfil.id,
  ]);

  const pendientes = base.filter(
    (p) =>
      !["listo_para_entregar", "entregado", "cancelado"].includes(p.estado),
  );
  const listos = base.filter((p) => p.estado === "listo_para_entregar");
  const retirados = base.filter((p) => p.estado === "entregado");
  const cancelados = base.filter((p) => p.estado === "cancelado");

  const aplicarOrden = (lista) =>
    ordenarLista(lista, orden, usuariosMap) || ordenarPorPrioridad(lista);
  // Retirados y cancelados: por defecto, lo más reciente primero
  const aplicarOrdenFinal = (lista, campo) =>
    ordenarLista(lista, orden, usuariosMap) || ordenarPorHora(lista, campo);

  const columnas = [
    {
      key: "pendientes",
      label: "Pendientes",
      color: "var(--st-en-espera)",
      bg: "var(--st-en-espera-bg)",
      data: aplicarOrden(pendientes),
    },
    {
      key: "listos",
      label: "Listos",
      color: "var(--st-listo)",
      bg: "var(--st-listo-bg)",
      data: aplicarOrden(listos),
    },
    {
      key: "retirados",
      label: "Retirados",
      color: "var(--st-entregado)",
      bg: "var(--st-entregado-bg)",
      data: aplicarOrdenFinal(retirados, "entregado_at"),
    },
    {
      key: "cancelados",
      label: "Cancelados",
      color: "#EF4444",
      bg: "rgba(239, 68, 68, 0.12)",
      data: aplicarOrdenFinal(cancelados, "created_at"),
    },
  ];

  const todosCombinadosBase = [
    ...pendientes,
    ...listos,
    ...retirados,
    ...cancelados,
  ];
  const todosCombinados =
    ordenarLista(todosCombinadosBase, orden, usuariosMap) ||
    ordenarLista(todosCombinadosBase, "fecha_desc");

  const columnasVisibles =
    grupo === "todos"
      ? [
          {
            key: "todos",
            label: "Todos los pedidos",
            color: "var(--primary)",
            bg: "var(--primary-subtle)",
            data: todosCombinados,
          },
        ]
      : columnas.filter((c) => c.key === grupo);

  return (
    <div className="mp-pagina">
      <style>{CSS}</style>

      <div className="mp-cabecera" style={{ marginBottom: 20 }}>
        <h2 className="mp-titulo">Mis Pedidos</h2>
        <p
          style={{
            color: "var(--text-secondary)",
            fontSize: 13.5,
            marginTop: 3,
          }}
        >
          Seguimiento de pedidos y su estado de retiro.
        </p>
      </div>

      {/* Filtros */}
      <div className="mp-filtros">
        {puedeVerTodos && (
          <>
            <div className="mp-filtro-caja" style={styles.filtroCard}>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                Solo mis pedidos
              </span>
              <button
                className="toggle"
                onClick={() => {
                  const nuevo = !soloMios;
                  setSoloMios(nuevo);
                  if (nuevo) setFiltroVendedor("todos");
                }}
                style={{
                  background: soloMios
                    ? "var(--primary)"
                    : "var(--border-strong)",
                }}
              >
                <span
                  className="toggle-knob"
                  style={{ left: soloMios ? 19 : 2 }}
                />
              </button>
            </div>

            <select
              className="input"
              style={{ width: "auto" }}
              value={filtroVendedor}
              onChange={(e) => {
                setFiltroVendedor(e.target.value);
                if (e.target.value !== "todos") setSoloMios(false);
              }}
            >
              <option value="todos">Vendedor: Todos</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </select>
          </>
        )}

        {vista !== "lista" && (
          <div className="mp-segmento" style={styles.segmented}>
            {GRUPOS.map((g) => (
              <button
                key={g.key}
                className="mp-seg-btn"
                onClick={() => setGrupo(g.key)}
                style={{
                  ...styles.segmentBtn,
                  ...(grupo === g.key ? styles.segmentBtnActive : {}),
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
        )}

        <select
          className="input mp-orden"
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

        <div className="mp-espacio" />

        <div className="mp-vista" style={styles.viewToggle}>
          <button
            onClick={() => setVista("tarjetas")}
            style={{
              ...styles.viewBtn,
              ...(vista === "tarjetas" ? styles.viewBtnActive : {}),
            }}
            title="Vista tarjetas"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            onClick={() => setVista("lista")}
            style={{
              ...styles.viewBtn,
              ...(vista === "lista" ? styles.viewBtnActive : {}),
            }}
            title="Vista lista"
          >
            <ListIcon size={15} />
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <span className="spinner" style={{ width: 24, height: 24 }} />
        </div>
      ) : vista === "lista" ? (
        <TablaMisPedidos
          pedidos={base}
          usuariosMap={usuariosMap}
          orden={ordenTabla}
          onOrdenar={(key) => {
            const siguiente =
              !ordenTabla || ordenTabla.col !== key
                ? { col: key, dir: 1 }
                : ordenTabla.dir === 1
                  ? { col: key, dir: -1 }
                  : null;
            setOrdenTabla(siguiente);
          }}
          onSelect={setPedidoDetalle}
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columnasVisibles.length}, minmax(300px, 1fr))`,
            gap: 24,
          }}
          className="kanban-grid"
        >
          {columnasVisibles.map((col) => (
            <Columna
              key={col.key}
              columna={col}
              vista={vista}
              clientesMap={clientesMap}
              usuariosMap={usuariosMap}
              miId={perfil.id}
              onSelect={setPedidoDetalle}
            />
          ))}
        </div>
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

function Columna({ columna, vista, clientesMap, usuariosMap, miId, onSelect }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `2px solid ${columna.color}`,
          paddingBottom: 9,
          marginBottom: 12,
        }}
      >
        <h3
          style={{
            fontFamily: "Montserrat, sans-serif",
            fontSize: 15,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: columna.color,
              display: "inline-block",
            }}
          />
          {columna.label}
        </h3>
        <span
          style={{
            background: columna.bg,
            color: columna.color,
            fontSize: 11.5,
            fontWeight: 700,
            padding: "3px 9px",
            borderRadius: 999,
          }}
        >
          {columna.data.length}
        </span>
      </div>

      {columna.data.length === 0 ? (
        <div className="empty-state" style={{ padding: "30px 10px" }}>
          <History size={26} />
          <p style={{ fontSize: 12.5 }}>Sin pedidos en esta columna</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {columna.data.map((p) =>
            vista === "tarjetas" ? (
              <TarjetaPedido
                key={p.id}
                pedido={p}
                cliente={clientesMap[p.cliente_id]}
                vendedor={usuariosMap[p.vendedor_id]}
                esMio={p.vendedor_id === miId}
                onClick={() => onSelect(p)}
              />
            ) : (
              <FilaPedido
                key={p.id}
                pedido={p}
                cliente={clientesMap[p.cliente_id]}
                vendedor={usuariosMap[p.vendedor_id]}
                esMio={p.vendedor_id === miId}
                onClick={() => onSelect(p)}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function TarjetaPedido({ pedido, cliente, vendedor, esMio, onClick }) {
  const estado = ESTADOS[pedido.estado];
  return (
    <div
      onClick={onClick}
      className="card mp-tarjeta"
      style={{
        padding: 15,
        boxShadow: esMio ? "inset 3px 0 0 var(--primary)" : undefined,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--primary)";
        e.currentTarget.style.boxShadow = "var(--shadow-md)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "var(--shadow-sm)";
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 8,
        }}
      >
        <div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: "var(--primary)",
              opacity: 0.7,
            }}
          >
            #{pedido.numero_pedido}
          </span>
          <h4
            style={{
              fontFamily: "Montserrat, sans-serif",
              fontSize: 14.5,
              fontWeight: 700,
              marginTop: 2,
            }}
          >
            {limpiarCliente(pedido.cliente_nombre) || "—"}
          </h4>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--text-muted)",
              marginTop: 2,
            }}
          >
            {vendedor?.nombre || "—"}
          </div>
        </div>
        <span
          className="badge"
          style={{ background: estado.bg, color: estado.color, fontSize: 10 }}
        >
          {estado.icono} {estado.label}
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        <span style={styles.chip}>
          {pedido.pago === "paga_ahora" ? "💵 Paga ahora" : "🔖 Solo retira"}
        </span>
        {pedido.facturado && <span style={styles.chip}>🧾 Facturado</span>}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--text-muted)",
          marginTop: 9,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <History size={12} />
        {pedido.estado === "entregado"
          ? `Entregado ${formatearFechaHora(pedido.entregado_at)}`
          : formatearFechaHora(pedido.created_at)}
      </div>
    </div>
  );
}

function FilaPedido({ pedido, cliente, vendedor, esMio, onClick }) {
  const estado = ESTADOS[pedido.estado];
  const entregadoEl = pedido.entregado_at
    ? `Entregado ${formatearFechaHora(pedido.entregado_at)}`
    : "Sin entregar";
  return (
    <div
      onClick={onClick}
      className="card"
      style={{
        padding: "10px 14px",
        cursor: "pointer",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        boxShadow: esMio ? "inset 3px 0 0 var(--primary)" : undefined,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: estado.color,
          flexShrink: 0,
          marginTop: 6,
        }}
      />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-muted)",
            }}
          >
            #{pedido.numero_pedido}
          </span>
          <span
            className="badge"
            style={{ background: estado.bg, color: estado.color, fontSize: 9.5 }}
          >
            {estado.label}
          </span>
        </div>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {limpiarCliente(pedido.cliente_nombre) || "—"}
        </span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {vendedor?.nombre || "—"}
          </span>
          <span style={{ whiteSpace: "nowrap", flexShrink: 0 }}>{entregadoEl}</span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  filtroCard: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "9px 14px",
  },
  segmented: {
    display: "flex",
    gap: 2,
    background: "var(--surface-container)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 3,
  },
  segmentBtn: {
    padding: "7px 13px",
    borderRadius: 6,
    border: "none",
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 12.5,
    fontWeight: 600,
  },
  segmentBtnActive: {
    background: "var(--surface)",
    color: "var(--text)",
    boxShadow: "var(--shadow-sm)",
    fontWeight: 700,
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
  chip: {
    fontSize: 10.5,
    fontWeight: 600,
    padding: "3px 8px",
    borderRadius: 5,
    background: "var(--surface-container)",
    color: "var(--text-secondary)",
  },
};
