import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EventoPublicadoConvocatorias } from './convocatorias';

const ids = { postulacionId: randomUUID(), convocatoriaId: randomUUID(), cuentaPostulanteId: randomUUID() };
const base = { id: randomUUID(), version: 1, ocurridoEn: '2026-11-20T12:00:00-05:00', edicionId: randomUUID(), correlacionId: randomUUID() };

describe('eventos publicados por Convocatorias', () => {
  it('acepta PostulacionEnviada y SubsanacionSolicitada con el sobre común', () => {
    const enviados = [
      { ...base, tipo: 'PostulacionEnviada', datos: { ...ids, numero: 'FIAVL-2026-0001', enviadaEn: base.ocurridoEn } },
      { ...base, tipo: 'SubsanacionSolicitada', datos: { ...ids, numero: 'FIAVL-2026-0001', detalle: 'Adjunte el dossier legible', venceEn: '2026-11-23T12:00:00-05:00' } },
    ];
    for (const event of enviados) expect(EventoPublicadoConvocatorias.safeParse(event).success).toBe(true);
  });

  it('rechaza payload sin ids, detalle vacío, fecha inválida o sobre sin correlación', () => {
    const malformed = [
      { ...base, tipo: 'PostulacionEnviada', datos: { ...ids, numero: 'X', enviadaEn: base.ocurridoEn, convocatoriaId: 'no-uuid' } },
      { ...base, tipo: 'SubsanacionSolicitada', datos: { ...ids, numero: 'X', detalle: '', venceEn: base.ocurridoEn } },
      { ...base, tipo: 'SubsanacionSolicitada', datos: { ...ids, numero: 'X', detalle: 'Corregir', venceEn: 'ayer' } },
      { ...base, correlacionId: undefined, tipo: 'PostulacionEnviada', datos: { ...ids, numero: 'X', enviadaEn: base.ocurridoEn } },
    ];
    for (const event of malformed) expect(EventoPublicadoConvocatorias.safeParse(event).success).toBe(false);
  });
});
