import { useState } from "react";
import { Check, X } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { formatearFechaHora } from "../../utils/helpers";
import {
  anularNotaCredito,
  cantidadTexto,
  marcarNotaRealizada,
  pesos,
  pesosUnitario,
} from "../../lib/notasCredito";

const ESTADOS = {
  pendiente: { label: "Pendiente", color: "var(--warning)", bg: "var(--warning-bg)" },
  realizada: { label: "Realizada", color: "var(--success)", bg: "var(--success-bg)" },
  anulada: { label: "Anulada", color: "var(--text-muted)", bg: "var(--surface-container)" },
};

const CSS_TABLA = `
.nci-scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; }
.nci { width: 100%; border-collapse: collapse; font-size: 13px; }
.nci th { text-align: left; font-size: 10.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; padding: 9px 10px; background: var(--surface-container); border-bottom: 1px solid var(--border); white-space: nowrap; }
.nci td { padding: 9px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
.nci tbody tr:last-child td { border-bottom: none; }
.nci .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.nci tfoot td { font-weight: 800; border-top: 2px solid var(--border); border-bottom: none; font-size: 14px; }
.nci-cod { color: var(--text-muted); font-size: 11.5px; }
@media (max-width: 640px) { .nci .nci-movil-no { display: none; } }
`;

// Tabla de productos de una nota de crédito (como la hoja de Odoo)
export function TablaItems({ items, total }) {
  return (
    <div className="nci-scroll">
      <style>{CSS_TABLA}</style>
      <table className="nci">
        <thead>
          <tr>
            <th className="n">Cant.</th>
            <th>Artículo</th>
            <th className="n nci-movil-no">P.U.</th>
            <th className="n nci-movil-no">Desc.</th>
            <th className="n">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i, k) => (
            <tr key={i.id || i.linea_odoo_id || k}>
              <td className="n">{cantidadTexto(i.cantidad)}</td>
              <td>
                {i.producto}
                {i.codigo ? <div className="nci-cod">{i.codigo}</div> : null}
              </td>
              <td className="n nci-movil-no">{pesosUnitario(i.precio_unitario)}</td>
              <td className="n nci-movil-no">{Number(i.descuento) ? pesos(i.descuento) : "—"}</td>
              <td className="n">{pesos(i.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Total</td>
            <td className="nci-movil-no" />
            <td className="nci-movil-no" />
            <td className="n">{pesos(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
        {label}
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// Detalle de una nota de crédito (ventana, igual que el detalle de un pedido)
export default function DetalleNotaCredito({ nota: n, modo, onClose, onCambio }) {
  const { perfil, esAdmin } = useAuth();
  const [confirmando, setConfirmando] = useState(null); // "realizar" | "anular"
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const est = ESTADOS[n.estado];

  const puedeRealizar = modo === "caja" && n.estado === "pendiente";
  const puedeAnular = modo === "gestion" && n.estado === "pendiente" && (esAdmin || n.creado_por === perfil?.id);

  const ejecutar = async () => {
    setProcesando(true);
    setError("");
    try {
      if (confirmando === "realizar") {
        await marcarNotaRealizada(n.id);
        onCambio(`Nota de crédito #${n.id} marcada como realizada.`);
      } else {
        await anularNotaCredito(n.id);
        onCambio(`Nota de crédito #${n.id} anulada.`);
      }
    } catch (e) {
      setError(e.message);
      setProcesando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !procesando && onClose()}>
      <div className="modal" style={{ maxWidth: 820 }}>
        <div className="modal-header" style={{ borderLeft: `4px solid ${est.color}`, paddingLeft: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>
              Nota de crédito #{n.id} · Pedido #{n.numero_pedido}
            </div>
            <span className="badge" style={{ background: est.bg, color: est.color }}>
              {est.label}
            </span>
          </div>
          <button className="btn-icon" onClick={onClose} disabled={procesando} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Cliente
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{n.cliente}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
            <Info label="Cargada" value={`${formatearFechaHora(n.created_at)} · ${n.creado_por_nombre || "—"}`} />
            {n.estado === "realizada" && (
              <Info label="Realizada" value={`${formatearFechaHora(n.realizada_at)} · ${n.realizada_por_nombre || "—"}`} />
            )}
            {n.estado === "anulada" && (
              <Info label="Anulada" value={`${formatearFechaHora(n.anulada_at)} · ${n.anulada_por_nombre || "—"}`} />
            )}
            <Info label="Total a devolver" value={<span style={{ fontSize: 17, fontWeight: 800, color: "var(--primary)" }}>{pesos(n.total)}</span>} />
          </div>

          <TablaItems items={n.items} total={n.total} />

          {error && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13 }}>
              {error}
            </div>
          )}

          {confirmando && (
            <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, border: "1px solid var(--warning)", background: "var(--warning-bg)", fontSize: 13 }}>
              <strong>
                {confirmando === "realizar"
                  ? `¿Ya hiciste la nota de crédito de ${pesos(n.total)} en Odoo?`
                  : "¿Anular esta nota de crédito?"}
              </strong>
              <div style={{ marginTop: 3 }}>
                {confirmando === "realizar"
                  ? "Queda registrada como realizada y sale de pendientes."
                  : "Caja deja de verla y sus cantidades vuelven a quedar disponibles para devolver."}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {confirmando ? (
            <>
              <button className="btn btn-ghost" onClick={() => setConfirmando(null)} disabled={procesando}>
                Volver
              </button>
              <button
                className={confirmando === "realizar" ? "btn btn-success" : "btn btn-primary"}
                onClick={ejecutar}
                disabled={procesando}
              >
                {procesando ? <span className="spinner" /> : null}
                {confirmando === "realizar" ? "Sí, está realizada" : "Sí, anular"}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={onClose}>
                Cerrar
              </button>
              {puedeAnular && (
                <button className="btn btn-ghost" style={{ color: "var(--danger)" }} onClick={() => setConfirmando("anular")}>
                  <X size={15} /> Anular
                </button>
              )}
              {puedeRealizar && (
                <button className="btn btn-success" onClick={() => setConfirmando("realizar")}>
                  <Check size={15} /> Marcar como realizada
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
