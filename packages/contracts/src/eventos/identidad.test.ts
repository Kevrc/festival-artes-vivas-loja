import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CuentaEliminada, CuentaVerificada, EventoPublicadoIdentidad, RolAsignado } from './identidad';
import { colaDe } from './index';

const base = {
  id: randomUUID(),
  version: 1,
  ocurridoEn: '2026-11-20T12:00:00-05:00',
  edicionId: randomUUID(),
  correlacionId: randomUUID(),
};
const cuentaId = randomUUID();

describe('eventos publicados por Identidad (spec 004)', () => {
  it('acepta CuentaVerificada, RolAsignado y CuentaEliminada con el sobre común', () => {
    const validos = [
      { ...base, tipo: 'CuentaVerificada', datos: { cuentaId, verificadaEn: base.ocurridoEn } },
      {
        ...base,
        tipo: 'RolAsignado',
        datos: {
          cuentaId,
          rol: 'validador',
          alcance: { tipo: 'sede', valor: randomUUID() },
          operacion: 'asignado',
          asignadoPor: randomUUID(),
        },
      },
      {
        ...base,
        tipo: 'RolAsignado',
        datos: { cuentaId, rol: 'programador', alcance: null, operacion: 'revocado', asignadoPor: randomUUID() },
      },
      { ...base, tipo: 'CuentaEliminada', datos: { cuentaId, eliminadaEn: base.ocurridoEn } },
    ];
    for (const evento of validos) expect(EventoPublicadoIdentidad.safeParse(evento).success).toBe(true);
  });

  it('rechaza rol desconocido, alcance vacío, operación inválida, fechas sin zona o ids no uuid', () => {
    const asignadoPor = randomUUID();
    expect(
      RolAsignado.safeParse({ ...base, tipo: 'RolAsignado', datos: { cuentaId, rol: 'superusuario', alcance: null, operacion: 'asignado', asignadoPor } }).success,
    ).toBe(false);
    expect(
      RolAsignado.safeParse({ ...base, tipo: 'RolAsignado', datos: { cuentaId, rol: 'taquilla', alcance: { tipo: 'sede', valor: '' }, operacion: 'asignado', asignadoPor } }).success,
    ).toBe(false);
    expect(
      RolAsignado.safeParse({ ...base, tipo: 'RolAsignado', datos: { cuentaId, rol: 'taquilla', alcance: null, operacion: 'cambiado', asignadoPor } }).success,
    ).toBe(false);
    expect(
      CuentaVerificada.safeParse({ ...base, tipo: 'CuentaVerificada', datos: { cuentaId, verificadaEn: '2026-11-20T12:00:00' } }).success,
    ).toBe(false);
    expect(
      CuentaEliminada.safeParse({ ...base, tipo: 'CuentaEliminada', datos: { cuentaId: 'no-uuid', eliminadaEn: base.ocurridoEn } }).success,
    ).toBe(false);
  });

  it('el datos de un evento no lleva correo ni nombre de la cuenta (Constitución VI)', () => {
    const conCorreo = { ...base, tipo: 'CuentaEliminada', datos: { cuentaId, eliminadaEn: base.ocurridoEn, correo: 'ana@fiavl.test' } };
    const r = CuentaEliminada.parse(conCorreo);
    expect(r.datos).not.toHaveProperty('correo');
  });

  it('las colas siguen la convención de ADR-0003', () => {
    expect(colaDe('operacion', 'CuentaEliminada')).toBe('operacion.cuenta-eliminada');
  });
});
