import { useState, useEffect, useMemo } from "react";
import { Download } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { useAppData } from "../../hooks/useAppData";
import { formatearMonto } from "../../utils/helpers";
import {
  claveDia,
  entregasDelDia,
  exportarEntregas,
} from "../../lib/exportExcel";
import SelectorMes from "./SelectorMes";

const TZ = "America/Argentina/Buenos_Aires";
const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const pad = (n) => String(n).padStart(2, "0");

// Versión corta del monto para las celdas del calendario en celular
function corto(n) {
  if (n >= 1000000) return `$ ${(n / 1000000).toFixed(1).replace(".", ",")} M`;
  if (n >= 1000) return `$ ${Math.round(n / 1000)} mil`;
  return formatearMonto(n);
}

function diaLargo(dia) {
  const t = new Date(`${dia}T12:00:00-03:00`).toLocaleDateString("es-AR", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function horaEntrega(fecha) {
  return new Date(fecha).toLocaleTimeString("es-AR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const CSS = `
.me-pagina { padding: 20px 20px 60px; max-width: 1100px; margin: 0 auto; }
.me-titulo { font-family: Montserrat, sans-serif; font-size: 24px; font-weight: 800; margin: 0; }
.me-subtitulo { color: var(--text-secondary); font-size: 13.5px; margin-top: 3px; }
.me-encabezado { margin-bottom: 20px; }
.me-barra { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; margin-bottom: 16px; }
.me-kpis { display: flex; gap: 12px; flex-wrap: wrap; }

.me-kpi { padding: 10px 16px; min-width: 120px; }
.me-kpi-etiqueta { font-size: 10.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 3px; }
.me-kpi-valor { font-family: Montserrat, sans-serif; font-size: 17px; font-weight: 800; color: var(--primary); }

.me-semana, .me-calendario { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
.me-semana { margin-bottom: 6px; }
.me-calendario { margin-bottom: 20px; }
.me-dia-sem { text-align: center; font-size: 11.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }

.me-celda { min-height: 78px; padding: 7px 8px; border-radius: 9px; cursor: pointer; display: flex; flex-direction: column; gap: 3px; overflow: hidden; min-width: 0; }
.me-celda-cab { display: flex; justify-content: space-between; align-items: center; gap: 4px; min-width: 0; }
.me-celda-num { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); }
.me-celda-hoy { font-weight: 800; color: var(--primary); }
.me-monto { font-size: 12.5px; font-weight: 700; }
.me-monto-corto { display: none; }
.me-cant { font-size: 11px; }

.me-tag { font-size: 9.5px; font-weight: 600; padding: 1px 6px; border-radius: 999px; white-space: nowrap; }
.me-tag-gris { background: var(--surface); color: var(--text-muted); border: 1px solid var(--border); }
.me-tag-aviso { background: var(--warning-bg); color: var(--warning); }

.me-detalle { padding: 16px; }
.me-detalle-cab { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
.me-detalle-titulo { font-family: Montserrat, sans-serif; font-size: 16px; font-weight: 700; }
.me-detalle-sub { font-size: 13px; color: var(--text-secondary); margin-top: 2px; }
.me-lista { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-bottom: 14px; }
.me-fila { display: flex; align-items: center; gap: 10px; padding: 9px 12px; font-size: 12.5px; }
.me-fila + .me-fila { border-top: 1px solid var(--border); }
.me-fila-num { flex: 0 0 120px; font-weight: 700; }
.me-fila-cliente { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.me-fila-vend { flex: 0 0 90px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.me-fila-hora { flex: 0 0 48px; color: var(--text-muted); }
.me-fila-monto { flex: 0 0 110px; text-align: right; font-weight: 600; }
.me-admin-titulo { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 8px; }
.me-marcas { display: flex; gap: 8px; flex-wrap: wrap; }

@media (max-width: 640px) {
  .me-pagina { padding: 12px 12px 40px !important; }
  .me-titulo { font-size: 20px !important; }
  .me-subtitulo { font-size: 12.5px; }
  .me-encabezado { margin-bottom: 14px; }
  .me-barra { flex-direction: column; align-items: stretch; gap: 10px; margin-bottom: 12px; }
  .me-barra > .sm-raiz { align-self: flex-start; }
  .me-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .me-kpi { min-width: 0 !important; padding: 8px 6px !important; }
  .me-kpi-etiqueta { font-size: 9px !important; letter-spacing: 0 !important; margin-bottom: 2px !important; }
  .me-kpi-valor { font-size: 13px !important; overflow-wrap: anywhere; }
  .me-semana, .me-calendario { gap: 4px; }
  .me-semana { margin-bottom: 4px; }
  .me-calendario { margin-bottom: 14px; }
  .me-dia-sem { font-size: 10px; }
  .me-celda { min-height: 56px; padding: 4px; gap: 2px; border-radius: 7px; }
  .me-celda-num { font-size: 11px; }
  .me-monto-largo { display: none; }
  .me-monto-corto { display: block; font-size: 10px; font-weight: 700; }
  .me-monto { font-size: 10px; }
  .me-cant, .me-tag { display: none; }
  .me-detalle { padding: 12px; }
  .me-detalle-titulo { font-size: 14.5px; }
  .me-detalle-cab { flex-direction: column; align-items: flex-start; }
  .me-fila {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas: "num cliente monto" "vend vend hora";
    gap: 2px 10px;
    padding: 8px 10px;
    font-size: 12px;
  }
  .me-fila-num { grid-area: num; flex: none; }
  .me-fila-cliente { grid-area: cliente; flex: none; }
  .me-fila-monto { grid-area: monto; flex: none; }
  .me-fila-vend { grid-area: vend; flex: none; font-size: 11px; }
  .me-fila-hora { grid-area: hora; flex: none; font-size: 11px; }
  .me-marcas button { padding: 6px 10px !important; font-size: 12px !important; }
}
`;

export default function MetricasView() {
  const { esAdmin, puedeVerMetricas, puedeExportarExcel, perfil } = useAuth();
  const { pedidos, usuariosMap, loading } = useAppData();

  const hoy = claveDia(new Date());
  const [anio, setAnio] = useState(parseInt(hoy.slice(0, 4), 10));
  const [mes, setMes] = useState(parseInt(hoy.slice(5, 7), 10) - 1);
  const [seleccion, setSeleccion] = useState(hoy);
  const [especiales, setEspeciales] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .from("dias_especiales")
      .select("*")
      .then(({ data }) => {
        const m = {};
        (data || []).forEach((d) => (m[d.fecha] = d.tipo));
        setEspeciales(m);
      });
  }, []);

  // Totales por día (solo pedidos entregados; los cancelados no cuentan)
  const porDia = useMemo(() => {
    const acc = {};
    pedidos.forEach((p) => {
      if (p.estado !== "entregado" || !p.entregado_at) return;
      const k = claveDia(p.entregado_at);
      if (!acc[k]) acc[k] = { cantidad: 0, total: 0 };
      acc[k].cantidad += 1;
      acc[k].total += Number(p.monto) || 0;
    });
    return acc;
  }, [pedidos]);

  if (!puedeVerMetricas) {
    return (
      <div style={{ padding: 40, color: "var(--text-secondary)" }}>
        No tenés acceso a esta sección.
      </div>
    );
  }

  const prefijo = `${anio}-${pad(mes + 1)}-`;
  const delMes = Object.entries(porDia).filter(([k]) => k.startsWith(prefijo));
  const totalMes = delMes.reduce((a, [, v]) => a + v.total, 0);
  const pedidosMes = delMes.reduce((a, [, v]) => a + v.cantidad, 0);
  const promedio = delMes.length ? totalMes / delMes.length : 0;

  const primerDow = (new Date(Date.UTC(anio, mes, 1)).getUTCDay() + 6) % 7;
  const diasMes = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  const celdas = [];
  for (let i = 0; i < primerDow; i++) celdas.push(null);
  for (let d = 1; d <= diasMes; d++) celdas.push(d);

  // Cambio de mes desde el calendario (flechas o grilla de meses)
  const cambiarPeriodo = ({ anio: nuevoAnio, mes: nuevoMes }) => {
    setAnio(nuevoAnio);
    setMes(nuevoMes - 1);
    setSeleccion(null);
  };

  const lista = seleccion ? entregasDelDia(pedidos, seleccion) : [];
  const resumenSel = seleccion ? porDia[seleccion] : null;
  const tipoSel = seleccion ? especiales[seleccion] || "normal" : "normal";

  const marcarDia = async (tipo) => {
    setGuardando(true);
    setError("");
    try {
      if (tipo === "normal") {
        const { error: err } = await supabase
          .from("dias_especiales")
          .delete()
          .eq("fecha", seleccion);
        if (err) throw err;
        setEspeciales((prev) => {
          const n = { ...prev };
          delete n[seleccion];
          return n;
        });
      } else {
        const { error: err } = await supabase
          .from("dias_especiales")
          .upsert({ fecha: seleccion, tipo });
        if (err) throw err;
        setEspeciales((prev) => ({ ...prev, [seleccion]: tipo }));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const bajarExcelDia = async () => {
    setExportando(true);
    setError("");
    try {
      const ok = await exportarEntregas(
        pedidos,
        usuariosMap,
        seleccion,
        perfil?.nombre,
      );
      if (!ok) setError("No hay entregas en ese día.");
    } catch (e) {
      console.error(e);
      setError("No se pudo generar el Excel. Intentá de nuevo.");
    } finally {
      setExportando(false);
    }
  };

  const opcionesMarca = [
    { v: "normal", l: "Día normal" },
    { v: "no_laboral", l: "No laboral" },
    { v: "medio_dia", l: "Medio día" },
  ];

  return (
    <div className="me-pagina">
      <style>{CSS}</style>

      <div className="me-encabezado">
        <h2 className="me-titulo">Métricas</h2>
        <p className="me-subtitulo">Entregas por día. Solo cuentan los pedidos entregados.</p>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <span className="spinner" style={{ width: 24, height: 24 }} />
        </div>
      ) : (
        <>
          <div className="me-barra">
            <SelectorMes anio={anio} mes={mes + 1} onChange={cambiarPeriodo} />
            <div className="me-kpis">
              <Kpi label="Total del mes" value={formatearMonto(totalMes)} />
              <Kpi label="Pedidos" value={pedidosMes} />
              <Kpi label="Promedio por día" value={formatearMonto(promedio)} />
            </div>
          </div>

          <div className="me-semana">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="me-dia-sem">{d}</div>
            ))}
          </div>

          <div className="me-calendario">
            {celdas.map((d, i) => {
              if (d === null) return <div key={`v${i}`} />;
              const key = `${prefijo}${pad(d)}`;
              const dow = (primerDow + d - 1) % 7;
              const domingo = dow === 6;
              const tipo = especiales[key];
              const apagado = domingo || tipo === "no_laboral";
              const info = porDia[key];
              const activo = seleccion === key;
              return (
                <div
                  key={key}
                  onClick={() => setSeleccion(key)}
                  className="me-celda"
                  style={{
                    border: activo
                      ? "1.5px solid var(--primary)"
                      : "1px solid var(--border)",
                    background: activo
                      ? "var(--primary-subtle)"
                      : apagado
                        ? "var(--surface-container)"
                        : "var(--surface)",
                    opacity: apagado && !activo && !info ? 0.6 : 1,
                  }}
                >
                  <div className="me-celda-cab">
                    <span className={`me-celda-num${key === hoy ? " me-celda-hoy" : ""}`}>{d}</span>
                    {tipo === "no_laboral" && (
                      <span className="me-tag me-tag-gris">No laboral</span>
                    )}
                    {tipo === "medio_dia" && (
                      <span className="me-tag me-tag-aviso">Medio día</span>
                    )}
                  </div>
                  {info && (
                    <>
                      <span className="me-monto me-monto-largo">{formatearMonto(info.total)}</span>
                      <span className="me-monto me-monto-corto">{corto(info.total)}</span>
                      <span className="me-cant">
                        {info.cantidad} pedido{info.cantidad !== 1 ? "s" : ""}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {seleccion && (
            <div className="card me-detalle">
              <div className="me-detalle-cab">
                <div>
                  <div className="me-detalle-titulo">{diaLargo(seleccion)}</div>
                  <div className="me-detalle-sub">
                    {resumenSel
                      ? `${resumenSel.cantidad} pedido${resumenSel.cantidad !== 1 ? "s" : ""} · ${formatearMonto(resumenSel.total)}`
                      : "Sin entregas este día"}
                  </div>
                </div>
                {puedeExportarExcel && resumenSel && (
                  <button
                    className="btn btn-ghost"
                    onClick={bajarExcelDia}
                    disabled={exportando}
                  >
                    {exportando ? (
                      <>
                        <span className="spinner" />
                        Generando...
                      </>
                    ) : (
                      <>
                        <Download size={15} /> Excel del día
                      </>
                    )}
                  </button>
                )}
              </div>

              {lista.length > 0 && (
                <div className="me-lista">
                  {lista.map((p) => (
                    <div key={p.id} className="me-fila">
                      <span className="me-fila-num">#{p.numero_pedido}</span>
                      <span className="me-fila-cliente">{p.cliente_nombre || "—"}</span>
                      <span className="me-fila-vend">{usuariosMap[p.vendedor_id]?.nombre || "—"}</span>
                      <span className="me-fila-hora">{horaEntrega(p.entregado_at)}</span>
                      <span className="me-fila-monto">
                        {p.monto != null ? formatearMonto(p.monto) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {esAdmin && (
                <div>
                  <div className="me-admin-titulo">Marcar este día (solo admin)</div>
                  <div className="me-marcas">
                    {opcionesMarca.map((o) => {
                      const activo = tipoSel === o.v;
                      return (
                        <button
                          key={o.v}
                          onClick={() => !activo && marcarDia(o.v)}
                          disabled={guardando}
                          style={{
                            padding: "8px 14px",
                            borderRadius: 8,
                            fontSize: 12.5,
                            fontWeight: activo ? 700 : 500,
                            border: `1px solid ${activo ? "var(--primary)" : "var(--border)"}`,
                            background: activo
                              ? "var(--primary-subtle)"
                              : "transparent",
                            color: activo
                              ? "var(--primary)"
                              : "var(--text-secondary)",
                            cursor: "pointer",
                          }}
                        >
                          {o.l}
                        </button>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
                    Es solo una marca visual en el calendario. No cambia los
                    horarios ni borra entregas.
                  </p>
                </div>
              )}

              {error && <p className="form-error">{error}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="card me-kpi">
      <div className="me-kpi-etiqueta">{label}</div>
      <div className="me-kpi-valor">{value}</div>
    </div>
  );
}
