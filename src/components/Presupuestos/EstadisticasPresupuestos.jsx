import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import {
  CONFIG_DEFAULT,
  formatearMonto,
  fechaCorta,
  evaluarPresupuesto,
} from "../../utils/presupuestos";
import { limpiarCliente } from "../../utils/ordenar";
import "./estadisticas.css";

// Estadísticas de presupuestos, en tres pestañas:
//  - Resumen: lo confirmado, lo perdido, la conversión y lo que está en juego.
//  - Pérdidas: por qué se pierden, cuánto seguimiento tuvieron y qué mejorar.
//  - Contactos: qué medios (llamada, WhatsApp...) y qué franjas horarias funcionan mejor.
//  - Vendedores: ranking (solo encargado y admin). Al tocar un vendedor se ven sus
//    estadísticas personales, con las mismas pestañas pero solo con sus datos.
// Lo cerrado (confirmado o perdido) se cuenta por su fecha de cierre.

const PERIODOS = [
  { key: "mes", label: "Este mes" },
  { key: "3m", label: "Últimos 3 meses" },
  { key: "todo", label: "Todo" },
];
const COMPARACION = { mes: "vs. mes anterior", "3m": "vs. 3 meses previos" };

const DIA = 86400000;

// ¿La fecha cae dentro del período elegido?
function enPeriodo(iso, periodo) {
  if (!iso) return false;
  if (periodo === "todo") return true;
  const f = new Date(iso);
  if (periodo === "3m") return Date.now() - f.getTime() <= 90 * DIA;
  const ahora = new Date();
  return f.getFullYear() === ahora.getFullYear() && f.getMonth() === ahora.getMonth();
}

// ¿Cae en el período inmediatamente anterior? (no aplica a "Todo")
function enPeriodoAnterior(iso, periodo) {
  if (!iso || periodo === "todo") return false;
  const f = new Date(iso);
  if (periodo === "3m") {
    const dias = (Date.now() - f.getTime()) / DIA;
    return dias > 90 && dias <= 180;
  }
  const ahora = new Date();
  const ant = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
  return f.getFullYear() === ant.getFullYear() && f.getMonth() === ant.getMonth();
}

const pct = (parte, total) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : 0);
const pctTexto = (parte, total) => `${String(pct(parte, total)).replace(".", ",")}%`;
const num1 = (n) => String(Math.round(n * 10) / 10).replace(".", ",");

// $26,5 M para los números grandes; el valor exacto va en el tooltip
function montoCorto(n) {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1000000) return `$${num1(v / 1000000)} M`;
  return formatearMonto(v);
}

const importeConfirmadoDe = (p) => Number(p.importe_confirmado ?? p.importe_original ?? 0);

// Totales de un conjunto de presupuestos cerrados
function totalesCierre(cerrados) {
  const conf = cerrados.filter((p) => p.estado === "confirmado");
  const perd = cerrados.filter((p) => p.estado === "perdido");
  const impConf = conf.reduce((a, p) => a + importeConfirmadoDe(p), 0);
  const impPerd = perd.reduce((a, p) => a + Number(p.importe_original || 0), 0);
  const conResultado = conf.length + perd.length;
  return {
    conf: conf.length,
    perd: perd.length,
    impConf,
    impPerd,
    conResultado,
    conversion: pct(conf.length, conResultado),
    tasaPerdida: pct(perd.length, conResultado),
  };
}

// Variación contra el período anterior. invertido: que baje es bueno (lo perdido)
function variacion(actual, previo, invertido = false) {
  if (!previo && !actual) return { texto: "sin cambios", tono: "igual" };
  if (!previo) return { texto: "nuevo", tono: invertido ? "baja" : "sube" };
  const d = ((actual - previo) / previo) * 100;
  if (Math.abs(d) < 0.5) return { texto: "sin cambios", tono: "igual" };
  const sube = d > 0;
  return {
    texto: `${sube ? "▲" : "▼"} ${num1(Math.abs(d))}%`,
    tono: (invertido ? !sube : sube) ? "sube" : "baja",
  };
}
function variacionPuntos(actual, previo, invertido = false) {
  const d = Math.round((actual - previo) * 10) / 10;
  if (d === 0) return { texto: "sin cambios", tono: "igual" };
  const sube = d > 0;
  return {
    texto: `${sube ? "▲" : "▼"} ${num1(Math.abs(d))} pts`,
    tono: (invertido ? !sube : sube) ? "sube" : "baja",
  };
}

// Consejo según el nombre del motivo de pérdida
function consejoMotivo(etiqueta = "") {
  const t = etiqueta.toLowerCase();
  if (/precio|caro|costo|valor/.test(t)) return "Revisar las cotizaciones y los márgenes, y ofrecer alternativas.";
  if (/competenc/.test(t)) return "Ver qué ofrece la competencia y reforzar lo que nos diferencia.";
  if (/plazo|entrega|demora|tiempo/.test(t)) return "Revisar los tiempos de entrega y comunicarlos mejor.";
  if (/stock|disponib/.test(t)) return "Revisar la disponibilidad de los productos más pedidos.";
  if (/financ|pago|cr[eé]dito/.test(t)) return "Evaluar mejores condiciones de pago o financiación.";
  if (/seguim|respuesta|contact|atenci/.test(t)) return "Mejorar el seguimiento y la rapidez de respuesta.";
  return "Analizar estos casos para encontrar qué se puede cambiar.";
}

// Frases de "qué mejorar", ordenadas por importancia (máximo 5)
function armarHallazgos({ perdidos, motivos, seg, vendedores, totales, previos, importeAlto, veTodos, empresa }) {
  const n = perdidos.length;
  if (n === 0) return [{ tono: "info", texto: "No hay presupuestos perdidos en este período." }];
  if (n < 5) {
    return [
      {
        tono: "info",
        texto: `Hay solo ${n} presupuesto${n === 1 ? "" : "s"} perdido${n === 1 ? "" : "s"} en este período: son pocos datos para sacar conclusiones firmes.`,
      },
    ];
  }
  const h = [];

  const top = motivos.find((m) => m.clave !== "sin_motivo");
  if (top && pct(top.cantidad, n) >= 30) {
    h.push({
      tono: "rojo",
      texto: `El ${pctTexto(top.cantidad, n)} de lo perdido fue por «${top.etiqueta}» (${top.cantidad} presupuestos, ${montoCorto(top.importe)}).`,
      consejo: consejoMotivo(top.etiqueta),
    });
  }

  if (seg.sinContacto > 0 && pct(seg.sinContacto, n) >= 20) {
    h.push({
      tono: "rojo",
      texto: `${seg.sinContacto} perdido${seg.sinContacto === 1 ? "" : "s"} (${pctTexto(seg.sinContacto, n)}) no tuvo${seg.sinContacto === 1 ? "" : "ieron"} ni un solo contacto efectivo.`,
      consejo: "Probable falta de seguimiento: priorizar el primer contacto con el cliente.",
    });
  }

  if (seg.gestionesProm < 3) {
    h.push({
      tono: "ambar",
      texto: `Antes de perderse, cada presupuesto tuvo en promedio ${num1(seg.gestionesProm)} gestiones.`,
      consejo: "Insistir más antes de darlos por perdidos.",
    });
  }

  const sinMotivo = motivos.find((m) => m.clave === "sin_motivo");
  if (sinMotivo && pct(sinMotivo.cantidad, n) >= 15) {
    h.push({
      tono: "ambar",
      texto: `${sinMotivo.cantidad} perdido${sinMotivo.cantidad === 1 ? "" : "s"} (${pctTexto(sinMotivo.cantidad, n)}) ${sinMotivo.cantidad === 1 ? "no tiene" : "no tienen"} motivo cargado.`,
      consejo: "Completar siempre el motivo para poder analizar qué pasa.",
    });
  }

  const impTotal = perdidos.reduce((a, p) => a + Number(p.importe_original || 0), 0);
  const impGrandes = perdidos
    .filter((p) => Number(p.importe_original) >= importeAlto)
    .reduce((a, p) => a + Number(p.importe_original || 0), 0);
  if (impTotal > 0 && pct(impGrandes, impTotal) >= 50) {
    h.push({
      tono: "ambar",
      texto: `Los presupuestos de importe alto concentran el ${pctTexto(impGrandes, impTotal)} de lo perdido.`,
      consejo: "Darles seguimiento prioritario, con apoyo del encargado.",
    });
  }

  if (previos && previos.impPerd > 0) {
    const d = ((totales.impPerd - previos.impPerd) / previos.impPerd) * 100;
    if (d >= 20) {
      h.push({ tono: "rojo", texto: `Lo perdido en dinero subió ${num1(d)}% respecto del período anterior.` });
    } else if (d <= -20) {
      h.push({ tono: "verde", texto: `Lo perdido en dinero bajó ${num1(Math.abs(d))}% respecto del período anterior.` });
    }
  }

  if (veTodos) {
    const prom = totales.tasaPerdida;
    const peor = vendedores
      .filter((v) => v.conResultado >= 5 && v.tasaPerdida >= prom * 1.5 && v.tasaPerdida - prom >= 15)
      .sort((a, b) => b.tasaPerdida - a.tasaPerdida)[0];
    if (peor) {
      h.push({
        tono: "ambar",
        texto: `${peor.nombre} pierde el ${num1(peor.tasaPerdida)}% de lo que cierra (el promedio es ${num1(prom)}%).`,
        consejo: "Acompañarlo y revisar sus casos perdidos.",
      });
    }
  }

  // Estadísticas personales: comparación con el promedio de la empresa
  if (empresa && totales.conResultado >= 5 && empresa.conResultado >= 10) {
    if (totales.tasaPerdida - empresa.tasaPerdida >= 15) {
      h.push({
        tono: "ambar",
        texto: `Su % de pérdida (${num1(totales.tasaPerdida)}%) supera al de la empresa (${num1(empresa.tasaPerdida)}%).`,
        consejo: "Revisar sus casos perdidos para ver qué se puede mejorar.",
      });
    } else if (empresa.tasaPerdida - totales.tasaPerdida >= 15) {
      h.push({
        tono: "verde",
        texto: `Su % de pérdida (${num1(totales.tasaPerdida)}%) está bien por debajo del de la empresa (${num1(empresa.tasaPerdida)}%).`,
      });
    }
  }

  const orden = { rojo: 0, ambar: 1, verde: 2, info: 3 };
  return h.sort((a, b) => orden[a.tono] - orden[b.tono]).slice(0, 5);
}

// ---------- Contactos: medios y franjas ----------
const MUESTRA_MIN = 8; // con menos gestiones no se saca conclusión

const FORMATO_HORA = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  hour: "numeric",
  hourCycle: "h23",
});
const horaBA = (iso) => parseInt(FORMATO_HORA.format(new Date(iso)), 10);

const FRANJAS = [
  { clave: "manana", etiqueta: "Mañana", rango: "8 a 12 h", cubre: (h) => h >= 8 && h < 12 },
  { clave: "mediodia", etiqueta: "Mediodía", rango: "12 a 15 h", cubre: (h) => h >= 12 && h < 15 },
  { clave: "tarde", etiqueta: "Tarde", rango: "15 a 19 h", cubre: (h) => h >= 15 && h < 19 },
  { clave: "fuera", etiqueta: "Fuera de horario", rango: "antes de las 8 o después de las 19 h", cubre: () => true },
];
const franjaDe = (iso) => FRANJAS.find((f) => f.cubre(horaBA(iso)));

// Conclusiones sobre qué medios y horarios conviene usar
function armarHallazgosContactos({ medios, franjas, total }) {
  if (total < 15) {
    return [
      {
        tono: "info",
        texto: `Hay solo ${total} gestion${total === 1 ? "" : "es"} en este período: son pocos datos para comparar medios y horarios.`,
      },
    ];
  }
  const h = [];
  const validos = medios.filter((m) => m.cantidad >= MUESTRA_MIN);
  if (validos.length >= 2) {
    const mejor = [...validos].sort((a, b) => b.tasa - a.tasa)[0];
    const peor = [...validos].sort((a, b) => a.tasa - b.tasa)[0];
    if (mejor.clave !== peor.clave && mejor.tasa - peor.tasa >= 10) {
      h.push({
        tono: "verde",
        texto: `«${mejor.etiqueta}» es el medio más efectivo: el ${num1(mejor.tasa)}% de sus gestiones llega a un contacto efectivo (${peor.etiqueta}: ${num1(peor.tasa)}%).`,
        consejo: `Probar ${mejor.etiqueta} primero cuando no se logra contactar al cliente.`,
      });
    }
    const masUsado = [...validos].sort((a, b) => b.cantidad - a.cantidad)[0];
    if (
      masUsado.clave === peor.clave &&
      masUsado.clave !== mejor.clave &&
      pct(masUsado.cantidad, total) >= 30 &&
      mejor.tasa - masUsado.tasa >= 10
    ) {
      h.push({
        tono: "rojo",
        texto: `«${masUsado.etiqueta}» es el medio más usado (${pctTexto(masUsado.cantidad, total)} de las gestiones) pero el menos efectivo.`,
        consejo: "Combinarlo con el medio más efectivo para no perder contactos.",
      });
    }
    const pocoUsado = validos
      .filter((m) => pct(m.cantidad, total) < 15 && m.tasa >= pct(medios.reduce((a, x) => a + x.efectivas, 0), total) + 10)
      .sort((a, b) => b.tasa - a.tasa)[0];
    if (pocoUsado) {
      h.push({
        tono: "ambar",
        texto: `«${pocoUsado.etiqueta}» se usa poco (${pctTexto(pocoUsado.cantidad, total)}) pero funciona bien: ${num1(pocoUsado.tasa)}% de contacto efectivo.`,
        consejo: "Usarlo más seguido.",
      });
    }
  }

  const fValidas = franjas.filter((f) => f.cantidad >= MUESTRA_MIN && f.clave !== "fuera");
  if (fValidas.length >= 2) {
    const mejor = [...fValidas].sort((a, b) => b.tasa - a.tasa)[0];
    const peor = [...fValidas].sort((a, b) => a.tasa - b.tasa)[0];
    if (mejor.tasa - peor.tasa >= 10) {
      h.push({
        tono: "verde",
        texto: `El mejor horario para contactar es ${mejor.etiqueta.toLowerCase()} (${mejor.rango}): ${num1(mejor.tasa)}% de contacto efectivo, contra ${num1(peor.tasa)}% en ${peor.etiqueta.toLowerCase()}.`,
        consejo: `Concentrar los llamados importantes en esa franja.`,
      });
    }
  }
  if (!h.length) {
    h.push({ tono: "info", texto: "No hay diferencias grandes entre medios ni horarios en este período." });
  }
  const orden = { rojo: 0, ambar: 1, verde: 2, info: 3 };
  return h.sort((a, b) => orden[a.tono] - orden[b.tono]).slice(0, 4);
}

export default function EstadisticasPresupuestos({ lista, estados, catalogos, config, onAbrirDetalle }) {
  const { esEncargadoVentas, esAdmin } = useAuth();
  const veTodos = esEncargadoVentas || esAdmin;
  const cfg = config || CONFIG_DEFAULT;

  const [periodo, setPeriodo] = useState("todo");
  const [tab, setTab] = useState("resumen");
  const [verLista, setVerLista] = useState(false);
  const [vendedorSel, setVendedorSel] = useState(null); // id del vendedor cuyo tablero personal se ve
  const [gestiones, setGestiones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  // Gestiones (llamados, mensajes, visitas) de todos los presupuestos visibles
  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      // PostgREST devuelve como máximo 1000 filas por pedido: se trae por páginas
      const PAGINA = 1000;
      const todas = [];
      let desde = 0;
      let fallo = false;
      for (;;) {
        const { data, error: err } = await supabase
          .from("presupuesto_gestiones")
          .select(
            "seguimiento_id, ocurrio_at, medio, resultado, efectivo, situacion, usuario_id, usuario:usuarios!usuario_id(nombre)",
          )
          .eq("anulada", false)
          .order("ocurrio_at", { ascending: false })
          .order("id", { ascending: false })
          .range(desde, desde + PAGINA - 1);
        if (!vivo) return;
        if (err) {
          fallo = true;
          break;
        }
        todas.push(...(data || []));
        if (!data || data.length < PAGINA) break;
        desde += PAGINA;
      }
      if (fallo) setError("No se pudieron cargar las gestiones: los datos de seguimiento pueden estar incompletos.");
      setGestiones(todas);
      setCargando(false);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const personal = veTodos && vendedorSel != null; // ¿se está viendo a un solo vendedor?

  const etiquetas = useMemo(() => {
    const mapa = {};
    Object.entries(catalogos || {}).forEach(([tipo, items]) => {
      mapa[tipo] = Object.fromEntries(items.map((i) => [i.clave, i.etiqueta]));
    });
    return mapa;
  }, [catalogos]);
  const cierra = useMemo(() => Object.fromEntries((estados || []).map((e) => [e.clave, e.cierra])), [estados]);

  const idsVisibles = useMemo(() => new Set((lista || []).map((p) => p.id)), [lista]);
  const gestionesVisibles = useMemo(
    () => gestiones.filter((g) => idsVisibles.has(g.seguimiento_id)),
    [gestiones, idsVisibles],
  );

  // Presupuestos que se analizan: todos, o solo los del vendedor elegido
  const base = useMemo(
    () => (personal ? (lista || []).filter((p) => p.responsable_id === vendedorSel) : lista || []),
    [lista, personal, vendedorSel],
  );

  // ---------- Lo cerrado en el período y en el anterior ----------
  const cerradosEmpresa = useMemo(
    () => (lista || []).filter((p) => p.fecha_cierre && enPeriodo(p.fecha_cierre, periodo)),
    [lista, periodo],
  );
  const cerradosPeriodo = useMemo(
    () => (personal ? cerradosEmpresa.filter((p) => p.responsable_id === vendedorSel) : cerradosEmpresa),
    [cerradosEmpresa, personal, vendedorSel],
  );
  const cerradosPrevio = useMemo(
    () =>
      periodo === "todo"
        ? null
        : base.filter((p) => p.fecha_cierre && enPeriodoAnterior(p.fecha_cierre, periodo)),
    [base, periodo],
  );
  const totales = useMemo(() => totalesCierre(cerradosPeriodo), [cerradosPeriodo]);
  const totalesEmpresa = useMemo(() => totalesCierre(cerradosEmpresa), [cerradosEmpresa]);
  const previos = useMemo(() => (cerradosPrevio ? totalesCierre(cerradosPrevio) : null), [cerradosPrevio]);

  // ---------- Abiertos hoy ----------
  const abiertos = useMemo(() => base.filter((p) => !cierra[p.estado]), [base, cierra]);
  const enJuego = useMemo(
    () => abiertos.reduce((a, p) => a + Number(p.importe_original || 0), 0),
    [abiertos],
  );
  const enAlerta = useMemo(() => {
    const rojos = abiertos.filter((p) => evaluarPresupuesto(p, cfg).alerta);
    return { cantidad: rojos.length, importe: rojos.reduce((a, p) => a + Number(p.importe_original || 0), 0) };
  }, [abiertos, cfg]);
  const abiertosPorEstado = useMemo(() => {
    const filas = (estados || [])
      .filter((e) => !e.cierra)
      .map((e) => {
        const de = abiertos.filter((p) => p.estado === e.clave);
        return {
          clave: e.clave,
          etiqueta: e.etiqueta,
          cantidad: de.length,
          importe: de.reduce((a, p) => a + Number(p.importe_original || 0), 0),
        };
      });
    const max = Math.max(1, ...filas.map((f) => f.cantidad));
    return filas.map((f) => ({ ...f, ancho: (f.cantidad / max) * 100 }));
  }, [estados, abiertos]);

  // ---------- Confirmado y perdido, mes a mes (últimos 6) ----------
  const porMes = useMemo(() => {
    const ahora = new Date();
    const meses = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
      meses.push({
        anio: d.getFullYear(),
        mes: d.getMonth(),
        etiqueta: d.toLocaleDateString("es-AR", { month: "short" }).replace(".", ""),
        conf: 0,
        perd: 0,
      });
    }
    base.forEach((p) => {
      if (!p.fecha_cierre) return;
      const f = new Date(p.fecha_cierre);
      const m = meses.find((x) => x.anio === f.getFullYear() && x.mes === f.getMonth());
      if (!m) return;
      if (p.estado === "confirmado") m.conf += importeConfirmadoDe(p);
      else if (p.estado === "perdido") m.perd += Number(p.importe_original || 0);
    });
    const max = Math.max(1, ...meses.flatMap((m) => [m.conf, m.perd]));
    return { meses, max };
  }, [base]);

  // ---------- Pérdidas ----------
  const gestionesPorPresupuesto = useMemo(() => {
    const mapa = {};
    gestionesVisibles.forEach((g) => {
      (mapa[g.seguimiento_id] ||= []).push(g);
    });
    return mapa;
  }, [gestionesVisibles]);

  const perdidos = useMemo(
    () =>
      cerradosPeriodo
        .filter((p) => p.estado === "perdido")
        .map((p) => {
          const limite = new Date(p.fecha_cierre).getTime() + 60000;
          const gs = (gestionesPorPresupuesto[p.id] || []).filter((g) => new Date(g.ocurrio_at).getTime() <= limite);
          return {
            ...p,
            _gestiones: gs.length,
            _efectivas: gs.filter((g) => g.efectivo).length,
            _dias: Math.max(0, Math.round((new Date(p.fecha_cierre) - new Date(p.fecha_creacion_odoo)) / DIA)),
          };
        })
        .sort((a, b) => new Date(b.fecha_cierre) - new Date(a.fecha_cierre)),
    [cerradosPeriodo, gestionesPorPresupuesto],
  );

  const motivos = useMemo(() => {
    const mapa = {};
    perdidos.forEach((p) => {
      const clave = p.motivo_perdida || "sin_motivo";
      (mapa[clave] ||= { clave, cantidad: 0, importe: 0 });
      mapa[clave].cantidad += 1;
      mapa[clave].importe += Number(p.importe_original || 0);
    });
    const filas = Object.values(mapa).map((m) => ({
      ...m,
      etiqueta: m.clave === "sin_motivo" ? "Sin motivo cargado" : etiquetas.motivo_perdida?.[m.clave] || m.clave,
    }));
    return filas.sort((a, b) => b.importe - a.importe || b.cantidad - a.cantidad);
  }, [perdidos, etiquetas]);

  const seg = useMemo(() => {
    const n = perdidos.length;
    if (!n) return { dias: 0, gestionesProm: 0, sinContacto: 0, tramos: [] };
    const tramos = [
      { clave: "0", etiqueta: "Ninguna", cantidad: perdidos.filter((p) => p._gestiones === 0).length },
      { clave: "1-2", etiqueta: "1 a 2", cantidad: perdidos.filter((p) => p._gestiones >= 1 && p._gestiones <= 2).length },
      { clave: "3-5", etiqueta: "3 a 5", cantidad: perdidos.filter((p) => p._gestiones >= 3 && p._gestiones <= 5).length },
      { clave: "6+", etiqueta: "6 o más", cantidad: perdidos.filter((p) => p._gestiones >= 6).length },
    ];
    return {
      dias: perdidos.reduce((a, p) => a + p._dias, 0) / n,
      gestionesProm: perdidos.reduce((a, p) => a + p._gestiones, 0) / n,
      sinContacto: perdidos.filter((p) => p._efectivas === 0).length,
      tramos,
    };
  }, [perdidos]);

  // ---------- Vendedores (siempre sobre toda la empresa) ----------
  const vendedores = useMemo(() => {
    const mapa = new Map();
    const fila = (id, nombre) => {
      if (!mapa.has(id)) {
        mapa.set(id, {
          id,
          nombre,
          conf: 0,
          perd: 0,
          impConf: 0,
          impPerd: 0,
          abiertos: 0,
          gestiones: 0,
          efectivas: 0,
          motivos: {},
        });
      }
      return mapa.get(id);
    };
    (lista || []).forEach((p) => {
      const f = fila(p.responsable_id, p.responsable?.nombre || "Sin nombre");
      if (!cierra[p.estado]) f.abiertos += 1;
    });
    cerradosEmpresa.forEach((p) => {
      const f = fila(p.responsable_id, p.responsable?.nombre || "Sin nombre");
      if (p.estado === "confirmado") {
        f.conf += 1;
        f.impConf += importeConfirmadoDe(p);
      } else if (p.estado === "perdido") {
        f.perd += 1;
        f.impPerd += Number(p.importe_original || 0);
        const k = p.motivo_perdida || "sin_motivo";
        f.motivos[k] = (f.motivos[k] || 0) + 1;
      }
    });
    gestionesVisibles
      .filter((g) => enPeriodo(g.ocurrio_at, periodo))
      .forEach((g) => {
        const f = fila(g.usuario_id, g.usuario?.nombre || "Sin nombre");
        f.gestiones += 1;
        if (g.efectivo) f.efectivas += 1;
      });
    return [...mapa.values()]
      .map((f) => {
        const conResultado = f.conf + f.perd;
        const principal = Object.entries(f.motivos).sort((a, b) => b[1] - a[1])[0]?.[0];
        return {
          ...f,
          conResultado,
          conversion: pct(f.conf, conResultado),
          tasaPerdida: pct(f.perd, conResultado),
          motivoPrincipal: principal
            ? principal === "sin_motivo"
              ? "Sin motivo cargado"
              : etiquetas.motivo_perdida?.[principal] || principal
            : "—",
        };
      })
      .filter((f) => f.conResultado > 0 || f.abiertos > 0 || f.gestiones > 0)
      .sort((a, b) => b.impConf - a.impConf || b.conf - a.conf);
  }, [lista, cerradosEmpresa, gestionesVisibles, periodo, cierra, etiquetas]);

  const nombreVendedor = personal
    ? vendedores.find((v) => v.id === vendedorSel)?.nombre ||
      (lista || []).find((p) => p.responsable_id === vendedorSel)?.responsable?.nombre ||
      "Vendedor"
    : "";

  // ---------- Contactos: qué medios y qué horarios funcionan ----------
  // Gestiones del período (y, en la vista personal, solo las que hizo ese vendedor)
  const gestionesPeriodo = useMemo(
    () =>
      gestionesVisibles.filter(
        (g) => enPeriodo(g.ocurrio_at, periodo) && (!personal || g.usuario_id === vendedorSel),
      ),
    [gestionesVisibles, periodo, personal, vendedorSel],
  );
  const gestionesEmpresaPeriodo = useMemo(
    () => gestionesVisibles.filter((g) => enPeriodo(g.ocurrio_at, periodo)),
    [gestionesVisibles, periodo],
  );

  const medios = useMemo(() => {
    const mapa = {};
    gestionesPeriodo.forEach((g) => {
      const clave = g.medio || "sin_medio";
      (mapa[clave] ||= { clave, cantidad: 0, efectivas: 0, cierreN: 0, cierreConf: 0 });
      mapa[clave].cantidad += 1;
      if (g.efectivo) mapa[clave].efectivas += 1;
    });
    // "Cierre logrado": de los presupuestos cerrados donde este medio consiguió un contacto
    // efectivo (antes del cierre), cuántos terminaron confirmados.
    cerradosPeriodo
      .filter((p) => p.estado === "confirmado" || p.estado === "perdido")
      .forEach((p) => {
        const limite = new Date(p.fecha_cierre).getTime() + 60000;
        const usados = new Set();
        (gestionesPorPresupuesto[p.id] || []).forEach((g) => {
          if (!g.efectivo || new Date(g.ocurrio_at).getTime() > limite) return;
          if (personal && g.usuario_id !== vendedorSel) return;
          usados.add(g.medio || "sin_medio");
        });
        usados.forEach((clave) => {
          if (!mapa[clave]) return;
          mapa[clave].cierreN += 1;
          if (p.estado === "confirmado") mapa[clave].cierreConf += 1;
        });
      });
    const filas = Object.values(mapa).map((m) => ({
      ...m,
      etiqueta: m.clave === "sin_medio" ? "Sin medio cargado" : etiquetas.medio?.[m.clave] || m.clave,
      tasa: pct(m.efectivas, m.cantidad),
      tasaCierre: pct(m.cierreConf, m.cierreN),
    }));
    return filas.sort((a, b) => b.cantidad - a.cantidad);
  }, [gestionesPeriodo, cerradosPeriodo, gestionesPorPresupuesto, personal, vendedorSel, etiquetas]);

  const franjas = useMemo(() => {
    const mapa = Object.fromEntries(FRANJAS.map((f) => [f.clave, { ...f, cantidad: 0, efectivas: 0 }]));
    gestionesPeriodo.forEach((g) => {
      const f = mapa[franjaDe(g.ocurrio_at).clave];
      f.cantidad += 1;
      if (g.efectivo) f.efectivas += 1;
    });
    return FRANJAS.map((f) => ({ ...mapa[f.clave], tasa: pct(mapa[f.clave].efectivas, mapa[f.clave].cantidad) }));
  }, [gestionesPeriodo]);

  const contacto = useMemo(() => {
    const total = gestionesPeriodo.length;
    const efectivas = gestionesPeriodo.filter((g) => g.efectivo).length;
    const validos = medios.filter((m) => m.cantidad >= MUESTRA_MIN && m.clave !== "sin_medio");
    return {
      total,
      efectivas,
      tasa: pct(efectivas, total),
      mejor: [...validos].sort((a, b) => b.tasa - a.tasa)[0] || null,
      masUsado: [...medios].filter((m) => m.clave !== "sin_medio").sort((a, b) => b.cantidad - a.cantidad)[0] || null,
      tasaEmpresa: pct(gestionesEmpresaPeriodo.filter((g) => g.efectivo).length, gestionesEmpresaPeriodo.length),
    };
  }, [gestionesPeriodo, gestionesEmpresaPeriodo, medios]);

  const mejorMedioClave = contacto.mejor?.clave;

  const hallazgosContactos = useMemo(
    () => armarHallazgosContactos({ medios: medios.filter((m) => m.clave !== "sin_medio"), franjas, total: contacto.total }),
    [medios, franjas, contacto.total],
  );

  // ---------- Situación actual de los abiertos (según la última gestión) ----------
  const situaciones = useMemo(() => {
    const mapa = {};
    abiertos.forEach((p) => {
      const ultima = (gestionesPorPresupuesto[p.id] || [])[0]; // vienen de la más nueva a la más vieja
      let clave;
      let etiqueta;
      if (!ultima) {
        clave = "_sin_gestiones";
        etiqueta = "Sin gestiones";
      } else if (!ultima.situacion) {
        clave = "_sin_definir";
        etiqueta = "Sin definir";
      } else {
        clave = ultima.situacion;
        etiqueta = etiquetas.situacion?.[ultima.situacion] || ultima.situacion;
      }
      (mapa[clave] ||= { clave, etiqueta, cantidad: 0, importe: 0 });
      mapa[clave].cantidad += 1;
      mapa[clave].importe += Number(p.importe_original || 0);
    });
    const filas = Object.values(mapa).sort((a, b) => b.cantidad - a.cantidad);
    const max = Math.max(1, ...filas.map((f) => f.cantidad));
    return filas.map((f) => ({ ...f, ancho: (f.cantidad / max) * 100 }));
  }, [abiertos, gestionesPorPresupuesto, etiquetas]);

  const hallazgos = useMemo(
    () =>
      armarHallazgos({
        perdidos,
        motivos,
        seg,
        vendedores,
        totales,
        previos,
        importeAlto: Number(cfg.importe_alto ?? CONFIG_DEFAULT.importe_alto),
        veTodos: veTodos && !personal,
        empresa: personal ? totalesEmpresa : null,
      }),
    [perdidos, motivos, seg, vendedores, totales, previos, cfg, veTodos, personal, totalesEmpresa],
  );

  if (cargando) return <div className="est-caja"><p className="est-vacio">Cargando estadísticas…</p></div>;

  const comparar = periodo !== "todo" && previos;
  const TABS = [
    { key: "resumen", label: "Resumen" },
    { key: "perdidas", label: "Pérdidas" },
    { key: "contactos", label: "Contactos" },
    ...(veTodos && !personal ? [{ key: "vendedores", label: "Vendedores" }] : []),
  ];
  const tabActiva = TABS.some((t) => t.key === tab) ? tab : "resumen";
  const maxMotivo = Math.max(1, ...motivos.map((m) => m.importe));
  const maxTramo = Math.max(1, ...seg.tramos.map((t) => t.cantidad));
  const textoPeriodo =
    periodo === "todo" ? "Todo el historial" : `${PERIODOS.find((p) => p.key === periodo)?.label} · ${COMPARACION[periodo]}`;

  const elegirVendedor = (v) => {
    if (v.id == null) return;
    setVendedorSel(v.id);
    setTab("resumen");
    setVerLista(false);
  };
  const volverATodos = () => {
    setVendedorSel(null);
    setTab("vendedores");
    setVerLista(false);
  };

  return (
    <div className="est-caja">
      <div className="est-cabecera">
        <div>
          <div className="est-titulo">
            {personal ? `Estadísticas de ${nombreVendedor}` : "Estadísticas de presupuestos"}
          </div>
          <div className="est-subtitulo">
            {textoPeriodo}. Lo confirmado y lo perdido se cuenta por su fecha de cierre.
            {!veTodos && " Ves solo tus presupuestos."}
          </div>
        </div>
        <div className="est-periodos">
          {PERIODOS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriodo(p.key)}
              className={`est-periodo-btn${periodo === p.key ? " est-periodo-activo" : ""}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {personal && (
        <div className="est-banner">
          <button className="est-volver" onClick={volverATodos}>
            ← Todos los vendedores
          </button>
          <span className="est-banner-texto">
            Estás viendo solo los presupuestos y las gestiones de <strong>{nombreVendedor}</strong>.
          </span>
        </div>
      )}

      <div className="est-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tabActiva === t.key}
            onClick={() => setTab(t.key)}
            className={`est-tab${tabActiva === t.key ? " est-tab-activa" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="est-error">{error}</p>}

      {/* ---------------- RESUMEN ---------------- */}
      {tabActiva === "resumen" && (
        <>
          <div className="est-kpis">
            <Kpi
              etiqueta="Confirmado"
              valor={montoCorto(totales.impConf)}
              titulo={formatearMonto(totales.impConf)}
              sub={`${totales.conf} presupuesto${totales.conf === 1 ? "" : "s"}`}
              clase="verde"
              delta={comparar ? variacion(totales.impConf, previos.impConf) : null}
            />
            <Kpi
              etiqueta="Perdido"
              valor={montoCorto(totales.impPerd)}
              titulo={formatearMonto(totales.impPerd)}
              sub={`${totales.perd} presupuesto${totales.perd === 1 ? "" : "s"}`}
              clase="rojo"
              delta={comparar ? variacion(totales.impPerd, previos.impPerd, true) : null}
            />
            <Kpi
              etiqueta="Conversión"
              valor={`${num1(totales.conversion)}%`}
              sub={`sobre ${totales.conResultado} cerrados con resultado`}
              delta={comparar ? variacionPuntos(totales.conversion, previos.conversion) : null}
            />
            <Kpi
              etiqueta="En juego"
              valor={montoCorto(enJuego)}
              titulo={formatearMonto(enJuego)}
              sub={`${abiertos.length} abierto${abiertos.length === 1 ? "" : "s"} hoy`}
            />
            <Kpi
              etiqueta="En alerta"
              valor={enAlerta.cantidad}
              sub={enAlerta.cantidad ? `${montoCorto(enAlerta.importe)} en riesgo` : "todo al día"}
              clase={enAlerta.cantidad ? "rojo" : undefined}
            />
          </div>

          {personal && (
            <Panel titulo="Comparación con la empresa" nota="Mismo período, para ubicar su desempeño">
              <div className="est-comp">
                <div className="est-comp-cab">
                  <span />
                  <span>{nombreVendedor}</span>
                  <span>Empresa</span>
                </div>
                <div className="est-comp-fila">
                  <span>Conversión</span>
                  <strong>{totales.conResultado ? `${num1(totales.conversion)}%` : "—"}</strong>
                  <span>{totalesEmpresa.conResultado ? `${num1(totalesEmpresa.conversion)}%` : "—"}</span>
                </div>
                <div className="est-comp-fila">
                  <span>% de pérdida</span>
                  <strong>{totales.conResultado ? `${num1(totales.tasaPerdida)}%` : "—"}</strong>
                  <span>{totalesEmpresa.conResultado ? `${num1(totalesEmpresa.tasaPerdida)}%` : "—"}</span>
                </div>
                <div className="est-comp-fila">
                  <span>Contacto efectivo</span>
                  <strong>{contacto.total ? `${num1(contacto.tasa)}%` : "—"}</strong>
                  <span>{gestionesEmpresaPeriodo.length ? `${num1(contacto.tasaEmpresa)}%` : "—"}</span>
                </div>
              </div>
            </Panel>
          )}

          <div className="est-grid">
            <Panel titulo="Confirmado y perdido por mes" nota="Últimos 6 meses, por fecha de cierre">
              <div className="est-meses">
                {porMes.meses.map((m) => (
                  <div key={`${m.anio}-${m.mes}`} className="est-mes">
                    <div className="est-mes-barras">
                      <div
                        className="est-mes-barra est-fondo-verde"
                        style={{ height: `${m.conf ? Math.max((m.conf / porMes.max) * 100, 3) : 0}%` }}
                        title={`Confirmado: ${formatearMonto(m.conf)}`}
                      />
                      <div
                        className="est-mes-barra est-fondo-rojo"
                        style={{ height: `${m.perd ? Math.max((m.perd / porMes.max) * 100, 3) : 0}%` }}
                        title={`Perdido: ${formatearMonto(m.perd)}`}
                      />
                    </div>
                    <div className="est-mes-nombre">{m.etiqueta}</div>
                  </div>
                ))}
              </div>
              <div className="est-leyenda-simple">
                <span><i className="est-fondo-verde" /> Confirmado</span>
                <span><i className="est-fondo-rojo" /> Perdido</span>
              </div>
            </Panel>

            <Panel titulo="Abiertos por estado" nota="Situación de hoy">
              {abiertos.length === 0 ? (
                <p className="est-vacio">No hay presupuestos abiertos.</p>
              ) : (
                abiertosPorEstado.map((f) => (
                  <div key={f.clave} className="est-fila-barra">
                    <div className="est-fila-top">
                      <span>{f.etiqueta}</span>
                      <span className="est-fila-num">
                        <strong>{f.cantidad}</strong> · {montoCorto(f.importe)}
                      </span>
                    </div>
                    <div className="est-barra-fondo">
                      <div className="est-barra-relleno" style={{ width: `${f.cantidad ? Math.max(f.ancho, 2) : 0}%` }} />
                    </div>
                  </div>
                ))
              )}
            </Panel>
          </div>

          <Panel titulo="Situación actual de los abiertos" nota="Según lo que quedó cargado en la última gestión de cada presupuesto">
            {abiertos.length === 0 ? (
              <p className="est-vacio">No hay presupuestos abiertos.</p>
            ) : (
              <div className="est-situaciones">
                {situaciones.map((s) => {
                  const aviso = s.clave === "_sin_gestiones";
                  return (
                    <div key={s.clave} className="est-fila-barra">
                      <div className="est-fila-top">
                        <span className={s.clave.startsWith("_") ? "est-tenue" : undefined}>{s.etiqueta}</span>
                        <span className="est-fila-num">
                          <strong>{s.cantidad}</strong> · {montoCorto(s.importe)}
                        </span>
                      </div>
                      <div className="est-barra-fondo">
                        <div
                          className={`est-barra-relleno${aviso ? " est-fondo-ambar" : ""}`}
                          style={{ width: `${Math.max(s.ancho, 2)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </>
      )}

      {/* ---------------- PÉRDIDAS ---------------- */}
      {tabActiva === "perdidas" && (
        <>
          <div className="est-kpis est-kpis-4">
            <Kpi
              etiqueta="Presupuestos perdidos"
              valor={totales.perd}
              clase="rojo"
              delta={comparar ? variacion(totales.perd, previos.perd, true) : null}
            />
            <Kpi
              etiqueta="Dinero perdido"
              valor={montoCorto(totales.impPerd)}
              titulo={formatearMonto(totales.impPerd)}
              clase="rojo"
              delta={comparar ? variacion(totales.impPerd, previos.impPerd, true) : null}
            />
            <Kpi
              etiqueta="% de pérdida"
              valor={`${num1(totales.tasaPerdida)}%`}
              sub="de lo que se cierra con resultado"
              delta={comparar ? variacionPuntos(totales.tasaPerdida, previos.tasaPerdida, true) : null}
            />
            <Kpi
              etiqueta="Importe promedio perdido"
              valor={montoCorto(totales.perd ? totales.impPerd / totales.perd : 0)}
              titulo={formatearMonto(totales.perd ? totales.impPerd / totales.perd : 0)}
            />
          </div>

          <Panel titulo="Qué mejorar" nota="Conclusiones automáticas según los datos del período">
            <ul className="est-hallazgos">
              {hallazgos.map((h, i) => (
                <li key={i} className={`est-hallazgo est-hallazgo-${h.tono}`}>
                  <div className="est-hallazgo-texto">{h.texto}</div>
                  {h.consejo && <div className="est-hallazgo-consejo">→ {h.consejo}</div>}
                </li>
              ))}
            </ul>
          </Panel>

          <div className="est-grid">
            <Panel titulo="¿Por qué se pierden?" nota="Ordenado por dinero perdido">
              {motivos.length === 0 ? (
                <p className="est-vacio">No hay presupuestos perdidos en este período.</p>
              ) : (
                motivos.map((m) => (
                  <div key={m.clave} className="est-fila-barra">
                    <div className="est-fila-top">
                      <span className={m.clave === "sin_motivo" ? "est-tenue" : undefined}>{m.etiqueta}</span>
                      <span className="est-fila-num">
                        <strong>{m.cantidad}</strong> · {pctTexto(m.cantidad, perdidos.length)} · {montoCorto(m.importe)}
                      </span>
                    </div>
                    <div className="est-barra-fondo">
                      <div
                        className="est-barra-relleno est-fondo-rojo"
                        style={{ width: `${m.importe ? Math.max((m.importe / maxMotivo) * 100, 2) : 2}%`, opacity: m.clave === "sin_motivo" ? 0.45 : 1 }}
                      />
                    </div>
                  </div>
                ))
              )}
            </Panel>

            <Panel titulo="Seguimiento antes de perderse" nota="Cuánto se insistió con cada presupuesto perdido">
              {perdidos.length === 0 ? (
                <p className="est-vacio">No hay presupuestos perdidos en este período.</p>
              ) : (
                <>
                  <div className="est-mini">
                    <div>
                      <strong>{num1(seg.dias)}</strong>
                      <span>días hasta perderse</span>
                    </div>
                    <div>
                      <strong>{num1(seg.gestionesProm)}</strong>
                      <span>gestiones en promedio</span>
                    </div>
                    <div>
                      <strong>{pctTexto(seg.sinContacto, perdidos.length)}</strong>
                      <span>sin contacto efectivo</span>
                    </div>
                  </div>
                  <div className="est-subtitulo-panel">Perdidos según cantidad de gestiones</div>
                  {seg.tramos.map((t) => (
                    <div key={t.clave} className="est-fila-barra">
                      <div className="est-fila-top">
                        <span>{t.etiqueta}</span>
                        <span className="est-fila-num">
                          <strong>{t.cantidad}</strong> · {pctTexto(t.cantidad, perdidos.length)}
                        </span>
                      </div>
                      <div className="est-barra-fondo">
                        <div
                          className="est-barra-relleno"
                          style={{ width: `${t.cantidad ? Math.max((t.cantidad / maxTramo) * 100, 2) : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </>
              )}
            </Panel>
          </div>

          {veTodos && !personal && (
            <Panel titulo="Pérdidas por vendedor" nota="Tocá un vendedor para ver sus estadísticas personales">
              {vendedores.filter((v) => v.perd > 0).length === 0 ? (
                <p className="est-vacio">No hay presupuestos perdidos en este período.</p>
              ) : (
                <TablaResp
                  onFila={elegirVendedor}
                  columnas={[
                    { key: "nombre", label: "Vendedor", render: (v) => <strong>{v.nombre}</strong> },
                    { key: "perd", label: "Perdidos", num: true },
                    { key: "impPerd", label: "Dinero perdido", num: true, render: (v) => formatearMonto(v.impPerd) },
                    { key: "tasaPerdida", label: "% de pérdida", num: true, render: (v) => `${num1(v.tasaPerdida)}%` },
                    { key: "motivoPrincipal", label: "Motivo principal" },
                  ]}
                  filas={vendedores.filter((v) => v.perd > 0).sort((a, b) => b.impPerd - a.impPerd)}
                />
              )}
            </Panel>
          )}

          <div className="est-acciones">
            <button className="btn btn-ghost" onClick={() => setVerLista((v) => !v)} disabled={perdidos.length === 0}>
              {verLista ? "Ocultar presupuestos perdidos" : `Ver los ${perdidos.length} presupuestos perdidos`}
            </button>
          </div>

          {verLista && perdidos.length > 0 && (
            <Panel titulo={`Presupuestos perdidos · ${perdidos.length}`} nota="Tocá uno para abrir su detalle">
              <TablaResp
                onFila={onAbrirDetalle}
                columnas={[
                  {
                    key: "cliente_nombre",
                    label: "Cliente",
                    render: (p) => (
                      <>
                        <strong>{limpiarCliente(p.cliente_nombre) || "—"}</strong>
                        <div className="est-tenue est-chico">#{p.odoo_numero}</div>
                      </>
                    ),
                  },
                  { key: "resp", label: "Responsable", render: (p) => p.responsable?.nombre || "—" },
                  { key: "importe", label: "Importe", num: true, render: (p) => formatearMonto(p.importe_original) },
                  {
                    key: "motivo",
                    label: "Motivo",
                    render: (p) =>
                      p.motivo_perdida ? etiquetas.motivo_perdida?.[p.motivo_perdida] || p.motivo_perdida : <span className="est-tenue">Sin motivo</span>,
                  },
                  { key: "gest", label: "Gestiones", num: true, render: (p) => p._gestiones },
                  { key: "dias", label: "Días", num: true, render: (p) => p._dias },
                  { key: "cierre", label: "Perdido el", render: (p) => fechaCorta(p.fecha_cierre) },
                ]}
                filas={perdidos}
              />
            </Panel>
          )}
        </>
      )}

      {/* ---------------- CONTACTOS ---------------- */}
      {tabActiva === "contactos" && (
        <>
          <div className="est-kpis est-kpis-4">
            <Kpi
              etiqueta="Gestiones"
              valor={contacto.total}
              sub={personal ? "hechas por este vendedor" : "llamados, mensajes y visitas"}
            />
            <Kpi
              etiqueta="Contacto efectivo"
              valor={contacto.total ? `${num1(contacto.tasa)}%` : "—"}
              sub={`${contacto.efectivas} de ${contacto.total} gestiones`}
              clase={contacto.total && contacto.tasa >= 50 ? "verde" : undefined}
            />
            <Kpi
              etiqueta="Medio más efectivo"
              valor={contacto.mejor ? contacto.mejor.etiqueta : "—"}
              sub={contacto.mejor ? `${num1(contacto.mejor.tasa)}% de contacto efectivo` : `faltan datos (mín. ${MUESTRA_MIN} por medio)`}
              clase={contacto.mejor ? "verde" : undefined}
            />
            <Kpi
              etiqueta="Medio más usado"
              valor={contacto.masUsado ? contacto.masUsado.etiqueta : "—"}
              sub={contacto.masUsado ? `${pctTexto(contacto.masUsado.cantidad, contacto.total)} de las gestiones` : undefined}
            />
          </div>

          <Panel titulo="Qué conviene hacer" nota="Conclusiones automáticas sobre medios y horarios">
            <ul className="est-hallazgos">
              {hallazgosContactos.map((h, i) => (
                <li key={i} className={`est-hallazgo est-hallazgo-${h.tono}`}>
                  <div className="est-hallazgo-texto">{h.texto}</div>
                  {h.consejo && <div className="est-hallazgo-consejo">→ {h.consejo}</div>}
                </li>
              ))}
            </ul>
          </Panel>

          <div className="est-grid">
            <Panel
              titulo="Efectividad por medio"
              nota="Contacto efectivo: se logró hablar con el cliente. Cierre logrado: de los presupuestos cerrados donde ese medio logró contacto efectivo, cuántos se confirmaron."
            >
              {medios.length === 0 ? (
                <p className="est-vacio">No hay gestiones en este período.</p>
              ) : (
                medios.map((m) => {
                  const poco = m.cantidad < MUESTRA_MIN;
                  return (
                    <div key={m.clave} className="est-medio">
                      <div className="est-medio-cab">
                        <strong className={m.clave === "sin_medio" ? "est-tenue" : undefined}>{m.etiqueta}</strong>
                        {m.clave === mejorMedioClave && <span className="est-badge est-badge-mejor">Más efectivo</span>}
                        {poco && <span className="est-badge est-badge-poco">Pocos datos</span>}
                      </div>
                      <div className="est-medio-cifras">
                        <span><b>{m.cantidad}</b> gestiones</span>
                        <span><b>{num1(m.tasa)}%</b> contacto efectivo</span>
                        <span>
                          <b>{m.cierreN >= 3 ? `${num1(m.tasaCierre)}%` : "—"}</b> cierre logrado
                          {m.cierreN > 0 && <small> ({m.cierreConf} de {m.cierreN})</small>}
                        </span>
                      </div>
                      <div className="est-barra-fondo">
                        <div
                          className={`est-barra-relleno${m.clave === mejorMedioClave ? " est-fondo-verde" : ""}`}
                          style={{ width: `${m.tasa ? Math.max(m.tasa, 2) : 0}%`, opacity: poco ? 0.45 : 1 }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </Panel>

            <Panel titulo="Mejor horario para contactar" nota="% de contacto efectivo según la hora de la gestión">
              {contacto.total === 0 ? (
                <p className="est-vacio">No hay gestiones en este período.</p>
              ) : (
                franjas
                  .filter((f) => f.clave !== "fuera" || f.cantidad > 0)
                  .map((f) => {
                    const poco = f.cantidad < MUESTRA_MIN;
                    return (
                      <div key={f.clave} className="est-fila-barra">
                        <div className="est-fila-top">
                          <span>
                            {f.etiqueta} <span className="est-tenue est-chico">{f.rango}</span>
                          </span>
                          <span className="est-fila-num">
                            <strong>{f.cantidad ? `${num1(f.tasa)}%` : "—"}</strong> · {f.cantidad} gestion{f.cantidad === 1 ? "" : "es"}
                          </span>
                        </div>
                        <div className="est-barra-fondo">
                          <div
                            className="est-barra-relleno"
                            style={{ width: `${f.tasa ? Math.max(f.tasa, 2) : 0}%`, opacity: poco ? 0.45 : 1 }}
                          />
                        </div>
                      </div>
                    );
                  })
              )}
            </Panel>
          </div>
        </>
      )}

      {/* ---------------- VENDEDORES ---------------- */}
      {tabActiva === "vendedores" && veTodos && !personal && (
        <Panel titulo="Vendedores" nota="Ordenado por dinero confirmado. Tocá un vendedor para ver sus estadísticas personales">
          {vendedores.length === 0 ? (
            <p className="est-vacio">Sin datos en este período.</p>
          ) : (
            <TablaResp
              onFila={elegirVendedor}
              columnas={[
                { key: "nombre", label: "Vendedor", render: (v) => <strong className="est-link">{v.nombre} ›</strong> },
                { key: "impConf", label: "Confirmado", num: true, render: (v) => <span className="est-verde">{formatearMonto(v.impConf)}</span> },
                { key: "conf", label: "Confirmados", num: true },
                { key: "perd", label: "Perdidos", num: true },
                { key: "conversion", label: "Conversión", num: true, render: (v) => (v.conResultado ? `${num1(v.conversion)}%` : "—") },
                { key: "abiertos", label: "Abiertos", num: true },
                { key: "gestiones", label: "Gestiones", num: true },
                { key: "efectivo", label: "Contacto efectivo", num: true, render: (v) => (v.gestiones ? pctTexto(v.efectivas, v.gestiones) : "—") },
              ]}
              filas={vendedores}
            />
          )}
        </Panel>
      )}
    </div>
  );
}

function Kpi({ etiqueta, valor, sub, delta, clase, titulo }) {
  return (
    <div className={`est-kpi${clase ? ` est-kpi-${clase}` : ""}`} title={titulo}>
      <span className="est-kpi-etiqueta">{etiqueta}</span>
      <strong className="est-kpi-valor">{valor}</strong>
      {sub && <span className="est-kpi-sub">{sub}</span>}
      {delta && <span className={`est-delta est-delta-${delta.tono}`}>{delta.texto}</span>}
    </div>
  );
}

function Panel({ titulo, nota, children }) {
  return (
    <section className="est-panel">
      <h3 className="est-panel-titulo">{titulo}</h3>
      {nota && <div className="est-panel-nota">{nota}</div>}
      {children}
    </section>
  );
}

// Tabla en escritorio y tablet; en celular, una tarjeta por fila
function TablaResp({ columnas, filas, onFila }) {
  const celda = (c, f) => (c.render ? c.render(f) : f[c.key]);
  return (
    <>
      <div className="est-tabla-wrap est-tr-tabla">
        <table className="est-tabla">
          <thead>
            <tr>
              {columnas.map((c) => (
                <th key={c.key} className={c.num ? "est-th-n" : "est-th"}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className={onFila ? "est-fila-detalle" : undefined} onClick={onFila ? () => onFila(f) : undefined}>
                {columnas.map((c) => (
                  <td key={c.key} className={c.num ? "est-td-n" : "est-td"}>
                    {celda(c, f)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="est-tr-cards">
        {filas.map((f) => (
          <div key={f.id} className={`est-card${onFila ? " est-card-click" : ""}`} onClick={onFila ? () => onFila(f) : undefined}>
            <div className="est-card-titulo">{celda(columnas[0], f)}</div>
            {columnas.slice(1).map((c) => (
              <div key={c.key} className="est-card-fila">
                <span>{c.label}</span>
                <span className="est-card-valor">{celda(c, f)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
