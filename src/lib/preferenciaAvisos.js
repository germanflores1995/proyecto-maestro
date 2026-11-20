// Interruptor «Avisos» (menú de la cuenta): sonido, carteles y avisos del sistema.
// Está activado por defecto. Se guarda en este equipo y se comparte entre el menú y el resto de la app.
const CLAVE = "maestro_avisos_v2";
const EVENTO = "maestro-avisos-cambio";

export function leerAvisos() {
  try {
    return localStorage.getItem(CLAVE) !== "0";
  } catch {
    return true;
  }
}

export function guardarAvisos(valor) {
  try {
    localStorage.setItem(CLAVE, valor ? "1" : "0");
  } catch {
    /* sin almacenamiento: vale solo hasta cerrar la pestaña */
  }
  window.dispatchEvent(new Event(EVENTO));
}

export function suscribirAvisos(callback) {
  window.addEventListener(EVENTO, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENTO, callback);
    window.removeEventListener("storage", callback);
  };
}
