import { useAuth } from "../../contexts/AuthContext";
import ListaNotasCredito, { CSS_NC } from "./ListaNotasCredito";

// Caja: notas de crédito para hacer a mano en Odoo y marcarlas como realizadas.
// Por ahora, en prueba: solo el administrador.
export default function CajaNotasCredito() {
  const { esAdmin } = useAuth();
  if (!esAdmin) return null;
  return (
    <div className="mp-pagina">
      <style>{CSS_NC}</style>
      <div className="mp-cabecera" style={{ marginBottom: 20 }}>
        <h2 className="mp-titulo">Caja · Notas de crédito</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 13.5, marginTop: 3 }}>
          Tocá una nota para ver qué hay que devolver. Hacela en Odoo y marcala como realizada.
        </p>
      </div>
      <ListaNotasCredito modo="caja" />
    </div>
  );
}
