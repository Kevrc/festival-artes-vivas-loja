import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ContextoIdentidad, IdentidadPublica } from '@fiavl/contracts';
import { describe, expect, it } from 'vitest';
import { ErrorConCodigo } from '../http/problema-codigo.filter';
import { META_PUBLICO, META_REQUIERE, META_SIN_SEGUNDO_FACTOR, RequiereGuard, exigirAlcance } from './requiere.guard';

const sedeBolivar = { tipo: 'sede' as const, valor: 'bolivar' };
const base: ContextoIdentidad = {
  cuentaId: 'c',
  sesionId: 's',
  correo: 'a@fiavl.test',
  correoVerificado: true,
  estudianteAcreditado: false,
  segundoFactorOk: true,
  roles: [{ rol: 'jefe_sala', alcance: sedeBolivar }],
};

function guard(ctx: ContextoIdentidad | null, meta: Record<string, unknown> = {}) {
  const identidad: IdentidadPublica = { resolverSesion: async () => ctx };
  const reflector = { getAllAndOverride: (clave: string) => meta[clave] } as unknown as Reflector;
  const req: { identidad?: ContextoIdentidad; headers: Record<string, string> } = { headers: {} };
  const ejecucion = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ejecutar: () => new RequiereGuard(identidad, reflector).canActivate(ejecucion), req };
}

describe('RequiereGuard (Constitución VI: autorización en el servidor)', () => {
  it('sin sesión ⇒ 401; ruta pública pasa sin sesión', async () => {
    await expect(guard(null).ejecutar()).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard(null, { [META_PUBLICO]: true }).ejecutar()).resolves.toBe(true);
  });

  it('rol insuficiente ⇒ 403; rol correcto deja el contexto en la petición', async () => {
    await expect(guard(base, { [META_REQUIERE]: ['programador'] }).ejecutar()).rejects.toBeInstanceOf(ForbiddenException);
    const g = guard(base, { [META_REQUIERE]: ['jefe_sala', 'direccion'] });
    await expect(g.ejecutar()).resolves.toBe(true);
    expect(g.req.identidad?.cuentaId).toBe('c');
  });

  it('US9-AS3: sesión sin segundo factor solo entra en rutas que lo permiten', async () => {
    const sinTotp = { ...base, segundoFactorOk: false };
    await expect(guard(sinTotp).ejecutar()).rejects.toMatchObject({ codigo: 'segundo_factor_requerido' });
    await expect(guard(sinTotp, { [META_SIN_SEGUNDO_FACTOR]: true }).ejecutar()).resolves.toBe(true);
  });
});

describe('exigirAlcance (RN-009)', () => {
  it('cubre su sede y no otra', () => {
    expect(() => exigirAlcance(base, ['jefe_sala'], sedeBolivar)).not.toThrow();
    try {
      exigirAlcance(base, ['jefe_sala'], { tipo: 'sede', valor: 'cueva-celi' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorConCodigo);
      expect((e as ErrorConCodigo).codigo).toBe('fuera_de_alcance');
      expect((e as ErrorConCodigo).getStatus()).toBe(403);
    }
  });

  it('un rol global (sin alcance) cubre cualquier sede; otro rol no cuenta', () => {
    const programador = { ...base, roles: [{ rol: 'programador' as const, alcance: null }] };
    expect(() => exigirAlcance(programador, ['programador'], sedeBolivar)).not.toThrow();
    expect(() => exigirAlcance(programador, ['jefe_sala'], sedeBolivar)).toThrow(ErrorConCodigo);
  });
});
