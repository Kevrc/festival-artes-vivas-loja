import { describe, expect, it } from 'vitest';
import { generarIcs } from './calendario';

const funcion = {
  id: '6f0b2f2e-1111-4a4a-9a9a-000000000001',
  titulo: 'Cometa, danza; teatro',
  inicio: new Date('2026-11-15T17:00:00-05:00'),
  fin: new Date('2026-11-15T17:55:00-05:00'),
  sede: 'Centro Cultural Alfredo Mora Reyes',
  direccion: 'Av. Orillas del Zamora',
  url: 'https://fiavl.example/obras/1',
};

describe('generarIcs (US6-AS2, RFC 5545)', () => {
  const ics = generarIcs(funcion, new Date('2026-11-01T00:00:00Z'));
  it('usa CRLF y envuelve el evento', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('BEGIN:VEVENT\r\n');
  });
  it('DTSTART y DTEND en UTC', () => {
    expect(ics).toContain('DTSTART:20261115T220000Z');
    expect(ics).toContain('DTEND:20261115T225500Z');
  });
  it('escapa comas y punto y coma en el texto', () => {
    expect(ics).toContain('SUMMARY:Cometa\\, danza\\; teatro');
    expect(ics).toContain('LOCATION:Centro Cultural Alfredo Mora Reyes\\, Av. Orillas del Zamora');
  });
  it('UID estable por función', () => expect(ics).toContain(`UID:${funcion.id}@fiavl`));
  it('ninguna línea supera 75 octetos', () => {
    const largo = generarIcs({ ...funcion, titulo: 'Nada era un misterio: El enigmático caso de la Continental Company y más' }, new Date());
    for (const linea of largo.split('\r\n')) expect(new TextEncoder().encode(linea).length).toBeLessThanOrEqual(75);
  });
});
