import { PackageCheck, Clock, X } from "lucide-react";

const CSS = `
.av-pila {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 400;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(400px, calc(100vw - 24px));
  pointer-events: none;
}
.av-tarjeta {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px;
  border-radius: 16px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  box-shadow: 0 14px 38px rgba(15, 23, 42, 0.32);
  animation: av-entra 0.25s ease-out;
}
.av-icono {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--st-listo-bg, rgba(16, 185, 129, 0.14));
  color: var(--st-listo, #059669);
}
.av-icono-espera {
  background: var(--st-en-espera-bg, rgba(245, 158, 11, 0.16));
  color: var(--st-en-espera, #d97706);
}
.av-cuerpo { flex: 1; min-width: 0; }
.av-titulo { font-size: 15px; font-weight: 700; line-height: 1.25; }
.av-texto { margin-top: 3px; font-size: 14px; color: var(--text-secondary); overflow-wrap: anywhere; }
.av-texto b { color: var(--text); }
.av-ver {
  margin-top: 10px;
  padding: 7px 14px;
  border-radius: 8px;
  border: 1px solid var(--primary);
  background: var(--primary-subtle);
  color: var(--primary);
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}
.av-ver:hover { background: var(--primary); color: #fff; }
.av-x {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.av-x:hover { background: var(--surface-container); color: var(--text); }
@keyframes av-entra {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes av-entra-arriba {
  from { opacity: 0; transform: translateY(-28px); }
  to { opacity: 1; transform: translateY(0); }
}
/* Tablet y celular: aparece arriba y al centro, como el aviso de un mensaje, por encima de la barra superior */
@media (max-width: 1099px), (pointer: coarse) and (max-width: 1400px) {
  .av-pila {
    left: 50%;
    right: auto;
    bottom: auto;
    transform: translateX(-50%);
    top: calc(env(safe-area-inset-top, 0px) + 8px);
  }
  .av-tarjeta { animation-name: av-entra-arriba; }
}
@media (prefers-reduced-motion: reduce) { .av-tarjeta { animation: none; } }
`;

const TIPOS = {
  listo: { titulo: "Tu pedido está listo para entregar", boton: "Ver mis pedidos", Icono: PackageCheck, clase: "" },
  espera: { titulo: "Pedido en espera", boton: "Ver pedidos en espera", Icono: Clock, clase: " av-icono-espera" },
};

// Carteles de aviso estilo mensaje: abajo a la derecha en PC y arriba en tablet y celular; se quedan unos segundos y se pueden cerrar.
export default function AvisosToast({ carteles, onCerrar, onVer }) {
  if (!carteles.length) return null;
  return (
    <>
      <style>{CSS}</style>
      <div className="av-pila" role="region" aria-label="Avisos" aria-live="polite">
        {carteles.map((c) => {
          const t = TIPOS[c.tipo] || TIPOS.listo;
          const Icono = t.Icono;
          return (
          <div key={c.id} className="av-tarjeta" role="status">
            <div className={`av-icono${t.clase}`}>
              <Icono size={22} />
            </div>
            <div className="av-cuerpo">
              <div className="av-titulo">{t.titulo}</div>
              <div className="av-texto">
                <b>#{c.numero}</b>
                {c.cliente ? ` · ${c.cliente}` : ""}
              </div>
              <button type="button" className="av-ver" onClick={() => onVer(c)}>
                {t.boton}
              </button>
            </div>
            <button type="button" className="av-x" aria-label="Cerrar aviso" onClick={() => onCerrar(c.id)}>
              <X size={16} />
            </button>
          </div>
          );
        })}
      </div>
    </>
  );
}
