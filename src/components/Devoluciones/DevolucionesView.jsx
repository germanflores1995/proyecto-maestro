import { useState } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { pesos } from "../../lib/notasCredito";
import ListaNotasCredito, { CSS_NC } from "./ListaNotasCredito";
import FormularioNotaCredito from "./FormularioNotaCredito";

// Devoluciones: se arma la nota de crédito de un pedido vendido y queda pendiente para Caja.
// Por ahora, en prueba: solo el administrador.
export default function DevolucionesView() {
  const { esAdmin } = useAuth();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [recargarKey, setRecargarKey] = useState(0);
  const [creada, setCreada] = useState(null);

  if (!esAdmin) return null;

  return (
    <div className="mp-pagina">
      <style>{CSS_NC}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <div className="mp-cabecera">
          <h2 className="mp-titulo">Devoluciones</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 13.5, marginTop: 3 }}>
            Notas de crédito de pedidos vendidos. Caja las hace en Odoo y las marca como realizadas.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setCreada(null);
            setMostrarFormulario(true);
          }}
        >
          <Plus size={15} /> Nueva nota de crédito
        </button>
      </div>

      {creada && (
        <div className="nc-ok">
          Nota de crédito #{creada.id} cargada · {creada.cliente} · Pedido #{creada.numero_pedido} · {pesos(creada.total)}.
          Quedó pendiente para Caja.
        </div>
      )}

      <ListaNotasCredito modo="gestion" recargarKey={recargarKey} />

      {mostrarFormulario && (
        <FormularioNotaCredito
          onClose={() => setMostrarFormulario(false)}
          onCreada={(nota) => {
            setMostrarFormulario(false);
            setCreada(nota);
            setRecargarKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
