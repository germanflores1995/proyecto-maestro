import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Plus, Upload, Check, AlertCircle, Search, Power, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatearFechaHora } from '../../utils/helpers'

export default function GestionClientes() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [mostrarManual, setMostrarManual] = useState(false)
  const [mostrarImport, setMostrarImport] = useState(false)

  const cargar = async () => {
    setLoading(true)
    const { data } = await supabase.from('clientes').select('*').order('nombre')
    setClientes(data || [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const toggleActivo = async (c) => {
    await supabase.from('clientes').update({ activo: !c.activo }).eq('id', c.id)
    cargar()
  }

  const filtrados = clientes.filter(c => c.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{clientes.length} clientes cargados en el sistema.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => { setMostrarImport(v => !v); setMostrarManual(false) }}>
            <Upload size={14} /> Importar Excel
          </button>
          <button className="btn btn-primary" onClick={() => { setMostrarManual(v => !v); setMostrarImport(false) }}>
            <Plus size={14} /> Agregar cliente
          </button>
        </div>
      </div>

      {mostrarManual && <FormularioManual onCreado={() => { cargar(); setMostrarManual(false) }} onCancelar={() => setMostrarManual(false)} />}
      {mostrarImport && <ImportarExcel onImportado={() => { cargar(); setMostrarImport(false) }} onCancelar={() => setMostrarImport(false)} />}

      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input className="input" style={{ paddingLeft: 34 }} placeholder="Buscar cliente..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><span className="spinner" style={{ width: 24, height: 24 }} /></div>
      ) : filtrados.length === 0 ? (
        <div className="empty-state"><Users size={32} /><p style={{ fontSize: 13 }}>Sin clientes que coincidan.</p></div>
      ) : (
        <div className="card" style={{ maxHeight: 420, overflowY: 'auto' }}>
          {filtrados.map((c, i) => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
              borderBottom: i < filtrados.length - 1 ? '1px solid var(--border)' : 'none',
              opacity: c.activo ? 1 : 0.5
            }}>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{c.nombre}</span>
              {c.codigo && <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>#{c.codigo}</span>}
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatearFechaHora(c.created_at)}</span>
              <button onClick={() => toggleActivo(c)} className={`btn ${c.activo ? 'btn-danger' : 'btn-success'}`} style={{ padding: '4px 9px', fontSize: 10.5 }}>
                <Power size={11} /> {c.activo ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FormularioManual({ onCreado, onCancelar }) {
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const guardar = async () => {
    if (!nombre.trim()) { setError('El nombre es requerido.'); return }
    setLoading(true); setError('')
    const { error: err } = await supabase.from('clientes').insert({ nombre: nombre.trim(), codigo: codigo.trim() || null })
    setLoading(false)
    if (err) { setError(err.message); return }
    onCreado()
  }

  return (
    <div className="card" style={{ padding: 18, marginBottom: 18 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
          <label className="form-label">Nombre del cliente *</label>
          <input className="input" placeholder="Ferretería Los Pinos" value={nombre} onChange={e => setNombre(e.target.value)} autoFocus />
        </div>
        <div className="form-group" style={{ width: 140, marginBottom: 0 }}>
          <label className="form-label">Código (opcional)</label>
          <input className="input" placeholder="0234" value={codigo} onChange={e => setCodigo(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={guardar} disabled={loading} style={{ height: 40 }}>
          {loading ? <span className="spinner" /> : <Check size={14} />} Guardar
        </button>
        <button className="btn btn-ghost" onClick={onCancelar} style={{ height: 40 }}>Cancelar</button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

function ImportarExcel({ onImportado, onCancelar }) {
  const [estado, setEstado] = useState('idle')
  const [preview, setPreview] = useState([])
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const handleArchivo = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setError(''); setEstado('loading')
    try {
      const data = await leerExcel(file)
      if (!data.length) throw new Error('El archivo no tiene filas con datos.')
      const columnas = Object.keys(data[0])
      const nombreKey = columnas.find(k => ['nombre', 'name', 'cliente', 'razon social', 'razón social'].includes(k.toLowerCase()))
      if (!nombreKey) throw new Error(`No se encontró columna de nombre. Columnas: ${columnas.join(', ')}`)
      const codigoKey = columnas.find(k => ['codigo', 'código', 'code'].includes(k.toLowerCase()))

      const clientes = data.map(r => ({
        nombre: r[nombreKey]?.toString().trim(),
        codigo: codigoKey ? (r[codigoKey]?.toString().trim() || null) : null
      })).filter(c => c.nombre)

      if (!clientes.length) throw new Error('No se encontraron nombres válidos.')
      setPreview(clientes)
      setEstado('preview')
    } catch (err) {
      setError(err.message); setEstado('idle')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const leerExcel = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        resolve(XLSX.utils.sheet_to_json(ws, { defval: '' }))
      } catch (err) { reject(new Error('No se pudo leer el archivo.')) }
    }
    reader.onerror = () => reject(new Error('Error al leer el archivo.'))
    reader.readAsBinaryString(file)
  })

  const confirmar = async () => {
    setEstado('loading')
    try {
      const batchSize = 200
      for (let i = 0; i < preview.length; i += batchSize) {
        const lote = preview.slice(i, i + batchSize)
        const { error: err } = await supabase.from('clientes').insert(lote.map(c => ({ ...c, activo: true })))
        if (err) throw err
      }
      onImportado()
    } catch (err) {
      setError(err.message); setEstado('preview')
    }
  }

  return (
    <div className="card" style={{ padding: 18, marginBottom: 18 }}>
      {estado === 'idle' && (
        <div onClick={() => inputRef.current?.click()} style={{
          border: '2px dashed var(--border-strong)', borderRadius: 10, padding: '26px 16px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer'
        }}>
          <Upload size={26} color="var(--primary)" />
          <p style={{ fontSize: 13, fontWeight: 600 }}>Hacé clic para subir un Excel de clientes</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Debe tener una columna "nombre" (y opcional "codigo")</p>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleArchivo} style={{ display: 'none' }} />
        </div>
      )}
      {estado === 'loading' && <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: 20 }}><span className="spinner" /> Procesando...</div>}
      {estado === 'preview' && (
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{preview.length} clientes detectados</p>
          <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 12 }}>
            {preview.slice(0, 8).map((c, i) => (
              <div key={i} style={{ padding: '6px 12px', fontSize: 12.5, borderBottom: '1px solid var(--border)' }}>{c.nombre}</div>
            ))}
            {preview.length > 8 && <div style={{ padding: '6px 12px', fontSize: 11.5, color: 'var(--text-muted)' }}>... y {preview.length - 8} más</div>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={confirmar}><Check size={14} /> Confirmar importación</button>
            <button className="btn btn-ghost" onClick={() => setEstado('idle')}>Cancelar</button>
          </div>
        </div>
      )}
      {error && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, fontSize: 12.5, color: 'var(--danger)' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}
    </div>
  )
}
