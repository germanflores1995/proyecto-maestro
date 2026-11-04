import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { cargarConfig, contarAlertas } from "../lib/presupuestosApi";

const CADA_MS = 60000;
const CLAVE_AVISOS = "maestro_avisos_escritorio";

const soportaAvisos = () => typeof window !== "undefined" && "Notification" in window;

function leerPreferencia() {
  try {
    return localStorage.getItem(CLAVE_AVISOS) === "1";
  } catch {
    return false;
  }
}

function guardarPreferencia(valor) {
  try {
    localStorage.setItem(CLAVE_AVISOS, valor ? "1" : "0");
  } catch {
    /* sin almacenamiento: la preferencia dura solo esta sesión */
  }
}

// Qué pide atención a cada usuario:
// - Ventas (vendedor, encargado de ventas, admin): presupuestos con alerta roja.
// - Expedición (expedición, encargado de expedición, admin): pedidos en espera.
// Se recalcula cada minuto y al volver a la pestaña. Si con avisos activados
// aparece algo nuevo y la pestaña está en segundo plano, manda un aviso del navegador.
export default function useNotificaciones() {
  const { perfil, esAdmin, esVendedor, esExpedicion, esEncargadoExpedicion, esEncargadoVentas } =
    useAuth();

  const ventas = esAdmin || esVendedor || esEncargadoVentas;
  const expedicion = esAdmin || esExpedicion || esEncargadoExpedicion;

  const [items, setItems] = useState([]);
  const [avisoPref, setAvisoPref] = useState(leerPreferencia);
  const [permiso, setPermiso] = useState(() =>
    soportaAvisos() ? Notification.permission : "unsupported",
  );
  const [mensajeAvisos, setMensajeAvisos] = useState("");

  // Refs para leerlos dentro de cargar() sin depender de un render viejo
  const prefRef = useRef(avisoPref);
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
      const subieron = lista.filter((i) => i.cantidad > (previos[i.id] || 0));
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

  // Activar o desactivar el interruptor. Al activar pide permiso al navegador.
  const cambiarAvisos = async () => {
    setMensajeAvisos("");
    if (prefRef.current) {
      prefRef.current = false;
      setAvisoPref(false);
      guardarPreferencia(false);
      return;
    }
    if (!soportaAvisos()) {
      setMensajeAvisos("Este navegador no permite avisos.");
      return;
    }
    let p = Notification.permission;
    if (p === "default") p = await Notification.requestPermission();
    permisoRef.current = p;
    setPermiso(p);
    if (p === "granted") {
      prefRef.current = true;
      setAvisoPref(true);
      guardarPreferencia(true);
    } else if (p === "denied") {
      setMensajeAvisos("Los avisos están bloqueados. Habilitalos desde el candado de la barra de direcciones.");
    } else {
      setMensajeAvisos("No se dio permiso para los avisos.");
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
    avisosActivos: avisoPref && permiso === "granted",
    avisosSoportados: soportaAvisos(),
    mensajeAvisos,
    cambiarAvisos,
  };
}
