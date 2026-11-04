import { useState } from "react";
import { createPortal } from "react-dom";
import { X, HelpCircle, ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

// Guía en dos niveles. Los temas principales son los mismos que ves en la barra
// de arriba, según tu rol. Dentro de cada uno hay submenús con pasos.
export default function AyudaModal({ onClose }) {
  const {
    perfil,
    esVendedor,
    esExpedicion,
    esEncargadoExpedicion,
    esEncargadoVentas,
    esAdmin,
  } = useAuth();

  // Mismas condiciones que la barra de navegación
  const verMisPedidos = esVendedor || esAdmin || esEncargadoExpedicion || esEncargadoVentas;
  const verExpedicion = esExpedicion || esVendedor;
  const verPresupuestos = esVendedor || esAdmin;
  const verObjetivo = esAdmin || esEncargadoExpedicion;
  const puedePreparar = esExpedicion || esEncargadoExpedicion || esAdmin;

  const temas = [
    {
      id: "inicio",
      titulo: "Primeros pasos",
      visible: true,
      submenus: [
        {
          titulo: "Cómo moverte",
          pasos: [
            "La barra de arriba tiene las secciones a las que tenés acceso.",
            "Tocá el logo para volver al inicio.",
            "Ayuda y Cerrar sesión están a la derecha.",
          ],
        },
        {
          titulo: "Qué significa cada estado",
          pasos: [
            "En espera, en camino, viene hoy, retira mañana o retira otro día: el pedido todavía no está listo.",
            "Listo para entregar: Expedición ya lo armó y lo dejó en su ubicación.",
            "Entregado: el cliente ya lo retiró.",
            "Cancelado: el pedido no se va a entregar.",
          ],
        },
      ],
    },
    {
      id: "mis-pedidos",
      titulo: "Mis Pedidos",
      visible: verMisPedidos,
      submenus: [
        {
          titulo: "Ver los pedidos",
          pasos: [
            "Los pedidos se ven en 4 columnas: Pendientes, Listos, Retirados y Cancelados.",
            "Cada fila muestra el número, el cliente, el vendedor, la fecha de entrega y el estado.",
            "Tocá un pedido para abrir su detalle.",
            "Con el botón de la derecha cambiás entre vista de lista y de tarjetas.",
            "Si sos vendedor, solo ves tus pedidos. Los encargados ven todos y pueden filtrar por vendedor.",
          ],
        },
        {
          titulo: "Cambiar estado, horario y pago",
          pasos: [
            "Abrí el pedido desde Mis Pedidos.",
            "En Cambiar estado elegís el nuevo estado. Ventas puede hacerlo hasta que el pedido pase a Expedición.",
            "Con Desde las HH asignás un horario de retiro. Con Sin horario lo quitás.",
            "En Pago elegís Solo retira o Paga ahora.",
            "Cada cambio queda anotado en el historial, al final del detalle.",
          ],
        },
      ],
    },
    {
      id: "expedicion",
      titulo: "Expedición",
      visible: verExpedicion,
      submenus: [
        {
          titulo: "Cargar un pedido nuevo",
          pasos: [
            "Tocá Nuevo Pedido, arriba a la derecha.",
            "Completá el número de pedido, el cliente, el pago y el horario, y guardá.",
          ],
        },
        {
          titulo: "Ver y ordenar la lista",
          pasos: [
            "Acá ves los pedidos que hay que preparar y entregar.",
            "Tocá el título de una columna para ordenar. Tocá otra vez para invertir el orden.",
            "Para cambiar el ancho de una columna, arrastrá su borde derecho. Doble toque la vuelve a su tamaño normal.",
            "Si tu puesto lo permite, podés descargar la lista en Excel.",
          ],
        },
        {
          titulo: "Preparar para entregar",
          visible: puedePreparar,
          pasos: [
            "Abrí el pedido y tocá Listo para entregar en Cambiar estado.",
            "Elegí la ubicación: una estantería (1A a 3C) o un palet (P1 a P6). Es obligatoria.",
            "Cargá cada bulto con su cantidad. Solo se guardan los que tienen cantidad.",
            "Si querés, escribí un detalle. En Otros el detalle es obligatorio.",
            "Tocá Listo para entregar para guardar. Tiene que haber al menos un bulto.",
          ],
        },
        {
          titulo: "Entregar o cancelar",
          visible: puedePreparar,
          pasos: [
            "Para entregar: abrí el pedido, tocá Marcar como entregado y confirmá. El monto se trae de Odoo.",
            "Para cancelar: tocá Cancelar pedido y confirmá.",
            "Un pedido entregado conserva su ubicación y sus bultos. Sirve para revisar que no falte nada al cliente.",
          ],
        },
      ],
    },
    {
      id: "presupuestos",
      titulo: "Presupuestos",
      visible: verPresupuestos,
      submenus: [
        {
          titulo: "Buscar y agregar",
          pasos: [
            "Tocá Agregar.",
            "Buscá por número de presupuesto o por nombre del cliente. Los datos vienen de Odoo.",
            "Elegí el presupuesto correcto y guardalo. Aparece en tu lista de presupuestos.",
          ],
        },
        {
          titulo: "Registrar seguimiento",
          pasos: [
            "Tocá el presupuesto para abrir su detalle y después Registrar seguimiento.",
            "Anotá el medio de contacto, el resultado, la situación actual y, si hace falta, la fecha de la próxima llamada.",
            "Si cambió de estado, podés actualizarlo desde el detalle del presupuesto.",
            "Cada seguimiento queda en la historia del presupuesto.",
          ],
        },
        {
          titulo: "Cerrar o reabrir",
          pasos: [
            "Confirmar: el cliente aceptó. Pide el número de orden de compra.",
            "Perder: el cliente no compra. Pide el motivo.",
            "Cerrar sin resultado: no hubo respuesta o no aplica.",
            "Reabrir: si el cliente vuelve a moverse, reabrilo. Empieza un nuevo ciclo de seguimiento.",
          ],
        },
        {
          titulo: "Alertas",
          pasos: [
            "Rojo: presupuesto vencido o sin contacto desde hace mucho. Llamalo primero.",
            "Amarillo: conviene mirarlo pronto.",
            "El número rojo del menú Presupuestos indica cuántos están en alerta.",
          ],
        },
      ],
    },
    {
      id: "objetivo",
      titulo: "Objetivo",
      visible: verObjetivo,
      submenus: [
        {
          titulo: "Cómo leerlo",
          pasos: [
            "Muestra cuánto se entregó en el mes, según la fecha de entrega.",
            "Arriba ves el porcentaje del objetivo, lo entregado y lo que falta.",
            "Cambiá de mes con las flechas.",
          ],
        },
        {
          titulo: "Ventas por vendedor",
          pasos: [
            "La tabla muestra quién cargó cada pedido en Odoo, con cantidad de pedidos y total vendido.",
            "La barra indica el porcentaje de cada vendedor sobre el total del mes.",
            "Si aparece Sin dato, el pedido todavía no tiene el vendedor de Odoo guardado.",
          ],
        },
      ],
    },
  ].filter((t) => t.visible);

  const [temaAbierto, setTemaAbierto] = useState(temas[0]?.id ?? null);
  const [submenuAbierto, setSubmenuAbierto] = useState(null); // "temaId:indice"

  const alternarTema = (id) => {
    setTemaAbierto((actual) => (actual === id ? null : id));
    setSubmenuAbierto(null);
  };
  const alternarSubmenu = (clave) =>
    setSubmenuAbierto((actual) => (actual === clave ? null : clave));

  const contenido = (
    <div style={s.fondo} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={s.caja} role="dialog" aria-label="Ayuda">
        <div style={s.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <HelpCircle size={20} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Ayuda</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {perfil?.nombre ? `Guía para ${perfil.nombre}. ` : ""}Elegí un tema y después un submenú.
              </div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={s.cerrar}>
            <X size={18} />
          </button>
        </div>

        <div style={s.cuerpo}>
          {temas.map((t) => {
            const abierto = temaAbierto === t.id;
            const Flecha = abierto ? ChevronDown : ChevronRight;
            const submenus = t.submenus.filter((sm) => sm.visible !== false);
            return (
              <section key={t.id} style={s.tema}>
                <button type="button" onClick={() => alternarTema(t.id)} style={s.temaBoton}>
                  <Flecha size={16} />
                  <span>{t.titulo}</span>
                </button>

                {abierto && (
                  <div style={s.submenus}>
                    {submenus.map((sm, i) => {
                      const clave = `${t.id}:${i}`;
                      const subAbierto = submenuAbierto === clave;
                      const SubFlecha = subAbierto ? ChevronDown : ChevronRight;
                      return (
                        <div key={clave} style={s.submenu}>
                          <button
                            type="button"
                            onClick={() => alternarSubmenu(clave)}
                            style={s.submenuBoton}
                          >
                            <SubFlecha size={14} />
                            <span>{sm.titulo}</span>
                          </button>
                          {subAbierto && (
                            <ol style={s.pasos}>
                              {sm.pasos.map((p, j) => (
                                <li key={j} style={{ marginBottom: 5 }}>
                                  {p}
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <div style={s.pie}>Si algo no funciona o no sabés cómo seguir, avisale a tu encargado.</div>
      </div>
    </div>
  );

  return createPortal(contenido, document.body);
}

const s = {
  fondo: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 1300,
  },
  caja: {
    background: "var(--surface, #ffffff)",
    color: "var(--text, #0f172a)",
    borderRadius: 14,
    width: "100%",
    maxWidth: 640,
    maxHeight: "86vh",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "16px 20px",
    borderBottom: "1px solid var(--border, #e2e8f0)",
  },
  cerrar: {
    background: "transparent",
    border: "none",
    color: "inherit",
    cursor: "pointer",
    padding: 4,
    borderRadius: 6,
    display: "flex",
  },
  cuerpo: {
    padding: "10px 14px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  tema: {
    border: "1px solid var(--border, #e2e8f0)",
    borderRadius: 10,
    padding: "2px 12px",
  },
  temaBoton: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "11px 0",
    background: "transparent",
    border: "none",
    color: "inherit",
    fontSize: 15,
    fontWeight: 700,
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  submenus: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    paddingBottom: 8,
  },
  submenu: {
    borderTop: "1px solid var(--border, #e2e8f0)",
  },
  submenuBoton: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 4px",
    background: "transparent",
    border: "none",
    color: "inherit",
    fontSize: 13.5,
    fontWeight: 600,
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  pasos: {
    margin: "0 0 10px",
    paddingLeft: 26,
    fontSize: 13,
    lineHeight: 1.6,
  },
  pie: {
    padding: "12px 20px",
    borderTop: "1px solid var(--border, #e2e8f0)",
    fontSize: 12.5,
    opacity: 0.75,
  },
};
