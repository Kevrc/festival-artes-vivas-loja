/** Zona fija del festival: los días se cuentan en hora de Ecuador continental (research R3). */
export const ZONA_FESTIVAL = 'America/Guayaquil';

const formatoDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_FESTIVAL,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Día de festival (AAAA-MM-DD) en que inicia una función. */
export const diaFestival = (instante: Date): string => formatoDia.format(instante);

/** Una función puntual cuenta el día que inicia; una continua, cada día de su intervalo. */
export function incluidaEnDia(f: { continua: boolean; inicio: Date; fin: Date }, dia: string): boolean {
  const desde = diaFestival(f.inicio);
  if (!f.continua) return desde === dia;
  return desde <= dia && dia <= diaFestival(f.fin);
}
