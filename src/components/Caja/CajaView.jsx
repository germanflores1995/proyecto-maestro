import ListaNotasCredito, { CSS_NC } from "../Devoluciones/ListaNotasCredito";

// Caja: notas de crédito para hacer a mano en Odoo y marcarlas como realizadas
export default function CajaView() {
  return (
    <div className="mp-pagina">
      <style>{CSS_NC}</style>
      <div className="mp-cabecera" style={{ marginBottom: 20 }}>
        <h2 className="mp-titulo">Caja · Notas de crédito</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 13.5, marginTop: 3 }}>
          Hacé cada nota de crédito en Odoo y después marcala como realizada para que quede registrada.
        </p>
      </div>
      <ListaNotasCredito modo="caja" />
    </div>
  );
}
