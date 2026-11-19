// Categorías de bultos y ubicaciones de retiro (destino: src/utils/bultos.js)

export const CATEGORIAS_BULTO = [
  { clave: "carretillas", etiqueta: "Carretillas" },
  { clave: "hormigoneras", etiqueta: "Hormigoneras" },
  { clave: "cajas", etiqueta: "Cajas" },
  { clave: "bolsas", etiqueta: "Bolsas" },
  {
    clave: "rollos",
    etiqueta: "Rollos",
    ayuda: "Corrugado, media sombra, film, polietileno, soga",
  },
  {
    clave: "tachos",
    etiqueta: "Tachos",
    ayuda: "20 L, 10 L y 4 L",
  },
  {
    clave: "packs",
    etiqueta: "Packs",
    ayuda: "Packs de 4 L, 1 L, 1/2 L y 1/4 L",
  },
  {
    clave: "canos",
    etiqueta: "Caños y varillas",
    ayuda: "Tubos rígidos, mangueras, cablecanal, varillas",
  },
  {
    clave: "otros",
    etiqueta: "Otros",
    ayuda: "Escribí qué son",
    detalleObligatorio: true,
  },
];

// Estanterías: filas 1 a 3, columnas A a C
export const ESTANTERIAS = [1, 2, 3].flatMap((fila) =>
  ["A", "B", "C"].map((col) => `${fila}${col}`),
);

// Playa: palets P1 a P6
export const PALETS = ["P1", "P2", "P3", "P4", "P5", "P6"];

// Ubicaciones especiales: no exigen cargar bultos
export const UBIC_MOSTRADOR = "MOSTRADOR";
export const UBIC_PALET_COMPLETO = "PALET COMPLETO";
export const UBICACIONES_ESPECIALES = [UBIC_MOSTRADOR, UBIC_PALET_COMPLETO];
export const esUbicacionEspecial = (u) => UBICACIONES_ESPECIALES.includes(u);

// "Palet completo" se guarda como un bulto aparte (no aparece en la grilla de categorías)
export const CATEGORIA_PALET_COMPLETO = "palet_completo";

export const etiquetaCategoria = (clave) =>
  clave === CATEGORIA_PALET_COMPLETO
    ? "Palet completo"
    : CATEGORIAS_BULTO.find((c) => c.clave === clave)?.etiqueta || clave;

export const ordenCategoria = (clave) => {
  const i = CATEGORIAS_BULTO.findIndex((c) => c.clave === clave);
  return i === -1 ? 999 : i;
};
