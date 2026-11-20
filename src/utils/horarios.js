const TZ = "America/Argentina/Buenos_Aires";

export function ahoraArgentina() {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const get = (tipo) => partes.find((p) => p.type === tipo).value;
  const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let hora = parseInt(get("hour"), 10);
  if (hora === 24) hora = 0;
  return { dia: dias[get("weekday")], hora };
}

const pad = (h) => String(h).padStart(2, "0") + ":00";

export function horariosDisponibles(estado) {
  if (estado !== "viene_hoy" && estado !== "retira_manana") {
    return { aplica: false, horas: [], sinHorarios: false, descripcionDia: "" };
  }

  const { dia, hora } = ahoraArgentina();

  let diaRetiro = dia;
  if (estado === "retira_manana") {
    diaRetiro = (dia + 1) % 7;
    if (diaRetiro === 0) diaRetiro = 1;
  }

  let desde = 9;
  let hasta = 16;
  if (diaRetiro === 6) {
    desde = 8;
    hasta = 12;
  }

  const horas = [];
  if (diaRetiro !== 0) {
    for (let h = desde; h <= hasta; h++) {
      if (estado === "viene_hoy" && h <= hora) continue;
      horas.push(pad(h));
    }
  }

  let descripcionDia = "hoy";
  if (estado === "retira_manana") {
    if (diaRetiro === 6) descripcionDia = "el sábado";
    else if (dia === 6 || dia === 0) descripcionDia = "el lunes";
    else descripcionDia = "mañana";
  }

  return {
    aplica: true,
    horas,
    sinHorarios: horas.length === 0,
    descripcionDia,
  };
}

// Fecha (AAAA-MM-DD) en Argentina, hoy + n días
export function fechaArgentina(n = 0) {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const [a, m, d] = hoy.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

// Para qué día es la hora que se elige según el estado:
// «Viene hoy» → hoy; «Retira mañana» → mañana (sábado y domingo → lunes, igual que en horariosDisponibles).
export function diaDeRetiro(estado) {
  if (estado !== "retira_manana") return fechaArgentina(0);
  const { dia } = ahoraArgentina();
  return fechaArgentina(dia === 6 ? 2 : 1);
}

// La hora guardada del pedido, solo si todavía sirve: si fue elegida para un día que ya pasó
// (ej. «viene hoy» de ayer que no vino), se ignora y el pedido queda sin hora.
export function horaVigente(pedido) {
  if (!pedido?.hora_desde) return null;
  if (pedido.hora_desde_dia && pedido.hora_desde_dia < fechaArgentina(0)) return null;
  return pedido.hora_desde;
}

export function formatearHoraDesde(valor) {
  return valor ? String(valor).slice(0, 5) : "";
}

export function ordenarConHorario(lista) {
  const resultado = [];
  let i = 0;
  while (i < lista.length) {
    let j = i;
    while (j < lista.length && lista[j].estado === lista[i].estado) j++;
    const tramo = lista.slice(i, j);
    const conHora = tramo
      .filter((p) => horaVigente(p))
      .sort((a, b) => String(horaVigente(a)).localeCompare(String(horaVigente(b))));
    const sinHora = tramo.filter((p) => !horaVigente(p));
    resultado.push(...conHora, ...sinHora);
    i = j;
  }
  return resultado;
}
