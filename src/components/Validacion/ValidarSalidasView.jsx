import { useMemo, useState } from "react";
import { ClipboardCheck, Search } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { limpiarCliente } from "../../utils/ordenar";
import { formatearHora } from "../../utils/helpers";

// Validar salidas de mercadería en Odoo.
// Toma los pedidos que se entregaron en la app ese día y muestra cómo está su entrega en Odoo.
// «Simular» no escribe nada. «Validar» comprueba la disponibilidad y, si está todo reservado,
// valida la entrega; si falta stock la deja pendiente (no fuerza nada).

const TZ = "America/Argentina/Buenos_Aires";
const TANDA = 25; // pedidos por consulta a Odoo
const TANDA_VALIDAR = 10; // pedidos por tanda al simular/validar
const CANDIDATAS = ["pendiente", "sin_stock"];

const hoyAR = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });

// Inicio y fin del día en hora de Buenos Aires (UTC-3, sin horario de verano)
function rangoDelDia(fecha) {
  const desde = new Date(`${fecha}T00:00:00-03:00`);
  const hasta = new Date(desde.getTime() + 24 * 60 * 60 * 1000);
  return [desde.toISOString(), hasta.toISOString()];
}

const RESULTADOS = {
  pendiente: { label: "Pendiente de validar", tono: "warning" },
  sin_stock: { label: "Sin stock reservado", tono: "danger" },
  borrador: { label: "Entrega en borrador", tono: "danger" },
  validada: { label: "Validada", tono: "success" },
  sin_entrega: { label: "Sin entrega en Odoo", tono: "neutro" },
  cancelada: { label: "Entrega cancelada", tono: "neutro" },
  no_encontrado: { label: "No está en Odoo", tono: "neutro" },
};
const ORDEN_RESULTADOS = ["pendiente", "sin_stock", "borrador", "validada", "sin_entrega", "cancelada", "no_encontrado"];

const ESTADO_ENTREGA = {
  draft: "Borrador",
  waiting: "Esperando otra operación",
  confirmed: "En espera",
  assigned: "Lista",
  done: "Hecha",
  cancel: "Cancelada",
};

const ACCIONES = {
  validada: { texto: "✓ Se validó ahora en Odoo", tono: "success" },
  se_validaria: { texto: "Se validaría (está todo reservado)", tono: "success" },
  se_comprobaria: { texto: "Se comprobaría la disponibilidad y se validaría si alcanza el stock", tono: "warning" },
  sin_stock: { texto: "Se comprobó la disponibilidad: sigue faltando stock. Queda pendiente para hacerlo a mano.", tono: "danger" },
  error: { texto: "No se pudo validar", tono: "danger" },
};

const CSS = `
.vs-pagina { padding: 20px 20px 60px; max-width: 1200px; margin: 0 auto; }
.vs-titulo { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.vs-prueba { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px; background: var(--warning-bg); color: var(--warning); letter-spacing: 0.03em; }
.vs-aviso { margin: 14px 0 18px; padding: 11px 14px; border-radius: 10px; background: var(--surface-container); border-left: 3px solid var(--primary); font-size: 13px; color: var(--text-secondary); }
.vs-controles { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; margin-bottom: 18px; }
.vs-campo { display: flex; flex-direction: column; gap: 5px; }
.vs-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.vs-chip { border: 1px solid var(--border); background: var(--surface); color: var(--text-secondary); border-radius: 999px; padding: 6px 13px; font-size: 12.5px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; }
.vs-chip:hover { border-color: var(--primary); }
.vs-chip-activo { border-color: var(--primary); background: var(--primary-subtle); color: var(--primary); }
.vs-chip b { font-variant-numeric: tabular-nums; }
.vs-tabla { overflow: hidden; }
.vs-cab, .vs-fila { display: grid; grid-template-columns: 150px minmax(0, 1.4fr) 80px minmax(0, 1.2fr) minmax(0, 1.5fr); gap: 14px; padding: 12px 18px; align-items: center; }
.vs-cab { background: var(--surface-container); border-bottom: 1px solid var(--border); font-size: 10.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.vs-fila { border-bottom: 1px solid var(--border); font-size: 13px; }
.vs-fila:last-child { border-bottom: none; }
.vs-num { font-weight: 700; }
.vs-sub { font-size: 11.5px; color: var(--text-muted); }
.vs-cliente { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vs-detalle { font-size: 11.5px; color: var(--text-secondary); margin-top: 4px; line-height: 1.35; }
.vs-insignia { display: inline-flex; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
.vs-t-success { background: var(--success-bg); color: var(--success); }
.vs-t-warning { background: var(--warning-bg); color: var(--warning); }
.vs-t-danger { background: var(--danger-bg); color: var(--danger); }
.vs-t-neutro { background: var(--surface-container); color: var(--text-secondary); }
.vs-error { margin-bottom: 16px; padding: 11px 14px; border-radius: 10px; background: var(--danger-bg); color: var(--danger); font-size: 13px; }
.vs-pie { margin-top: 10px; font-size: 11.5px; color: var(--text-muted); }
.vs-et-movil { display: none; }
.vs-acciones { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 0 14px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.vs-acciones .vs-sel { font-size: 12.5px; color: var(--text-secondary); margin-right: auto; }
.vs-link { background: none; border: none; color: var(--primary); font-size: 12px; font-weight: 600; cursor: pointer; padding: 0 4px; }
.vs-confirma { margin: 0 0 14px; padding: 14px; border-radius: 12px; border: 1px solid var(--warning); background: var(--warning-bg); font-size: 13px; color: var(--text); }
.vs-confirma-btns { display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
.vs-resumen { margin: 0 0 14px; padding: 11px 14px; border-radius: 10px; background: var(--surface-container); font-size: 13px; color: var(--text-secondary); }
.vs-chk { display: inline-flex; align-items: center; gap: 8px; }
.vs-chk input { width: 16px; height: 16px; cursor: pointer; }
.vs-t-txt-success { color: var(--success); }
.vs-t-txt-warning { color: var(--warning); }
.vs-t-txt-danger { color: var(--danger); }

@media (max-width: 760px) {
  .vs-pagina { padding: 12px 12px 40px; }
  .vs-cab { display: none; }
  .vs-fila { grid-template-columns: 1fr; gap: 5px; padding: 12px; }
  .vs-et-movil { display: inline; color: var(--text-muted); font-weight: 600; }
  .vs-controles .btn { flex: 1; }
  .vs-campo { flex: 1 1 100%; }
  .vs-acciones .btn { flex: 1; }
}
`;

async function llamarFuncion(body) {
  const { data, error } = await supabase.functions.invoke("validar-salidas-odoo", { body });
  if (error) {
    let mensaje = "No se pudo consultar Odoo.";
    if (error.context?.status === 404) {
      mensaje = "La función «validar-salidas-odoo» todavía no está instalada en Supabase.";
    } else {
      try {
        const cuerpo = await error.context.json();
        if (typeof cuerpo?.error === "string") mensaje = cuerpo.error;
      } catch {
        /* se deja el mensaje general */
      }
    }
    throw new Error(mensaje);
  }
  if (data?.error) throw new Error(data.error);
  return data?.resultados || [];
}

const consultarOdoo = (numeros) => llamarFuncion({ accion: "listar", numeros });
const validarOdoo = (numeros, simular) => llamarFuncion({ accion: "validar", numeros, simular });

const cantidad = (n) => String(Math.round(n * 100) / 100).replace(".", ",");

export default function ValidarSalidasView() {
  const { esAdmin } = useAuth();
  const [fecha, setFecha] = useState(hoyAR);
  const [cargando, setCargando] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [error, setError] = useState("");
  const [filas, setFilas] = useState(null); // null = todavía no se consultó
  const [consultadoEl, setConsultadoEl] = useState(null);
  const [filtro, setFiltro] = useState("todos");
  const [seleccion, setSeleccion] = useState(new Set());
  const [ejecutando, setEjecutando] = useState(null); // "simular" | "validar" | null
  const [confirmando, setConfirmando] = useState(false);
  const [resumen, setResumen] = useState(null);

  const consultar = async () => {
    setError("");
    setCargando(true);
    setFilas(null);
    setFiltro("todos");
    setResumen(null);
    setConfirmando(false);
    try {
      const [desde, hasta] = rangoDelDia(fecha);
      const { data: peds, error: errPedidos } = await supabase
        .from("pedidos")
        .select("id, numero_pedido, cliente_nombre, entregado_at")
        .eq("estado", "entregado")
        .gte("entregado_at", desde)
        .lt("entregado_at", hasta)
        .order("entregado_at", { ascending: true });
      if (errPedidos) throw new Error(`No se pudieron leer los pedidos de la app: ${errPedidos.message}`);

      const numeros = (peds || []).map((p) => p.numero_pedido);
      const porNumero = {};
      for (let i = 0; i < numeros.length; i += TANDA) {
        setProgreso({ hecho: i, total: numeros.length });
        const res = await consultarOdoo(numeros.slice(i, i + TANDA));
        res.forEach((r) => {
          porNumero[r.numero] = r;
        });
      }
      const nuevas = (peds || []).map((p) => ({
        pedido: p,
        odoo: porNumero[p.numero_pedido] || { clasificacion: "no_encontrado", entregas: [], faltantes: [] },
      }));
      setFilas(nuevas);
      setSeleccion(
        new Set(nuevas.filter((f) => CANDIDATAS.includes(f.odoo.clasificacion)).map((f) => f.pedido.numero_pedido)),
      );
      setConsultadoEl(new Date());
    } catch (e) {
      setError(e.message || "No se pudo completar la consulta.");
    } finally {
      setCargando(false);
      setProgreso(null);
    }
  };

  // Pedidos marcados que todavía se pueden validar
  const marcados = useMemo(
    () =>
      (filas || []).filter(
        (f) => seleccion.has(f.pedido.numero_pedido) && CANDIDATAS.includes(f.odoo.clasificacion),
      ),
    [filas, seleccion],
  );
  const candidatas = useMemo(
    () => (filas || []).filter((f) => CANDIDATAS.includes(f.odoo.clasificacion)),
    [filas],
  );

  const alternar = (numero) =>
    setSeleccion((prev) => {
      const sig = new Set(prev);
      if (sig.has(numero)) sig.delete(numero);
      else sig.add(numero);
      return sig;
    });

  // Simula o valida los pedidos marcados, en tandas. Si una tanda falla, se corta y se muestra lo hecho.
  const ejecutar = async (simular) => {
    const numeros = marcados.map((f) => f.pedido.numero_pedido);
    if (!numeros.length) return;
    setError("");
    setConfirmando(false);
    setResumen(null);
    setEjecutando(simular ? "simular" : "validar");
    const cuenta = {};
    let hechos = 0;
    try {
      for (let i = 0; i < numeros.length; i += TANDA_VALIDAR) {
        setProgreso({ hecho: i, total: numeros.length, paso: TANDA_VALIDAR });
        const res = await validarOdoo(numeros.slice(i, i + TANDA_VALIDAR), simular);
        const porNumero = {};
        res.forEach((r) => {
          porNumero[r.numero] = r;
          cuenta[r.accion] = (cuenta[r.accion] || 0) + 1;
        });
        hechos += res.length;
        setFilas((prev) =>
          prev.map((f) => (porNumero[f.pedido.numero_pedido] ? { ...f, odoo: porNumero[f.pedido.numero_pedido] } : f)),
        );
      }
    } catch (e) {
      setError(
        `${e.message || "Se cortó el proceso."} Se llegaron a procesar ${hechos} de ${numeros.length} pedidos; lo ya hecho en Odoo queda hecho.`,
      );
    } finally {
      setEjecutando(null);
      setProgreso(null);
      setResumen({ simular, cuenta, total: numeros.length });
    }
  };

  const conteos = useMemo(() => {
    const c = {};
    (filas || []).forEach((f) => {
      c[f.odoo.clasificacion] = (c[f.odoo.clasificacion] || 0) + 1;
    });
    return c;
  }, [filas]);

  const visibles = useMemo(
    () => (filas || []).filter((f) => filtro === "todos" || f.odoo.clasificacion === filtro),
    [filas, filtro],
  );

  if (!esAdmin) return null;

  return (
    <div className="vs-pagina">
      <style>{CSS}</style>

      <div className="vs-titulo">
        <ClipboardCheck size={24} />
        <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: 24, fontWeight: 800, margin: 0 }}>
          Validar salidas
        </h2>
        <span className="vs-prueba">EN PRUEBA · SOLO ADMINISTRADOR</span>
      </div>

      <div className="vs-aviso">
        Elegí un día y se revisa en Odoo el estado de la salida de mercadería de los pedidos que se entregaron en la
        app ese día. <strong>«Simular» no modifica nada.</strong> «Validar» comprueba la disponibilidad en Odoo y, si
        está todo reservado, valida la entrega; si falta stock la deja pendiente para hacerla a mano.
      </div>

      <div className="vs-controles">
        <div className="vs-campo">
          <label className="form-label" style={{ margin: 0 }}>
            Día de entrega
          </label>
          <input
            className="input"
            type="date"
            value={fecha}
            max={hoyAR()}
            onChange={(e) => setFecha(e.target.value)}
            style={{ width: 190 }}
          />
        </div>
        <button className="btn btn-primary" onClick={consultar} disabled={cargando || !fecha || !!ejecutando}>
          {cargando ? (
            <>
              <span className="spinner" /> Consultando…
            </>
          ) : (
            <>
              <Search size={15} /> Consultar
            </>
          )}
        </button>
        {progreso && (
          <span style={{ fontSize: 12.5, color: "var(--text-muted)", paddingBottom: 10 }}>
            {ejecutando ? (ejecutando === "validar" ? "Validando en Odoo…" : "Simulando…") : "Revisando Odoo…"}{" "}
            {Math.min(progreso.hecho + (progreso.paso || TANDA), progreso.total)} de {progreso.total}
          </span>
        )}
      </div>

      {error && <div className="vs-error">{error}</div>}

      {filas && filas.length === 0 && (
        <div className="empty-state">
          <ClipboardCheck size={34} />
          <p style={{ fontSize: 14, fontWeight: 600 }}>No hubo pedidos entregados ese día</p>
          <p style={{ fontSize: 12.5 }}>Probá con otra fecha.</p>
        </div>
      )}

      {filas && filas.length > 0 && (
        <>
          {candidatas.length > 0 && (
            <>
              <div className="vs-acciones">
                <span className="vs-sel">
                  <b>{marcados.length}</b> de {candidatas.length} pedidos pendientes marcados
                  <button
                    className="vs-link"
                    disabled={!!ejecutando}
                    onClick={() => setSeleccion(new Set(candidatas.map((f) => f.pedido.numero_pedido)))}
                  >
                    Marcar todos
                  </button>
                  <button className="vs-link" disabled={!!ejecutando} onClick={() => setSeleccion(new Set())}>
                    Ninguno
                  </button>
                </span>
                <button
                  className="btn btn-ghost"
                  disabled={!marcados.length || !!ejecutando}
                  onClick={() => ejecutar(true)}
                >
                  {ejecutando === "simular" ? <span className="spinner" /> : null} Simular
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!marcados.length || !!ejecutando}
                  onClick={() => setConfirmando(true)}
                >
                  {ejecutando === "validar" ? <span className="spinner" /> : <ClipboardCheck size={15} />} Validar en
                  Odoo
                </button>
              </div>

              {confirmando && (
                <div className="vs-confirma">
                  <strong>
                    Se van a validar en Odoo hasta {marcados.length} {marcados.length === 1 ? "pedido" : "pedidos"}.
                  </strong>
                  <div style={{ marginTop: 4 }}>
                    Para cada uno se comprueba la disponibilidad y, si está todo reservado, se valida la entrega. Los
                    que no tengan stock se saltean y quedan pendientes. Esta acción escribe en Odoo.
                  </div>
                  <div className="vs-confirma-btns">
                    <button className="btn btn-primary" onClick={() => ejecutar(false)}>
                      Sí, validar
                    </button>
                    <button className="btn btn-ghost" onClick={() => setConfirmando(false)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {resumen && (
            <div className="vs-resumen">
              {resumen.simular ? (
                <>
                  <strong>Simulación terminada (no se modificó nada en Odoo).</strong>{" "}
                  {resumen.cuenta.se_validaria ? `${resumen.cuenta.se_validaria} se validarían. ` : ""}
                  {resumen.cuenta.se_comprobaria
                    ? `${resumen.cuenta.se_comprobaria} sin stock reservado: se comprobaría la disponibilidad. `
                    : ""}
                  {resumen.cuenta.sin_cambios ? `${resumen.cuenta.sin_cambios} sin cambios.` : ""}
                </>
              ) : (
                <>
                  <strong>Listo.</strong> {resumen.cuenta.validada || 0} validados ·{" "}
                  {resumen.cuenta.sin_stock || 0} sin stock (pendientes, hacerlos a mano) ·{" "}
                  {resumen.cuenta.error || 0} con error
                  {resumen.cuenta.sin_cambios ? ` · ${resumen.cuenta.sin_cambios} sin cambios` : ""}.
                </>
              )}
            </div>
          )}

          <div className="vs-chips">
            <button
              className={`vs-chip${filtro === "todos" ? " vs-chip-activo" : ""}`}
              onClick={() => setFiltro("todos")}
            >
              Todos <b>{filas.length}</b>
            </button>
            {ORDEN_RESULTADOS.filter((k) => conteos[k]).map((k) => (
              <button
                key={k}
                className={`vs-chip${filtro === k ? " vs-chip-activo" : ""}`}
                onClick={() => setFiltro(filtro === k ? "todos" : k)}
              >
                {RESULTADOS[k].label} <b>{conteos[k]}</b>
              </button>
            ))}
          </div>

          <div className="card vs-tabla">
            <div className="vs-cab">
              <div>Pedido</div>
              <div>Cliente</div>
              <div>Hora</div>
              <div>Entrega en Odoo</div>
              <div>Resultado</div>
            </div>
            {visibles.map(({ pedido, odoo }) => {
              const res = RESULTADOS[odoo.clasificacion] || RESULTADOS.no_encontrado;
              const faltantes = odoo.faltantes || [];
              return (
                <div key={pedido.id} className="vs-fila">
                  <div className="vs-chk">
                    {CANDIDATAS.includes(odoo.clasificacion) && (
                      <input
                        type="checkbox"
                        checked={seleccion.has(pedido.numero_pedido)}
                        disabled={!!ejecutando}
                        onChange={() => alternar(pedido.numero_pedido)}
                        aria-label={`Marcar el pedido ${pedido.numero_pedido}`}
                      />
                    )}
                    <div>
                      <div className="vs-num">#{pedido.numero_pedido}</div>
                      {odoo.estado_odoo && <div className="vs-sub">Pedido en Odoo: {odoo.estado_odoo}</div>}
                    </div>
                  </div>
                  <div className="vs-cliente" title={pedido.cliente_nombre || ""}>
                    {limpiarCliente(pedido.cliente_nombre) || "—"}
                  </div>
                  <div className="vs-sub">
                    <span className="vs-et-movil">Entregado a las </span>
                    {formatearHora(pedido.entregado_at)}
                  </div>
                  <div>
                    {odoo.entregas?.length ? (
                      odoo.entregas.map((e) => (
                        <div key={e.id} className="vs-sub" style={{ color: "var(--text-secondary)" }}>
                          {e.name} · {ESTADO_ENTREGA[e.state] || e.state}
                        </div>
                      ))
                    ) : (
                      <span className="vs-sub">—</span>
                    )}
                  </div>
                  <div>
                    <span className={`vs-insignia vs-t-${res.tono}`}>{res.label}</span>
                    {ACCIONES[odoo.accion] && (
                      <div className={`vs-detalle vs-t-txt-${ACCIONES[odoo.accion].tono}`} style={{ fontWeight: 600 }}>
                        {ACCIONES[odoo.accion].texto}
                        {odoo.accion === "error" && odoo.detalle ? `: ${odoo.detalle}` : ""}
                      </div>
                    )}
                    {faltantes.length > 0 && (
                      <div className="vs-detalle">
                        Faltan:{" "}
                        {faltantes
                          .slice(0, 3)
                          .map((f) => `${cantidad(f.faltan)} × ${f.producto}`)
                          .join(", ")}
                        {faltantes.length > 3 ? ` y ${faltantes.length - 3} más` : ""}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="vs-pie">
            Consultado a las {formatearHora(consultadoEl)} · {visibles.length} de {filas.length} pedidos
          </div>
        </>
      )}

    </div>
  );
}
