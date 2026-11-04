import { useEffect, useMemo, useRef, useState } from "react";
import { Target, TrendingUp, Wallet, Package, Pencil } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { formatearMonto } from "../../utils/presupuestos";
import SelectorMes from "./SelectorMes";

const TZ = "America/Argentina/Buenos_Aires";

// Mes actual en zona Buenos Aires
function mesActual() {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date());
  const v = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  return { anio: Number(v.year), mes: Number(v.month), dia: Number(v.day) };
}

const pad = (n) => String(n).padStart(2, "0");

// Rango del mes en hora de Buenos Aires (sin cambio de horario)
function rangoMes(anio, mes) {
  const siguiente = mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 };
  return {
    desde: `${anio}-${pad(mes)}-01T00:00:00-03:00`,
    hasta: `${siguiente.anio}-${pad(siguiente.mes)}-01T00:00:00-03:00`,
    clave: `${anio}-${pad(mes)}-01`,
  };
}

function diasDelMes(anio, mes) {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

const CSS = `
.ob-pagina { padding: 24px 28px 48px; display: flex; flex-direction: column; gap: 18px; max-width: 1200px; margin: 0 auto; }
.ob-encabezado { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.ob-principal { display: grid; grid-template-columns: minmax(240px, 300px) 1fr; gap: 18px; align-items: stretch; }
.ob-tarjetas { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
.ob-anillo svg { display: block; }
.ob-tabla { width: 100%; border-collapse: collapse; font-size: 14px; }

@media (max-width: 700px) {
  .ob-pagina { padding: 14px 12px 40px !important; gap: 14px !important; }
  .ob-encabezado { flex-direction: column; align-items: stretch; gap: 10px; }
  .ob-titulo { font-size: 20px !important; }
  .ob-principal { grid-template-columns: 1fr !important; gap: 12px !important; }
  .ob-anillo { padding: 14px !important; }
  .ob-anillo svg { width: 150px; height: 150px; }
  .ob-porcentaje { font-size: 26px !important; }
  .ob-tarjetas { grid-template-columns: 1fr 1fr !important; gap: 8px !important; }
  .ob-tarjeta { padding: 12px !important; gap: 4px !important; }
  .ob-valor { font-size: 16px !important; }
  .ob-tarjeta-titulo { font-size: 10px !important; letter-spacing: 0.04em !important; }
  .ob-editor .ob-input { min-width: 0 !important; flex: 1 1 100%; }
  .ob-col-part { display: none !important; }
  .ob-tabla th, .ob-tabla td { padding: 10px 8px !important; font-size: 13px !important; }
  .ob-tabla th { font-size: 10px !important; }
  .ob-tabla td strong { font-size: 13px; }
}
`;

export default function ObjetivoView() {
  const { esAdmin } = useAuth();
  const hoy = mesActual();
  const [periodo, setPeriodo] = useState({ anio: hoy.anio, mes: hoy.mes });
  const [pedidos, setPedidos] = useState([]);
  const intentosOdoo = useRef(new Set());
  const [objetivo, setObjetivo] = useState(null);
  const [editando, setEditando] = useState(false);
  const [valorEdicion, setValorEdicion] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const rango = rangoMes(periodo.anio, periodo.mes);
  const esMesActual = periodo.anio === hoy.anio && periodo.mes === hoy.mes;

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      setError("");
      const [resPedidos, resObjetivo] = await Promise.all([
        supabase
          .from("pedidos")
          .select("vendedor_odoo, monto, estado, numero_pedido, entregado_at")
          .eq("estado", "entregado")
          .gte("entregado_at", rango.desde)
          .lt("entregado_at", rango.hasta)
          .limit(10000),
        supabase.from("objetivos_mensuales").select("monto").eq("mes", rango.clave).maybeSingle(),
      ]);
      if (!vivo) return;
      if (resPedidos.error) {
        setError("No se pudieron cargar los pedidos del mes.");
      }
      setPedidos(resPedidos.data || []);
      setObjetivo(resObjetivo.data ? Number(resObjetivo.data.monto) : null);
      setEditando(false);
      setCargando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [rango.desde, rango.hasta, rango.clave]);

  // Pedidos entregados sin vendedor de Odoo: se consulta a Odoo una sola vez y se guarda
  useEffect(() => {
    const faltan = [
      ...new Set(
        pedidos
          .filter((p) => !p.vendedor_odoo && !intentosOdoo.current.has(p.numero_pedido))
          .map((p) => p.numero_pedido),
      ),
    ];
    if (faltan.length === 0) return;
    faltan.forEach((n) => intentosOdoo.current.add(n));
    let vivo = true;
    (async () => {
      for (let i = 0; i < faltan.length; i += 100) {
        const lote = faltan.slice(i, i + 100);
        const { data, error } = await supabase.functions.invoke("obtener-vendedor-odoo", {
          body: { numeros: lote },
        });
        if (!vivo) return;
        if (error || !data?.vendedores) continue;
        const mapa = data.vendedores;
        await Promise.all(
          Object.entries(mapa).map(([numero, nombre]) =>
            supabase.from("pedidos").update({ vendedor_odoo: nombre }).eq("numero_pedido", numero),
          ),
        );
        if (!vivo) return;
        setPedidos((ps) =>
          ps.map((p) => (mapa[p.numero_pedido] ? { ...p, vendedor_odoo: mapa[p.numero_pedido] } : p)),
        );
      }
    })();
    return () => {
      vivo = false;
    };
  }, [pedidos]);

  const total = useMemo(() => pedidos.reduce((s, p) => s + Number(p.monto || 0), 0), [pedidos]);
  const porcentaje = objetivo && objetivo > 0 ? (total / objetivo) * 100 : null;
  const faltante = objetivo ? Math.max(0, objetivo - total) : null;
  const cumplido = porcentaje !== null && porcentaje >= 100;

  // Agrupado por el vendedor que cargó el pedido en Odoo
  const porVendedor = useMemo(() => {
    const mapa = new Map();
    pedidos.forEach((p) => {
      const nombre = p.vendedor_odoo || "Sin dato";
      const actual = mapa.get(nombre) || { id: nombre, nombre, cantidad: 0, monto: 0 };
      actual.cantidad += 1;
      actual.monto += Number(p.monto || 0);
      mapa.set(nombre, actual);
    });
    return [...mapa.values()]
      .map((v) => ({
        ...v,
        participacion: total > 0 ? (v.monto / total) * 100 : 0,
      }))
      .sort((a, b) => b.monto - a.monto);
  }, [pedidos, total]);

  // Días que faltan en el mes (incluye hoy)
  const diasRestantes = esMesActual
    ? diasDelMes(periodo.anio, periodo.mes) - hoy.dia + 1
    : null;

  async function guardarObjetivo() {
    const n = Number(String(valorEdicion).replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      setError("Revisá el objetivo ingresado.");
      return;
    }
    const { error: errorGuardar } = await supabase
      .from("objetivos_mensuales")
      .upsert({ mes: rango.clave, monto: n }, { onConflict: "mes" });
    if (errorGuardar) {
      setError("No se pudo guardar el objetivo.");
      return;
    }
    setObjetivo(n);
    setEditando(false);
    setError("");
  }

  const anillo = Math.min(porcentaje ?? 0, 100);
  const radio = 62;
  const circunferencia = 2 * Math.PI * radio;

  return (
    <div className="ob-pagina" style={styles.pagina}>
      <style>{CSS}</style>

      <div className="ob-encabezado" style={styles.encabezado}>
        <div>
          <h1 className="ob-titulo" style={styles.titulo}>Objetivo mensual</h1>
          <p style={styles.subtitulo}>Pedidos entregados en el mes frente a la meta.</p>
        </div>
        <SelectorMes
          anio={periodo.anio}
          mes={periodo.mes}
          onChange={setPeriodo}
          alineacion="derecha"
        />
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {cargando ? (
        <div style={styles.vacio}>Cargando...</div>
      ) : (
        <>
          <div className="ob-principal" style={styles.principal}>
            <div className="ob-anillo" style={styles.tarjetaAnillo}>
              <svg width="170" height="170" viewBox="0 0 170 170" aria-label="Porcentaje del objetivo">
                <circle cx="85" cy="85" r={radio} fill="none" stroke="var(--border, #e2e8f0)" strokeWidth="14" />
                <circle
                  cx="85"
                  cy="85"
                  r={radio}
                  fill="none"
                  stroke={cumplido ? "#16a34a" : "var(--primary, #1d4ed8)"}
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={circunferencia}
                  strokeDashoffset={circunferencia * (1 - anillo / 100)}
                  transform="rotate(-90 85 85)"
                />
              </svg>
              <div style={styles.anilloCentro}>
                <strong className="ob-porcentaje" style={styles.porcentaje}>
                  {porcentaje === null ? "—" : `${porcentaje.toFixed(1).replace(".", ",")}%`}
                </strong>
                <span style={styles.anilloEtiqueta}>del objetivo</span>
              </div>
            </div>

            <div className="ob-tarjetas" style={styles.tarjetas}>
              <Tarjeta icono={<Wallet size={18} />} titulo="Entregado" valor={formatearMonto(total)} />
              <Tarjeta
                icono={<Target size={18} />}
                titulo="Objetivo del mes"
                valor={objetivo === null ? "Sin cargar" : formatearMonto(objetivo)}
                acento={objetivo === null ? "#64748b" : "#1d4ed8"}
              />
              <Tarjeta
                icono={<TrendingUp size={18} />}
                titulo="Faltan"
                valor={faltante === null ? "—" : formatearMonto(faltante)}
                acento={cumplido ? "#16a34a" : "#d97706"}
              />
              <Tarjeta icono={<Package size={18} />} titulo="Pedidos entregados" valor={String(pedidos.length)} />
            </div>
          </div>

          <div style={styles.barraObjetivo}>
            <div style={styles.barraFila}>
              <span style={styles.barraEtiqueta}>
                {cumplido
                  ? "¡Objetivo cumplido!"
                  : diasRestantes !== null
                    ? `Quedan ${diasRestantes} día${diasRestantes === 1 ? "" : "s"} del mes`
                    : "Mes cerrado"}
              </span>
              {esAdmin && !editando && (
                <button style={styles.editar} onClick={() => {
                  setValorEdicion(objetivo === null ? "" : String(objetivo));
                  setEditando(true);
                }}>
                  <Pencil size={13} /> {objetivo === null ? "Cargar objetivo" : "Editar objetivo"}
                </button>
              )}
            </div>
            {editando && (
              <div className="ob-editor" style={styles.editorFila}>
                <input
                  className="ob-input"
                  style={styles.input}
                  inputMode="decimal"
                  value={valorEdicion}
                  onChange={(e) => setValorEdicion(e.target.value)}
                  placeholder="Ej: 15000000"
                  autoFocus
                />
                <button style={styles.btnGuardar} onClick={guardarObjetivo}>Guardar</button>
                <button style={styles.btnCancelar} onClick={() => setEditando(false)}>Cancelar</button>
              </div>
            )}
          </div>

          <div style={styles.seccionTitulo}>Ventas por vendedor</div>
          <div style={styles.tarjetaTabla}>
            {porVendedor.length === 0 ? (
              <div style={styles.vacio}>No hay pedidos cargados en este mes.</div>
            ) : (
              <table className="ob-tabla" style={styles.tabla}>
                <thead>
                  <tr>
                    <th className="ob-th" style={styles.th}>Vendedor (en Odoo)</th>
                    <th className="ob-th" style={{ ...styles.th, textAlign: "right" }}>Pedidos</th>
                    <th className="ob-th" style={{ ...styles.th, textAlign: "right" }}>Total vendido</th>
                    <th className="ob-th ob-col-part" style={{ ...styles.th, width: "32%" }}>Participación</th>
                  </tr>
                </thead>
                <tbody>
                  {porVendedor.map((v, i) => (
                    <tr key={v.id} style={styles.fila}>
                      <td style={styles.td}>
                        <span style={styles.puesto}>{i + 1}</span>
                        <strong>{v.nombre}</strong>
                      </td>
                      <td style={{ ...styles.td, textAlign: "right" }}>{v.cantidad}</td>
                      <td style={{ ...styles.td, textAlign: "right", fontWeight: 700 }}>
                        {formatearMonto(v.monto)}
                      </td>
                      <td className="ob-col-part" style={styles.td}>
                        <div style={styles.barra}>
                          <div style={{ ...styles.barraRelleno, width: `${Math.max(v.participacion, 0.5)}%` }} />
                        </div>
                        <span style={styles.participacion}>{v.participacion.toFixed(1).replace(".", ",")}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Tarjeta({ icono, titulo, valor, acento }) {
  return (
    <div className="ob-tarjeta" style={styles.tarjeta}>
      <div style={{ ...styles.tarjetaIcono, color: acento || "var(--primary, #1d4ed8)" }}>{icono}</div>
      <span className="ob-tarjeta-titulo" style={styles.tarjetaTitulo}>{titulo}</span>
      <strong className="ob-valor" style={{ ...styles.tarjetaValor, color: acento || "inherit" }}>{valor}</strong>
    </div>
  );
}

const styles = {
  pagina: { padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 18, maxWidth: 1200, margin: "0 auto" },
  encabezado: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" },
  titulo: { margin: 0, fontSize: 24, fontWeight: 800 },
  subtitulo: { margin: "4px 0 0", fontSize: 13.5, color: "var(--text-secondary, #64748b)" },
  principal: {
    display: "grid",
    gridTemplateColumns: "minmax(240px, 300px) 1fr",
    gap: 18,
    alignItems: "stretch",
  },
  tarjetaAnillo: {
    position: "relative",
    background: "var(--surface, #fff)",
    border: "1px solid var(--border, #e2e8f0)",
    borderRadius: 16,
    padding: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
  },
  anilloCentro: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  porcentaje: { fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em" },
  anilloEtiqueta: { fontSize: 12, color: "var(--text-secondary, #64748b)", textTransform: "uppercase", letterSpacing: "0.06em" },
  tarjetas: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
  },
  tarjeta: {
    background: "var(--surface, #fff)",
    border: "1px solid var(--border, #e2e8f0)",
    borderRadius: 14,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
  },
  tarjetaIcono: { display: "flex" },
  tarjetaTitulo: { fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary, #64748b)" },
  tarjetaValor: { fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em" },
  barraObjetivo: {
    background: "var(--surface, #fff)",
    border: "1px solid var(--border, #e2e8f0)",
    borderRadius: 14,
    padding: "14px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  barraFila: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  barraEtiqueta: { fontSize: 14, fontWeight: 600 },
  editar: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid var(--border-strong, #cbd5e1)",
    background: "transparent",
    color: "inherit",
    fontSize: 13,
    cursor: "pointer",
  },
  editorFila: { display: "flex", gap: 8, flexWrap: "wrap" },
  input: {
    height: 38,
    padding: "0 12px",
    borderRadius: 8,
    border: "1px solid var(--border-strong, #cbd5e1)",
    background: "var(--surface, #fff)",
    color: "inherit",
    fontSize: 16,
    minWidth: 220,
  },
  btnGuardar: {
    padding: "0 16px",
    height: 38,
    borderRadius: 8,
    border: "none",
    background: "#1d4ed8",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  btnCancelar: {
    padding: "0 14px",
    height: 38,
    borderRadius: 8,
    border: "1px solid var(--border-strong, #cbd5e1)",
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
  },
  seccionTitulo: { fontSize: 15, fontWeight: 700, marginTop: 6 },
  tarjetaTabla: {
    background: "var(--surface, #fff)",
    border: "1px solid var(--border, #e2e8f0)",
    borderRadius: 14,
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
  },
  tabla: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: {
    textAlign: "left",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--text-secondary, #64748b)",
    padding: "12px 16px",
    background: "var(--bg, #f8fafc)",
    borderBottom: "1px solid var(--border, #e2e8f0)",
  },
  fila: { borderBottom: "1px solid var(--border, #f1f5f9)" },
  td: { padding: "14px 16px", verticalAlign: "middle" },
  puesto: {
    display: "inline-flex",
    width: 22,
    height: 22,
    borderRadius: 999,
    background: "var(--bg, #f1f5f9)",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
    marginRight: 10,
  },
  barra: {
    height: 8,
    borderRadius: 999,
    background: "var(--border, #e2e8f0)",
    overflow: "hidden",
    display: "inline-block",
    width: "calc(100% - 60px)",
    verticalAlign: "middle",
  },
  barraRelleno: { height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #3b82f6, #1d4ed8)" },
  participacion: { display: "inline-block", width: 52, textAlign: "right", fontSize: 13, color: "var(--text-secondary, #64748b)", marginLeft: 8 },
  vacio: { padding: 32, textAlign: "center", color: "var(--text-secondary, #64748b)" },
  error: { color: "var(--danger, #b91c1c)", fontSize: 13, margin: 0 },
};
