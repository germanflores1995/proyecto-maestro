import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "../../lib/supabase";

// Etiquetas amigables para cada umbral
const ETIQUETAS = {
  importe_alto: "Importe alto (pesos)",
  dias_nuevo_sin_gestionar: "Días para marcar un nuevo sin gestionar",
  dias_sin_contacto_aviso: "Días sin contacto efectivo: aviso (amarillo)",
  dias_sin_contacto_critico: "Días sin contacto efectivo: alerta (rojo)",
  dias_antiguedad_aviso: "Antigüedad: aviso (amarillo), en días",
  dias_antiguedad_critico: "Antigüedad: alerta (rojo), en días",
};

const ORDEN = Object.keys(ETIQUETAS);

export default function ConfigPresupuesto({ onClose, onSaved }) {
  const [filas, setFilas] = useState([]);
  const [original, setOriginal] = useState({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error: errorCarga } = await supabase
        .from("presupuesto_config")
        .select("clave, valor");
      if (errorCarga) {
        setError("No se pudo cargar la configuración.");
      } else {
        const valores = Object.fromEntries(data.map((c) => [c.clave, String(Number(c.valor))]));
        setOriginal(valores);
        setFilas(valores);
      }
      setCargando(false);
    })();
  }, []);

  async function guardar(e) {
    e.preventDefault();
    setError("");
    setOk("");
    const cambios = ORDEN.filter(
      (k) => filas[k] !== undefined && filas[k] !== original[k],
    );
    if (cambios.length === 0) {
      setOk("No hay cambios para guardar.");
      return;
    }
    for (const k of cambios) {
      const n = Number(filas[k]);
      if (!Number.isFinite(n) || n < 0) {
        setError(`Revisá el valor de «${ETIQUETAS[k]}».`);
        return;
      }
    }
    setGuardando(true);
    const resultados = await Promise.all(
      cambios.map((k) =>
        supabase
          .from("presupuesto_config")
          .update({ valor: Number(filas[k]) })
          .eq("clave", k)
          .select("clave"),
      ),
    );
    setGuardando(false);
    const fallo = resultados.find((r) => r.error || !r.data?.length);
    if (fallo) {
      setError("No se pudo guardar. Solo el admin puede cambiar la configuración.");
      return;
    }
    setOriginal({ ...original, ...Object.fromEntries(cambios.map((k) => [k, filas[k]])) });
    setOk("Configuración guardada.");
    onSaved?.();
  }

  return (
    <div style={styles.fondo} onClick={onClose}>
      <form onSubmit={guardar} style={styles.caja} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.titulo}>Configuración de alertas</h2>
            <p style={styles.subtitulo}>
              Estos umbrales los ven todos los usuarios de Presupuestos.
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        {cargando ? (
          <p style={styles.aviso}>Cargando...</p>
        ) : (
          <div style={styles.lista}>
            {ORDEN.map((k) => (
              <label key={k} style={styles.fila}>
                <span style={styles.etiqueta}>{ETIQUETAS[k]}</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step={k === "importe_alto" ? "1000" : "1"}
                  value={filas[k] ?? ""}
                  onChange={(e) => setFilas({ ...filas, [k]: e.target.value })}
                  style={{ width: 150 }}
                />
              </label>
            ))}
          </div>
        )}

        {error && <p style={styles.error}>{error}</p>}
        {ok && <p style={styles.ok}>{ok}</p>}

        <div style={styles.acciones}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cerrar
          </button>
          <button type="submit" className="btn btn-primary" disabled={guardando || cargando}>
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </form>
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
    zIndex: 1100,
  },
  caja: {
    background: "var(--surface, #fff)",
    color: "var(--text, #0f172a)",
    borderRadius: 14,
    width: "100%",
    maxWidth: 580,
    maxHeight: "90vh",
    overflowY: "auto",
    padding: 22,
    boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  titulo: { margin: 0, fontSize: 18, fontWeight: 700 },
  subtitulo: { margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary, #64748b)" },
  lista: { display: "flex", flexDirection: "column", gap: 8 },
  fila: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "9px 0",
    borderBottom: "1px solid var(--border, #f1f5f9)",
  },
  etiqueta: { fontSize: 14 },
  aviso: { fontSize: 13, color: "var(--text-secondary, #64748b)" },
  error: { color: "var(--danger, #b91c1c)", fontSize: 13, marginTop: 12 },
  ok: { color: "#15803d", fontSize: 13, marginTop: 12 },
  acciones: {
    marginTop: 18,
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },
};
