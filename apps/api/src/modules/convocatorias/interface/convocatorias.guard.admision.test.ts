import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AutorizacionConvocatoriasDevAdapter } from '../infrastructure/autorizacion-dev.adapter';
import { ConvocatoriasGuard, ROLES_CONVOCATORIAS } from './convocatorias.guard';
import type { ContextoConvocatorias } from '../application/puertos';

const roles = ['coordinación de convocatorias', 'coordinación provincial'] as const;

interface PeticionPrueba {
  headers: Record<string, string>;
  convocatoriaProvincia?: string;
  contextoConvocatorias?: ContextoConvocatorias;
}

function peticion(headers: Record<string, string>, provincia?: string) {
  const handler = () => undefined;
  Reflect.defineMetadata(ROLES_CONVOCATORIAS, roles, handler);
  const req: PeticionPrueba = { headers, ...(provincia ? { convocatoriaProvincia: provincia } : {}) };
  const ctx = {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

const guard = new ConvocatoriasGuard(new Reflector(), new AutorizacionConvocatoriasDevAdapter('test'));

describe('US2 · autorización de admisibilidad (T034)', () => {
  it('permite a coordinación de convocatorias resolver cualquier provincia', async () => {
    const { ctx, req } = peticion({
      'x-cuenta-dev': randomUUID(),
      'x-rol-dev': 'coordinación de convocatorias',
    }, 'Loja');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.contextoConvocatorias?.roles[0]?.rol).toBe('coordinación de convocatorias');
  });

  it('limita a coordinación provincial a la provincia de su alcance', async () => {
    const cuenta = randomUUID();
    const propia = peticion({
      'x-cuenta-dev': cuenta,
      'x-rol-dev': 'coordinación provincial',
      'x-provincia-dev': 'Loja',
    }, 'Loja');
    await expect(guard.canActivate(propia.ctx)).resolves.toBe(true);

    const ajena = peticion({
      'x-cuenta-dev': cuenta,
      'x-rol-dev': 'coordinación provincial',
      'x-provincia-dev': 'Loja',
    }, 'Pichincha');
    await expect(guard.canActivate(ajena.ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('impide que un postulante resuelva admisibilidad', async () => {
    const { ctx } = peticion({
      'x-cuenta-dev': randomUUID(),
      'x-rol-dev': 'postulante',
    }, 'Loja');
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechaza peticiones sin sesión válida', async () => {
    const { ctx } = peticion({}, 'Loja');
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
