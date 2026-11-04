import { useState, useEffect } from "react";
import { X, Clock, PackageCheck, XCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { ESTADOS } from "../../utils/constants";
import { formatearFechaHora, formatearMonto } from "../../utils/helpers";
import { obtenerPedidoDeOdoo } from "../../lib/odoo";
import { horariosDisponibles, formatearHoraDesde } from "../../utils/horarios";
import PrepararEntrega from "./PrepararEntrega";
import ResumenPreparacion from "./ResumenPreparacion";

// Estados que Ventas puede poner (solo sobre pedidos propios; el encargado, sobre cualquiera)
const ESTADOS_VENTAS = [
  "en_espera",
  "en_camino",
  "viene_hoy",
  "retira_manana",
  "retira_otro_dia",
];

export default function DetallePedido({
  pedido: pedidoInicial,
  cliente,
  vendedor,
  onClose,
  onActualizado,
  onEntregado,
}) {
  const { perfil, puedeGestionarPedidos, esVendedor, esEncargadoVentas } =
    useAuth();
  const [pedido, setPedido] = useState(pedidoInicial);
  const [historial, setHistorial] = useState([]);
  const [articulos, setArticulos] = useState([]);
  const [loadingHist, setLoadingHist] = useState(true);
  const [loadingEstado, setLoadingEstado] = useState(false);
  const [confirmEntrega, setConfirmEntrega] = useState(false);
  const [entregando, setEntregando] = useState(false);
  const [confirmCancelar, setConfirmCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState("");
  const [cambiandoHora, setCambiandoHora] = useState(false);
  const [cambiandoPago, setCambiandoPago] = useState(false);
  const [preparando, setPreparando] = useState(false);

  // Permisos de Ventas: cada vendedor solo sobre lo que cargó; el encargado, sobre todo.
  const esDueno = pedido.vendedor_id === perfil.id;
  const ventasPuedeTocar = esVendedor && (esDueno || esEncargadoVentas);
  const puedeEditarEstado =
    puedeGestionarPedidos ||
    (ventasPuedeTocar && ESTADOS_VENTAS.includes(pedido.estado));
  const puedeEditarPago = ventasPuedeTocar || esEncargadoVentas;

  useEffect(() => {
    cargarHistorial();
    cargarArticulos();
  }, [pedido.id]);

  const cargarHistorial = async () => {
    setLoadingHist(true);
    const { data } = await supabase
      .from("historial_pedidos")
      .select("*, usuario:usuarios(nombre)")
      .eq("pedido_id", pedido.id)
      .order("created_at", { ascending: true });
    setHistorial(data || []);
    setLoadingHist(false);
  };

  const cargarArticulos = async () => {
    const { data } = await supabase
      .from("pedido_articulos")
      .select("*")
      .eq("pedido_id", pedido.id);
    setArticulos(data || []);
  };

  const cambiarEstado = async (nuevoEstado) => {
    if (loadingEstado) return;
    // Pasar a "listo para entregar" pide ubicación y bultos antes
    if (nuevoEstado === "listo_para_entregar") {
      setPreparando(true);
      return;
    }
    setLoadingEstado(true);
    setError("");
    const anterior = pedido.estado;
    try {
      const { error: err } = await supabase
        .from("pedidos")
        .update({ estado: nuevoEstado, hora_desde: null })
        .eq("id", pedido.id);
      if (err) throw err;
      await supabase.from("historial_pedidos").insert({
        pedido_id: pedido.id,
        usuario_id: perfil.id,
        estado_anterior: anterior,
        estado_nuevo: nuevoEstado,
        descripcion: `${perfil.nombre} cambió estado: "${ESTADOS[anterior]?.label}" → "${ESTADOS[nuevoEstado]?.label}"`,
      });
      setPedido((p) => ({ ...p, estado: nuevoEstado, hora_desde: null }));
      cargarHistorial();
      onActualizado?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingEstado(false);
    }
  };
  const cambiarPago = async (nuevoPago) => {
    if (cambiandoPago || nuevoPago === pedido.pago) return;
    setCambiandoPago(true);
    setError("");
    const etiqueta = (v) => (v === "paga_ahora" ? "Paga ahora" : "Solo retira");
    try {
      const { error: err } = await supabase
        .from("pedidos")
        .update({ pago: nuevoPago })
        .eq("id", pedido.id);
      if (err) throw err;
      await supabase.from("historial_pedidos").insert({
        pedido_id: pedido.id,
        usuario_id: perfil.id,
        estado_anterior: pedido.estado,
        estado_nuevo: pedido.estado,
        descripcion: `${perfil.nombre} cambió el pago: ${etiqueta(pedido.pago)} → ${etiqueta(nuevoPago)}`,
      });
      setPedido((p) => ({ ...p, pago: nuevoPago }));
      cargarHistorial();
      onActualizado?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setCambiandoPago(false);
    }
  };

  const cambiarHorario = async (nuevaHora) => {
    if (cambiandoHora) return;
    setCambiandoHora(true);
    setError("");
    const anterior = pedido.hora_desde;
    try {
      const { error: err } = await supabase
        .from("pedidos")
        .update({ hora_desde: nuevaHora })
        .eq("id", pedido.id);
      if (err) throw err;
      await supabase.from("historial_pedidos").insert({
        pedido_id: pedido.id,
        usuario_id: perfil.id,
        estado_anterior: pedido.estado,
        estado_nuevo: pedido.estado,
        descripcion: `${perfil.nombre} cambió el horario: ${anterior ? formatearHoraDesde(anterior) : "sin horario"} → ${nuevaHora || "sin horario"}`,
      });
      setPedido((p) => ({ ...p, hora_desde: nuevaHora }));
      cargarHistorial();
      onActualizado?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setCambiandoHora(false);
    }
  };

  const marcarEntregado = async () => {
    setEntregando(true);
    setError("");
    try {
      const datosOdoo = await obtenerPedidoDeOdoo(pedido.numero_pedido);
      if (!datosOdoo || datosOdoo.monto == null) {
        setError("No se pudo consultar el monto en Odoo, intentá de nuevo.");
        setEntregando(false);
        return;
      }
      const { monto, articulos: arts } = datosOdoo;
      const ahora = new Date().toISOString();

      const { error: errUpd } = await supabase
        .from("pedidos")
        .update({
          estado: "entregado",
          entregado_at: ahora,
          activo: false,
          monto,
        })
        .eq("id", pedido.id);
      if (errUpd) throw errUpd;

      // Vendedor que cargó el pedido en Odoo, guardado aparte del vendedor de la app.
      // Si falla, la entrega igual queda registrada.
      try {
        const { data: vend } = await supabase.functions.invoke("obtener-vendedor-odoo", {
          body: { numeros: [pedido.numero_pedido] },
        });
        const nombreOdoo = vend?.vendedores?.[pedido.numero_pedido];
        if (nombreOdoo) {
          await supabase
            .from("pedidos")
            .update({ vendedor_odoo: nombreOdoo })
            .eq("id", pedido.id);
        }
      } catch (e) {
        console.error("No se pudo traer el vendedor de Odoo:", e);
      }

      if (arts?.length) {
        await supabase
          .from("pedido_articulos")
          .insert(arts.map((a) => ({ pedido_id: pedido.id, ...a })));
      }

      await supabase.from("historial_pedidos").insert({
        pedido_id: pedido.id,
        usuario_id: perfil.id,
        estado_anterior: pedido.estado,
        estado_nuevo: "entregado",
        descripcion: `${perfil.nombre} marcó el pedido como ENTREGADO — monto ${formatearMonto(monto)}`,
      });

      onEntregado?.();
      onClose();
    } catch (err) {
      setError(err.message);
      setEntregando(false);
    }
  };

  const cancelarPedido = async () => {
    setCancelando(true);
    setError("");
    try {
      const anterior = pedido.estado;
      const { error: errUpd } = await supabase
        .from("pedidos")
        .update({
          estado: "cancelado",
          activo: false,
        })
        .eq("id", pedido.id);
      if (errUpd) throw errUpd;

      await supabase.from("historial_pedidos").insert({
        pedido_id: pedido.id,
        usuario_id: perfil.id,
        estado_anterior: anterior,
        estado_nuevo: "cancelado",
        descripcion: `${perfil.nombre} canceló el pedido`,
      });

      onActualizado?.();
      onClose();
    } catch (err) {
      setError(err.message);
      setCancelando(false);
    }
  };

  const estadoActual = ESTADOS[pedido.estado] || ESTADOS.viene_hoy;
  const estadosBotones = (
    puedeGestionarPedidos
      ? Object.keys(ESTADOS).filter((k) => k !== "entregado")
      : ESTADOS_VENTAS
  ).filter((k) => k !== pedido.estado);
  const horarios = horariosDisponibles(pedido.estado);
  const pedidoFinalizado =
    pedido.estado === "entregado" || pedido.estado === "cancelado";

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {preparando && (
        <PrepararEntrega
          pedido={pedido}
          onCancelar={() => setPreparando(false)}
          onGuardado={(ubic) => {
            setPreparando(false);
            setPedido((p) => ({
              ...p,
              estado: "listo_para_entregar",
              hora_desde: null,
              ubicacion_retiro: ubic,
            }));
            cargarHistorial();
            onActualizado?.();
          }}
        />
      )}
      <div className="modal" style={{ maxWidth: 720 }}>
        <div
          className="modal-header"
          style={{
            borderLeft: `4px solid ${estadoActual.color}`,
            paddingLeft: 18,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                marginBottom: 3,
              }}
            >
              Pedido #{pedido.numero_pedido}
            </div>
            <span
              className="badge"
              style={{ background: estadoActual.bg, color: estadoActual.color }}
            >
              {estadoActual.icono} {estadoActual.label}
            </span>
            {pedido.hora_desde && (
              <span
                className="badge"
                style={{
                  marginLeft: 6,
                  background: "var(--surface-container)",
                  color: "var(--text-secondary)",
                }}
              >
                🕓 Desde las {formatearHoraDesde(pedido.hora_desde)}
              </span>
            )}
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div
          className="modal-body"
          style={{ maxHeight: "70vh", overflowY: "auto" }}
        >
          {/* Cliente ocupa todo el ancho arriba */}
          <div style={{ marginBottom: 14 }}>
            <Info label="Cliente" value={pedido.cliente_nombre || "—"} grande />
          </div>

          {/* Resto de datos en 2 columnas */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
              marginBottom: 20,
            }}
          >
            <Info label="Vendedor" value={vendedor?.nombre || "—"} />
            {puedeEditarPago && !pedidoFinalizado ? (
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--text-muted)",
                    marginBottom: 5,
                  }}
                >
                  Pago
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[
                    { v: "solo_retira", l: "🔖 Solo retira" },
                    { v: "paga_ahora", l: "💵 Paga ahora" },
                  ].map((op) => {
                    const activo = pedido.pago === op.v;
                    return (
                      <button
                        key={op.v}
                        onClick={() => cambiarPago(op.v)}
                        disabled={cambiandoPago}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 7,
                          fontSize: 12,
                          fontWeight: activo ? 700 : 500,
                          border: `1px solid ${activo ? "var(--primary)" : "var(--border)"}`,
                          background: activo
                            ? "var(--primary-subtle)"
                            : "transparent",
                          color: activo
                            ? "var(--primary)"
                            : "var(--text-secondary)",
                          cursor: activo ? "default" : "pointer",
                        }}
                      >
                        {op.l}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <Info
                label="Pago"
                value={
                  pedido.pago === "paga_ahora"
                    ? "💵 Paga ahora"
                    : "🔖 Solo retira"
                }
              />
            )}
            <Info label="Facturado" value={pedido.facturado ? "🧾 Sí" : "No"} />
            <Info
              label="Cargado"
              value={formatearFechaHora(pedido.created_at)}
            />
            {pedido.entregado_at && (
              <Info
                label="Entregado"
                value={formatearFechaHora(pedido.entregado_at)}
              />
            )}
            {pedido.monto != null && (
              <Info label="Monto" value={formatearMonto(pedido.monto)} grande />
            )}
          </div>

          {pedido.observaciones && (
            <div style={styles.obsBox}>
              <span
                style={{
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  fontSize: 10.5,
                  textTransform: "uppercase",
                }}
              >
                Observaciones ·{" "}
              </span>
              {pedido.observaciones}
            </div>
          )}

          {articulos.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <SectionLabel>Artículos del pedido</SectionLabel>
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                {articulos.map((a, i) => (
                  <div
                    key={a.id || i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "9px 12px",
                      fontSize: 12.5,
                      borderBottom:
                        i < articulos.length - 1
                          ? "1px solid var(--border)"
                          : "none",
                    }}
                  >
                    <span>
                      {a.cantidad}x {a.descripcion}
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>
                      {formatearMonto(a.subtotal)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(pedido.estado === "listo_para_entregar" ||
            pedido.estado === "entregado") && (
            <ResumenPreparacion pedidoId={pedido.id} />
          )}

          {!pedidoFinalizado && puedeEditarEstado && horarios.aplica && (
            <div style={{ marginBottom: 20 }}>
              <SectionLabel>Cambiar horario</SectionLabel>
              {horarios.sinHorarios && (
                <p
                  style={{
                    fontSize: 12.5,
                    color: "var(--text-muted)",
                    marginBottom: 8,
                  }}
                >
                  Ya no se pueden asignar horarios para hoy.
                </p>
              )}
              {(!horarios.sinHorarios || pedido.hora_desde) && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))",
                    gap: 8,
                  }}
                >
                  {[null, ...horarios.horas].map((h) => {
                    const activo =
                      (h || null) ===
                      (formatearHoraDesde(pedido.hora_desde) || null);
                    return (
                      <button
                        key={h || "sin"}
                        onClick={() => !activo && cambiarHorario(h)}
                        disabled={cambiandoHora}
                        style={{
                          padding: "9px 0",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: activo ? 700 : 500,
                          border: `1px solid ${activo ? "var(--primary)" : "var(--border)"}`,
                          background: activo
                            ? "var(--primary-subtle)"
                            : "transparent",
                          color: activo
                            ? "var(--primary)"
                            : "var(--text-secondary)",
                          transition: "transform 0.12s, filter 0.12s",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(ev) => {
                          ev.currentTarget.style.filter = "brightness(1.25)";
                          ev.currentTarget.style.transform = "translateY(-1px)";
                        }}
                        onMouseLeave={(ev) => {
                          ev.currentTarget.style.filter = "none";
                          ev.currentTarget.style.transform = "none";
                        }}
                      >
                        {h || "Sin horario"}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {/* Aviso de solo lectura */}
          {!pedidoFinalizado && !puedeEditarEstado && (
            <div style={styles.obsBox}>
              {esVendedor && !esDueno && !esEncargadoVentas
                ? `Este pedido lo cargó ${vendedor?.nombre || "otro vendedor"}. Solo esa persona puede modificarlo.`
                : "Este pedido ya está en manos de Expedición. Ya no se puede modificar desde Ventas."}
            </div>
          )}

          {/* Cambiar estado — solo si el pedido no está finalizado */}
          {!pedidoFinalizado && puedeEditarEstado && (
            <div style={{ marginBottom: 20 }}>
              <SectionLabel>Cambiar estado</SectionLabel>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 8,
                }}
              >
                {estadosBotones
                  .filter((k) => k !== "cancelado")
                  .map((key) => {
                    const e = ESTADOS[key];
                    return (
                      <button
                        key={key}
                        onClick={() => cambiarEstado(key)}
                        disabled={loadingEstado}
                        style={{
                          padding: "10px 8px",
                          borderRadius: 8,
                          fontSize: 12.5,
                          fontWeight: 600,
                          border: `1px solid transparent`,
                          background: e.bg,
                          color: e.color,
                          textAlign: "center",
                          transition: "transform 0.12s, filter 0.12s",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(ev) => {
                          ev.currentTarget.style.filter = "brightness(1.25)";
                          ev.currentTarget.style.transform = "translateY(-1px)";
                        }}
                        onMouseLeave={(ev) => {
                          ev.currentTarget.style.filter = "none";
                          ev.currentTarget.style.transform = "none";
                        }}
                      >
                        {e.icono} {e.label}
                      </button>
                    );
                  })}
              </div>

              {/* Botón / confirmación de cancelar pedido */}
              {puedeGestionarPedidos && (
                <div style={{ marginTop: 10 }}>
                  {!confirmCancelar ? (
                    <button
                      onClick={() => setConfirmCancelar(true)}
                      disabled={loadingEstado}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 8,
                        fontSize: 12.5,
                        fontWeight: 600,
                        border: "1px solid #EF4444",
                        background: "transparent",
                        color: "#EF4444",
                        cursor: "pointer",
                        transition: "background 0.12s",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                      onMouseEnter={(ev) => {
                        ev.currentTarget.style.background =
                          "rgba(239, 68, 68, 0.1)";
                      }}
                      onMouseLeave={(ev) => {
                        ev.currentTarget.style.background = "transparent";
                      }}
                    >
                      <XCircle size={15} /> Cancelar pedido
                    </button>
                  ) : (
                    <div style={styles.confirmBoxDanger}>
                      {cancelando ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            color: "var(--text-secondary)",
                            fontSize: 13,
                          }}
                        >
                          <span className="spinner" /> Cancelando pedido...
                        </div>
                      ) : (
                        <>
                          <span
                            style={{
                              fontSize: 13,
                              color: "#EF4444",
                              fontWeight: 600,
                            }}
                          >
                            ¿Confirmar cancelación?
                          </span>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              className="btn btn-ghost"
                              style={{ padding: "5px 11px", fontSize: 12 }}
                              onClick={() => setConfirmCancelar(false)}
                            >
                              Volver
                            </button>
                            <button
                              style={{
                                padding: "5px 13px",
                                fontSize: 12,
                                borderRadius: 6,
                                border: "none",
                                background: "#EF4444",
                                color: "#fff",
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                              onClick={cancelarPedido}
                            >
                              ❌ Sí, cancelar
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Marcar como entregado — solo si no está finalizado (ni entregado ni cancelado) */}
          {puedeGestionarPedidos && !pedidoFinalizado && (
            <div style={{ marginBottom: 4 }}>
              {!confirmEntrega ? (
                <button
                  className="btn btn-success w-full"
                  style={{ padding: 12 }}
                  onClick={() => setConfirmEntrega(true)}
                >
                  <PackageCheck size={16} /> Marcar como entregado
                </button>
              ) : (
                <div style={styles.confirmBox}>
                  {entregando ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        color: "var(--text-secondary)",
                        fontSize: 13,
                      }}
                    >
                      <span className="spinner" /> Consultando monto en Odoo...
                    </div>
                  ) : (
                    <>
                      <span
                        style={{
                          fontSize: 13,
                          color: "var(--success)",
                          fontWeight: 600,
                        }}
                      >
                        ¿Confirmar entrega?
                      </span>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "5px 11px", fontSize: 12 }}
                          onClick={() => setConfirmEntrega(false)}
                        >
                          Cancelar
                        </button>
                        <button
                          className="btn btn-success"
                          style={{ padding: "5px 13px", fontSize: 12 }}
                          onClick={marcarEntregado}
                        >
                          ✅ Confirmar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {error && <p className="form-error">{error}</p>}

          <hr className="divider" />

          <div>
            <SectionLabel>Historial de movimientos</SectionLabel>
            {loadingHist ? (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  color: "var(--text-muted)",
                  fontSize: 13,
                }}
              >
                <span className="spinner" /> Cargando...
              </div>
            ) : historial.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                Sin movimientos registrados.
              </p>
            ) : (
              <div>
                {historial.map((mov, i) => (
                  <div
                    key={mov.id}
                    style={{
                      display: "flex",
                      gap: 10,
                      padding: "8px 0",
                      borderBottom:
                        i < historial.length - 1
                          ? "1px solid var(--border)"
                          : "none",
                    }}
                  >
                    <div
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        marginTop: 5,
                        flexShrink: 0,
                        background: mov.estado_nuevo
                          ? ESTADOS[mov.estado_nuevo]?.color || "var(--primary)"
                          : "var(--primary)",
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5 }}>{mov.descripcion}</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          display: "flex",
                          alignItems: "center",
                          gap: 3,
                          marginTop: 2,
                        }}
                      >
                        <Clock size={10} /> {formatearFechaHora(mov.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, grande }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--text-muted)",
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        style={{ fontSize: grande ? 16 : 13, fontWeight: grande ? 700 : 500 }}
      >
        {value}
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "var(--text-muted)",
        marginBottom: 9,
      }}
    >
      {children}
    </div>
  );
}

const styles = {
  obsBox: {
    background: "var(--surface-container)",
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 13,
    color: "var(--text-secondary)",
    marginBottom: 20,
    borderLeft: "3px solid var(--border-strong)",
  },
  confirmBox: {
    background: "var(--success-bg)",
    borderRadius: 8,
    padding: "12px 14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  confirmBoxDanger: {
    background: "rgba(239, 68, 68, 0.1)",
    borderRadius: 8,
    padding: "12px 14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
};
