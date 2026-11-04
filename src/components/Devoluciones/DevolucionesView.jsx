import { useState, useEffect, useCallback } from 'react'
import { Plus, Undo2, X, Check, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { MOTIVOS_DEVOLUCION, ESTADOS_DEVOLUCION } from '../../utils/constants'
import { formatearFechaHora, formatearMonto, coincideNumero } from '../../utils/helpers'

export default function DevolucionesView() {
  const [devoluciones, setDevoluciones] = useState([])
  const [clientes, setClientes] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('todas')
  const [mostrarNueva, setMostrarNueva] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    const [devRes, clientesRes, usuariosRes] = await Promise.all([
      supabase.from('devoluciones').select('*, pedido:pedidos(numero_pedido, cliente_id), articulos:devolucion_articulos(*)').order('created_at', { ascending: false }),
      supabase.from('clientes').select('*'),
      supabase.from('usuarios').select('*')
    ])
    setDevoluciones(devRes.data || [])
    setClientes(clientesRes.data || [])
    setUsuarios(usuariosRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const clientesMap = Object.fromEntries(clientes.map(c => [c.id, c]))
  const usuariosMap = Object.fromEntries(usuarios.map(u => [u.id, u]))

  const filtradas = filtroEstado === 'todas' ? devoluciones : devoluciones.filter(d => d.estado === filtroEstado)

  return (
    <div style={{ padding: '20px 20px 60px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 14, marginBottom: 22 }}>
        <div>
          <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 24, fontWeight: 800 }}>Devoluciones</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, marginTop: 3 }}>Gestión interna de notas de crédito y cambios.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setMostrarNueva(true)}>
          <Plus size={16} /> Nueva devolución
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {[{ k: 'todas', l: 'Todas' }, { k: 'pendiente', l: 'Pendientes' }, { k: 'procesada', l: 'Procesadas' }].map(f => (
          <button key={f.k} onClick={() => setFiltroEstado(f.k)} style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            border: `1px solid ${filtroEstado === f.k ? 'var(--primary)' : 'var(--border)'}`,
            background: filtroEstado === f.k ? 'var(--primary-subtle)' : 'transparent',
            color: filtroEstado === f.k ? 'var(--primary)' : 'var(--text-secondary)'
          }}>
            {f.l}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" style={{ width: 24, height: 24 }} /></div>
      ) : filtradas.length === 0 ? (
        <div className="empty-state">
          <Undo2 size={36} />
          <p style={{ fontSize: 14, fontWeight: 600 }}>No hay devoluciones</p>
          <p style={{ fontSize: 12.5 }}>Creá una devolución desde un pedido entregado.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtradas.map(d => (
            <DevolucionCard key={d.id} devolucion={d} cliente={clientesMap[d.pedido?.cliente_id]} usuariosMap={usuariosMap} />
          ))}
        </div>
      )}

      {mostrarNueva && (
        <NuevaDevolucion onClose={() => setMostrarNueva(false)} onSuccess={cargar} />
      )}
    </div>
  )
}

function DevolucionCard({ devolucion: d, cliente, usuariosMap }) {
  const estado = ESTADOS_DEVOLUCION[d.estado]
  const motivo = MOTIVOS_DEVOLUCION[d.motivo]
  const totalArticulos = d.articulos?.reduce((acc, a) => acc + a.cantidad, 0) || 0
  const totalMonto = d.articulos?.reduce((acc, a) => acc + a.subtotal, 0) || 0

  return (
    <div className="card" style={{ padding: 16, borderLeft: `3px solid ${estado.color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Pedido #{d.pedido?.numero_pedido}</span>
            <span className="badge" style={{ background: estado.bg, color: estado.color }}>{estado.label}</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{cliente?.nombre || '—'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {motivo.icono} {motivo.label} · {totalArticulos} artículo(s) · {formatearMonto(totalMonto)}
          </div>
          {d.observaciones && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>💬 {d.observaciones}</div>}
        </div>
        <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-muted)' }}>
          <div>{usuariosMap[d.usuario_id]?.nombre}</div>
          <div>{formatearFechaHora(d.created_at)}</div>
        </div>
      </div>
    </div>
  )
}

function NuevaDevolucion({ onClose, onSuccess }) {
  const { perfil } = useAuth()
  const [busquedaPedido, setBusquedaPedido] = useState('')
  const [pedidosEntregados, setPedidosEntregados] = useState([])
  const [pedidoSel, setPedidoSel] = useState(null)
  const [articulosPedido, setArticulosPedido] = useState([])
  const [seleccion, setSeleccion] = useState({}) // { articulo_id: cantidad }
  const [motivo, setMotivo] = useState('nota_credito')
  const [observaciones, setObservaciones] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('pedidos').select('*, cliente:clientes(nombre)').eq('estado', 'entregado').order('entregado_at', { ascending: false }).limit(200)
      .then(({ data }) => setPedidosEntregados(data || []))
  }, [])

  const seleccionarPedido = async (p) => {
    setPedidoSel(p)
    const { data } = await supabase.from('pedido_articulos').select('*').eq('pedido_id', p.id)
    setArticulosPedido(data || [])
    setSeleccion({})
  }

  const toggleArticulo = (art) => {
    setSeleccion(prev => {
      const copia = { ...prev }
      if (copia[art.id] !== undefined) delete copia[art.id]
      else copia[art.id] = art.cantidad
      return copia
    })
  }

  const cambiarCantidad = (art, cantidad) => {
    const cant = Math.max(1, Math.min(art.cantidad, Number(cantidad) || 1))
    setSeleccion(prev => ({ ...prev, [art.id]: cant }))
  }

  const articulosSeleccionados = Object.keys(seleccion)

  const handleGuardar = async () => {
    if (!pedidoSel) { setError('Seleccioná un pedido.'); return }
    if (articulosSeleccionados.length === 0) { setError('Seleccioná al menos un artículo.'); return }
    setError(''); setLoading(true)
    try {
      const { data: dev, error: errDev } = await supabase.from('devoluciones').insert({
        pedido_id: pedidoSel.id,
        usuario_id: perfil.id,
        motivo,
        estado: 'pendiente',
        observaciones: observaciones.trim() || null
      }).select().single()
      if (errDev) throw errDev

      const filas = articulosPedido
        .filter(a => seleccion[a.id] !== undefined)
        .map(a => ({
          devolucion_id: dev.id,
          pedido_articulo_id: a.id,
          codigo: a.codigo,
          descripcion: a.descripcion,
          cantidad: seleccion[a.id],
          precio_unitario: a.precio_unitario,
          subtotal: seleccion[a.id] * a.precio_unitario
        }))

      const { error: errArts } = await supabase.from('devolucion_articulos').insert(filas)
      if (errArts) throw errArts

      onSuccess()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const pedidosFiltrados = pedidosEntregados.filter(p =>
    !busquedaPedido || coincideNumero(p.numero_pedido, busquedaPedido) || p.cliente?.nombre.toLowerCase().includes(busquedaPedido.toLowerCase())
  ).slice(0, 12)

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 620 }}>
        <div className="modal-header">
          <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 16, fontWeight: 700 }}>Nueva devolución</h3>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {!pedidoSel ? (
            <>
              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label">Buscar pedido entregado</label>
                <div style={{ position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input className="input" style={{ paddingLeft: 36 }} placeholder="N° de pedido o cliente..." value={busquedaPedido} onChange={e => setBusquedaPedido(e.target.value)} autoFocus />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                {pedidosFiltrados.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No se encontraron pedidos entregados.</p>
                ) : pedidosFiltrados.map(p => (
                  <button key={p.id} onClick={() => seleccionarPedido(p)} style={styles.pedidoItem}>
                    <span style={{ fontWeight: 700, fontSize: 12.5 }}>#{p.numero_pedido}</span>
                    <span style={{ fontSize: 13, flex: 1, textAlign: 'left' }}>{p.cliente?.nombre}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatearMonto(p.monto)}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, background: 'var(--surface-container)', padding: 12, borderRadius: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>#{pedidoSel.numero_pedido} · {pedidoSel.cliente?.nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatearMonto(pedidoSel.monto)}</div>
                </div>
                <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setPedidoSel(null)}>Cambiar</button>
              </div>

              <div className="form-group">
                <label className="form-label">Artículos a devolver</label>
                {articulosPedido.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Este pedido no tiene artículos registrados.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {articulosPedido.map(a => {
                      const activo = seleccion[a.id] !== undefined
                      return (
                        <div key={a.id} style={{ ...styles.articuloRow, borderColor: activo ? 'var(--primary)' : 'var(--border)', background: activo ? 'var(--primary-subtle)' : 'transparent' }}>
                          <button onClick={() => toggleArticulo(a)} style={{ ...styles.checkbox, background: activo ? 'var(--primary)' : 'transparent', borderColor: activo ? 'var(--primary)' : 'var(--border-strong)' }}>
                            {activo && <Check size={12} color="#fff" />}
                          </button>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{a.descripcion}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.codigo} · {formatearMonto(a.precio_unitario)} c/u</div>
                          </div>
                          {activo && (
                            <input
                              type="number" min={1} max={a.cantidad} value={seleccion[a.id]}
                              onChange={e => cambiarCantidad(a, e.target.value)}
                              className="input" style={{ width: 60, padding: '6px 8px', textAlign: 'center' }}
                            />
                          )}
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 40 }}>/ {a.cantidad}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Motivo</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {Object.entries(MOTIVOS_DEVOLUCION).map(([key, m]) => (
                    <button key={key} onClick={() => setMotivo(key)} style={{
                      flex: 1, padding: 10, borderRadius: 8, fontSize: 13,
                      border: `1px solid ${motivo === key ? 'var(--primary)' : 'var(--border)'}`,
                      background: motivo === key ? 'var(--primary-subtle)' : 'transparent',
                      color: motivo === key ? 'var(--primary)' : 'var(--text-secondary)',
                      fontWeight: motivo === key ? 700 : 400
                    }}>
                      {m.icono} {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Observaciones</label>
                <textarea className="input" rows={2} placeholder="Detalle del motivo..." value={observaciones} onChange={e => setObservaciones(e.target.value)} style={{ resize: 'vertical', minHeight: 55 }} />
              </div>

              {error && <p className="form-error">{error}</p>}
            </>
          )}
        </div>

        {pedidoSel && (
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleGuardar} disabled={loading}>
              {loading ? <><span className="spinner" />Guardando...</> : 'Crear devolución'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  pedidoItem: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
    border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', textAlign: 'left'
  },
  articuloRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', border: '1px solid', borderRadius: 8 },
  checkbox: { width: 20, height: 20, borderRadius: 5, border: '1.5px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }
}
