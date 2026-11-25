import { useState } from "react";
import { X, Search, Check } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { ESTADOS, ESTADOS_VENDEDOR } from "../../utils/constants";
import { buscarPedidosOdoo } from "../../lib/odoo";
import { horariosDisponibles, diaDeRetiro } from "../../utils/horarios";

const TZ = "America/Argentina/Buenos_Aires";
const MAX_GRUPO = 10; // máximo de pedidos que se cargan juntos

function formatearMonto(n) {
  return (
    "$" +
    Number(n || 0).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

const ESTADOS_ODOO = {
  draft: "Presupuesto",
  sent: "Presupuesto enviado",
  sale: "Pedido de venta",
  sale_control: "Control de venta",
  in_deposit: "En depósito",
  sold: "Vendido",
  done: "Bloqueado",
  cancel: "Cancelado",
};

// "FORTIS SRL - [FORTIS SRL]" -> "FORTIS SRL"
function limpiarCliente(nombre) {
  if (!nombre) return "";
  const i = nombre.indexOf(" - [");
  return (i > 0 ? nombre.slice(0, i) : nombre).trim();
}

function fechaCorta(fecha) {
  if (!fecha) return "";
  return new Date(fecha).toLocaleDateString("es-AR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export default function FormularioPedido({ onClose, onSuccess }) {
  const { perfil, puedeGestionarPedidos } = useAuth();

  const [texto, setTexto] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState(null); // null = todavía no buscó
  const [hayMas, setHayMas] = useState(false);
  const [seleccionado, setSeleccionado] = useState(null);
  // Carga en grupo: 2 o más pedidos del mismo cliente (con un solo pedido se usa «seleccionado», como siempre)
  const [elegidos, setElegidos] = useState([]);
  const [marcados, setMarcados] = useState([]); // casillas tildadas en el listado
  const [progreso, setProgreso] = useState(null);
  const [comentarioOdoo, setComentarioOdoo] = useState("");
  const [mostrarResultados, setMostrarResultados] = useState(false);

  const [estado, setEstado] = useState("viene_hoy");
  const [pago, setPago] = useState("solo_retira");
  const [observaciones, setObservaciones] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [horaDesde, setHoraDesde] = useState(null);

  // Mismos estados, orden y restricciones que "Cambiar estado" del detalle del pedido:
  // Ventas elige entre los suyos; Expedición/admin, todos menos entregado, cancelado y
  // listo para entregar (ese pide ubicación y bultos, y se hace desde el detalle).
  const estadosDisponibles = (
    puedeGestionarPedidos
      ? Object.keys(ESTADOS).filter(
          (k) => !["entregado", "cancelado", "listo_para_entregar"].includes(k),
        )
      : ESTADOS_VENDEDOR
  ).filter((k) => ESTADOS[k]);
  const horarios = horariosDisponibles(estado);

  const buscarPedido = async () => {
    const q = texto.trim();
    if (!q) {
      setError("Escribí un número de pedido o el nombre de un cliente.");
      return;
    }
    setError("");
    setBuscando(true);
    setSeleccionado(null);
    setElegidos([]);
    setMarcados([]);
    setResultados(null);

    const res = await buscarPedidosOdoo(q);
    if (!res || res.error || !res.resultados) {
      setError(res?.error || "No se pudo consultar Odoo.");
      setBuscando(false);
      return;
    }

    // Marcar los que ya están cargados y activos en la app (por número o por id interno de Odoo,
    // así también se detecta un pedido cargado con su nombre anterior)
    const numeros = res.resultados.map((r) => r.numero_pedido);
    const ids = res.resultados.map((r) => r.odoo_id).filter(Boolean);
    let cargados = new Set();
    let cargadosPorId = new Set();
    if (numeros.length > 0) {
      const { data } = await supabase
        .from("pedidos")
        .select("numero_pedido")
        .in("numero_pedido", numeros)
        .eq("activo", true);
      cargados = new Set((data || []).map((d) => d.numero_pedido));
    }
    if (ids.length > 0) {
      const { data, error: errIds } = await supabase
        .from("pedidos")
        .select("odoo_id")
        .in("odoo_id", ids)
        .eq("activo", true);
      if (!errIds) cargadosPorId = new Set((data || []).map((d) => d.odoo_id));
    }

    const lista = res.resultados.map((r) => ({
      ...r,
      yaCargado: cargados.has(r.numero_pedido) || (r.odoo_id && cargadosPorId.has(r.odoo_id)),
    }));
    setResultados(lista);
    setHayMas(!!res.hay_mas);

    setMostrarResultados(true);
    setBuscando(false);
  };

  // Al elegir un pedido, el comentario de Odoo se precarga en "Observaciones"
  // (si el vendedor ya escribió algo propio, no se pisa).
  const elegirPedido = (r) => {
    const nuevo = (r.comentario || "").trim();
    setObservaciones((prev) =>
      prev.trim() === "" || prev === comentarioOdoo ? nuevo : prev,
    );
    setComentarioOdoo(nuevo);
    setSeleccionado(r);
  };

  // Abre el listado con lo que ya estaba elegido tildado
  const abrirListado = () => {
    setMarcados(elegidos.length > 0 ? elegidos : seleccionado ? [seleccionado] : []);
    setMostrarResultados(true);
  };

  const alternarMarca = (r) =>
    setMarcados((prev) =>
      prev.some((m) => m.numero_pedido === r.numero_pedido)
        ? prev.filter((m) => m.numero_pedido !== r.numero_pedido)
        : prev.length >= MAX_GRUPO
          ? prev
          : [...prev, r],
    );

  // Aceptar en el listado: con un pedido tildado funciona como siempre; con varios, carga en grupo
  const aceptarMarcados = () => {
    if (marcados.length === 0) return;
    if (marcados.length === 1) {
      setElegidos([]);
      elegirPedido(marcados[0]);
    } else {
      setSeleccionado(null);
      setElegidos(marcados);
    }
    setMostrarResultados(false);
  };

  // Guarda UN pedido (el mismo paso para la carga de a uno y para la carga en grupo)
  const guardarUno = async (r, obs) => {
    // Verificar si ya existe un pedido activo con ese número
    const { data: existente } = await supabase
      .from("pedidos")
      .select("id")
      .eq("numero_pedido", r.numero_pedido)
      .eq("activo", true)
      .maybeSingle();

    if (existente) {
      throw new Error(
        "Ya existe un pedido activo con ese número. Modificá su estado en vez de crear uno nuevo.",
      );
    }

    const { data, error: errPedido } = await supabase
      .from("pedidos")
      .insert({
        numero_pedido: r.numero_pedido,
        cliente_nombre: r.cliente,
        vendedor_id: perfil.id,
        estado,
        pago,
        facturado: false, // ya no se pide en pantalla; la columna de la base no se toca
        observaciones: obs,
        hora_desde: horarios.aplica ? horaDesde : null,
        hora_desde_dia: horarios.aplica && horaDesde ? diaDeRetiro(estado) : null,
        monto: Number(r.monto),
      })
      .select()
      .single();

    if (errPedido) throw errPedido;

    // Id interno de Odoo (sirve para reconocer el pedido si después le cambian el nombre).
    // Es un dato extra: si falla, el pedido igual queda cargado.
    if (r.odoo_id) {
      const { error: errId } = await supabase
        .from("pedidos")
        .update({ odoo_id: r.odoo_id })
        .eq("id", data.id);
      if (errId) console.error("No se pudo guardar el id de Odoo:", errId.message);
    }

    await supabase.from("historial_pedidos").insert({
      pedido_id: data.id,
      usuario_id: perfil.id,
      estado_anterior: null,
      estado_nuevo: estado,
      descripcion: `Pedido cargado por ${perfil.nombre}`,
    });
  };

  // Carga en grupo: de a uno, como si se hubieran cargado por separado.
  // Si uno falla, los demás se cargan igual y el que falló queda elegido para reintentar.
  const guardarGrupo = async () => {
    setError("");
    setLoading(true);
    const total = elegidos.length;
    const fallidos = [];
    let cargados = 0;
    for (let i = 0; i < total; i++) {
      const r = elegidos[i];
      setProgreso({ hecho: i, total });
      try {
        // Cada pedido lleva su propio comentario de Odoo como observación (lo ve Expedición)
        await guardarUno(r, (r.comentario || "").trim() || null);
        cargados++;
      } catch (err) {
        fallidos.push({ r, motivo: err?.message || "error al guardar" });
      }
    }
    setProgreso(null);
    setLoading(false);
    if (cargados > 0) onSuccess?.();
    if (fallidos.length === 0) {
      onClose();
      return;
    }
    const restantes = fallidos.map((f) => f.r);
    if (restantes.length === 1) {
      setElegidos([]);
      elegirPedido(restantes[0]);
    } else {
      setElegidos(restantes);
    }
    setError(
      `Se cargaron ${cargados} de ${total}. No se pudo cargar: ${fallidos
        .map((f) => `#${f.r.numero_pedido} (${f.motivo})`)
        .join("; ")}. Quedaron elegidos para reintentar.`,
    );
  };

  const handleSubmit = async () => {
    if (elegidos.length > 1) {
      await guardarGrupo();
      return;
    }
    if (!seleccionado) {
      setError("Buscá y elegí un pedido de Odoo primero.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      await guardarUno(seleccionado, observaciones.trim() || null);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message || "Error al guardar el pedido.");
    } finally {
      setLoading(false);
    }
  };


  const popup = mostrarResultados && resultados !== null && (
    <div
      onClick={(e) => e.target === e.currentTarget && setMostrarResultados(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--surface, #fff)",
          borderRadius: 14,
          boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              Resultados de la búsqueda
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {resultados.length === 0
                ? "Sin coincidencias"
                : `${resultados.length} ${resultados.length === 1 ? "pedido" : "pedidos"} · tildá uno o varios del mismo cliente`}
            </div>
          </div>
          <button className="btn-icon" onClick={() => setMostrarResultados(false)}>
            <X size={18} />
          </button>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {resultados.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-secondary)",
              }}
            >
              No se encontraron pedidos. Probá con otros dígitos o con más
              letras del nombre.
            </div>
          ) : (
            resultados.map((r, i) => {
              const bloqueado = r.cargable === false;
              const marcado = marcados.some((m) => m.numero_pedido === r.numero_pedido);
              const otroCliente = !marcado && marcados.length > 0 && marcados[0].cliente !== r.cliente;
              const lleno = !marcado && marcados.length >= MAX_GRUPO;
              const deshabilitado = bloqueado || r.yaCargado || otroCliente || lleno;
              let motivo = "";
              if (r.yaCargado) motivo = "Ya cargado";
              else if (bloqueado)
                motivo = `${ESTADOS_ODOO[r.estado_odoo] || r.estado_odoo} en Odoo`;
              else if (otroCliente) motivo = "Otro cliente";
              else if (lleno) motivo = `Máximo ${MAX_GRUPO} pedidos`;
              return (
                <button
                  key={r.numero_pedido}
                  type="button"
                  role="checkbox"
                  aria-checked={marcado}
                  onClick={() => {
                    if (deshabilitado) return;
                    alternarMarca(r);
                  }}
                  disabled={deshabilitado}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 16px",
                    background: "transparent",
                    border: "none",
                    borderBottom:
                      i < resultados.length - 1
                        ? "1px solid var(--border)"
                        : "none",
                    cursor: deshabilitado ? "not-allowed" : "pointer",
                    opacity: deshabilitado ? 0.55 : 1,
                    background: marcado ? "var(--primary-subtle)" : "transparent",
                  }}
                  onMouseEnter={(ev) => {
                    if (!deshabilitado)
                      ev.currentTarget.style.background = "var(--primary-subtle)";
                  }}
                  onMouseLeave={(ev) => {
                    ev.currentTarget.style.background = marcado ? "var(--primary-subtle)" : "transparent";
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 5,
                      flexShrink: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: `2px solid ${marcado ? "var(--primary)" : "var(--border-strong, #cbd5e1)"}`,
                      background: marcado ? "var(--primary)" : "transparent",
                      color: "#fff",
                    }}
                  >
                    {marcado && <Check size={14} strokeWidth={3} />}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      #{r.numero_pedido}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--text-secondary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {limpiarCliente(r.cliente)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {formatearMonto(Number(r.monto))}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: motivo ? "var(--warning)" : "var(--text-muted)",
                        fontWeight: motivo ? 600 : 400,
                      }}
                    >
                      {motivo || fechaCorta(r.fecha)}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
        {hayMas && (
          <div
            style={{
              padding: "10px 16px",
              fontSize: 12,
              color: "var(--text-muted)",
              borderTop: "1px solid var(--border)",
            }}
          >
            Hay más resultados. Escribí más dígitos o más letras para afinar.
          </div>
        )}
        {resultados.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "12px 16px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
              {marcados.length === 0
                ? "Tildá los pedidos a cargar"
                : `${marcados.length} ${marcados.length === 1 ? "pedido" : "pedidos"} · ${formatearMonto(
                    marcados.reduce((t, m) => t + Number(m.monto || 0), 0),
                  )}`}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={aceptarMarcados}
              disabled={marcados.length === 0}
            >
              Aceptar
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const clienteLimpio = seleccionado ? limpiarCliente(seleccionado.cliente) : "";

  return (
    <>
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        <div className="modal-header">
          <h3
            style={{
              fontFamily: "Montserrat, sans-serif",
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            Nuevo pedido
          </h3>
          <button className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Buscador: número de pedido o cliente */}
          <div className="form-group">
            <label className="form-label">Pedido o cliente *</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="input"
                placeholder="Número de pedido o nombre del cliente"
                value={texto}
                onChange={(e) => {
                  setTexto(e.target.value);
                  setSeleccionado(null);
                  setElegidos([]);
                  setMarcados([]);
                  setResultados(null);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !buscando) buscarPedido();
                }}
                autoFocus
                type="text"
                name="busqueda-odoo"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                data-lpignore="true"
                data-form-type="other"
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-primary"
                onClick={buscarPedido}
                disabled={buscando}
                style={{ whiteSpace: "nowrap" }}
              >
                {buscando ? (
                  "Buscando..."
                ) : (
                  <>
                    <Search size={15} /> Buscar
                  </>
                )}
              </button>
            </div>
            {!seleccionado && elegidos.length === 0 && resultados === null && !buscando && (
              <p
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginTop: 6,
                }}
              >
                Escribí el número completo, los últimos dígitos o parte del
                nombre del cliente, y tocá Buscar.
              </p>
            )}
          </div>

          {/* Carga en grupo: varios pedidos del mismo cliente */}
          {elegidos.length > 1 && (
            <div className="form-group">
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 8,
                  background: "var(--primary-subtle)",
                  border: "1px solid var(--primary)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--primary)",
                      }}
                    >
                      {elegidos.length} pedidos
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--primary)" }}>
                      {limpiarCliente(elegidos[0].cliente)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--text-muted)",
                      }}
                    >
                      Total
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>
                      {formatearMonto(elegidos.reduce((t, m) => t + Number(m.monto || 0), 0))}
                    </div>
                    <button
                      type="button"
                      onClick={abrirListado}
                      style={{
                        marginTop: 4,
                        background: "none",
                        border: "none",
                        padding: 0,
                        fontSize: 12,
                        color: "var(--primary)",
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      Cambiar
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                  {elegidos.map((r) => (
                    <div
                      key={r.numero_pedido}
                      style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}
                    >
                      <span style={{ fontWeight: 600 }}>#{r.numero_pedido}</span>
                      <span style={{ color: "var(--text-secondary)" }}>{formatearMonto(Number(r.monto))}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                Estado, horario y pago valen para todos. Cada pedido se carga por separado, con su propio comentario de
                Odoo.
              </p>
            </div>
          )}

          {/* Pedido elegido */}
          {seleccionado && (
            <div className="form-group">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 8,
                  background: "var(--primary-subtle)",
                  border: "1px solid var(--primary)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--primary)",
                    }}
                  >
                    Pedido #{seleccionado.numero_pedido}
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "var(--primary)",
                    }}
                  >
                    {clienteLimpio}
                  </div>
                  {clienteLimpio !== seleccionado.cliente && (
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--text-muted)",
                        marginTop: 2,
                      }}
                    >
                      {seleccionado.cliente}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--text-muted)",
                    }}
                  >
                    Monto
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>
                    {formatearMonto(Number(seleccionado.monto))}
                  </div>
                  {resultados && resultados.length > 0 && (
                    <button
                      type="button"
                      onClick={abrirListado}
                      style={{
                        marginTop: 4,
                        background: "none",
                        border: "none",
                        padding: 0,
                        fontSize: 12,
                        color: "var(--primary)",
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                    >
                      Cambiar
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Estado inicial</label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 8,
              }}
            >
              {estadosDisponibles.map((key) => {
                const e = ESTADOS[key];
                const activo = estado === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setEstado(key);
                      setHoraDesde(null);
                    }}
                    style={{
                      padding: "10px 8px",
                      borderRadius: 8,
                      fontSize: 12.5,
                      fontWeight: activo ? 700 : 600,
                      border: `1px solid ${activo ? e.color : "transparent"}`,
                      boxShadow: activo ? `inset 0 0 0 1px ${e.color}` : "none",
                      background: e.bg,
                      color: e.color,
                      opacity: activo ? 1 : 0.6,
                      textAlign: "center",
                      transition: "transform 0.12s, filter 0.12s, opacity 0.12s",
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
          </div>

          {horarios.aplica && (
            <div className="form-group">
              <label className="form-label">Horario de retiro (opcional)</label>
              {horarios.sinHorarios ? (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "var(--warning-bg)",
                    color: "var(--warning)",
                    fontSize: 13,
                  }}
                >
                  Ya no se pueden asignar horarios para hoy. El pedido se carga
                  sin horario.
                </div>
              ) : (
                <>
                  <p
                    style={{
                      fontSize: 12.5,
                      color: "var(--text-secondary)",
                      marginBottom: 8,
                    }}
                  >
                    Horarios de {horarios.descripcionDia}. El cliente puede
                    venir a partir de esa hora.
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(84px, 1fr))",
                      gap: 8,
                    }}
                  >
                    {[null, ...horarios.horas].map((h) => {
                      const activo = horaDesde === h;
                      return (
                        <button
                          key={h || "sin"}
                          onClick={() => setHoraDesde(h)}
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
                            ev.currentTarget.style.transform =
                              "translateY(-1px)";
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
                </>
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Pago</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { v: "solo_retira", l: "🔖 Solo retira" },
                { v: "paga_ahora", l: "💵 Paga ahora" },
              ].map((op) => (
                <button
                  key={op.v}
                  onClick={() => setPago(op.v)}
                  style={{
                    flex: 1,
                    padding: 10,
                    borderRadius: 8,
                    fontSize: 13,
                    border: `1px solid ${pago === op.v ? "var(--primary)" : "var(--border)"}`,
                    background:
                      pago === op.v ? "var(--primary-subtle)" : "transparent",
                    color:
                      pago === op.v
                        ? "var(--primary)"
                        : "var(--text-secondary)",
                    fontWeight: pago === op.v ? 700 : 400,
                  }}
                >
                  {op.l}
                </button>
              ))}
            </div>
          </div>

          {elegidos.length < 2 && (
            <div className="form-group">
              <label className="form-label">
                Comentario / observaciones (opcional)
              </label>
              <textarea
                className="input"
                placeholder="Ej: op1, cliente con urgencia..."
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                rows={2}
                style={{ resize: "vertical", minHeight: 60 }}
              />
            </div>
          )}

          {error && <p className="form-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner" />
                {progreso ? `Guardando ${progreso.hecho + 1} de ${progreso.total}...` : "Guardando..."}
              </>
            ) : elegidos.length > 1 ? (
              `Guardar ${elegidos.length} pedidos`
            ) : (
              "Guardar pedido"
            )}
          </button>
        </div>
      </div>
    </div>
    {popup}
    </>
  );
}
