import { Wallet } from "lucide-react";
import ListaNotasCredito, { CSS_NC } from "./ListaNotasCredito";

// Caja: notas de crédito para hacer a mano en Odoo y marcarlas como realizadas
export default function CajaNotasCredito() {
  return (
    <div className="nc-pagina">
      <style>{CSS_NC}</style>
      <div className="nc-titulo">
        <Wallet size={24} />
        <h2 style={{ fontFamily: "Montserrat, sans-serif", fontSize: 24, fontWeight: 800, margin: 0 }}>
          Caja · Notas de crédito
        </h2>
      </div>
      <p className="nc-sub">
        Hacé cada nota de crédito en Odoo y después marcala como realizada para que quede registrada.
      </p>
      <ListaNotasCredito modo="caja" />
    </div>
  );
}
