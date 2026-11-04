import { useState } from "react";
import { X, PackageCheck, MapPin, Minus, Plus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { CATEGORIAS_BULTO, ESTANTERIAS, PALETS } from "../../utils/bultos";

// Ventana que se abre al pasar un pedido a "listo para entregar".
// Pide ubicación y bultos, y guarda todo junto.
export default function PrepararEntrega({ pedido, onCancelar, onGuardado }) {
  const [ubicacion, setUbicacion] = useState("");
  const [bultos, setBultos] = useState({}); // { clave: { cantidad, detalle } }
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const cantidadDe = (clave) => bultos[clave]?.cantidad || 0;
  const detalleDe = (clave) => bultos[clave]?.detalle || "";

  const cambiarCantidad = (clave, nueva) => {
    const cantidad = Math.max(0, Math.floor(Number(nueva) || 0));
    setBultos((b) => ({ ...b, [clave]: { cantidad, detalle: detalleDe(clave) } }));
  };

  const cambiarDetalle = (clave, texto) =>
    setBultos((b) => ({ ...b, [clave]: { cantidad: cantidadDe(clave), detalle: texto } }));

  // Solo se guardan las categorías con cantidad
  const seleccionados = CATEGORIAS_BULTO.filter((c) => cantidadDe(c.clave) > 0);
  const totalBultos = seleccionados.reduce((acc, c) => acc + cantidadDe(c.clave), 0);

  async function guardar(e) {
    e.preventDefault();
    if (!ubicacion) {
      setError("Elegí la ubicación del pedido.");
      return;
    }
    if (seleccionados.length === 0) {
      setError("Cargá al menos un bulto.");
      return;
    }
    const otrosSinDetalle = seleccionados.find(
      (c) => c.detalleObligatorio && !detalleDe(c.clave).trim(),
    );
    if (otrosSinDetalle) {
      setError('Escribí qué son los bultos de "Otros".');
      return;
    }

    setGuardando(true);
    setError("");
    const payload = seleccionados.map((c) => ({
      categoria: c.clave,
      cantidad: cantidadDe(c.clave),
      detalle: detalleDe(c.clave).trim() || null,
    }));
    const { error: errorRpc } = await supabase.rpc("marcar_listo_para_entregar", {
      p_pedido_id: pedido.id,
      p_ubicacion: ubicacion,
      p_bultos: payload,
    });
    setGuardando(false);
    if (errorRpc) {
      setError(errorRpc.message || "No se pudo guardar la preparación.");
      return;
    }
    onGuardado(ubicacion);
  }

  return (
    <div style={s.fondo} onClick={onCancelar}>
      <form onSubmit={guardar} style={s.caja} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <div style={{ minWidth: 0 }}>
            <div style={s.titulo}>Preparar para entregar</div>
            <div style={s.subtitulo}>
              #{pedido.numero_pedido} · {pedido.cliente_nombre}
            </div>
          </div>
          <button type="button" onClick={onCancelar} style={s.cerrar} aria-label="Cerrar">
            <X size={17} />
          </button>
        </div>

        <div style={s.cuerpo}>
          {/* Ubicación */}
          <div style={s.etiquetaSeccion}>
            <MapPin size={12} /> Ubicación <span style={{ color: "#dc2626" }}>*</span>
          </div>
          <div style={s.gridEstanterias}>
            {ESTANTERIAS.map((u) => (
              <BotonUbic key={u} texto={u} activo={ubicacion === u} onClick={() => setUbicacion(u)} />
            ))}
          </div>
          <div style={s.gridPalets}>
            {PALETS.map((u) => (
              <BotonUbic key={u} texto={u} activo={ubicacion === u} onClick={() => setUbicacion(u)} />
            ))}
          </div>

          {/* Bultos */}
          <div style={s.etiquetaSeccion}>Bultos</div>
          <div style={s.gridBultos}>
            {CATEGORIAS_BULTO.map((c) => {
              const cant = cantidadDe(c.clave);
              const activa = cant > 0;
              return (
                <div
                  key={c.clave}
                  style={{
                    ...s.tarjetaBulto,
                    borderColor: activa ? "var(--primary, #1d4ed8)" : "var(--border, #e2e8f0)",
                    background: activa ? "var(--primary-subtle, #eff6ff)" : "transparent",
                  }}
                >
                  <div style={s.filaBulto}>
                    <div style={s.nombre} title={c.ayuda || c.etiqueta}>
                      {c.etiqueta}
                    </div>
                    <div style={s.stepper}>
                      <button
                        type="button"
                        style={s.stepBtn}
                        onClick={() => cambiarCantidad(c.clave, cant - 1)}
                        disabled={cant === 0}
                        aria-label={`Quitar ${c.etiqueta}`}
                      >
                        <Minus size={12} />
                      </button>
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={cant}
                        onChange={(e) => cambiarCantidad(c.clave, e.target.value)}
                        style={s.inputCant}
                        aria-label={`Cantidad de ${c.etiqueta}`}
                      />
                      <button
                        type="button"
                        style={s.stepBtn}
                        onClick={() => cambiarCantidad(c.clave, cant + 1)}
                        aria-label={`Sumar ${c.etiqueta}`}
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                  {activa && (
                    <input
                      value={detalleDe(c.clave)}
                      onChange={(e) => cambiarDetalle(c.clave, e.target.value)}
                      placeholder={c.detalleObligatorio ? "Qué son (obligatorio)" : c.ayuda || "Detalle (opcional)"}
                      style={s.inputDetalle}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {error && <p style={s.error}>{error}</p>}
        </div>

        <div style={s.pie}>
          <span style={s.resumen}>
            {totalBultos} bulto{totalBultos === 1 ? "" : "s"} · {ubicacion || "sin ubicación"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onCancelar}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={guardando}>
              <PackageCheck size={15} /> {guardando ? "Guardando..." : "Listo para entregar"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function BotonUbic({ texto, activo, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 30,
        borderRadius: 6,
        fontSize: 12.5,
        fontWeight: 700,
        border: `1px solid ${activo ? "var(--primary, #1d4ed8)" : "var(--border-strong, #cbd5e1)"}`,
        background: activo ? "var(--primary, #1d4ed8)" : "var(--surface, #fff)",
        color: activo ? "#fff" : "inherit",
        cursor: "pointer",
        padding: 0,
      }}
    >
      {texto}
    </button>
  );
}

const s = {
  fondo: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    zIndex: 1100,
  },
  caja: {
    background: "var(--surface, #fff)",
    color: "var(--text, #0f172a)",
    borderRadius: 12,
    width: "100%",
    maxWidth: 620,
    maxHeight: "94vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    padding: "12px 18px",
    borderBottom: "1px solid var(--border, #e2e8f0)",
  },
  titulo: { fontSize: 15, fontWeight: 700 },
  subtitulo: { fontSize: 12, color: "var(--text-secondary, #64748b)", marginTop: 2 },
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
    padding: "10px 18px 12px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  etiquetaSeccion: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
    fontSize: 10.5,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--primary, #1d4ed8)",
  },
  gridEstanterias: {
    display: "grid",
    gridTemplateColumns: "repeat(9, 1fr)",
    gap: 5,
  },
  gridPalets: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: 5,
  },
  gridBultos: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 6,
  },
  tarjetaBulto: {
    border: "1px solid",
    borderRadius: 8,
    padding: "6px 9px",
    display: "flex",
    flexDirection: "column",
    gap: 5,
    minWidth: 0,
  },
  filaBulto: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    minWidth: 0,
  },
  nombre: {
    fontSize: 12.5,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
  stepper: { display: "flex", alignItems: "center", gap: 3, flexShrink: 0 },
  stepBtn: {
    width: 24,
    height: 24,
    borderRadius: 5,
    border: "1px solid var(--border-strong, #cbd5e1)",
    background: "var(--surface, #fff)",
    color: "inherit",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
  },
  inputCant: {
    width: 40,
    height: 24,
    textAlign: "center",
    fontSize: 13,
    fontWeight: 700,
    borderRadius: 5,
    border: "1px solid var(--border-strong, #cbd5e1)",
    background: "var(--surface, #fff)",
    color: "inherit",
    fontFamily: "inherit",
    boxSizing: "border-box",
    padding: 0,
  },
  inputDetalle: {
    width: "100%",
    height: 26,
    padding: "0 7px",
    borderRadius: 5,
    border: "1px solid var(--border-strong, #cbd5e1)",
    background: "var(--surface, #fff)",
    color: "inherit",
    fontSize: 12,
    fontFamily: "inherit",
    boxSizing: "border-box",
  },
  error: {
    margin: 0,
    padding: "7px 10px",
    borderRadius: 6,
    background: "#fee2e2",
    color: "#b91c1c",
    fontSize: 12.5,
  },
  pie: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    padding: "10px 18px",
    borderTop: "1px solid var(--border, #e2e8f0)",
    background: "var(--bg, #f8fafc)",
  },
  resumen: { fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary, #475569)" },
};
