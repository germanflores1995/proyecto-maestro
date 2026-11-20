import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { leerAvisos } from "../lib/preferenciaAvisos";
import { reproducir } from "../utils/sonidos";
import { limpiarCliente } from "../utils/ordenar";

const CADA_MS = 45000; // revisión de respaldo, por si se pierde algún aviso en tiempo real
const DURACION_CARTEL_MS = 15000;
const MAX_CARTELES = 3;

// Decide qué aviso corresponde cuando un pedido cambia.
// - "espera": expedición (expedición, encargado de expedición, admin) cuando un pedido entra o pasa a «En espera».
// - "listo": el vendedor que cargó el pedido, cuando pasa a «Listo para entregar».
export function decidirAviso({ iniciado, previo, pedido, miId, esExpedicion }) {
  if (!iniciado || !pedido) return [];
  const tipos = [];
  if (esExpedicion && pedido.activo !== false && pedido.estado === "en_espera" && previo !== "en_espera") {
    tipos.push("espera");
  }
  if (
    miId &&
    pedido.vendedor_id === miId &&
    pedido.estado === "listo_para_entregar" &&
    previo &&
    previo !== "listo_para_entregar"
  ) {
    tipos.push("listo");
  }
  return tipos;
}

// Avisos de pedidos para toda la app (se usa una sola vez, en App.jsx).
// Devuelve los carteles a mostrar y la función para cerrarlos.
export default function useAvisosPedidos() {
  const { perfil, esAdmin, esExpedicion, esEncargadoExpedicion } = useAuth();
  const miId = perfil?.id;
  const expedicion = !!(esAdmin || esExpedicion || esEncargadoExpedicion);

  const [carteles, setCarteles] = useState([]);
  const expedicionRef = useRef(expedicion);
  expedicionRef.current = expedicion;

  const cerrar = useCallback((id) => setCarteles((lista) => lista.filter((c) => c.id !== id)), []);

  useEffect(() => {
    if (!miId) return undefined;

    const estados = new Map(); // id del pedido → último estado conocido
    let iniciado = false;
    let ultimoSonido = { espera: 0, listo: 0 };
    let vivo = true;

    const avisarSistema = (titulo, cuerpo, tag) => {
      if (document.visibilityState !== "hidden") return;
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      try {
        const aviso = new Notification(titulo, { body: cuerpo, tag, icon: "/logo.png" });
        aviso.onclick = () => {
          window.focus();
          aviso.close();
        };
      } catch {
        /* el navegador no permitió mostrar el aviso */
      }
    };

    const avisar = (tipo, p) => {
      if (!leerAvisos()) return;
      const ahora = Date.now();
      if (ahora - ultimoSonido[tipo] > 1500) {
        ultimoSonido[tipo] = ahora;
        reproducir(tipo === "espera" ? "timbre" : "doble");
      }
      const cliente = limpiarCliente(p.cliente_nombre) || "";
      // Cada vez que suena el aviso también se muestra el cartel
      const id = `${tipo}-${p.id}-${ahora}`;
      setCarteles((lista) =>
        [{ id, tipo, pedidoId: p.id, numero: p.numero_pedido, cliente }, ...lista].slice(0, MAX_CARTELES),
      );
      setTimeout(() => cerrar(id), DURACION_CARTEL_MS);
      avisarSistema(
        tipo === "listo" ? "Pedido listo para entregar" : "Pedido en espera",
        `#${p.numero_pedido}${cliente ? ` · ${cliente}` : ""}`,
        `${tipo}-${p.id}`,
      );
    };

    const procesar = (p) => {
      if (!p?.id) return;
      const previo = estados.get(p.id);
      estados.set(p.id, p.estado);
      decidirAviso({ iniciado, previo, pedido: p, miId, esExpedicion: expedicionRef.current }).forEach((t) => avisar(t, p));
    };

    const sincronizar = async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("id, numero_pedido, cliente_nombre, vendedor_id, estado, activo")
        .eq("activo", true);
      if (error || !vivo) return;
      if (!iniciado) {
        // Primera lectura: solo se registra cómo está todo, sin avisar
        data.forEach((p) => estados.set(p.id, p.estado));
        iniciado = true;
        return;
      }
      data.forEach(procesar);
    };

    sincronizar();
    const intervalo = setInterval(sincronizar, CADA_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") sincronizar();
    };
    document.addEventListener("visibilitychange", alVolver);

    const canal = supabase
      .channel(`avisos-pedidos-${miId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, (payload) => {
        if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") procesar(payload.new);
      })
      .subscribe();

    return () => {
      vivo = false;
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
      supabase.removeChannel(canal);
    };
  }, [miId, cerrar]);

  return { carteles, cerrar };
}
