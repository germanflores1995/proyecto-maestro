import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { formatearMonto, fechaCorta } from "../../utils/presupuestos";
import { limpiarCliente } from "../../utils/ordenar";
import "./estadisticas.css";

// Estadísticas de presupuestos: estados, vendedores, medios, resultados,
// situación actual y motivos de pérdida. Se calcula sobre lo que el usuario puede ver.
// Al tocar Presupuestos, Confirmados o Perdidos se abre la lista con detalle.
const PERIODOS = [
  { key: "mes", label: "Este mes" },
  { key: "30", label: "Últimos 30 días" },
  { key: "todo", label: "Todo" },
];

const TITULOS_DETALLE = {
  presupuestos: "Todos los presupuestos",
  confirmados: "Presupuestos confirmados",
  perdidos: "Presupuestos perdidos",
};

function enPeriodo(iso, periodo) {
  if (!iso) return false;
  if (periodo === "todo") return true;
  const f = new Date(iso);
  if (periodo === "30") return Date.now() - f.getTime() <= 30 * 24 * 60 * 60 * 1000;
  const ahora = new Date();
  return f.getFullYear() === ahora.getFullYear() && f.getMonth() === ahora.getMonth();
}

const pct = (parte, total) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : 0);
const pctTexto = (parte, total) => `${String(pct(parte, total)).replace(".", ",")}%`;

export default function EstadisticasPresupuestos({ lista, estados, catalogos, onAbrirDetalle }) {
  const [periodo, setPeriodo] = useState("mes");
  const [detalle, setDetalle] = useState(null); // null | "presupuestos" | "confirmados" | "perdidos"
  const [gestiones, setGestiones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      // PostgREST devuelve como máximo 1000 filas por pedido: traemos por páginas
      const PAGINA = 1000;
      const todas = [];
      let desde = 0;
      let fallo = false;
      for (;;) {
        const { data, error: err } = await supabase
          .from("presupuesto_gestiones")
          .select("seguimiento_id, ocurrio_at, medio, resultado, efectivo, situacion, usuario_id, usuario:usuarios!usuario_id(nombre)")
          .eq("anulada", false)
          .order("ocurrio_at", { ascending: false })
          .order("id", { ascending: false })
          .range(desde, desde + PAGINA - 1);
        if (!vivo) return;
        if (err) {
          fallo = true;
          break;
        }
        todas.push(...(data || []));
        if (!data || data.length < PAGINA) break;
        desde += PAGINA;
      }
      if (fallo) setError("No se pudieron cargar las gestiones.");
      setGestiones(todas);
      setCargando(false);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const etiquetas = useMemo(() => {
    const mapa = {};
    Object.entries(catalogos || {}).forEach(([tipo, items]) => {
      mapa[tipo] = Object.fromEntries(items.map((i) => [i.clave, i.etiqueta]));
    });
    return mapa;
  }, [catalogos]);

  const nombreEstado = useMemo(
    () => Object.fromEntries((estados || []).map((e) => [e.clave, e.etiqueta])),
    [estados],
  );
  const cierra = useMemo(() => Object.fromEntries((estados || []).map((e) => [e.clave, e.cierra])), [estados]);

  const presupuestos = useMemo(
    () => (lista || []).filter((p) => enPeriodo(p.fecha_creacion_odoo, periodo)),
    [lista, periodo],
  );

  // Solo cuentan las gestiones de los presupuestos que el usuario ve en su lista
  // (para un vendedor, únicamente los suyos)
  const idsVisibles = useMemo(() => new Set((lista || []).map((p) => p.id)), [lista]);
  const gestionesVisibles = useMemo(
    () => gestiones.filter((g) => idsVisibles.has(g.seguimiento_id)),
    [gestiones, idsVisibles],
  );
  const gestionesPeriodo = useMemo(
    () => gestionesVisibles.filter((g) => enPeriodo(g.ocurrio_at, periodo)),
    [gestionesVisibles, periodo],
  );

  // Situación actual: la última gestión de cada presupuesto (sobre todo el historial)
  const situacionActual = useMemo(() => {
    const mapa = {};
    gestionesVisibles.forEach((g) => {
      if (!(g.seguimiento_id in mapa)) mapa[g.seguimiento_id] = g.situacion || null;
    });
    return mapa;
  }, [gestionesVisibles]);

  const resumen = useMemo(() => {
    const total = presupuestos.length;
    const importeTotal = presupuestos.reduce((acc, p) => acc + Number(p.importe_original || 0), 0);
    const cerrados = presupuestos.filter((p) => cierra[p.estado]).length;
    const confirmados = presupuestos.filter((p) => p.estado === "confirmado");
    const perdidos = presupuestos.filter((p) => p.estado === "perdido");
    const importeConfirmado = confirmados.reduce(
      (acc, p) => acc + Number(p.importe_confirmado ?? p.importe_original ?? 0),
      0,
    );
    return {
      total,
      importeTotal,
      cerrados,
      confirmados: confirmados.length,
      perdidos: perdidos.length,
      importeConfirmado,
      conversion: pct(confirmados.length, cerrados),
    };
  }, [presupuestos, cierra]);

  // Lista de detalle del indicador elegido, la más reciente primero
  const filasDetalle = useMemo(() => {
    if (!detalle) return [];
    const base =
      detalle === "confirmados"
        ? presupuestos.filter((p) => p.estado === "confirmado")
        : detalle === "perdidos"
          ? presupuestos.filter((p) => p.estado === "perdido")
          : presupuestos;
    return [...base].sort((a, b) => new Date(b.fecha_creacion_odoo) - new Date(a.fecha_creacion_odoo));
  }, [detalle, presupuestos]);

  // Por estado, en el orden de la configuración
  const porEstado = useMemo(() => {
    const filas = (estados || []).map((e) => {
      const de = presupuestos.filter((p) => p.estado === e.clave);
      return {
        clave: e.clave,
        etiqueta: e.etiqueta,
        cantidad: de.length,
        importe: de.reduce((acc, p) => acc + Number(p.importe_original || 0), 0),
      };
    });
    const maximo = Math.max(1, ...filas.map((f) => f.cantidad));
    return filas.map((f) => ({ ...f, ancho: (f.cantidad / maximo) * 100 }));
  }, [estados, presupuestos]);

  // Por vendedor: presupuestos a su nombre y gestiones que hizo
  const porVendedor = useMemo(() => {
    const mapa = new Map();
    const fila = (id, nombre) => {
      if (!mapa.has(id)) {
        mapa.set(id, { id, nombre, presupuestos: 0, cerrados: 0, confirmados: 0, perdidos: 0, importeConfirmado: 0, gestiones: 0, efectivas: 0 });
      }
      return mapa.get(id);
    };
    presupuestos.forEach((p) => {
      const f = fila(p.responsable_id, p.responsable?.nombre || "Sin nombre");
      f.presupuestos += 1;
      if (cierra[p.estado]) f.cerrados += 1;
      if (p.estado === "confirmado") {
        f.confirmados += 1;
        f.importeConfirmado += Number(p.importe_confirmado ?? p.importe_original ?? 0);
      }
      if (p.estado === "perdido") f.perdidos += 1;
    });
    gestionesPeriodo.forEach((g) => {
      const f = fila(g.usuario_id, g.usuario?.nombre || "Sin nombre");
      f.gestiones += 1;
      if (g.efectivo) f.efectivas += 1;
    });
    return [...mapa.values()].sort((a, b) => b.presupuestos - a.presupuestos || b.gestiones - a.gestiones);
  }, [presupuestos, gestionesPeriodo, cierra]);

  // Medios de contacto
  const porMedio = useMemo(() => agrupar(gestionesPeriodo, "medio", etiquetas.medio), [gestionesPeriodo, etiquetas]);
  // Resultados
  const porResultado = useMemo(
    () => agrupar(gestionesPeriodo, "resultado", etiquetas.resultado),
    [gestionesPeriodo, etiquetas],
  );

  // Situación actual de los presupuestos abiertos
  const porSituacion = useMemo(() => {
    const abiertos = presupuestos.filter((p) => !cierra[p.estado]);
    const conteo = {};
    abiertos.forEach((p) => {
      const clave = situacionActual[p.id] || "sin_definir";
      conteo[clave] = (conteo[clave] || 0) + 1;
    });
    const total = abiertos.length;
    return Object.entries(conteo)
      .map(([clave, cantidad]) => ({
        clave,
        etiqueta: clave === "sin_definir" ? "Sin definir" : etiquetas.situacion?.[clave] || clave,
        cantidad,
        porcentaje: pct(cantidad, total),
      }))
      .sort((a, b) => b.cantidad - a.cantidad);
  }, [presupuestos, cierra, situacionActual, etiquetas]);

  // Motivos de pérdida
  const porMotivo = useMemo(() => {
    const perdidos = presupuestos.filter((p) => p.estado === "perdido");
    const conteo = {};
    perdidos.forEach((p) => {
      const clave = p.motivo_perdida || "sin_motivo";
      conteo[clave] = (conteo[clave] || 0) + 1;
    });
    return Object.entries(conteo)
      .map(([clave, cantidad]) => ({
        clave,
        etiqueta: clave === "sin_motivo" ? "Sin motivo" : etiquetas.motivo_perdida?.[clave] || clave,
        cantidad,
        porcentaje: pct(cantidad, perdidos.length),
      }))
      .sort((a, b) => b.cantidad - a.cantidad);
  }, [presupuestos, etiquetas]);

  const alternarDetalle = (clave) => setDetalle((actual) => (actual === clave ? null : clave));

  // Importe que se muestra en el detalle de confirmados y de perdidos
  const importeFila = (p) =>
    detalle === "confirmados" ? formatearMonto(p.importe_confirmado ?? p.importe_original) : formatearMonto(p.importe_original);

  const motivoFila = (p) =>
    etiquetas.motivo_perdida?.[p.motivo_perdida] || p.motivo_perdida || "Sin motivo";

  if (cargando) return <div className="est-caja"><p className="est-vacio">Cargando estadísticas…</p></div>;

  return (
    <div className="est-caja">
      <div className="est-cabecera">
        <div>
          <div className="est-titulo">Estadísticas de presupuestos</div>
          <div className="est-subtitulo">Según el período elegido. Tocá Presupuestos, Confirmados o Perdidos para ver el detalle.</div>
        </div>
        <div className="est-periodos">
          {PERIODOS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriodo(p.key)}
              className={`est-periodo-btn${periodo === p.key ? " est-periodo-activo" : ""}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="est-error">{error}</p>}

      {/* Indicadores */}
      <div className="est-kpis">
        <Kpi etiqueta="Presupuestos" valor={resumen.total} onClick={() => alternarDetalle("presupuestos")} activo={detalle === "presupuestos"} />
        <Kpi etiqueta="Importe cotizado" valor={formatearMonto(resumen.importeTotal)} />
        <Kpi etiqueta="Confirmados" valor={resumen.confirmados} color="#15803d" onClick={() => alternarDetalle("confirmados")} activo={detalle === "confirmados"} />
        <Kpi etiqueta="Importe confirmado" valor={formatearMonto(resumen.importeConfirmado)} color="#15803d" />
        <Kpi etiqueta="Perdidos" valor={resumen.perdidos} color="#dc2626" onClick={() => alternarDetalle("perdidos")} activo={detalle === "perdidos"} />
        <Kpi etiqueta="Conversión" valor={`${String(resumen.conversion).replace(".", ",")}%`} sub={`sobre ${resumen.cerrados} cerrados`} />
      </div>

      {/* Lista de detalle */}
      {detalle && (
        <Bloque titulo={`${TITULOS_DETALLE[detalle]} · ${filasDetalle.length}`}>
          <div className="est-detalle-top">
            <span className="est-vacio">Tocá una fila para abrir el presupuesto.</span>
            <button className="btn btn-ghost est-boton-cerrar" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setDetalle(null)}>
              Cerrar lista
            </button>
          </div>

          {filasDetalle.length === 0 ? (
            <p className="est-vacio">No hay presupuestos en esta categoría para el período elegido.</p>
          ) : (
            <>
              {/* Tarjetas: celular */}
              <div className="est-cards">
                {filasDetalle.map((p) => (
                  <button key={p.id} type="button" className="est-card" onClick={() => onAbrirDetalle?.(p)}>
                    <div className="est-card-cabecera">
                      <div>
                        <div className="est-card-cliente">{limpiarCliente(p.cliente_nombre) || "—"}</div>
                        <div className="est-card-linea">
                          #{p.odoo_numero} · {fechaCorta(p.fecha_creacion_odoo)} · {p.responsable?.nombre || "—"}
                        </div>
                        <div className="est-card-linea">
                          {nombreEstado[p.estado] || p.estado}
                          {detalle === "perdidos" && ` · ${motivoFila(p)}`}
                        </div>
                      </div>
                      <span className="est-card-importe">{importeFila(p)}</span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Tabla: escritorio y tablet */}
              <div className="est-tabla-wrap est-tabla-detalle">
                <table className="est-tabla">
                  <thead>
                    <tr>
                      <th className="est-th">N°</th>
                      <th className="est-th">Cliente</th>
                      <th className="est-th">Responsable</th>
                      <th className="est-th">Creado</th>
                      <th className="est-th-n">Importe</th>
                      <th className="est-th">Estado</th>
                      {detalle === "confirmados" && <th className="est-th-n">Importe confirmado</th>}
                      {detalle === "perdidos" && <th className="est-th">Motivo de pérdida</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filasDetalle.map((p) => (
                      <tr
                        key={p.id}
                        className="est-fila-detalle"
                        onClick={() => onAbrirDetalle?.(p)}
                      >
                        <td className="est-td" style={{ fontWeight: 700, color: "var(--text-muted, #64748b)" }}>#{p.odoo_numero}</td>
                        <td className="est-td" style={{ fontWeight: 600 }}>{limpiarCliente(p.cliente_nombre) || "—"}</td>
                        <td className="est-td">{p.responsable?.nombre || "—"}</td>
                        <td className="est-td">{fechaCorta(p.fecha_creacion_odoo)}</td>
                        <td className="est-td-n">{formatearMonto(p.importe_original)}</td>
                        <td className="est-td">{nombreEstado[p.estado] || p.estado}</td>
                        {detalle === "confirmados" && (
                          <td className="est-td-n" style={{ color: "#15803d", fontWeight: 700 }}>
                            {importeFila(p)}
                          </td>
                        )}
                        {detalle === "perdidos" && <td className="est-td">{motivoFila(p)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Bloque>
      )}

      {/* Por estado */}
      <Bloque titulo="Por estado">
        {porEstado.map((f) => (
          <Barra key={f.clave} etiqueta={f.etiqueta} cantidad={f.cantidad} ancho={f.ancho} detalle={formatearMonto(f.importe)} />
        ))}
      </Bloque>

      {/* Por vendedor */}
      <Bloque titulo="Por vendedor">
        {porVendedor.length === 0 ? (
          <p className="est-vacio">Sin datos en este período.</p>
        ) : (
          <div className="est-tabla-wrap">
            <table className="est-tabla">
              <thead>
                <tr>
                  <th className="est-th">Vendedor</th>
                  <th className="est-th-n">Presup.</th>
                  <th className="est-th-n">Confirm.</th>
                  <th className="est-th-n">Perdidos</th>
                  <th className="est-th-n">Conversión</th>
                  <th className="est-th-n">Gestiones</th>
                  <th className="est-th-n">Contacto efectivo</th>
                  <th className="est-th-n">Importe confirmado</th>
                </tr>
              </thead>
              <tbody>
                {porVendedor.map((v) => (
                  <tr key={v.id}>
                    <td className="est-td"><strong>{v.nombre}</strong></td>
                    <td className="est-td-n">{v.presupuestos}</td>
                    <td className="est-td-n" style={{ color: "#15803d", fontWeight: 700 }}>{v.confirmados}</td>
                    <td className="est-td-n" style={{ color: "#dc2626" }}>{v.perdidos}</td>
                    <td className="est-td-n">{pctTexto(v.confirmados, v.cerrados)}</td>
                    <td className="est-td-n">{v.gestiones}</td>
                    <td className="est-td-n">{pctTexto(v.efectivas, v.gestiones)}</td>
                    <td className="est-td-n">{formatearMonto(v.importeConfirmado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Bloque>

      <div className="est-dos">
        {/* Medios */}
        <Bloque titulo="Medios de contacto">
          {porMedio.length === 0 ? (
            <p className="est-vacio">Sin contactos en este período.</p>
          ) : (
            porMedio.map((f) => (
              <Barra key={f.clave} etiqueta={f.etiqueta} cantidad={f.cantidad} ancho={f.ancho} detalle={`${pctTexto(f.efectivas, f.cantidad)} efectivo`} />
            ))
          )}
        </Bloque>

        {/* Resultados */}
        <Bloque titulo="Resultados de contacto">
          {porResultado.length === 0 ? (
            <p className="est-vacio">Sin contactos en este período.</p>
          ) : (
            porResultado.map((f) => (
              <Barra key={f.clave} etiqueta={f.etiqueta} cantidad={f.cantidad} ancho={f.ancho} detalle={pctTexto(f.cantidad, gestionesPeriodo.length) + " del total"} />
            ))
          )}
        </Bloque>
      </div>

      <div className="est-dos">
        {/* Situación actual */}
        <Bloque titulo="Situación actual (abiertos)">
          {porSituacion.length === 0 ? (
            <p className="est-vacio">No hay presupuestos abiertos en este período.</p>
          ) : (
            porSituacion.map((f) => (
              <Barra key={f.clave} etiqueta={f.etiqueta} cantidad={f.cantidad} ancho={pct(f.cantidad, porSituacion[0].cantidad)} detalle={`${String(f.porcentaje).replace(".", ",")}%`} />
            ))
          )}
        </Bloque>

        {/* Motivos de pérdida */}
        <Bloque titulo="Motivos de pérdida">
          {porMotivo.length === 0 ? (
            <p className="est-vacio">No hay presupuestos perdidos en este período.</p>
          ) : (
            porMotivo.map((f) => (
              <Barra key={f.clave} etiqueta={f.etiqueta} cantidad={f.cantidad} ancho={pct(f.cantidad, porMotivo[0].cantidad)} detalle={`${String(f.porcentaje).replace(".", ",")}%`} />
            ))
          )}
        </Bloque>
      </div>
    </div>
  );
}

function agrupar(lista, campo, etiquetas = {}) {
  const conteo = {};
  lista.forEach((g) => {
    const clave = g[campo] || "sin_dato";
    if (!conteo[clave]) conteo[clave] = { clave, cantidad: 0, efectivas: 0 };
    conteo[clave].cantidad += 1;
    if (g.efectivo) conteo[clave].efectivas += 1;
  });
  const filas = Object.values(conteo).map((f) => ({
    ...f,
    etiqueta: f.clave === "sin_dato" ? "Sin dato" : etiquetas[f.clave] || f.clave,
  }));
  const maximo = Math.max(1, ...filas.map((f) => f.cantidad));
  return filas
    .map((f) => ({ ...f, ancho: (f.cantidad / maximo) * 100 }))
    .sort((a, b) => b.cantidad - a.cantidad);
}

function Kpi({ etiqueta, valor, color, sub, onClick, activo }) {
  const clicable = Boolean(onClick);
  const clases = ["est-kpi"];
  if (clicable) clases.push("est-kpi-boton");
  if (activo) clases.push("est-kpi-activo");
  return (
    <button type="button" onClick={onClick} disabled={!clicable} className={clases.join(" ")}>
      <span className="est-kpi-etiqueta">{etiqueta}</span>
      <strong className="est-kpi-valor" style={{ color: color || "var(--text, #0f172a)" }}>{valor}</strong>
      {sub && <span className="est-kpi-sub">{sub}</span>}
    </button>
  );
}

function Bloque({ titulo, children }) {
  return (
    <section className="est-bloque">
      <h3 className="est-bloque-titulo">{titulo}</h3>
      {children}
    </section>
  );
}

function Barra({ etiqueta, cantidad, ancho, detalle }) {
  return (
    <div className="est-barra-fila">
      <div className="est-barra-top">
        <span className="est-barra-etiqueta">{etiqueta}</span>
        <span className="est-barra-numeros">
          <strong>{cantidad}</strong>
          {detalle && <span className="est-barra-detalle"> · {detalle}</span>}
        </span>
      </div>
      <div className="est-barra-fondo">
        <div className="est-barra-relleno" style={{ width: `${Math.max(ancho, 1)}%` }} />
      </div>
    </div>
  );
}
