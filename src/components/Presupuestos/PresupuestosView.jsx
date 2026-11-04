import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Settings, ArrowUp, ArrowDown, X, BarChart3, FileText } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { cargarConfig } from "../../lib/presupuestosApi";
import { limpiarCliente } from "../../utils/ordenar";
import {
  CONFIG_DEFAULT,
  FILTROS,
  filtrarPresupuestos,
  colorEstado,
  formatearMonto,
  fechaCorta,
  claseAntiguedad,
  COLOR_ANTIGUEDAD,
  COLOR_TONO,
  estadoProximo,
  textoHace,
  evaluarPresupuesto,
  rangoPrioridad,
  tonoDias,
} from "../../utils/presupuestos";
import FormularioPresupuesto from "./FormularioPresupuesto";
import DetallePresupuesto from "./DetallePresupuesto";
import ConfigPresupuesto from "./ConfigPresupuesto";
import EstadisticasPresupuestos from "./EstadisticasPresupuestos";
import "./presupuestos.css";

const CAMPOS = [
  "id",
  "odoo_numero",
  "cliente_nombre",
  "importe_original",
  "fecha_creacion_odoo",
  "vendedor_odoo",
  "contacto_telefono",
  "contacto_email",
  "comentario_odoo",
  "estado",
  "ciclo",
  "responsable_id",
  "responsable:usuarios!responsable_id(nombre)",
  "ultimo_intento_at",
  "ultimo_contacto_efectivo_at",
  "proximo_seguimiento_at",
  "ultima_gestion_resumen",
  "fecha_cierre",
  "importe_confirmado",
  "motivo_perdida",
  "created_at",
].join(", ");

// Columnas de la tabla (solo escritorio y tablet). En celular se usan tarjetas.
const COLUMNAS = [
  { key: "numero", label: "N° / Creado", min: 95, def: 105 },
  { key: "cliente", label: "Cliente / Responsable", min: 130, def: 175 },
  { key: "importe", label: "Importe", min: 90, def: 105, derecha: true },
  { key: "antig", label: "Antigüedad", min: 80, def: 90 },
  { key: "contacto", label: "Días sin contacto", min: 100, def: 115 },
  { key: "gestion", label: "Última gestión", min: 110, def: 185 },
  { key: "proximo", label: "Próx. seguimiento", min: 100, def: 125 },
  { key: "estado", label: "Estado", min: 100, def: 150 },
];
const ANCHOS_DEF = Object.fromEntries(COLUMNAS.map((c) => [c.key, c.def]));
const CLAVE_ANCHOS = "maestro_anchos_presupuestos_v2";

function leerAnchos() {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE_ANCHOS) || "null");
    if (g && typeof g === "object") return { ...ANCHOS_DEF, ...g };
  } catch {
    /* sin almacenamiento: anchos por defecto */
  }
  return ANCHOS_DEF;
}

// vista: "lista" (tabla o tarjetas de presupuestos) o "estadisticas".
// La controla el menú (App.jsx) y el botón del encabezado, que avisan con onCambiarVista.
export default function PresupuestosView({ vista = "lista", onCambiarVista }) {
  const { esEncargadoVentas, esAdmin } = useAuth();
  // Vendedor: solo ve los suyos (lo garantiza la base). Encargado y admin: todos.
  const puedeVerTodos = esEncargadoVentas || esAdmin;

  const [estados, setEstados] = useState([]);
  const [catalogos, setCatalogos] = useState({});
  const [config, setConfig] = useState(CONFIG_DEFAULT);
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("activos");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroResponsable, setFiltroResponsable] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState({ col: null, dir: 1 });
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [seleccionadoId, setSeleccionadoId] = useState(null);

  const [anchos, setAnchos] = useState(leerAnchos);
  const anchosRef = useRef(anchos);
  anchosRef.current = anchos;

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    const [resEstados, resCatalogos, resLista, cfg] = await Promise.all([
      supabase.from("presupuesto_estados").select("clave, etiqueta, orden, cierra").order("orden"),
      supabase
        .from("presupuesto_catalogos")
        .select("tipo, clave, etiqueta, orden, efectivo")
        .eq("activo", true)
        .order("orden"),
      supabase
        .from("presupuesto_seguimientos")
        .select(CAMPOS)
        .order("fecha_creacion_odoo", { ascending: false })
        .limit(1000),
      cargarConfig(),
    ]);
    if (resEstados.error || resCatalogos.error || resLista.error) {
      setError("No se pudieron cargar los presupuestos.");
    } else {
      setEstados(resEstados.data || []);
      const agrupados = {};
      (resCatalogos.data || []).forEach((c) => {
        (agrupados[c.tipo] ||= []).push(c);
      });
      setCatalogos(agrupados);
      setLista(resLista.data || []);
    }
    setConfig(cfg);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cierraEstado = useMemo(
    () => Object.fromEntries(estados.map((e) => [e.clave, e.cierra])),
    [estados],
  );
  const etiquetaEstado = useMemo(
    () => Object.fromEntries(estados.map((e) => [e.clave, e.etiqueta])),
    [estados],
  );

  // Alertas de cada presupuesto según la configuración actual
  const flags = useMemo(
    () => Object.fromEntries(lista.map((p) => [p.id, evaluarPresupuesto(p, config)])),
    [lista, config],
  );

  const responsables = useMemo(() => {
    const mapa = new Map();
    lista.forEach((p) => {
      if (p.responsable_id) mapa.set(p.responsable_id, p.responsable?.nombre || "Sin nombre");
    });
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [lista]);

  // Valor de cada columna para ordenar (null = vacío, va al final)
  const valorOrden = (col, p) => {
    const ev = flags[p.id] || {};
    switch (col) {
      case "numero":
        return new Date(p.fecha_creacion_odoo).getTime();
      case "cliente":
        return limpiarCliente(p.cliente_nombre).toLowerCase();
      case "importe":
        return Number(p.importe_original || 0);
      case "antig":
        return ev.dias;
      case "contacto":
        return ev.diasSinContacto;
      case "gestion":
        return p.ultima_gestion_resumen ? p.ultima_gestion_resumen.toLowerCase() : null;
      case "proximo":
        return p.proximo_seguimiento_at ? new Date(p.proximo_seguimiento_at).getTime() : null;
      case "estado":
        return (etiquetaEstado[p.estado] || p.estado).toLowerCase();
      default:
        return null;
    }
  };

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const base =
      filtro === "alerta"
        ? lista.filter((p) => flags[p.id]?.alerta && !cierraEstado[p.estado])
        : filtrarPresupuestos(lista, filtro, cierraEstado, flags);
    const filas = base
      .filter((p) => !filtroEstado || p.estado === filtroEstado)
      .filter((p) => !filtroResponsable || p.responsable_id === filtroResponsable)
      .filter(
        (p) =>
          !q ||
          p.cliente_nombre.toLowerCase().includes(q) ||
          p.odoo_numero.includes(q),
      );

    if (!orden.col) {
      // Orden por defecto: prioridad (alertas primero) y después más recientes
      return filas.sort(
        (a, b) =>
          rangoPrioridad(flags[a.id]) - rangoPrioridad(flags[b.id]) ||
          new Date(b.fecha_creacion_odoo) - new Date(a.fecha_creacion_odoo),
      );
    }

    return filas.sort((a, b) => {
      const va = valorOrden(orden.col, a);
      const vb = valorOrden(orden.col, b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // vacíos siempre al final
      if (vb == null) return -1;
      if (va < vb) return -orden.dir;
      if (va > vb) return orden.dir;
      return 0;
    });
  }, [lista, filtro, filtroEstado, filtroResponsable, busqueda, cierraEstado, flags, orden, etiquetaEstado]);

  const abiertos = lista.filter((p) => !cierraEstado[p.estado]);
  const cantidadAlerta = abiertos.filter((p) => flags[p.id]?.alerta).length;

  // Se toma siempre la versión más nueva de la lista (así se actualizan los contadores)
  const seleccionado = lista.find((p) => p.id === seleccionadoId) || null;

  // Tocar un título: asc -> desc -> sin orden
  const ordenarPor = (col) => {
    setOrden((o) => {
      if (o.col !== col) return { col, dir: 1 };
      if (o.dir === 1) return { col, dir: -1 };
      return { col: null, dir: 1 };
    });
  };

  // Redimensionar columnas (solo con mouse, en escritorio y tablet)
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
      try {
        localStorage.setItem(CLAVE_ANCHOS, JSON.stringify(anchosRef.current));
      } catch {
        /* ignorar */
      }
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", soltar);
  };

  const restablecerColumna = (col) => {
    const a = { ...anchosRef.current, [col.key]: col.def };
    setAnchos(a);
    try {
      localStorage.setItem(CLAVE_ANCHOS, JSON.stringify(a));
    } catch {
      /* ignorar */
    }
  };

  const totalAncho = COLUMNAS.reduce((acc, c) => acc + anchos[c.key], 0);

  // Datos visuales de cada presupuesto (compartidos por la tabla y las tarjetas)
  const datosVisuales = (p) => {
    const ev = flags[p.id] || {};
    return {
      ev,
      antig: COLOR_ANTIGUEDAD[claseAntiguedad(ev.dias, config)],
      estadoColor: colorEstado(p.estado),
      proximo: estadoProximo(p.proximo_seguimiento_at),
      tonoContacto: COLOR_TONO[
        tonoDias(ev.diasSinContacto, config.dias_sin_contacto_aviso, config.dias_sin_contacto_critico)
      ],
      marca: ev.alerta ? "#dc2626" : ev.aviso ? "#f59e0b" : "transparent",
    };
  };

  const textoContacto = (p, ev) =>
    p.ultimo_contacto_efectivo_at ? `${ev.diasSinContacto} d` : `Sin contacto · ${ev.diasSinContacto} d`;

  return (
    <div className="pres-pagina">
      <div className="pres-encabezado">
        <div>
          <h1 className="pres-titulo">Presupuestos</h1>
          <p className="pres-subtitulo">Seguimiento comercial de presupuestos de Odoo.</p>
        </div>
        <div className="pres-acciones">
          <div className="pres-contador">
            <span className="pres-contador-etiqueta">Abiertos</span>
            <strong className="pres-contador-valor">{abiertos.length}</strong>
          </div>
          <button
            onClick={() => setFiltro(filtro === "alerta" ? "activos" : "alerta")}
            title="Ver solo los presupuestos en alerta"
            className={`pres-contador pres-contador-boton${filtro === "alerta" ? " pres-contador-activo" : ""}`}
          >
            <span className="pres-contador-etiqueta">En alerta</span>
            <strong
              className="pres-contador-valor"
              style={{ color: cantidadAlerta ? "#b91c1c" : undefined }}
            >
              {cantidadAlerta}
            </strong>
          </button>
          {esAdmin && (
            <button className="btn btn-ghost" onClick={() => setMostrarConfig(true)}>
              <Settings size={16} /> Configuración
            </button>
          )}
          <button
            className="btn btn-primary"
            style={{ background: "#0f766e", borderColor: "#0f766e", color: "#fff" }}
            onClick={() => onCambiarVista?.(vista === "estadisticas" ? "lista" : "estadisticas")}
          >
            {vista === "estadisticas" ? <FileText size={16} /> : <BarChart3 size={16} />}
            {vista === "estadisticas" ? " Presupuestos" : " Estadísticas"}
          </button>
          <button className="btn btn-primary pres-boton-ancho" onClick={() => setMostrarFormulario(true)}>
            <Plus size={16} /> Agregar presupuesto
          </button>
        </div>
      </div>

      {vista === "estadisticas" ? (
        <EstadisticasPresupuestos
          lista={lista}
          estados={estados}
          catalogos={catalogos}
          onAbrirDetalle={(p) => setSeleccionadoId(p.id)}
        />
      ) : (
        <>
          <div className="pres-chips">
            {FILTROS.map((f) => {
              const cantidad = filtrarPresupuestos(lista, f.key, cierraEstado, flags).length;
              const activo = filtro === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFiltro(f.key)}
                  className={`pres-chip${activo ? " pres-chip-activo" : ""}`}
                >
                  {f.label}
                  <span className="pres-chip-numero">{cantidad}</span>
                </button>
              );
            })}
          </div>

          {filtro === "alerta" && (
            <div className="pres-banner-alerta">
              <span>Mostrando solo los presupuestos en alerta.</span>
              <button
                className="btn btn-ghost"
                style={{ padding: "4px 10px", fontSize: 12 }}
                onClick={() => setFiltro("activos")}
              >
                <X size={13} /> Quitar filtro
              </button>
            </div>
          )}

          <div className="pres-filtros">
            <input
              type="search"
              placeholder="Buscar cliente o N° de presupuesto..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pres-buscador"
            />
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="pres-select"
            >
              <option value="">Estado: todos</option>
              {estados.map((e) => (
                <option key={e.clave} value={e.clave}>
                  {e.etiqueta}
                </option>
              ))}
            </select>
            {puedeVerTodos && (
              <select
                value={filtroResponsable}
                onChange={(e) => setFiltroResponsable(e.target.value)}
                className="pres-select"
              >
                <option value="">Responsable: todos</option>
                {responsables.map(([id, nombre]) => (
                  <option key={id} value={id}>
                    {nombre}
                  </option>
                ))}
              </select>
            )}
          </div>

          <p className="pres-leyenda">
            <span className="pres-marca" style={{ background: "#dc2626" }} /> Vencido o sin contacto crítico
            <span className="pres-marca" style={{ background: "#f59e0b" }} /> Para hoy o aviso
            <span className="pres-leyenda-orden">Tocá un título para ordenar</span>
          </p>

          {error && <p className="pres-error">{error}</p>}

          <div className="pres-tarjeta">
            {cargando ? (
              <div className="pres-vacio">Cargando presupuestos...</div>
            ) : visibles.length === 0 ? (
              <div className="pres-vacio">
                {lista.length === 0
                  ? "Todavía no cargaste presupuestos. Usá «Agregar presupuesto»."
                  : "No hay presupuestos con estos filtros."}
              </div>
            ) : (
              <>
                {/* Tarjetas: celular */}
                <div className="pres-cards">
                  {visibles.map((p) => {
                    const { ev, antig, estadoColor, proximo, tonoContacto, marca } = datosVisuales(p);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className="pres-card"
                        style={{ borderLeft: `4px solid ${marca}` }}
                        onClick={() => setSeleccionadoId(p.id)}
                      >
                        <div className="pres-card-cabecera">
                          <div>
                            <strong>#{p.odoo_numero}</strong>{" "}
                            <span className="pres-subtexto">{fechaCorta(p.fecha_creacion_odoo)}</span>
                            <div className="pres-cliente">
                              {ev.importeAlto && <span title="Importe alto">🔥 </span>}
                              {limpiarCliente(p.cliente_nombre)}
                            </div>
                            {puedeVerTodos && (
                              <div className="pres-subtexto">{p.responsable?.nombre || "Sin responsable"}</div>
                            )}
                          </div>
                          <span
                            className="pres-pildora"
                            style={{ color: estadoColor.color, background: estadoColor.fondo }}
                          >
                            {etiquetaEstado[p.estado] || p.estado}
                          </span>
                        </div>
                        <div className="pres-card-grid">
                          <div>
                            <span className="pres-card-etiqueta">Importe</span>
                            <strong>{formatearMonto(p.importe_original)}</strong>
                          </div>
                          <div>
                            <span className="pres-card-etiqueta">Antigüedad</span>
                            <span className="pres-pildora" style={{ color: antig.color, background: antig.fondo }}>
                              {ev.dias} d
                            </span>
                          </div>
                          <div>
                            <span className="pres-card-etiqueta">Sin contacto</span>
                            <span
                              className="pres-pildora"
                              style={{ color: tonoContacto.color, background: tonoContacto.fondo }}
                            >
                              {textoContacto(p, ev)}
                            </span>
                          </div>
                          <div>
                            <span className="pres-card-etiqueta">Próx. seguimiento</span>
                            <span
                              className="pres-pildora"
                              style={{ color: COLOR_TONO[proximo.tono].color, background: COLOR_TONO[proximo.tono].fondo }}
                            >
                              {proximo.texto}
                            </span>
                          </div>
                          <div className="pres-card-ancho">
                            <span className="pres-card-etiqueta">Última gestión</span>
                            <span className="pres-subtexto" style={{ fontSize: 13, color: "inherit" }}>
                              {p.ultima_gestion_resumen || "Sin gestiones"}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Tabla: escritorio y tablet */}
                <div className="pres-tabla-wrap">
                  <div className="pres-scroll">
                    <table className="pres-tabla" style={{ width: "100%", minWidth: totalAncho, tableLayout: "fixed" }}>
                      <colgroup>
                        {COLUMNAS.map((col) => (
                          <col key={col.key} style={{ width: anchos[col.key] }} />
                        ))}
                      </colgroup>
                      <thead>
                        <tr>
                          {COLUMNAS.map((col) => {
                            const activa = orden.col === col.key;
                            return (
                              <th
                                key={col.key}
                                className="pres-th"
                                onClick={() => ordenarPor(col.key)}
                                title="Tocá para ordenar"
                                style={{
                                  textAlign: col.derecha ? "right" : "left",
                                  color: activa ? "var(--primary, #1d4ed8)" : undefined,
                                }}
                              >
                                <span className="pres-titulo-columna">
                                  {col.label}
                                  {activa && (orden.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                                </span>
                                <span
                                  onClick={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => iniciarArrastre(e, col)}
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    restablecerColumna(col);
                                  }}
                                  title="Arrastrá para cambiar el ancho (doble clic: restablecer)"
                                  className="pres-manija"
                                >
                                  <span className="pres-linea-manija" />
                                </span>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {visibles.map((p) => {
                          const { ev, antig, estadoColor, proximo, tonoContacto, marca } = datosVisuales(p);
                          return (
                            <tr key={p.id} className="pres-fila" onClick={() => setSeleccionadoId(p.id)}>
                              <td className="pres-td" style={{ boxShadow: `inset 3px 0 0 ${marca}` }}>
                                <strong>#{p.odoo_numero}</strong>
                                <div className="pres-subtexto">{fechaCorta(p.fecha_creacion_odoo)}</div>
                              </td>
                              <td className="pres-td">
                                <div className="pres-cliente" title={p.cliente_nombre}>
                                  {ev.importeAlto && <span title="Importe alto">🔥 </span>}
                                  {limpiarCliente(p.cliente_nombre)}
                                </div>
                                {puedeVerTodos && (
                                  <div className="pres-subtexto">{p.responsable?.nombre || "Sin responsable"}</div>
                                )}
                              </td>
                              <td className="pres-td" style={{ textAlign: "right" }}>
                                <strong>{formatearMonto(p.importe_original)}</strong>
                              </td>
                              <td className="pres-td">
                                <span className="pres-pildora" style={{ color: antig.color, background: antig.fondo }}>
                                  {ev.dias} d
                                </span>
                              </td>
                              <td className="pres-td">
                                <span
                                  className="pres-pildora"
                                  style={{ color: tonoContacto.color, background: tonoContacto.fondo }}
                                >
                                  {textoContacto(p, ev)}
                                </span>
                                <div className="pres-subtexto">Intento: {textoHace(p.ultimo_intento_at)}</div>
                              </td>
                              <td className="pres-td">
                                <div className="pres-gestion" title={p.ultima_gestion_resumen || ""}>
                                  {p.ultima_gestion_resumen || <span className="pres-subtexto">Sin gestiones</span>}
                                </div>
                              </td>
                              <td className="pres-td">
                                <span
                                  className="pres-pildora"
                                  style={{ color: COLOR_TONO[proximo.tono].color, background: COLOR_TONO[proximo.tono].fondo }}
                                >
                                  {proximo.texto}
                                </span>
                              </td>
                              <td className="pres-td">
                                <span className="pres-pildora" style={{ color: estadoColor.color, background: estadoColor.fondo }}>
                                  {etiquetaEstado[p.estado] || p.estado}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {mostrarFormulario && (
        <FormularioPresupuesto onClose={() => setMostrarFormulario(false)} onSuccess={cargar} />
      )}

      {mostrarConfig && <ConfigPresupuesto onClose={() => setMostrarConfig(false)} onSaved={cargar} />}

      {seleccionado && (
        <DetallePresupuesto
          seguimiento={seleccionado}
          catalogos={catalogos}
          estados={estados}
          config={config}
          onClose={() => setSeleccionadoId(null)}
          onCambio={cargar}
        />
      )}
    </div>
  );
}
