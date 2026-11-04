import { useState } from "react";
import { X, Check, XCircle, Minus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  formatearMonto,
  formatearImporteCampo,
  leerImporte,
} from "../../utils/presupuestos";

// Qué pasa en cada tipo de cierre: texto, colores del estado y del botón
const CIERRES = {
  confirmado: {
    titulo: "Confirmar presupuesto",
    destino: "Confirmado",
    color: "#15803d",
    fondo: "#dcfce7",
    boton: "Confirmar presupuesto",
    icono: Check,
  },
  perdido: {
    titulo: "Marcar como perdido",
    destino: "Perdido",
    color: "#dc2626",
    fondo: "#fee2e2",
    boton: "Marcar como perdido",
    icono: XCircle,
  },
  sin_resultado: {
    titulo: "Cerrar sin resultado",
    destino: "Cerrado sin resultado",
    color: "#475569",
    fondo: "#e2e8f0",
    boton: "Cerrar presupuesto",
    icono: Minus,
  },
};

export default function FormularioCierre({ seguimiento, tipo, motivos, onClose, onSuccess }) {
  const cfg = CIERRES[tipo];
  const Icono = cfg.icono;
  const [referencia, setReferencia] = useState("");
  const [importe, setImporte] = useState(formatearImporteCampo(seguimiento.importe_original));
  const [motivo, setMotivo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function guardar(e) {
    e.preventDefault();
    const importeNumero = tipo === "confirmado" ? leerImporte(importe) : null;
    if (tipo === "confirmado" && importeNumero === null) {
      setError("Revisá el importe confirmado.");
      return;
    }
    setGuardando(true);
    setError("");
    const { error: errorRpc } = await supabase.rpc("cerrar_presupuesto", {
      p_seguimiento_id: seguimiento.id,
      p_tipo: tipo,
      p_referencia_oc: tipo === "confirmado" ? referencia.trim() || null : null,
      p_importe: importeNumero,
      p_motivo: tipo === "perdido" ? motivo || null : null,
      p_observaciones: observaciones.trim() || null,
    });
    setGuardando(false);
    if (errorRpc) {
      setError(errorRpc.message || "No se pudo cerrar el presupuesto.");
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
            <h2 style={styles.titulo}>{cfg.titulo}</h2>
            <p style={styles.subtitulo}>
              #{seguimiento.odoo_numero} · {seguimiento.cliente_nombre}
            </p>
          </div>
          <button type="button" onClick={onClose} style={styles.cerrar} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div style={styles.cuerpo}>
          <div style={styles.destino}>
            <span style={styles.destinoEtiqueta}>El presupuesto pasará a</span>
            <span
              style={{
                ...styles.destinoEstado,
                color: cfg.color,
                background: cfg.fondo,
                borderColor: cfg.color,
              }}
            >
              <Icono size={16} /> {cfg.destino}
            </span>
          </div>

          <div style={styles.resumen}>
            <span>Importe del presupuesto</span>
            <strong>{formatearMonto(seguimiento.importe_original, 2)}</strong>
          </div>

          {tipo === "confirmado" && (
            <div style={styles.grilla}>
              <Campo etiqueta="N° de orden de compra" requerido>
                <input
                  style={styles.control}
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  required
                  placeholder="Ej: OC-4521"
                />
              </Campo>
              <Campo etiqueta="Importe confirmado">
                <input
                  style={{ ...styles.control, textAlign: "right" }}
                  inputMode="decimal"
                  value={importe}
                  onChange={(e) => setImporte(e.target.value)}
                  onBlur={() => {
                    const n = leerImporte(importe);
                    if (n !== null) setImporte(formatearImporteCampo(n));
                  }}
                  placeholder="0,00"
                />
              </Campo>
            </div>
          )}

          {tipo === "perdido" && (
            <Campo etiqueta="Motivo de la pérdida" requerido>
              <select
                style={styles.control}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                required
              >
                <option value="">Elegí un motivo…</option>
                {motivos.map((m) => (
                  <option key={m.clave} value={m.clave}>
                    {m.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
          )}

          <Campo etiqueta="Observaciones">
            <textarea
              style={{ ...styles.control, height: "auto", padding: "10px 12px", resize: "vertical" }}
              rows={3}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Opcional"
            />
          </Campo>

          {error && <p style={styles.error}>{error}</p>}
        </div>

        <div style={styles.pie}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando}
            style={{ ...styles.botonAccion, background: cfg.color }}
          >
            <Icono size={16} /> {guardando ? "Guardando..." : cfg.boton}
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
    maxWidth: 560,
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
  destino: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  destinoEtiqueta: {
    fontSize: 13,
    color: "var(--text-secondary, #64748b)",
  },
  destinoEstado: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "7px 14px",
    borderRadius: 999,
    border: "1.5px solid",
    fontSize: 15,
    fontWeight: 700,
  },
  resumen: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 14px",
    borderRadius: 8,
    background: "var(--bg, #f8fafc)",
    fontSize: 14,
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
    alignItems: "center",
    gap: 10,
    padding: "14px 22px",
    borderTop: "1px solid var(--border, #e2e8f0)",
    background: "var(--bg, #f8fafc)",
  },
  botonAccion: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "10px 18px",
    borderRadius: 8,
    border: "none",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
  },
};
