import { useEffect, useState } from "react";
import { MapPin, Package } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { etiquetaCategoria, ordenCategoria } from "../../utils/bultos";

// Qué se preparó para el pedido: ubicación y bultos. Para revisar al entregar.
export default function ResumenPreparacion({ pedidoId }) {
  const [ubicacion, setUbicacion] = useState(null);
  const [bultos, setBultos] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      const [{ data: ped }, { data: bs }] = await Promise.all([
        supabase
          .from("pedidos")
          .select("ubicacion_retiro")
          .eq("id", pedidoId)
          .maybeSingle(),
        supabase
          .from("pedido_bultos")
          .select("categoria, cantidad, detalle")
          .eq("pedido_id", pedidoId),
      ]);
      if (!vivo) return;
      setUbicacion(ped?.ubicacion_retiro || null);
      setBultos(
        [...(bs || [])].sort(
          (a, b) => ordenCategoria(a.categoria) - ordenCategoria(b.categoria),
        ),
      );
      setCargando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [pedidoId]);

  const total = bultos.reduce((acc, b) => acc + b.cantidad, 0);

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={styles.titulo}>Preparación del pedido</div>

      {cargando ? (
        <p style={styles.vacio}>Cargando…</p>
      ) : (
        <div style={styles.caja}>
          <div style={styles.fila}>
            <span style={styles.etiqueta}>
              <MapPin size={13} /> Ubicación
            </span>
            <span style={styles.ubicacion}>{ubicacion || "Sin ubicación"}</span>
          </div>

          <div style={styles.separador} />

          {bultos.length === 0 ? (
            <p style={styles.vacio}>
              Sin bultos cargados (pedido preparado antes de esta función).
            </p>
          ) : (
            <>
              {bultos.map((b) => (
                <div key={b.categoria} style={styles.bulto}>
                  <span style={styles.cantidad}>{b.cantidad}×</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={styles.nombre}>{etiquetaCategoria(b.categoria)}</span>
                    {b.detalle && <span style={styles.detalle}> · {b.detalle}</span>}
                  </span>
                </div>
              ))}
              <div style={styles.total}>
                <Package size={13} /> Total: {total} bulto{total === 1 ? "" : "s"}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  titulo: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  },
  caja: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  fila: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  etiqueta: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  },
  ubicacion: {
    fontSize: 16,
    fontWeight: 800,
    padding: "3px 12px",
    borderRadius: 7,
    background: "var(--primary-subtle)",
    color: "var(--primary)",
  },
  separador: { height: 1, background: "var(--border)" },
  bulto: { display: "flex", alignItems: "baseline", gap: 10, fontSize: 13.5 },
  cantidad: { fontWeight: 800, minWidth: 34, textAlign: "right" },
  nombre: { fontWeight: 600 },
  detalle: { color: "var(--text-secondary)" },
  total: {
    marginTop: 2,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-muted)",
  },
  vacio: { margin: 0, fontSize: 12.5, color: "var(--text-muted)" },
};
