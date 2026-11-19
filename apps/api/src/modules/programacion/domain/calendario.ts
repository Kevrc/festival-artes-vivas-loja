/** Evento iCalendar (RFC 5545) de una función (FR-012, US6-AS2). Horas en UTC: cada calendario las muestra en su zona. */
export interface FuncionCalendario {
  id: string;
  titulo: string;
  inicio: Date;
  fin: Date;
  sede: string;
  direccion: string;
  url: string;
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escapar = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Pliega líneas a 75 octetos sin partir caracteres UTF-8 (RFC 5545 §3.1). */
function plegar(linea: string): string {
  const partes: string[] = [];
  let actual = '';
  let octetos = 0;
  for (const c of linea) {
    const n = new TextEncoder().encode(c).length;
    const limite = partes.length ? 74 : 75; // las continuaciones empiezan con un espacio
    if (octetos + n > limite) {
      partes.push(actual);
      actual = '';
      octetos = 0;
    }
    actual += c;
    octetos += n;
  }
  partes.push(actual);
  return partes.join('\r\n ');
}

export function generarIcs(f: FuncionCalendario, generado: Date): string {
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FIAVL//Cartelera//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${f.id}@fiavl`,
    `DTSTAMP:${utc(generado)}`,
    `DTSTART:${utc(f.inicio)}`,
    `DTEND:${utc(f.fin)}`,
    `SUMMARY:${escapar(f.titulo)}`,
    `LOCATION:${escapar(`${f.sede}, ${f.direccion}`)}`,
    `URL:${f.url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lineas.map(plegar).join('\r\n') + '\r\n';
}
