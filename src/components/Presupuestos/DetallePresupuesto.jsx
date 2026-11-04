import { useEffect, useState } from "react";
import { X, Phone, Mail, Plus, Ban, RotateCcw, CalendarClock, Check, XCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import {
  CONFIG_DEFAULT,
  colorEstado,
  formatearMonto,
  fechaCorta,
  COLOR_ANTIGUEDAD,
  claseAntiguedad,
  COLOR_TONO,
  estadoProximo,
  textoHace,
  evaluarPresupuesto,
  tonoDias,
  aIsoOpcional,
  aValorLocal,
} from "../../utils/presupuestos";
import FormularioSeguimiento from "./FormularioSeguimiento";
import FormularioCierre from "./FormularioCierre";

export default function DetallePresupuesto({
  seguimiento,
  catalogos,
  estados,
  config = CONFIG_DEFAULT,
  onClose,
  onCambio,
}) {
  const { esEncargadoVentas } = useAuth();
  const [items, setItems] = useState([]);
  const [cargandoItems, setCargandoItems] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [mostrarSeguimiento, setMostrarSeguimiento] = useState(false);
  const [cierreTipo, setCierreTipo] = useState(null);
  const [nuevoEstado, setNuevoEstado] = useState("");
  const [comentario, setComentario] = useState(seguimiento.comentario_odoo || "");
  const [proximoLocal, setProximoLocal] = useState(
    aValorLocal(seguimiento.proximo_seguimiento_at),
  );
  const [anulando, setAnulando] = useState(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");

  const cerrado = !!seguimiento.fecha_cierre;
  const estadoColor = colorEstado(seguimiento.estado);
  const ev = evaluarPresupuesto(seguimiento, config);
  const antig = COLOR_ANTIGUEDAD[claseAntiguedad(ev.dias, config)];
  const tonoContacto = COLOR_TONO[
    tonoDias(ev.diasSinContacto, config.dias_sin_contacto_aviso, config.dias_sin_contacto_critico)
  ];
  const proximo = estadoProximo(seguimiento.proximo_seguimiento_at);
  const proximoColor = COLOR_TONO[proximo.tono];
  const estadosDisponibles = estados.filter(
    (e) => !e.cierra && e.clave !== seguimiento.estado,
  );
  const comentarioCambio = (comentario.trim() || "") !== (seguimiento.comentario_odoo || "");
  const proximoCambio = proximoLocal !== aValorLocal(seguimiento.proximo_seguimiento_at);

  // Si la lista se refresca, tomo los datos guardados
  useEffect(() => {
    setComentario(seguimiento.comentario_odoo || "");
  }, [seguimiento.comentario_odoo]);

  useEffect(() => {
    setProximoLocal(aValorLocal(seguimiento.proximo_seguimiento_at));
  }, [seguimiento.proximo_seguimiento_at]);

  function nombreEstado(clave) {
    return estados.find((e) => e.clave === clave)?.etiqueta || clave;
  }

  function etiqueta(tipo, clave) {
    return catalogos[tipo]?.find((x) => x.clave === clave)?.etiqueta || clave;
  }

  async function cargarItems() {
    setCargandoItems(true);
    const [resGestiones, resEventos] = await Promise.all([
      supabase
        .from("presupuesto_gestiones")
        .select(
          "id, ocurrio_at, medio, resultado, efectivo, persona_contactada, situacion, observaciones, proximo_seguimiento_at, anulada, anulada_at, anulada_motivo, usuario:usuarios!usuario_id(nombre), anulador:usuarios!anulada_por(nombre)",
        )
        .eq("seguimiento_id", seguimiento.id),
      supabase
        .from("presupuesto_eventos")
        .select("id, tipo, ocurrio_at, detalle, usuario:usuarios!usuario_id(nombre)")
        .eq("seguimiento_id", seguimiento.id)
        .in("tipo", ["cambio_estado", "confirmacion", "perdida", "cierre", "reapertura", "programacion"]),
    ]);

    const gestiones = (resGestiones.data || []).map((g) => ({
      ...g,
      _tipo: "gestion",
      _fecha: g.ocurrio_at,
    }));
    const eventos = (resEventos.data || []).map((e) => ({
      ...e,
      _tipo: "evento",
      _fecha: e.ocurrio_at,
    }));
    setItems(
      [...gestiones, ...eventos].sort((a, b) => new Date(b._fecha) - new Date(a._fecha)),
    );
    setCargandoItems(false);
  }

  useEffect(() => {
    cargarItems();
  }, [seguimiento.id]);

  // Ejecuta una acción en la base y, si sale bien, refresca todo
  async function ejecutar(nombreRpc, parametros) {
    setOcupado(true);
    setError("");
    const { error: errorRpc } = await supabase.rpc(nombreRpc, parametros);
    setOcupado(false);
    if (errorRpc) {
      setError(errorRpc.message || "No se pudo completar la acción.");
      return false;
    }
    await cargarItems();
    onCambio?.();
    return true;
  }

  async function cambiarEstado() {
    if (!nuevoEstado) return;
    const ok = await ejecutar("cambiar_estado_presupuesto", {
      p_seguimiento_id: seguimiento.id,
      p_estado: nuevoEstado,
    });
    if (ok) setNuevoEstado("");
  }

  async function programar(fecha) {
    await ejecutar("programar_seguimiento_presupuesto", {
      p_seguimiento_id: seguimiento.id,
      p_fecha: fecha,
    });
  }

  async function guardarProximo() {
    if (!proximoLocal) return;
    await programar(aIsoOpcional(proximoLocal));
  }

  async function quitarProximo() {
    setProximoLocal("");
    await programar(null);
  }

  async function reabrir() {
    await ejecutar("reabrir_presupuesto", {
      p_seguimiento_id: seguimiento.id,
      p_estado: "en_seguimiento",
    });
  }

  async function guardarComentario() {
    setOcupado(true);
    setError("");
    const { data, error: errorUpdate } = await supabase
      .from("presupuesto_seguimientos")
      .update({ comentario_odoo: comentario.trim() || null })
      .eq("id", seguimiento.id)
      .select("id");
    setOcupado(false);
    if (errorUpdate || !data?.length) {
      setError("No se pudo guardar el comentario.");
      return;
    }
    onCambio?.();
  }

  async function confirmarAnulacion() {
    const ok = await ejecutar("anular_gestion_presupuesto", {
      p_gestion_id: anulando.id,
      p_motivo: motivoAnulacion.trim(),
    });
    if (ok) {
      setAnulando(null);
      setMotivoAnulacion("");
    }
  }

  function textoEvento(e) {
    const d = e.detalle || {};
    switch (e.tipo) {
      case "cambio_estado":
        return `Estado: ${nombreEstado(d.desde)} → ${nombreEstado(d.hacia)}`;
      case "confirmacion":
        return `Confirmado · OC ${d.referencia_oc || "—"}`;
      case "perdida":
        return `Perdido · ${etiqueta("motivo_perdida", d.motivo)}`;
      case "cierre":
        return "Cerrado sin resultado";
      case "reapertura":
        return `Reabierto · ${nombreEstado(d.estado)}`;
      case "programacion":
        return d.fecha
          ? `Próximo seguimiento programado: ${fechaCorta(d.fecha)}`
          : "Próximo seguimiento quitado";
      default:
        return e.tipo;
    }
  }

  return (
    <div style={styles.fondo} onClick={onClose}>
      <div style={styles.caja} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={{ minWidth: 0 }}>
            <div style={styles.numeroFila}>
              <strong style={styles.numero}>#{seguimiento.odoo_numero}</strong>
              <span
                style={{
                  ...styles.estadoGrande,
                  color: estadoColor.color,
                  background: estadoColor.fondo,
                  borderColor: estadoColor.color,
                }}
              >
                <span style={{ ...styles.punto, background: estadoColor.color }} />
                {nombreEstado(seguimiento.estado)}
              </span>
              {seguimiento.ciclo > 1 && <span style={styles.ciclo}>Ciclo {seguimiento.ciclo}</span>}
              {ev.importeAlto && <span style={styles.ciclo}>🔥 Importe alto</span>}
            </div>
            <h2 style={styles.cliente}>{seguimiento.cliente_nombre}</h2>
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div style={styles.datos}>
          <Dato etiqueta="Importe" valor={formatearMonto(seguimiento.importe_original, 2)} />
          <Dato etiqueta="Creado en Odoo" valor={fechaCorta(seguimiento.fecha_creacion_odoo)} />
          <Dato etiqueta="Vendedor en Odoo" valor={seguimiento.vendedor_odoo || "—"} />
          <Dato etiqueta="Responsable" valor={seguimiento.responsable?.nombre || "—"} />
          <Dato
            etiqueta="Teléfono"
            valor={seguimiento.contacto_telefono || "Sin teléfono"}
            icono={<Phone size={13} />}
          />
          <Dato
            etiqueta="Email"
            valor={seguimiento.contacto_email || "Sin email"}
            icono={<Mail size={13} />}
          />
        </div>

        <div style={styles.bloque}>
          <span style={styles.etiqueta}>Comentario</span>
          <textarea
            className="input"
            rows={3}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Sin comentario"
          />
          {comentarioCambio && (
            <div>
              <button className="btn btn-primary" onClick={guardarComentario} disabled={ocupado}>
                Guardar comentario
              </button>
            </div>
          )}
        </div>

        <div style={styles.contadores}>
          <Contador etiqueta="Antigüedad" valor={`${ev.dias} d`} estilo={antig} />
          <Contador
            etiqueta="Días sin contacto efectivo"
            valor={
              seguimiento.ultimo_contacto_efectivo_at
                ? `${ev.diasSinContacto} d`
                : `Sin contacto · ${ev.diasSinContacto} d`
            }
            estilo={tonoContacto}
          />
          <Contador etiqueta="Último intento" valor={textoHace(seguimiento.ultimo_intento_at)} />
          <Contador etiqueta="Próximo seguimiento" valor={proximo.texto} estilo={proximoColor} />
        </div>

        {!cerrado && (
          <div style={styles.bloque}>
            <span style={styles.etiqueta}>Programar próximo seguimiento</span>
            <div style={styles.filaProximo}>
              <input
                className="input"
                type="datetime-local"
                value={proximoLocal}
                onChange={(e) => setProximoLocal(e.target.value)}
                style={{ flex: "1 1 220px", minWidth: 0 }}
              />
              {proximoCambio && (
                <button
                  className="btn btn-primary"
                  onClick={guardarProximo}
                  disabled={ocupado || !proximoLocal}
                >
                  <CalendarClock size={15} /> Guardar fecha
                </button>
              )}
              {seguimiento.proximo_seguimiento_at && !proximoCambio && (
                <button className="btn btn-ghost" onClick={quitarProximo} disabled={ocupado}>
                  Quitar
                </button>
              )}
            </div>
          </div>
        )}

        <div style={styles.acciones}>
          {!cerrado && (
            <>
              <div style={styles.estadoFila}>
                <select
                  className="input"
                  value={nuevoEstado}
                  onChange={(e) => setNuevoEstado(e.target.value)}
                  style={{ flex: 1, minWidth: 180 }}
                >
                  <option value="">Cambiar estado…</option>
                  {estadosDisponibles.map((e) => (
                    <option key={e.clave} value={e.clave}>
                      {e.etiqueta}
                    </option>
                  ))}
                </select>
                <button className="btn btn-ghost" onClick={cambiarEstado} disabled={!nuevoEstado || ocupado}>
                  Aplicar
                </button>
              </div>
              <button className="btn btn-primary" onClick={() => setMostrarSeguimiento(true)}>
                <Plus size={16} /> Registrar seguimiento
              </button>
              <button style={styles.btnVerde} onClick={() => setCierreTipo("confirmado")}>
                <Check size={15} /> Confirmar
              </button>
              <button style={styles.btnRojo} onClick={() => setCierreTipo("perdido")}>
                <XCircle size={15} /> Perder
              </button>
              <button style={styles.btnNeutro} onClick={() => setCierreTipo("sin_resultado")}>
                Cerrar sin resultado
              </button>
            </>
          )}
          {cerrado && (
            <>
              <p style={styles.aviso}>Presupuesto cerrado el {fechaCorta(seguimiento.fecha_cierre)}.</p>
              <button style={styles.btnAmbar} onClick={reabrir} disabled={ocupado}>
                <RotateCcw size={15} /> Reabrir presupuesto
              </button>
            </>
          )}
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <h3 style={styles.seccion}>Línea de tiempo</h3>

        {anulando && (
          <div style={styles.panelAnular}>
            <strong style={{ fontSize: 14 }}>
              Anular gestión de {fechaCorta(anulando.ocurrio_at)}
            </strong>
            <textarea
              className="input"
              rows={2}
              value={motivoAnulacion}
              onChange={(e) => setMotivoAnulacion(e.target.value)}
              placeholder="Motivo de la anulación (obligatorio)"
            />
            <div style={styles.filaFinal}>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setAnulando(null);
                  setMotivoAnulacion("");
                }}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={confirmarAnulacion}
                disabled={ocupado || !motivoAnulacion.trim()}
              >
                Anular gestión
              </button>
            </div>
          </div>
        )}

        {cargandoItems ? (
          <p style={styles.aviso}>Cargando...</p>
        ) : items.length === 0 ? (
          <p style={styles.aviso}>Todavía no hay movimientos.</p>
        ) : (
          <ol style={styles.timeline}>
            {items.map((it) =>
              it._tipo === "gestion" ? (
                <li key={`g-${it.id}`} style={{ ...styles.item, opacity: it.anulada ? 0.6 : 1 }}>
                  <div style={styles.itemCabecera}>
                    <span style={styles.itemFecha}>{fechaCorta(it.ocurrio_at)}</span>
                    <span style={styles.itemUsuario}>{it.usuario?.nombre || "—"}</span>
                  </div>
                  <div
                    style={{
                      ...styles.itemTitulo,
                      textDecoration: it.anulada ? "line-through" : "none",
                    }}
                  >
                    {etiqueta("medio", it.medio)} · {etiqueta("resultado", it.resultado)}
                    {it.efectivo && <span style={styles.efectivo}>Efectivo</span>}
                    {it.anulada && <span style={styles.anulada}>Anulada</span>}
                  </div>
                  {it.situacion && <div style={styles.itemDetalle}>{etiqueta("situacion", it.situacion)}</div>}
                  {it.persona_contactada && (
                    <div style={styles.itemDetalle}>Persona: {it.persona_contactada}</div>
                  )}
                  {it.observaciones && <div style={styles.itemNota}>{it.observaciones}</div>}
                  {it.proximo_seguimiento_at && (
                    <div style={styles.itemDetalle}>Próximo: {fechaCorta(it.proximo_seguimiento_at)}</div>
                  )}
                  {it.anulada && (
                    <div style={styles.itemDetalle}>
                      Anulada por {it.anulador?.nombre || "—"}: {it.anulada_motivo}
                    </div>
                  )}
                  {esEncargadoVentas && !it.anulada && (
                    <div>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={() => setAnulando(it)}
                      >
                        <Ban size={13} /> Anular
                      </button>
                    </div>
                  )}
                </li>
              ) : (
                <li key={`e-${it.id}`} style={styles.itemEvento}>
                  <div style={styles.itemCabecera}>
                    <span style={styles.itemFecha}>{fechaCorta(it.ocurrio_at)}</span>
                    <span style={styles.itemUsuario}>{it.usuario?.nombre || "—"}</span>
                  </div>
                  <div style={styles.itemTitulo}>{textoEvento(it)}</div>
                </li>
              ),
            )}
          </ol>
        )}

        <p style={styles.pie}>Cargado en el sistema: {fechaCorta(seguimiento.created_at)}</p>
      </div>

      {mostrarSeguimiento && (
        <FormularioSeguimiento
          seguimiento={seguimiento}
          estadoEtiqueta={nombreEstado(seguimiento.estado)}
          estadoColor={estadoColor}
          medios={catalogos.medio || []}
          resultados={catalogos.resultado || []}
          situaciones={catalogos.situacion || []}
          onClose={() => setMostrarSeguimiento(false)}
          onSuccess={() => {
            cargarItems();
            onCambio?.();
          }}
        />
      )}

      {cierreTipo && (
        <FormularioCierre
          seguimiento={seguimiento}
          tipo={cierreTipo}
          motivos={catalogos.motivo_perdida || []}
          onClose={() => setCierreTipo(null)}
          onSuccess={() => {
            cargarItems();
            onCambio?.();
          }}
        />
      )}
    </div>
  );
}

function Dato({ etiqueta, valor, icono }) {
  return (
    <div style={styles.dato}>
      <span style={styles.etiqueta}>{etiqueta}</span>
      <span style={styles.datoValor}>
        {icono}
        {valor}
      </span>
    </div>
  );
}

function Contador({ etiqueta, valor, estilo }) {
  return (
    <div
      style={{
        ...styles.contador,
        ...(estilo ? { background: estilo.fondo } : {}),
      }}
    >
      <span style={styles.etiqueta}>{etiqueta}</span>
      <strong style={{ color: estilo?.color || "inherit", fontSize: 14 }}>{valor}</strong>
    </div>
  );
}

const styles = {
  fondo: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 1000,
  },
  caja: {
    background: "var(--surface, #fff)",
    color: "var(--text, #0f172a)",
    borderRadius: 14,
    width: "100%",
    maxWidth: 800,
    maxHeight: "92vh",
    overflowY: "auto",
    padding: 22,
    boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  numeroFila: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  numero: { fontSize: 14 },
  cliente: { margin: "6px 0 0", fontSize: 19, fontWeight: 700 },
  pildora: {
    display: "inline-block",
    padding: "3px 9px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  ciclo: {
    fontSize: 12,
    padding: "3px 9px",
    borderRadius: 999,
    border: "1px solid var(--border, #cbd5e1)",
  },
  datos: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 12,
    padding: "12px 0",
    borderTop: "1px solid var(--border, #e2e8f0)",
    borderBottom: "1px solid var(--border, #e2e8f0)",
  },
  dato: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
  etiqueta: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--text-secondary, #64748b)",
  },
  datoValor: {
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    gap: 5,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  bloque: { marginTop: 14, display: "flex", flexDirection: "column", gap: 6 },
  filaProximo: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  contadores: {
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
  },
  contador: {
    border: "1px solid var(--border, #e2e8f0)",
    borderRadius: 10,
    padding: "9px 11px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  acciones: { marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  estadoFila: { display: "flex", gap: 8, flex: "1 1 100%", flexWrap: "wrap" },
  aviso: { fontSize: 13, color: "var(--text-secondary, #64748b)", margin: 0 },
  error: { color: "var(--danger, #b91c1c)", fontSize: 13, marginTop: 10 },
  seccion: { margin: "20px 0 8px", fontSize: 15, fontWeight: 700 },
  panelAnular: {
    border: "1px solid var(--border, #e2e8f0)",
    borderRadius: 10,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 12,
  },
  filaFinal: { display: "flex", justifyContent: "flex-end", gap: 8 },
  timeline: { listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 },
  item: {
    borderLeft: "3px solid var(--primary, #1d4ed8)",
    paddingLeft: 12,
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  itemEvento: {
    borderLeft: "3px solid var(--border, #94a3b8)",
    paddingLeft: 12,
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  itemCabecera: { display: "flex", gap: 10, fontSize: 12, flexWrap: "wrap" },
  itemFecha: { color: "var(--text-secondary, #64748b)" },
  itemUsuario: { fontWeight: 600 },
  itemTitulo: { fontSize: 14, fontWeight: 600, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  efectivo: {
    fontSize: 11,
    padding: "1px 7px",
    borderRadius: 999,
    background: "#dcfce7",
    color: "#15803d",
    fontWeight: 700,
  },
  anulada: {
    fontSize: 11,
    padding: "1px 7px",
    borderRadius: 999,
    background: "#fee2e2",
    color: "#b91c1c",
    fontWeight: 700,
  },
  itemDetalle: { fontSize: 13, color: "var(--text-secondary, #475569)" },
  itemNota: {
    fontSize: 13,
    padding: "7px 10px",
    borderRadius: 8,
    background: "var(--bg, #f8fafc)",
    whiteSpace: "pre-wrap",
  },
  pie: { marginTop: 18, fontSize: 12, color: "var(--text-secondary, #64748b)" },
  estadoGrande: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 14px",
    borderRadius: 999,
    fontSize: 15,
    fontWeight: 700,
    border: "1.5px solid",
    whiteSpace: "nowrap",
  },
  punto: { width: 9, height: 9, borderRadius: 999, display: "inline-block" },
  btnVerde: colorBoton("#15803d"),
  btnRojo: colorBoton("#dc2626"),
  btnAmbar: colorBoton("#d97706"),
  btnNeutro: colorBoton("#475569"),
};

function colorBoton(color) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "9px 16px",
    borderRadius: 8,
    border: "none",
    background: color,
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  };
}
