import { useState } from "react";
import { X, Search, ArrowLeft } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { buscarPresupuestosOdoo } from "../../lib/odoo";
import { formatearMonto, fechaCorta, aIsoOpcional, ESTADO_ODOO } from "../../utils/presupuestos";

export default function FormularioPresupuesto({ onClose, onSuccess }) {
  const { session } = useAuth();
  const [texto, setTexto] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [elegido, setElegido] = useState(null);
  const [cliente, setCliente] = useState("");
  const [contacto, setContacto] = useState({ telefono: "", email: "" });
  const [comentario, setComentario] = useState("");
  const [proximo, setProximo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function buscar(e) {
    e?.preventDefault();
    const q = texto.trim();
    if (!q) return;
    setBuscando(true);
    setMensaje("");
    setResultados(null);
    setElegido(null);
    setError("");
    const r = await buscarPresupuestosOdoo(q);
    setBuscando(false);
    if (r.error) {
      setMensaje(r.error);
      setResultados([]);
      return;
    }
    setResultados(r.resultados || []);
    if (!r.resultados?.length) setMensaje("No se encontraron presupuestos con ese dato.");
  }

  function elegir(r) {
    setElegido(r);
    setCliente(r.cliente || "");
    setContacto({ telefono: r.telefono || "", email: r.email || "" });
    setComentario(r.comentario || "");
    setProximo("");
    setError("");
  }

  async function guardar() {
    if (!elegido) return;
    if (!cliente.trim()) {
      setError("Poné el nombre del cliente para diferenciar este presupuesto.");
      return;
    }
    const uid = session?.user?.id;
    setGuardando(true);
    setError("");

    const { data, error: errorInsert } = await supabase
      .from("presupuesto_seguimientos")
      .insert({
        odoo_numero: elegido.numero_pedido,
        odoo_id: elegido.odoo_id,
        cliente_nombre: cliente.trim(),
        importe_original: elegido.monto,
        fecha_creacion_odoo: elegido.fecha_creacion,
        vendedor_odoo: elegido.vendedor_odoo,
        contacto_telefono: contacto.telefono.trim() || null,
        contacto_email: contacto.email.trim() || null,
        comentario_odoo: comentario.trim() || null,
        proximo_seguimiento_at: aIsoOpcional(proximo),
        responsable_id: uid,
        estado: "nuevo",
        ciclo: 1,
        creado_por: uid,
      })
      .select("id")
      .single();

    if (errorInsert) {
      setGuardando(false);
      setError(
        errorInsert.code === "23505"
          ? "Ese presupuesto ya está cargado en el sistema."
          : "No se pudo guardar el presupuesto. Probá de nuevo.",
      );
      return;
    }

    const { error: errorEvento } = await supabase.from("presupuesto_eventos").insert({
      seguimiento_id: data.id,
      ciclo: 1,
      tipo: "creacion",
      usuario_id: uid,
      detalle: { odoo_numero: elegido.numero_pedido },
    });
    if (errorEvento) console.error("Error al registrar la creación:", errorEvento);

    setGuardando(false);
    onSuccess?.();
    onClose();
  }

  return (
    <div style={styles.fondo} onClick={onClose}>
      <div style={styles.caja} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.titulo}>Agregar presupuesto</h2>
            <p style={styles.subtitulo}>Buscá el presupuesto en Odoo y revisá los datos antes de guardar.</p>
          </div>
          <button type="button" onClick={onClose} style={styles.cerrar} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div style={styles.cuerpo}>
          {!elegido && (
            <>
              <form onSubmit={buscar} style={styles.buscadorFila}>
                <div style={styles.buscadorWrap}>
                  <Search size={16} style={styles.lupa} />
                  <input
                    type="search"
                    name="q"
                    id="buscador-presupuesto"
                    autoComplete="off"
                    enterKeyHint="search"
                    placeholder="N° de presupuesto o cliente"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    style={styles.buscador}
                    autoFocus
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={buscando || !texto.trim()}>
                  {buscando ? "Buscando..." : "Buscar"}
                </button>
              </form>

              {mensaje && <p style={styles.aviso}>{mensaje}</p>}

              {resultados?.length > 0 && (
                <ul style={styles.lista}>
                  {resultados.map((r) => (
                    <li key={r.odoo_id}>
                      <button
                        type="button"
                        onClick={() => r.cargable && elegir(r)}
                        disabled={!r.cargable}
                        title={r.cargable ? "" : "Este pedido ya no está en estado de presupuesto"}
                        style={{
                          ...styles.fila,
                          opacity: r.cargable ? 1 : 0.5,
                          cursor: r.cargable ? "pointer" : "not-allowed",
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={styles.filaSuperior}>
                            <strong>{r.numero_pedido}</strong>
                            <strong>{formatearMonto(r.monto)}</strong>
                          </div>
                          <div style={styles.clienteFila}>{r.cliente}</div>
                          <div style={styles.subtexto}>
                            {fechaCorta(r.fecha_creacion)} · {ESTADO_ODOO[r.estado_odoo] || r.estado_odoo}
                            {r.vendedor_odoo ? ` · ${r.vendedor_odoo}` : ""}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {elegido && (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setElegido(null)}
                style={{ alignSelf: "flex-start" }}
              >
                <ArrowLeft size={15} /> Volver a resultados
              </button>

              <div style={styles.resumen}>
                <Dato etiqueta="N° de presupuesto" valor={elegido.numero_pedido} />
                <Dato etiqueta="Cliente en Odoo" valor={elegido.cliente || "—"} />
                <Dato etiqueta="Importe" valor={formatearMonto(elegido.monto, 2)} />
                <Dato etiqueta="Creado en Odoo" valor={fechaCorta(elegido.fecha_creacion)} />
                <Dato etiqueta="Vendedor en Odoo" valor={elegido.vendedor_odoo || "—"} />
              </div>

              <div style={styles.seccion}>Contacto y seguimiento</div>
              <Campo etiqueta="Nombre del cliente *">
                <input
                  style={styles.control}
                  value={cliente}
                  onChange={(e) => {
                    setCliente(e.target.value);
                    setError("");
                  }}
                  placeholder="Ej: Juan Pérez - Obra San Martín"
                  maxLength={120}
                />
                <span style={styles.ayuda}>Odoo trae el mismo nombre en todos los presupuestos. Escribí uno que los diferencie.</span>
              </Campo>
              <div style={styles.grilla}>
                <Campo etiqueta="Teléfono">
                  <input
                    style={styles.control}
                    value={contacto.telefono}
                    onChange={(e) => setContacto({ ...contacto, telefono: e.target.value })}
                    placeholder="Sin teléfono en Odoo"
                  />
                </Campo>
                <Campo etiqueta="Email">
                  <input
                    style={styles.control}
                    type="email"
                    value={contacto.email}
                    onChange={(e) => setContacto({ ...contacto, email: e.target.value })}
                    placeholder="Sin email en Odoo"
                  />
                </Campo>
                <Campo etiqueta="Próximo seguimiento">
                  <input
                    style={styles.control}
                    type="datetime-local"
                    value={proximo}
                    onChange={(e) => setProximo(e.target.value)}
                  />
                </Campo>
              </div>

              <Campo etiqueta="Comentario">
                <textarea
                  style={{ ...styles.control, height: "auto", padding: "10px 12px", resize: "vertical" }}
                  rows={3}
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Sin comentario"
                />
              </Campo>

              {error && <p style={styles.error}>{error}</p>}
            </>
          )}

          {!elegido && error && <p style={styles.error}>{error}</p>}
        </div>

        {elegido && (
          <div style={styles.pie}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar presupuesto"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor }) {
  return (
    <div style={styles.datoFila}>
      <span style={styles.etiquetaDato}>{etiqueta}</span>
      <span style={styles.valorDato}>{valor}</span>
    </div>
  );
}

function Campo({ etiqueta, children }) {
  return (
    <label style={styles.campo}>
      <span style={styles.etiqueta}>{etiqueta}</span>
      {children}
    </label>
  );
}

const styles = {
  fondo: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 1100,
  },
  caja: {
    background: "var(--surface, #fff)",
    color: "var(--text, #0f172a)",
    borderRadius: 14,
    width: "100%",
    maxWidth: 600,
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    padding: "18px 22px",
    borderBottom: "1px solid var(--border, #e2e8f0)",
  },
  titulo: { margin: 0, fontSize: 17, fontWeight: 700 },
  subtitulo: { margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary, #64748b)" },
  cerrar: {
    background: "transparent",
    border: "none",
    color: "inherit",
    cursor: "pointer",
    padding: 4,
    borderRadius: 6,
    display: "flex",
  },
  cuerpo: {
    padding: "18px 22px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  buscadorFila: { display: "flex", gap: 8, alignItems: "center" },
  buscadorWrap: { position: "relative", flex: 1 },
  lupa: {
    position: "absolute",
    left: 12,
    top: "50%",
    transform: "translateY(-50%)",
    color: "var(--text-secondary, #64748b)",
  },
  buscador: {
    width: "100%",
    height: 40,
    padding: "0 12px 0 36px",
    borderRadius: 8,
    border: "1px solid var(--border-strong, #cbd5e1)",
    background: "var(--surface, #fff)",
    color: "inherit",
    fontSize: 14,
    boxSizing: "border-box",
  },
  aviso: { margin: 0, color: "var(--text-secondary, #64748b)", fontSize: 13 },
  lista: {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    maxHeight: 360,
    overflowY: "auto",
  },
  fila: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    textAlign: "left",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid var(--border, #e2e8f0)",
    background: "var(--surface, #fff)",
    color: "inherit",
    font: "inherit",
  },
  filaSuperior: { display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 },
  clienteFila: {
    fontSize: 13,
    marginTop: 2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  subtexto: { fontSize: 12, color: "var(--text-secondary, #64748b)", marginTop: 2 },
  resumen: {
    border: "1px solid var(--border, #e2e8f0)",
    borderRadius: 10,
    padding: "4px 14px",
    display: "flex",
    flexDirection: "column",
  },
  datoFila: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "9px 0",
    borderBottom: "1px solid var(--border, #f1f5f9)",
    fontSize: 14,
  },
  etiquetaDato: { color: "var(--text-secondary, #64748b)", fontSize: 13 },
  valorDato: { fontWeight: 600, textAlign: "right", minWidth: 0 },
  seccion: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--primary, #1d4ed8)",
  },
  grilla: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 14,
  },
  campo: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 },
  etiqueta: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary, #475569)" },
  control: {
    width: "100%",
    height: 40,
    padding: "0 12px",
    borderRadius: 8,
    border: "1px solid var(--border-strong, #cbd5e1)",
    background: "var(--surface, #fff)",
    color: "inherit",
    fontSize: 14,
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  ayuda: { fontSize: 12, color: "var(--text-secondary, #64748b)" },
  error: {
    margin: 0,
    padding: "9px 12px",
    borderRadius: 8,
    background: "#fee2e2",
    color: "#b91c1c",
    fontSize: 13,
  },
  pie: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    padding: "14px 22px",
    borderTop: "1px solid var(--border, #e2e8f0)",
    background: "var(--bg, #f8fafc)",
  },
};
