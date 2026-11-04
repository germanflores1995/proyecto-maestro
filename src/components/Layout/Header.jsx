import { Search } from "lucide-react";

const CSS = `
.hdr {
  position: sticky;
  top: 60px;
  z-index: 100;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 10px 20px;
  display: flex;
  align-items: center;
  backdrop-filter: blur(6px);
  box-sizing: border-box;
}
.hdr-buscar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface-container);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 8px 16px;
  width: 100%;
  max-width: 380px;
  box-sizing: border-box;
}
.hdr-input {
  border: none;
  background: transparent;
  outline: none;
  font-size: 13.5px;
  color: var(--text);
  width: 100%;
  min-width: 0;
}
@media (max-width: 640px) {
  .hdr { padding: 8px 12px; }
  .hdr-buscar { max-width: none; padding: 6px 12px; gap: 6px; }
  .hdr-input { font-size: 14px; }
}
`;

// La barra superior (menú, usuario, notificaciones y tema) vive en Sidebar.
// Acá queda solo el buscador, debajo de esa barra.
export default function Header({ busqueda, setBusqueda }) {
  if (!setBusqueda) return null;
  return (
    <header className="hdr">
      <style>{CSS}</style>
      <div className="hdr-buscar">
        <Search size={16} color="var(--text-muted)" />
        <input
          type="text"
          className="hdr-input"
          placeholder="Buscar pedidos, clientes..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>
    </header>
  );
}
