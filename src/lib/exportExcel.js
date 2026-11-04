const TZ = "America/Argentina/Buenos_Aires";

const AZUL = "FF1565C0";
const AZUL_CLARO = "FFE3EDF9";
const GRIS_FILA = "FFF3F6FA";
const BORDE = "FFD9DEE4";
const FORMATO_CONTABLE =
  '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_);_(@_)';

// Devuelve el día en formato AAAA-MM-DD, siempre en hora de Argentina
export function claveDia(fecha) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(
    new Date(fecha),
  );
}

// Pedidos entregados ese día, de la hora más temprana a la más tardía.
// Los cancelados no entran porque solo se toman los entregados.
export function entregasDelDia(pedidos, dia) {
  return pedidos
    .filter(
      (p) =>
        p.estado === "entregado" &&
        p.entregado_at &&
        claveDia(p.entregado_at) === dia,
    )
    .sort((a, b) => new Date(a.entregado_at) - new Date(b.entregado_at));
}

export function resumenEntregas(pedidos, dia) {
  const lista = entregasDelDia(pedidos, dia);
  const total = lista.reduce((acc, p) => acc + (Number(p.monto) || 0), 0);
  return {
    cantidad: lista.length,
    total,
    sinMonto: lista.filter((p) => p.monto == null).length,
  };
}

function fechaHora(fecha) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(fecha))
    .replace(",", "");
}

function diaLargo(dia) {
  const f = new Date(`${dia}T12:00:00-03:00`);
  const semana = new Intl.DateTimeFormat("es-AR", {
    timeZone: TZ,
    weekday: "long",
  }).format(f);
  const [y, m, d] = dia.split("-");
  return `${semana} ${d}/${m}/${y}`;
}

async function cargarLogo(workbook) {
  try {
    const res = await fetch("/logo.png");
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const buffer = await blob.arrayBuffer();
    const id = workbook.addImage({ buffer, extension: "png" });
    let alto = 64;
    let ancho = Math.round((bmp.width * alto) / bmp.height);
    if (ancho > 170) {
      ancho = 170;
      alto = Math.round((bmp.height * ancho) / bmp.width);
    }
    return { id, ancho, alto };
  } catch {
    return null;
  }
}

const bordeFino = {
  top: { style: "thin", color: { argb: BORDE } },
  left: { style: "thin", color: { argb: BORDE } },
  bottom: { style: "thin", color: { argb: BORDE } },
  right: { style: "thin", color: { argb: BORDE } },
};

// Genera y descarga el Excel de un día. Devuelve false si no hay entregas.
export async function exportarEntregas(
  pedidos,
  usuariosMap,
  dia,
  generadoPor = "",
) {
  const lista = entregasDelDia(pedidos, dia);
  if (lista.length === 0) return false;

  const mod = await import("exceljs");
  const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Distribuidora Maestro S.R.L.";

  const ws = wb.addWorksheet("Entregas");
  ws.columns = [
    { width: 24 },
    { width: 42 },
    { width: 20 },
    { width: 24 },
    { width: 20 },
  ];

  // Encabezado con logo y título
  [1, 2, 3].forEach((n) => (ws.getRow(n).height = 24));
  ws.getRow(4).height = 8;

  const logo = await cargarLogo(wb);
  if (logo) {
    ws.addImage(logo.id, {
      tl: { col: 0.1, row: 0.2 },
      ext: { width: logo.ancho, height: logo.alto },
    });
  }

  ws.mergeCells("B1:E1");
  ws.getCell("B1").value = "DISTRIBUIDORA MAESTRO S.R.L.";
  ws.getCell("B1").font = { bold: true, size: 16, color: { argb: AZUL } };
  ws.getCell("B1").alignment = { vertical: "middle", horizontal: "left" };

  ws.mergeCells("B2:E2");
  ws.getCell("B2").value = `Entregas del ${diaLargo(dia)}`;
  ws.getCell("B2").font = { size: 12, color: { argb: "FF444444" } };
  ws.getCell("B2").alignment = { vertical: "middle", horizontal: "left" };

  ws.mergeCells("B3:E3");
  ws.getCell("B3").value = `Generado el ${fechaHora(new Date())}${
    generadoPor ? " por " + generadoPor : ""
  }`;
  ws.getCell("B3").font = { size: 10, color: { argb: "FF777777" } };
  ws.getCell("B3").alignment = { vertical: "middle", horizontal: "left" };

  // Fila de títulos de columnas
  const titulos = [
    "N° Pedido",
    "Cliente",
    "Vendedor",
    "Fecha y hora de entrega",
    "Monto",
  ];
  const enc = ws.getRow(5);
  enc.height = 26;
  titulos.forEach((t, i) => {
    const cell = enc.getCell(i + 1);
    cell.value = t;
    cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: AZUL },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: i === 4 ? "right" : "left",
      indent: 1,
    };
    cell.border = bordeFino;
  });

  // Filas de pedidos
  let fila = 6;
  let sinMonto = 0;
  lista.forEach((p, i) => {
    const r = ws.getRow(fila);
    r.height = 21;
    const monto = p.monto == null ? null : Number(p.monto);
    if (monto === null) sinMonto++;

    const valores = [
      p.numero_pedido,
      p.cliente_nombre || "—",
      usuariosMap?.[p.vendedor_id]?.nombre || "—",
      fechaHora(p.entregado_at),
      monto,
    ];

    valores.forEach((v, c) => {
      const cell = r.getCell(c + 1);
      cell.value = v;
      cell.font = { size: 11 };
      cell.alignment = {
        vertical: "middle",
        horizontal: c === 4 ? "right" : "left",
        indent: 1,
      };
      cell.border = bordeFino;
      if (c === 4) cell.numFmt = FORMATO_CONTABLE;
      if (c === 4 && monto === null) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFF4CE" },
        };
      } else if (i % 2 === 1) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: GRIS_FILA },
        };
      }
    });
    fila++;
  });

  // Fila de total con suma real de Excel
  const ultima = fila - 1;
  const total = lista.reduce((acc, p) => acc + (Number(p.monto) || 0), 0);
  const tr = ws.getRow(fila);
  tr.height = 26;
  tr.getCell(1).value = "TOTAL";
  tr.getCell(2).value =
    `${lista.length} pedido${lista.length !== 1 ? "s" : ""}`;
  tr.getCell(5).value = { formula: `SUM(E6:E${ultima})`, result: total };
  for (let c = 1; c <= 5; c++) {
    const cell = tr.getCell(c);
    cell.font = { bold: true, size: 12 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: AZUL_CLARO },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: c === 5 ? "right" : "left",
      indent: 1,
    };
    cell.border = {
      ...bordeFino,
      top: { style: "medium", color: { argb: AZUL } },
    };
    if (c === 5) cell.numFmt = FORMATO_CONTABLE;
  }

  // Aviso de seguridad (no debería aparecer nunca)
  if (sinMonto > 0) {
    const fa = fila + 2;
    ws.mergeCells(`A${fa}:E${fa}`);
    ws.getCell(`A${fa}`).value = `Atención: ${sinMonto} pedido${
      sinMonto !== 1 ? "s" : ""
    } sin monto cargado (marcado en amarillo).`;
    ws.getCell(`A${fa}`).font = {
      bold: true,
      size: 11,
      color: { argb: "FFC62828" },
    };
  }

  // Impresión en A4
  ws.pageSetup = {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    printTitlesRow: "5:5",
  };
  ws.headerFooter.oddFooter = "&CPágina &P de &N";

  // Descarga
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Entregas ${dia}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
}

// Se mantiene este nombre para que el botón actual siga funcionando:
// exporta las entregas de hoy con el nuevo formato.
export async function exportarEntregadosHoy(pedidos, clientesMap, usuariosMap) {
  try {
    const ok = await exportarEntregas(
      pedidos,
      usuariosMap,
      claveDia(new Date()),
    );
    if (!ok) alert("No hay pedidos entregados hoy para exportar todavía.");
  } catch (err) {
    console.error(err);
    alert("No se pudo generar el Excel. Intentá de nuevo.");
  }
}
