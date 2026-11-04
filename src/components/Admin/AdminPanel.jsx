import { useState } from 'react'
import { Users, Building2 } from 'lucide-react'
import GestionUsuarios from './GestionUsuarios'
import GestionClientes from './GestionClientes'

export default function AdminPanel() {
  const [tab, setTab] = useState('usuarios')

  return (
    <div style={{ padding: '20px 20px 60px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 24, fontWeight: 800 }}>Administración</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, marginTop: 3 }}>Gestión de usuarios y base de clientes.</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <TabBtn active={tab === 'usuarios'} onClick={() => setTab('usuarios')} icon={Users} label="Usuarios" />
        <TabBtn active={tab === 'clientes'} onClick={() => setTab('clientes')} icon={Building2} label="Clientes" />
      </div>

      {tab === 'usuarios' && <GestionUsuarios />}
      {tab === 'clientes' && <GestionClientes />}
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick} className="btn" style={{
      background: active ? 'var(--primary-subtle)' : 'transparent',
      color: active ? 'var(--primary)' : 'var(--text-secondary)',
      border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
      fontWeight: active ? 700 : 500
    }}>
      <Icon size={15} /> {label}
    </button>
  )
}
