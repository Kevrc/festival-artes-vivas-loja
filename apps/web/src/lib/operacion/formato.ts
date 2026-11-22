/** Formato de fechas y horas del panel de Operación (Loja, UTC−5 todo el año). Funciones puras. */

export const horaLoja = (iso: string) =>
  new Intl.DateTimeFormat('es-EC', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Guayaquil' }).format(new Date(iso));

export const fechaLarga = (fecha: string) =>
  new Intl.DateTimeFormat('es-EC', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${fecha}T00:00:00Z`));

/** Día del festival (YYYY-MM-DD en Loja) de un instante; lo que cruza medianoche cuenta para su inicio. */
export const diaFestival = (iso: string) => new Date(Date.parse(iso) - 5 * 3_600_000).toISOString().slice(0, 10);

/** Días de la edición, YYYY-MM-DD. */
export function diasEntre(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  for (let d = Date.parse(`${desde}T00:00:00Z`); d <= Date.parse(`${hasta}T00:00:00Z`); d += 86_400_000) dias.push(new Date(d).toISOString().slice(0, 10));
  return dias;
}

/** Hora de inicio (Loja) de un ISO, en horas enteras, para ubicarla en la fila de la grilla. */
export const horaDeInicio = (iso: string) => Number(horaLoja(iso).slice(0, 2));
