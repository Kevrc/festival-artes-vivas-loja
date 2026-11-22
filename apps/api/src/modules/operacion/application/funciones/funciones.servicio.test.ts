import type { ContextoIdentidad } from '@fiavl/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ErrorConCodigo } from '../../../../common/http/problema-codigo.filter';
import type { FuncionAgenda } from '../../domain/agenda';
import { CruceEnBaseDeDatos, InterbloqueoEnBaseDeDatos, type RepositorioOperacion } from '../puertos';
import { FuncionesServicio } from './funciones.servicio';

const actor = { cuentaId: 'c', roles: [{ rol: 'programador', alcance: null }] } as unknown as ContextoIdentidad;
const p = { actor, correlacionId: 'corr' };
const entrada = {
  obraId: 'obra', sedeId: 'sede', inicio: new Date('2026-11-13T21:15:00-05:00'), continua: false,
  tipoAcceso: 'pagada' as const, publico: 'familiar' as const, aforoHabilitado: 100,
};
const ocupante: FuncionAgenda = {
  id: 'otra', sedeId: 'sede', sedeNombre: 'Teatro Bolívar', montajeMin: 30, elencoId: 'otro-elenco', obraTitulo: 'Zombi Manifiesto',
  inicio: new Date('2026-11-13T19:00:00-05:00'), fin: new Date('2026-11-13T21:00:00-05:00'), continua: false, activa: true,
};

function repo(crear: () => Promise<unknown>, agenda: () => FuncionAgenda[]) {
  return {
    edicion: async () => ({ id: 'ed', anio: 2026, estado: 'planificacion' }),
    obra: async () => ({ id: 'obra', edicionId: 'ed', titulo: 'El Cura sin cabeza', duracionMin: 90, estado: 'disponible', elenco: { id: 'elenco' } }),
    sede: async () => ({ id: 'sede', edicionId: 'ed', nombre: 'Teatro Bolívar', aforo: 400, montajeMin: 30, activa: true }),
    agendaVecina: async () => agenda(),
    enTransaccion: async (fn: () => Promise<unknown>) => fn(),
    bloquearAgenda: vi.fn(async () => undefined),
    crearFuncion: vi.fn(crear),
  } as unknown as RepositorioOperacion & { crearFuncion: ReturnType<typeof vi.fn> };
}
const auditoria = { registrar: async () => undefined };
const publicador = { publicar: async () => undefined };
const reloj = () => new Date('2026-11-01T12:00:00-05:00');

describe('FuncionesServicio ante la concurrencia (ADR-0010)', () => {
  it('bloquea la sede y el elenco antes de comprobar y guardar', async () => {
    const r = repo(async () => ({ id: 'nueva', version: 1 }), () => []);
    await new FuncionesServicio(r, auditoria, publicador, reloj).crear('ed', entrada, p);
    expect((r as unknown as { bloquearAgenda: ReturnType<typeof vi.fn> }).bloquearAgenda).toHaveBeenCalledWith(['sede:sede', 'elenco:elenco']);
  });

  it('reintenta tras un interbloqueo y responde 409 con la función que ganó', async () => {
    let ganó = false;
    const r = repo(
      async () => {
        ganó = true;
        throw new InterbloqueoEnBaseDeDatos();
      },
      () => (ganó ? [ocupante] : []),
    );
    const error = await new FuncionesServicio(r, auditoria, publicador, reloj).crear('ed', entrada, p).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorConCodigo);
    expect(error.getStatus()).toBe(409);
    expect(error.codigo).toBe('cruce_sede');
    expect(r.crearFuncion).toHaveBeenCalledTimes(1);
  });

  it('reintenta tras un interbloqueo y guarda si ya no hay cruce', async () => {
    let intentos = 0;
    const r = repo(async () => {
      intentos++;
      if (intentos === 1) throw new InterbloqueoEnBaseDeDatos();
      return { id: 'nueva', version: 1 };
    }, () => []);
    await expect(new FuncionesServicio(r, auditoria, publicador, reloj).crear('ed', entrada, p)).resolves.toMatchObject({ id: 'nueva' });
    expect(intentos).toBe(2);
  });

  it('si la base ve un cruce que el dominio aún no ve, reintenta y termina en 409, nunca en 500', async () => {
    const r = repo(async () => {
      throw new CruceEnBaseDeDatos();
    }, () => []);
    const error = await new FuncionesServicio(r, auditoria, publicador, reloj).crear('ed', entrada, p).catch((e) => e);
    expect(error.getStatus()).toBe(409);
    expect(r.crearFuncion).toHaveBeenCalledTimes(3);
  });
});
