import GestionUsuarios from './GestionUsuarios'

export default function AdminPanel() {
  return (
    <div style={{ padding: '20px 20px 60px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 24, fontWeight: 800 }}>Administrador</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, marginTop: 3 }}>Gestión de usuarios.</p>
      </div>

      <GestionUsuarios />
    </div>
  )
}
