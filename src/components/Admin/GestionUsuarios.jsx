import { useState, useEffect } from 'react'
import { UserPlus, Check, X, Power } from 'lucide-react'
import { supabase, crearClienteTemporal } from '../../lib/supabase'
import { ROLES } from '../../utils/constants'
import { iniciales, formatearFechaHora } from '../../utils/helpers'

export default function GestionUsuarios() {
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'vendedor' })
  const [loadingForm, setLoadingForm] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')

  useEffect(() => { cargarUsuarios() }, [])

  const cargarUsuarios = async () => {
    setLoading(true)
    const { data } = await supabase.from('usuarios').select('*').order('rol').order('nombre')
    setUsuarios(data || [])
    setLoading(false)
  }

  const crearUsuario = async () => {
    const { nombre, email, password, rol } = form
    if (!nombre.trim() || !email.trim() || !password.trim()) { setError('Completá todos los campos.'); return }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return }
    setError(''); setLoadingForm(true)
    try {
      const clienteTemp = crearClienteTemporal()
      const { data: authData, error: authErr } = await clienteTemp.auth.signUp({ email: email.trim(), password })
      if (authErr) throw authErr
      if (!authData.user) throw new Error('No se pudo crear el usuario. Verificá que estén desactivadas las confirmaciones de email en Supabase.')

      const { error: perfErr } = await supabase.from('usuarios').insert({
        id: authData.user.id, nombre: nombre.trim(), email: email.trim(), rol
      })
      if (perfErr) throw perfErr

      setExito(`Usuario "${nombre}" creado correctamente.`)
      setForm({ nombre: '', email: '', password: '', rol: 'vendedor' })
      setMostrarForm(false)
      cargarUsuarios()
      setTimeout(() => setExito(''), 4000)
    } catch (err) {
      setError(err.message || 'Error al crear el usuario.')
    } finally {
      setLoadingForm(false)
    }
  }

  const toggleActivo = async (usuario) => {
    await supabase.from('usuarios').update({ activo: !usuario.activo }).eq('id', usuario.id)
    cargarUsuarios()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Vendedores, expedición, caja y administradores.</p>
        <button className="btn btn-primary" onClick={() => { setMostrarForm(v => !v); setError('') }}>
          <UserPlus size={15} /> Nuevo usuario
        </button>
      </div>

      {exito && (
        <div style={{ background: 'var(--success-bg)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--success)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Check size={15} /> {exito}
        </div>
      )}

      {mostrarForm && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Nuevo usuario</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Nombre completo *</label>
              <input className="input" placeholder="Juan Pérez" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Email *</label>
              <input className="input" type="email" placeholder="juan@maestro.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Contraseña *</label>
              <input className="input" type="password" placeholder="Mín. 6 caracteres" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Rol *</label>
              <select className="input" value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}>
                <option value="vendedor">Vendedor</option>
                <option value="expedicion">Expedición</option>
                <option value="caja">Caja</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          </div>
          {error && <p className="form-error">{error}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button className="btn btn-primary" onClick={crearUsuario} disabled={loadingForm}>
              {loadingForm ? <><span className="spinner" />Creando...</> : <><Check size={14} />Crear usuario</>}
            </button>
            <button className="btn btn-ghost" onClick={() => { setMostrarForm(false); setError('') }}><X size={14} />Cancelar</button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
            ⚠️ Requiere tener desactivada la confirmación de email en Supabase → Authentication → Sign In / Providers.
          </p>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><span className="spinner" style={{ width: 24, height: 24 }} /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {usuarios.map(u => (
            <div key={u.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, opacity: u.activo ? 1 : 0.5 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: u.activo ? 'var(--primary-subtle-strong)' : 'var(--surface-container)',
                color: u.activo ? 'var(--primary)' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 12
              }}>
                {iniciales(u.nombre)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {u.nombre}
                  {!u.activo && <span style={{ fontSize: 10, color: 'var(--danger)', marginLeft: 8, fontWeight: 700 }}>DESACTIVADO</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{u.email}</div>
              </div>
              <span className="badge" style={{ background: 'var(--surface-container)', color: 'var(--text-secondary)' }}>
                {ROLES[u.rol]?.icono} {ROLES[u.rol]?.label || u.rol}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatearFechaHora(u.created_at)}</span>
              <button onClick={() => toggleActivo(u)} className={`btn ${u.activo ? 'btn-danger' : 'btn-success'}`} style={{ padding: '5px 10px', fontSize: 11 }}>
                <Power size={12} /> {u.activo ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
