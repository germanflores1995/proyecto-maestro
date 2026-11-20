// Sonidos de aviso generados por el navegador (no hay archivos de audio).
// Cada nota: [frecuencia Hz, inicio s, duración s, onda, volumen]
const SONIDOS = {
  // Expedición: timbre de mostrador (dos «ding» brillantes)
  timbre: [
    [2093, 0, 0.9, "sine", 0.45],
    [4186, 0, 0.45, "sine", 0.16],
    [2093, 0.32, 1.0, "sine", 0.45],
    [4186, 0.32, 0.5, "sine", 0.16],
  ],
  // Vendedores: doble campanita (dos notas, la segunda más aguda)
  doble: [
    [988, 0, 0.7, "sine", 0.5],
    [1319, 0.22, 1.0, "sine", 0.5],
    [2638, 0.22, 0.5, "sine", 0.14],
  ],
};

const VOLUMEN = 0.5;

let ctx = null;

function contexto() {
  if (ctx) return ctx;
  const C = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!C) return null;
  try {
    ctx = new C();
  } catch {
    ctx = null;
  }
  return ctx;
}

// Los navegadores solo dejan sonar audio si la persona ya tocó algo en la página.
// Con el primer toque o tecla se deja el audio listo, así después puede sonar aunque la pestaña esté en segundo plano.
function desbloquear() {
  const c = contexto();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

if (typeof window !== "undefined") {
  ["pointerdown", "keydown", "touchstart"].forEach((ev) =>
    window.addEventListener(ev, desbloquear, { passive: true }),
  );
}

export function reproducir(nombre) {
  const notas = SONIDOS[nombre];
  const c = contexto();
  if (!notas || !c) return;
  try {
    if (c.state === "suspended") c.resume().catch(() => {});
    const t0 = c.currentTime + 0.03;
    notas.forEach(([frecuencia, inicio, duracion, onda, volumen]) => {
      const osc = c.createOscillator();
      const amp = c.createGain();
      osc.type = onda;
      osc.frequency.setValueAtTime(frecuencia, t0 + inicio);
      amp.gain.setValueAtTime(0.0001, t0 + inicio);
      amp.gain.exponentialRampToValueAtTime(Math.max(volumen * VOLUMEN, 0.0002), t0 + inicio + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + inicio + duracion);
      osc.connect(amp);
      amp.connect(c.destination);
      osc.start(t0 + inicio);
      osc.stop(t0 + inicio + duracion + 0.05);
    });
  } catch {
    /* si el navegador no deja reproducir, el aviso en pantalla igual aparece */
  }
}
