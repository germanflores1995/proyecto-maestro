import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Search, X } from "lucide-react";
import { formatearFechaHora } from "../../utils/helpers";
import { limpiarCliente } from "../../utils/ordenar";
import { TablaItems } from "./DetalleNotaCredito";
import {
  buscarPedidosVendidos,
  calcularLinea,
  cantidadTexto,
  crearNotaCredito,
  detallePedidoOdoo,
  devueltoPorLinea,
  pesos,
  pesosUnitario,
  redondear,
} from "../../lib/notasCredito";

// Nueva nota de crédito, en una ventana como «Nuevo pedido»:
// 1) buscar el pedido vendido, 2) elegir productos y cantidades, 3) revisar y confirmar.

const CSS = `
.fnc-res { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; width: 100%; text-align: left; padding: 11px 14px; border: none; border-bottom: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; font: inherit; }
.fnc-res:last-child { border-bottom: none; }
.fnc-res:hover:not(:disabled) { background: var(--primary-subtle); }
.fnc-res:disabled { cursor: not-allowed; opacity: 0.55; }
.fnc-lista { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.fnc-tabla { width: 100%; border-collapse: collapse; font-size: 13px; }
.fnc-tabla th { text-align: left; font-size: 10.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; padding: 9px 8px; background: var(--surface-container); border-bottom: 1px solid var(--border); white-space: nowrap; }
.fnc-tabla td { padding: 9px 8px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.fnc-tabla tbody tr:last-child td { border-bottom: none; }
.fnc-tabla tr.elegida td { background: var(--primary-subtle); }
.fnc-tabla tr.agotada td { color: var(--text-muted); }
.fnc-tabla .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.fnc-tabla input[type=checkbox] { width: 17px; height: 17px; cursor: pointer; }
.fnc-cant { width: 76px; text-align: right; padding: 6px 8px !important; }
.fnc-cant.mal { border-color: var(--danger) !important; }
.fnc-disp { font-size: 11px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; }
.fnc-cod { color: var(--text-muted); font-size: 11.5px; }
.fnc-buscar-prod { position: relative; margin-bottom: 10px; }
.fnc-buscar-prod input { width: 100%; padding-left: 34px; }
.fnc-buscar-prod svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
.fnc-sub-movil { display: none; }
@media (max-width: 640px) {
  .fnc-tabla .fnc-movil-no { display: none; }
  .fnc-sub-movil { display: block; font-size: 11.5px; color: var(--text-muted); margin-top: 2px; }
  .fnc-tabla th, .fnc-tabla td { padding: 8px 6px; }
  .fnc-cant { width: 62px; }
}
`;

const aNumero = (txt) => Number(String(txt).replace(",", "."));
const etiqueta = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" };

export default function FormularioNotaCredito({ onClose, onCreada }) {
  const [paso, setPaso] = useState("elegir"); // elegir | revisar
  const [texto, setTexto] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState(null);
  const [hayMas, setHayMas] = useState(false);
  const [mostrarResultados, setMostrarResultados] = useState(true);
  const [error, setError] = useState("");

  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [pedido, setPedido] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [devuelto, setDevuelto] = useState({});
  const [notasAnteriores, setNotasAnteriores] = useState(0);
  const [filtroProducto, setFiltroProducto] = useState("");
  const [elegidas, setElegidas] = useState({}); // linea_odoo_id -> texto de la cantidad
  const [guardando, setGuardando] = useState(false);

  const buscar = async () => {
    const q = texto.trim();
    if (!q) return;
    setError("");
    setBuscando(true);
    setResultados(null);
    try {
      const r = await buscarPedidosVendidos(q);
      setResultados(r.resultados || []);
      setHayMas(!!r.hay_mas);
      setMostrarResultados(true);
      // Si hay un único pedido vendido, se elige solo
      const vendidos = (r.resultados || []).filter((x) => x.vendido);
      if ((r.resultados || []).length === 1 && vendidos.length === 1) elegirPedido(vendidos[0]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBuscando(false);
    }
  };

  const elegirPedido = async (r) => {
    setError("");
    setCargandoDetalle(true);
    setMostrarResultados(false);
    try {
      const [det, prev] = await Promise.all([detallePedidoOdoo(r.odoo_id), devueltoPorLinea(r.odoo_id)]);
      setPedido(det.pedido);
      setLineas(det.lineas || []);
      setDevuelto(prev.mapa);
      setNotasAnteriores(prev.notasAnteriores);
      setElegidas({});
      setFiltroProducto("");
    } catch (e) {
      setError(e.message);
      setPedido(null);
      setMostrarResultados(true);
    } finally {
      setCargandoDetalle(false);
    }
  };

  const disponible = (l) => Math.max(0, redondear(l.cantidad - (devuelto[l.linea_odoo_id] || 0)));

  const alternarLinea = (l) =>
    setElegidas((prev) => {
      const sig = { ...prev };
      if (l.linea_odoo_id in sig) delete sig[l.linea_odoo_id];
      else sig[l.linea_odoo_id] = String(disponible(l)).replace(".", ",");
      return sig;
    });

  const cantidadValida = (l) => {
    const c = aNumero(elegidas[l.linea_odoo_id]);
    return Number.isFinite(c) && c > 0 && c <= disponible(l) + 0.00001;
  };

  const lineasVisibles = useMemo(() => {
    const q = filtroProducto.trim().toLowerCase();
    if (!q) return lineas;
    return lineas.filter((l) => l.producto.toLowerCase().includes(q) || (l.codigo || "").toLowerCase().includes(q));
  }, [lineas, filtroProducto]);

  const items = useMemo(
    () =>
      lineas
        .filter((l) => l.linea_odoo_id in elegidas)
        .map((l) => {
          const cantidad = aNumero(elegidas[l.linea_odoo_id]);
          const calc = calcularLinea(l, Number.isFinite(cantidad) ? cantidad : 0);
          return {
            linea_odoo_id: l.linea_odoo_id,
            codigo: l.codigo,
            producto: l.producto,
            cantidad_vendida: l.cantidad,
            cantidad,
            precio_unitario: l.precio_unitario,
            descuento_pct: l.descuento_pct,
            descuento: calc.descuento,
            total: calc.total,
          };
        }),
    [lineas, elegidas],
  );
  const total = redondear(items.reduce((a, i) => a + (Number.isFinite(i.total) ? i.total : 0), 0));
  const hayErrores = lineas.some((l) => l.linea_odoo_id in elegidas && !cantidadValida(l));

  const confirmar = async () => {
    setError("");
    setGuardando(true);
    try {
      const id = await crearNotaCredito({ pedido, items });
      onCreada({ id, total, cliente: pedido.cliente, numero_pedido: pedido.numero_pedido });
    } catch (e) {
      setError(e.message);
      setGuardando(false);
    }
  };

  const cerrar = () => !guardando && onClose();
  const clienteLimpio = pedido ? limpiarCliente(pedido.cliente) || pedido.cliente : "";

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && cerrar()}>
      <style>{CSS}</style>
      <div className="modal" style={{ maxWidth: 860 }}>
        <div className="modal-header">
          <h3 style={{ fontFamily: "Montserrat, sans-serif", fontSize: 16, fontWeight: 700 }}>
            {paso === "revisar" ? "Revisar nota de crédito" : "Nueva nota de crédito"}
          </h3>
          <button className="btn-icon" onClick={cerrar} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {paso === "elegir" && (
            <>
              {/* Buscador: número de pedido o cliente (igual que en Nuevo pedido) */}
              <div className="form-group">
                <label className="form-label">Pedido o cliente *</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="input"
                    placeholder="Número de pedido o nombre del cliente"
                    value={texto}
                    onChange={(e) => {
                      setTexto(e.target.value);
                      setError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !buscando) buscar();
                    }}
                    autoFocus
                    type="text"
                    name="busqueda-nc"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    data-lpignore="true"
                    data-form-type="other"
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-primary" onClick={buscar} disabled={buscando} style={{ whiteSpace: "nowrap" }}>
                    {buscando ? (
                      "Buscando..."
                    ) : (
                      <>
                        <Search size={15} /> Buscar
                      </>
                    )}
                  </button>
                </div>
                {!pedido && resultados === null && !buscando && (
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                    Solo pedidos en estado «Vendido» del último año. Escribí el número completo, los últimos dígitos o parte
                    del nombre del cliente, y tocá Buscar.
                  </p>
                )}
              </div>

              {error && (
                <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 8, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13 }}>
                  {error}
                </div>
              )}

              {/* Resultados */}
              {resultados && mostrarResultados && (
                <div className="form-group">
                  {resultados.length === 0 ? (
                    <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No hay pedidos vendidos que coincidan.</p>
                  ) : (
                    <>
                      <div className="fnc-lista">
                        {resultados.map((r) => (
                          <button
                            key={r.odoo_id}
                            className="fnc-res"
                            disabled={!r.vendido || cargandoDetalle}
                            onClick={() => elegirPedido(r)}
                            title={r.vendido ? "" : "Solo se pueden devolver pedidos en estado «Vendido»"}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {limpiarCliente(r.cliente) || r.cliente}
                              </div>
                              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                                #{r.numero_pedido} · {formatearFechaHora(r.fecha)}
                                {!r.vendido ? " · No está en «Vendido»" : ""}
                              </div>
                            </div>
                            <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{pesos(r.monto)}</div>
                          </button>
                        ))}
                      </div>
                      {hayMas && (
                        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                          Hay más resultados: escribí más para afinar la búsqueda.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {cargandoDetalle && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: 13, padding: "10px 0" }}>
                  <span className="spinner" /> Trayendo el pedido de Odoo…
                </div>
              )}

              {/* Pedido elegido */}
              {pedido && !cargandoDetalle && (
                <>
                  <div className="form-group">
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 14px",
                        borderRadius: 8,
                        background: "var(--primary-subtle)",
                        border: "1px solid var(--primary)",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ ...etiqueta, color: "var(--primary)" }}>Pedido #{pedido.numero_pedido}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--primary)" }}>{clienteLimpio}</div>
                        {clienteLimpio !== pedido.cliente && (
                          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{pedido.cliente}</div>
                        )}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ ...etiqueta, color: "var(--text-muted)" }}>Monto</div>
                        <div style={{ fontSize: 16, fontWeight: 800 }}>{pesos(pedido.monto)}</div>
                        {resultados && resultados.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setMostrarResultados(true)}
                            style={{ marginTop: 4, background: "none", border: "none", padding: 0, fontSize: 12, color: "var(--primary)", cursor: "pointer", textDecoration: "underline" }}
                          >
                            Cambiar
                          </button>
                        )}
                      </div>
                    </div>
                    {notasAnteriores > 0 && (
                      <p style={{ fontSize: 12, color: "var(--warning)", marginTop: 6 }}>
                        Este pedido ya tiene {notasAnteriores} {notasAnteriores === 1 ? "nota de crédito" : "notas de crédito"}: lo
                        ya devuelto se descuenta de lo disponible.
                      </p>
                    )}
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Productos a devolver *</label>
                    <div className="fnc-buscar-prod">
                      <Search size={15} />
                      <input
                        className="input"
                        value={filtroProducto}
                        onChange={(e) => setFiltroProducto(e.target.value)}
                        placeholder="Buscar producto o código"
                        aria-label="Buscar producto del pedido"
                      />
                    </div>
                    <div className="fnc-lista" style={{ overflowX: "auto" }}>
                      <table className="fnc-tabla">
                        <thead>
                          <tr>
                            <th style={{ width: 30 }} />
                            <th className="n fnc-movil-no">Cant.</th>
                            <th>Artículo</th>
                            <th className="n fnc-movil-no">P.U.</th>
                            <th className="n fnc-movil-no">Desc.</th>
                            <th className="n fnc-movil-no">Total</th>
                            <th className="n">A devolver</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lineasVisibles.map((l) => {
                            const disp = disponible(l);
                            const elegida = l.linea_odoo_id in elegidas;
                            const descLinea = (l.precio_unitario * l.cantidad * (l.descuento_pct || 0)) / 100;
                            return (
                              <tr key={l.linea_odoo_id} className={elegida ? "elegida" : disp <= 0 ? "agotada" : ""}>
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={elegida}
                                    disabled={disp <= 0}
                                    onChange={() => alternarLinea(l)}
                                    aria-label={`Devolver ${l.producto}`}
                                  />
                                </td>
                                <td className="n fnc-movil-no">{cantidadTexto(l.cantidad)}</td>
                                <td style={{ cursor: disp > 0 ? "pointer" : "default" }} onClick={() => disp > 0 && alternarLinea(l)}>
                                  {l.producto}
                                  {l.codigo ? <div className="fnc-cod">{l.codigo}</div> : null}
                                  <div className="fnc-sub-movil">
                                    Cant. {cantidadTexto(l.cantidad)} · {pesos(l.total)}
                                  </div>
                                </td>
                                <td className="n fnc-movil-no">{pesosUnitario(l.precio_unitario)}</td>
                                <td className="n fnc-movil-no">{descLinea ? pesos(descLinea) : "—"}</td>
                                <td className="n fnc-movil-no">{pesos(l.total)}</td>
                                <td className="n">
                                  {elegida && (
                                    <input
                                      className={`input fnc-cant${cantidadValida(l) ? "" : " mal"}`}
                                      inputMode="decimal"
                                      value={elegidas[l.linea_odoo_id]}
                                      onChange={(e) =>
                                        setElegidas((prev) => ({ ...prev, [l.linea_odoo_id]: e.target.value.replace(/[^\d.,]/g, "") }))
                                      }
                                      aria-label={`Cantidad a devolver de ${l.producto}`}
                                    />
                                  )}
                                  <div className="fnc-disp">{disp <= 0 ? "Ya devuelto" : `Disponible: ${cantidadTexto(disp)}`}</div>
                                </td>
                              </tr>
                            );
                          })}
                          {lineasVisibles.length === 0 && (
                            <tr>
                              <td colSpan={7} style={{ textAlign: "center", color: "var(--text-muted)", padding: 20 }}>
                                {lineas.length ? "Ningún producto coincide con la búsqueda" : "El pedido no tiene productos"}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {paso === "revisar" && pedido && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                <div>
                  <div style={{ ...etiqueta, color: "var(--text-muted)" }}>Cliente</div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{pedido.cliente}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ ...etiqueta, color: "var(--text-muted)" }}>Pedido</div>
                  <div style={{ fontWeight: 700 }}>#{pedido.numero_pedido}</div>
                </div>
              </div>
              <TablaItems items={items} total={total} />
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>
                Al confirmar, la nota de crédito queda pendiente para que Caja la haga en Odoo.
              </p>
              {error && (
                <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 8, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13 }}>
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer" style={{ justifyContent: "space-between", alignItems: "center" }}>
          {paso === "elegir" ? (
            <>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {hayErrores ? (
                  <span style={{ color: "var(--danger)" }}>Revisá las cantidades en rojo</span>
                ) : items.length ? (
                  <>
                    {items.length} {items.length === 1 ? "producto" : "productos"} ·{" "}
                    <b style={{ color: "var(--primary)", fontSize: 15 }}>{pesos(total)}</b>
                  </>
                ) : null}
              </span>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-ghost" onClick={cerrar}>
                  Cancelar
                </button>
                <button className="btn btn-primary" disabled={!items.length || hayErrores} onClick={() => setPaso("revisar")}>
                  Ver nota de crédito
                </button>
              </div>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => setPaso("elegir")} disabled={guardando}>
                <ArrowLeft size={15} /> Modificar
              </button>
              <button className="btn btn-primary" onClick={confirmar} disabled={guardando}>
                {guardando ? <span className="spinner" /> : <CheckCircle2 size={15} />} Confirmar nota de crédito
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
