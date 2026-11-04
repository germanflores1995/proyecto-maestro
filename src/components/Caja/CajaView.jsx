import { useState, useEffect, useCallback } from 'react'
import { CreditCard, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { MOTIVOS_DEVOLUCION, ESTADOS_DEVOLUCION } from '../../utils/constants'
import { formatearFechaHora, formatearMonto } from '../../utils/helpers'

export default function CajaView() {
  const { perfil } = useAuth()
  const [devoluciones, setDevoluciones] = useState([])
  const [clientes, setClientes] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('pendiente')
  const [procesando, setProcesando] = useState(null)

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

  const marcarProcesada = async (id) => {
    setProcesando(id)
    await supabase.from('devoluciones').update({
      estado: 'procesada', procesada_at: new Date().toISOString(), procesada_por: perfil.id
    }).eq('id', id)
    await cargar()
    setProcesando(null)
  }

  const filtradas = devoluciones.filter(d => d.estado === filtro)

  return (
    <div style={{ padding: '20px 20px 60px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 24, fontWeight: 800 }}>Devoluciones — Caja</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, marginTop: 3 }}>Ajustes pendientes de notas de crédito y cambios.</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {[{ k: 'pendiente', l: 'Pendientes' }, { k: 'procesada', l: 'Procesadas' }].map(f => (
          <button key={f.k} onClick={() => setFiltro(f.k)} style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
            border: `1px solid ${filtro === f.k ? 'var(--primary)' : 'var(--border)'}`,
            background: filtro === f.k ? 'var(--primary-subtle)' : 'transparent',
            color: filtro === f.k ? 'var(--primary)' : 'var(--text-secondary)'
          }}>
            {f.l}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><span className="spinner" style={{ width: 24, height: 24 }} /></div>
      ) : filtradas.length === 0 ? (
        <div className="empty-state">
          <CreditCard size={36} />
          <p style={{ fontSize: 14, fontWeight: 600 }}>Sin devoluciones {filtro === 'pendiente' ? 'pendientes' : 'procesadas'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtradas.map(d => {
            const estado = ESTADOS_DEVOLUCION[d.estado]
            const motivo = MOTIVOS_DEVOLUCION[d.motivo]
            const totalMonto = d.articulos?.reduce((acc, a) => acc + a.subtotal, 0) || 0
            return (
              <div key={d.id} className="card" style={{ padding: 18, borderLeft: `3px solid ${estado.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <span style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--text-muted)' }}>Pedido #{d.pedido?.numero_pedido}</span>
                      <span className="badge" style={{ background: motivo === MOTIVOS_DEVOLUCION.nota_credito ? 'var(--primary-subtle)' : 'var(--warning-bg)', color: motivo === MOTIVOS_DEVOLUCION.nota_credito ? 'var(--primary)' : 'var(--warning)' }}>
                        {motivo.icono} {motivo.label}
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{clientesMap[d.pedido?.cliente_id]?.nombre || '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{formatearFechaHora(d.created_at)} · Registrada por {usuariosMap[d.usuario_id]?.nombre}</div>
                  </div>
                  <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>
                    {formatearMonto(totalMonto)}
                  </div>
                </div>

                {d.articulos?.length > 0 && (
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    {d.articulos.map(a => (
                      <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                        <span>{a.cantidad}x {a.descripcion} <span style={{ color: 'var(--text-muted)' }}>({a.codigo})</span></span>
                        <span style={{ color: 'var(--text-muted)' }}>{formatearMonto(a.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {d.observaciones && (
                  <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--text-secondary)', background: 'var(--surface-container)', padding: '8px 11px', borderRadius: 6 }}>
                    💬 {d.observaciones}
                  </div>
                )}

                {d.estado === 'pendiente' && (
                  <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-success" onClick={() => marcarProcesada(d.id)} disabled={procesando === d.id}>
                      {procesando === d.id ? <span className="spinner" /> : <Check size={15} />}
                      Marcar como procesada
                    </button>
                  </div>
                )}
                {d.estado === 'procesada' && (
                  <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--success)' }}>
                    ✅ Procesada {formatearFechaHora(d.procesada_at)} por {usuariosMap[d.procesada_por]?.nombre}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
