import { useState } from "react";
import { X, Download } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import {
  claveDia,
  resumenEntregas,
  exportarEntregas,
} from "../../lib/exportExcel";
import { formatearMonto } from "../../utils/helpers";

const TZ = "America/Argentina/Buenos_Aires";

function diaLargo(dia) {
  const texto = new Date(`${dia}T12:00:00-03:00`).toLocaleDateString("es-AR", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default function ExportarEntregasModal({
  pedidos,
  usuariosMap,
  onClose,
}) {
  const { perfil } = useAuth();
  const hoy = claveDia(new Date());
  const [dia, setDia] = useState(hoy);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState("");

  const resumen = dia
    ? resumenEntregas(pedidos, dia)
    : { cantidad: 0, total: 0, sinMonto: 0 };

  const descargar = async () => {
    setGenerando(true);
    setError("");
    try {
      const ok = await exportarEntregas(
        pedidos,
        usuariosMap,
        dia,
        perfil?.nombre,
      );
      if (!ok) setError("No hay entregas en ese día.");
      else onClose();
    } catch (err) {
      console.error(err);
      setError("No se pudo generar el Excel. Intentá de nuevo.");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h3
            style={{
              fontFamily: "Montserrat, sans-serif",
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            Exportar entregas
          </h3>
          <button className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Fecha de las entregas</label>
            <input
              type="date"
              className="input"
              value={dia}
              max={hoy}
              onChange={(e) => {
                setDia(e.target.value);
                setError("");
              }}
            />
            {dia && (
              <p
                style={{
                  fontSize: 12.5,
                  color: "var(--text-secondary)",
                  marginTop: 6,
                }}
              >
                {diaLargo(dia)}
                {dia === hoy ? " · hoy" : ""}
              </p>
            )}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              padding: "14px 16px",
              borderRadius: 10,
              background: "var(--surface-container)",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text-muted)",
                }}
              >
                Pedidos entregados
              </div>
              <div
                style={{
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: 22,
                  fontWeight: 800,
                }}
              >
                {resumen.cantidad}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--text-muted)",
                }}
              >
                Total del día
              </div>
              <div
                style={{
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: 22,
                  fontWeight: 800,
                  color: "var(--primary)",
                }}
              >
                {formatearMonto(resumen.total)}
              </div>
            </div>
          </div>

          {dia && resumen.cantidad === 0 && (
            <p
              style={{
                fontSize: 13,
                color: "var(--text-muted)",
                marginTop: 12,
              }}
            >
              No hubo entregas ese día.
            </p>
          )}

          {resumen.sinMonto > 0 && (
            <p
              style={{
                fontSize: 13,
                color: "var(--warning)",
                marginTop: 12,
              }}
            >
              Atención: {resumen.sinMonto} pedido
              {resumen.sinMonto !== 1 ? "s" : ""} sin monto cargado.
            </p>
          )}

          {error && <p className="form-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            onClick={descargar}
            disabled={generando || !dia || resumen.cantidad === 0}
          >
            {generando ? (
              <>
                <span className="spinner" />
                Generando...
              </>
            ) : (
              <>
                <Download size={15} /> Descargar Excel
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
