import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { cargarConfig, contarAlertas } from "../lib/presupuestosApi";
import { leerAvisos, guardarAvisos, suscribirAvisos } from "../lib/preferenciaAvisos";

const CADA_MS = 60000;

const soportaAvisos = () => typeof window !== "undefined" && "Notification" in window;

// Qué pide atención a cada usuario:
// - Ventas (vendedor, encargado de ventas, admin): presupuestos con alerta roja.
// - Expedición (expedición, encargado de expedición, admin): pedidos en espera.
// Se recalcula cada minuto y al volver a la pestaña. Si con avisos activados
// aparecen presupuestos con alerta y la pestaña está en segundo plano, manda un aviso del navegador.
// El sonido y los avisos de pedidos (en espera / listo para entregar) los maneja useAvisosPedidos.
// El interruptor «Avisos» es compartido: está activado por defecto y se guarda en cada equipo.
export default function useNotificaciones() {
  const { perfil, esAdmin, esVendedor, esExpedicion, esEncargadoExpedicion, esEncargadoVentas } =
    useAuth();

  const ventas = esAdmin || esVendedor || esEncargadoVentas;
  const expedicion = esAdmin || esExpedicion || esEncargadoExpedicion;

  const [items, setItems] = useState([]);
  const avisoPref = useSyncExternalStore(suscribirAvisos, leerAvisos, () => true);
  const [permiso, setPermiso] = useState(() =>
    soportaAvisos() ? Notification.permission : "unsupported",
  );
  const [mensajeAvisos, setMensajeAvisos] = useState("");

  // Refs para leerlos dentro de cargar() sin depender de un render viejo
  const prefRef = useRef(avisoPref);
  prefRef.current = avisoPref;
  const permisoRef = useRef(permiso);
  const anteriores = useRef(null);

  const cargar = useCallback(async () => {
    if (!perfil?.id) return;
    const lista = [];

    if (expedicion) {
      const { count, error } = await supabase
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("activo", true)
        .eq("estado", "en_espera");
      if (!error && count > 0) {
        lista.push({ id: "en_espera", texto: "Pedidos en espera", cantidad: count, pagina: "expedicion", nivel: "alta" });
      }
    }

    if (ventas) {
      try {
        const cfg = await cargarConfig();
        const n = await contarAlertas(cfg);
        if (n > 0) {
          lista.push({ id: "presupuestos", texto: "Presupuestos con alerta", cantidad: n, pagina: "presupuestos", nivel: "alta" });
        }
      } catch {
        /* sin datos de presupuestos: no se muestra alerta */
      }
    }

    if (soportaAvisos()) {
      permisoRef.current = Notification.permission;
      setPermiso(Notification.permission);
    }

    // Aviso solo si algo subió respecto de la vez anterior (no en la primera carga)
    const previos = anteriores.current;
    anteriores.current = Object.fromEntries(lista.map((i) => [i.id, i.cantidad]));
    if (
      previos &&
      prefRef.current &&
      permisoRef.current === "granted" &&
      document.visibilityState === "hidden"
    ) {
      // Los pedidos en espera ya se avisan uno por uno (con sonido) desde useAvisosPedidos
      const subieron = lista.filter((i) => i.id !== "en_espera" && i.cantidad > (previos[i.id] || 0));
      if (subieron.length > 0) {
        try {
          const aviso = new Notification("Distribuidora Maestro", {
            body: subieron.map((i) => `${i.texto}: ${i.cantidad}`).join("\n"),
            tag: "maestro-avisos",
            icon: "/logo.png",
          });
          aviso.onclick = () => {
            window.focus();
            aviso.close();
          };
        } catch {
          /* el navegador no permitió mostrar el aviso */
        }
      }
    }

    setItems(lista);
  }, [perfil?.id, expedicion, ventas]);

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, CADA_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") cargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [cargar]);

  // Activar o desactivar el interruptor. El sonido y los carteles funcionan siempre;
  // al activar además se pide permiso para los avisos del sistema (cuando la pestaña está en segundo plano).
  const cambiarAvisos = async () => {
    setMensajeAvisos("");
    if (prefRef.current) {
      guardarAvisos(false);
      return;
    }
    guardarAvisos(true);
    if (!soportaAvisos()) return;
    let p = Notification.permission;
    if (p === "default") p = await Notification.requestPermission();
    permisoRef.current = p;
    setPermiso(p);
    if (p === "denied") {
      setMensajeAvisos(
        "Los avisos del sistema están bloqueados (candado de la barra de direcciones). El sonido y los carteles dentro de la app siguen funcionando.",
      );
    }
  };

  const total = items.reduce((acc, it) => acc + it.cantidad, 0);
  const porPagina = items.reduce((acc, it) => {
    acc[it.pagina] = (acc[it.pagina] || 0) + it.cantidad;
    return acc;
  }, {});

  return {
    items,
    total,
    porPagina,
    avisosActivos: avisoPref,
    avisosSoportados: true,
    mensajeAvisos,
    cambiarAvisos,
  };
}
