import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";

export const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const CSS = `
.sm-flecha, .sm-mes, .sm-mesbtn { transition: background 0.12s, border-color 0.12s; }
.sm-flecha:hover, .sm-mes:hover, .sm-mesbtn:hover { background: var(--surface-container, #f1f5f9); }
.sm-flecha:focus-visible, .sm-mes:focus-visible, .sm-mesbtn:focus-visible {
  outline: 2px solid var(--primary, #1d4ed8);
  outline-offset: 2px;
}
.sm-popover { max-width: calc(100vw - 32px); }
@media (max-width: 640px) {
  .sm-flecha { width: 40px !important; height: 40px !important; }
  .sm-mes { font-size: 14px !important; padding: 6px 6px !important; }
  .sm-caja { padding: 4px !important; }
  .sm-popover { left: 0 !important; right: auto !important; }
}
`;

// Selector de mes: flechas para moverse de a un mes y un calendario
// (año + grilla de meses) para saltar a cualquier mes.
// anio: número. mes: 1 a 12. onChange recibe { anio, mes }.
export default function SelectorMes({ anio, mes, onChange, alineacion = "izquierda" }) {
  const ahora = new Date();
  const anioHoy = ahora.getFullYear();
  const mesHoy = ahora.getMonth() + 1;

  const [abierto, setAbierto] = useState(false);
  const [anioVista, setAnioVista] = useState(anio);
  const raiz = useRef(null);

  // Cerrar al tocar afuera o con Escape
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e) => {
      if (raiz.current && !raiz.current.contains(e.target)) setAbierto(false);
    };
    const tecla = (e) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("touchstart", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("touchstart", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const moverMes = (delta) => {
    const idx = anio * 12 + (mes - 1) + delta;
    onChange({ anio: Math.floor(idx / 12), mes: (idx % 12) + 1 });
  };

  const abrir = () => {
    setAnioVista(anio);
    setAbierto((v) => !v);
  };

  const elegir = (m) => {
    onChange({ anio: anioVista, mes: m });
    setAbierto(false);
  };

  return (
    <div ref={raiz} className="sm-raiz" style={styles.raiz}>
      <style>{CSS}</style>

      <div className="sm-caja" style={styles.caja}>
        <button
          type="button"
          className="sm-flecha"
          style={styles.flecha}
          onClick={() => moverMes(-1)}
          aria-label="Mes anterior"
        >
          <ChevronLeft size={18} />
        </button>

        <button
          type="button"
          className="sm-mes"
          style={styles.botonMes}
          onClick={abrir}
          aria-haspopup="dialog"
          aria-expanded={abierto}
        >
          <span>{NOMBRES_MES[mes - 1]} {anio}</span>
          <ChevronDown size={15} />
        </button>

        <button
          type="button"
          className="sm-flecha"
          style={styles.flecha}
          onClick={() => moverMes(1)}
          aria-label="Mes siguiente"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {abierto && (
        <div
          role="dialog"
          aria-label="Elegir mes"
          className="sm-popover"
          style={{
            ...styles.popover,
            ...(alineacion === "derecha" ? { right: 0 } : { left: 0 }),
          }}
        >
          <div style={styles.popoverCab}>
            <button
              type="button"
              className="sm-flecha"
              style={styles.flecha}
              onClick={() => setAnioVista((a) => a - 1)}
              aria-label="Año anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <strong style={styles.anioTexto}>{anioVista}</strong>
            <button
              type="button"
              className="sm-flecha"
              style={styles.flecha}
              onClick={() => setAnioVista((a) => a + 1)}
              aria-label="Año siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div style={styles.grilla}>
            {CORTOS.map((nombre, i) => {
              const seleccionado = anioVista === anio && i + 1 === mes;
              const actual = anioVista === anioHoy && i + 1 === mesHoy;
              return (
                <button
                  key={nombre}
                  type="button"
                  className="sm-mesbtn"
                  onClick={() => elegir(i + 1)}
                  aria-pressed={seleccionado}
                  style={{
                    ...styles.mesBtn,
                    ...(actual ? styles.mesActual : {}),
                    ...(seleccionado ? styles.mesSeleccionado : {}),
                  }}
                >
                  {nombre}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  raiz: { position: "relative", display: "inline-flex", maxWidth: "100%" },
  caja: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "var(--surface, #fff)",
    border: "1px solid var(--border, #e2e8f0)",
    borderRadius: 10,
    padding: "6px 8px",
    maxWidth: "100%",
  },
  flecha: {
    width: 34,
    height: 34,
    borderRadius: 8,
    border: "1px solid var(--border, #e2e8f0)",
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  botonMes: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "transparent",
    border: "none",
    color: "inherit",
    fontSize: 15,
    fontWeight: 700,
    padding: "4px 8px",
    cursor: "pointer",
    borderRadius: 8,
    whiteSpace: "nowrap",
  },
  popover: {
    position: "absolute",
    top: "calc(100% + 8px)",
    zIndex: 60,
    width: 268,
    background: "var(--surface, #fff)",
    border: "1px solid var(--border, #e2e8f0)",
    borderRadius: 12,
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.18)",
    padding: 12,
  },
  popoverCab: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  anioTexto: { fontSize: 16 },
  grilla: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 6,
  },
  mesBtn: {
    padding: "10px 4px",
    borderRadius: 8,
    border: "1px solid transparent",
    background: "transparent",
    color: "inherit",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  mesActual: {
    borderColor: "var(--primary, #1d4ed8)",
    color: "var(--primary, #1d4ed8)",
  },
  mesSeleccionado: {
    background: "var(--primary, #1d4ed8)",
    borderColor: "var(--primary, #1d4ed8)",
    color: "#fff",
  },
};
