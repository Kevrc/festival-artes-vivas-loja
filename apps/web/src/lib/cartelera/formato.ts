/** Horas y fechas siempre en hora de Ecuador, sin depender del dispositivo (research R3). */
export const ZONA = 'America/Guayaquil';

const hora = new Intl.DateTimeFormat('es-EC', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false });
const diaLargo = new Intl.DateTimeFormat('es-EC', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const diaCorto = new Intl.DateTimeFormat('es-EC', { timeZone: 'UTC', weekday: 'short', day: 'numeric' });
const diaDe = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });

export const formatoHora = (iso: string) => hora.format(new Date(iso));
/** `dia` es AAAA-MM-DD (fecha de calendario, sin hora). */
export const formatoDia = (dia: string) => diaLargo.format(new Date(`${dia}T00:00:00Z`));
export const formatoDiaCorto = (dia: string) => diaCorto.format(new Date(`${dia}T00:00:00Z`));
/** Día de festival (AAAA-MM-DD) de un instante. */
export const diaDeInstante = (iso: string | Date) => diaDe.format(new Date(iso));

export function diasEntre(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  for (let d = new Date(`${desde}T00:00:00Z`); d <= new Date(`${hasta}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    dias.push(d.toISOString().slice(0, 10));
  }
  return dias;
}

export const ETIQUETA_DISCIPLINA: Record<string, string> = {
  teatro: 'Teatro', danza: 'Danza', circo: 'Circo', musica: 'Música', titeres: 'Títeres',
  exposicion: 'Exposición', taller: 'Taller', calle: 'Calle', cine: 'Cine',
};
export const ETIQUETA_ACCESO: Record<string, string> = {
  pagada: 'Con entrada', gratuita_reserva: 'Gratis con reserva', gratuita_libre: 'Entrada libre', restringida: 'Público restringido',
};
export const ETIQUETA_COMPONENTE: Record<string, string> = {
  internacional: 'Internacional', nacional: 'Nacional', camino_a_loja: 'Camino a Loja', escuela: 'Escuela del festival', salud_arte: 'Salud + Arte',
};
export const ETIQUETA_PUBLICO: Record<string, string> = { familiar: 'Familiar', adultos: 'Adultos', estudiantes: 'Solo estudiantes' };
export const ICONO_DISCIPLINA: Record<string, string> = {
  teatro: '🎭', danza: '💃', circo: '🎪', musica: '🎵', titeres: '🧸', exposicion: '🖼️', taller: '✏️', calle: '🛤️', cine: '🎬',
};
