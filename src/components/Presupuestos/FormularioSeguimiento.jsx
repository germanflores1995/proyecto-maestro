import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { aIsoOpcional } from "../../utils/presupuestos";

export default function FormularioSeguimiento({
  seguimiento,
  estadoEtiqueta,
  estadoColor,
  medios,
  resultados,
  situaciones,
  onClose,
  onSuccess,
}) {
  const [medio, setMedio] = useState("");
  const [resultado, setResultado] = useState("");
  const [persona, setPersona] = useState("");
  const [situacion, setSituacion] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [proximo, setProximo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function guardar(e) {
    e.preventDefault();
    if (!medio || !resultado) {
      setError("Elegí el medio de contacto y el resultado.");
      return;
    }
    setGuardando(true);
    setError("");
    const { error: errorRpc } = await supabase.rpc("registrar_gestion_presupuesto", {
      p_seguimiento_id: seguimiento.id,
      p_medio: medio,
      p_resultado: resultado,
      p_persona: persona.trim() || null,
      p_situacion: situacion || null,
      p_observaciones: observaciones.trim() || null,
      p_proximo_seguimiento: aIsoOpcional(proximo),
    });
    setGuardando(false);
    if (errorRpc) {
      setError(errorRpc.message || "No se pudo registrar el seguimiento.");
      return;
    }
    onSuccess?.();
    onClose();
  }

  return (
    <div style={styles.fondo} onClick={onClose}>
      <form onSubmit={guardar} style={styles.caja} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.titulo}>Registrar seguimiento</h2>
            <p style={styles.subtitulo}>
              #{seguimiento.odoo_numero} · {seguimiento.cliente_nombre}
            </p>
          </div>
          <button type="button" onClick={onClose} style={styles.cerrar} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div style={styles.cuerpo}>
          <div style={{ ...styles.estadoBanner, borderColor: estadoColor?.color || "#cbd5e1" }}>
            <span style={styles.estadoBannerEtiqueta}>Estado actual</span>
            <span
              style={{
                ...styles.estadoBannerValor,
                color: estadoColor?.color || "inherit",
                background: estadoColor?.fondo || "#e2e8f0",
              }}
            >
              <span style={{ ...styles.estadoPunto, background: estadoColor?.color || "#475569" }} />
              {estadoEtiqueta || seguimiento.estado}
            </span>
          </div>

          <div style={styles.seccion}>Contacto</div>
          <div style={styles.grilla}>
            <Campo etiqueta="Medio de contacto" requerido>
              <select style={styles.control} value={medio} onChange={(e) => setMedio(e.target.value)} required>
                <option value="">Elegí un medio…</option>
                {medios.map((m) => (
                  <option key={m.clave} value={m.clave}>
                    {m.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Persona contactada">
              <input
                style={styles.control}
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                placeholder="Quien atendió (opcional)"
              />
            </Campo>
          </div>

          <div style={styles.seccion}>Resultado</div>
          <div style={styles.grilla}>
            <Campo etiqueta="Resultado" requerido>
              <select
                style={styles.control}
                value={resultado}
                onChange={(e) => setResultado(e.target.value)}
                required
              >
                <option value="">Elegí un resultado…</option>
                {resultados.map((r) => (
                  <option key={r.clave} value={r.clave}>
                    {r.etiqueta}
                    {r.efectivo ? " (contacto efectivo)" : ""}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Situación actual">
              <select style={styles.control} value={situacion} onChange={(e) => setSituacion(e.target.value)}>
                <option value="">Sin definir</option>
                {situaciones.map((s) => (
                  <option key={s.clave} value={s.clave}>
                    {s.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <Campo etiqueta="Observaciones">
            <textarea
              style={{ ...styles.control, height: "auto", padding: "10px 12px", resize: "vertical" }}
              rows={3}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Qué se habló, qué pidió el cliente…"
            />
          </Campo>

          <div style={styles.seccion}>Próximo seguimiento</div>
          <Campo etiqueta="Fecha y hora (opcional)">
            <input
              style={styles.control}
              type="datetime-local"
              value={proximo}
              onChange={(e) => setProximo(e.target.value)}
            />
          </Campo>

          {error && <p style={styles.error}>{error}</p>}
        </div>

        <div style={styles.pie}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" disabled={guardando} style={styles.botonGuardar}>
            {guardando ? "Guardando..." : "Guardar seguimiento"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Campo({ etiqueta, requerido, children }) {
  return (
    <label style={styles.campo}>
      <span style={styles.etiqueta}>
        {etiqueta}
        {requerido && <span style={{ color: "#dc2626" }}> *</span>}
      </span>
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
    padding: "6px 22px 18px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  seccion: {
    marginTop: 10,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--primary, #1d4ed8)",
  },
  grilla: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
  error: {
    margin: 0,
    padding: "9px 12px",
    borderRadius: 8,
    background: "#fee2e2",
    color: "#b91c1c",
    fontSize: 13,
  },
  estadoBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 10,
    border: "1.5px solid",
    background: "var(--bg, #f8fafc)",
  },
  estadoBannerEtiqueta: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--text-secondary, #64748b)",
  },
  estadoBannerValor: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 14px",
    borderRadius: 999,
    fontSize: 15,
    fontWeight: 700,
  },
  estadoPunto: { width: 9, height: 9, borderRadius: 999, display: "inline-block" },
  botonGuardar: {
    padding: "10px 18px",
    borderRadius: 8,
    border: "none",
    background: "#1d4ed8",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
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
