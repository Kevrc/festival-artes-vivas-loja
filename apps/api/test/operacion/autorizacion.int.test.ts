import { randomUUID } from 'node:crypto';
import type { ContextoIdentidad, RolPersonal } from '@fiavl/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exigirAlcance } from '../../src/common/identidad/requiere.guard';
import { conRol, crearAppOperacion } from './app';

/**
 * T081 · SC-007: matriz rol × operación de Operación e Identidad. Con un rol permitido el guard deja
 * pasar (la respuesta puede ser 404 o 400 por los ids inventados, nunca 401/403); con cualquier otro,
 * 403. Incluye US9-AS2 (taquilla no programa) y, del lado del alcance, US9-AS1.
 */
let ctx: Awaited<ReturnType<typeof crearAppOperacion>>;
beforeAll(async () => (ctx = await crearAppOperacion()));
afterAll(() => ctx.cerrar());

const BOLIVAR = randomUUID();
const CUEVA_CELI = randomUUID();
const ROLES: RolPersonal[] = ['asistente', 'postulante', 'curador', 'coordinacion_convocatorias', 'coordinacion_provincial', 'programador', 'jefe_sala', 'taquilla', 'validador', 'direccion', 'administrador'];
/** Cabecera x-roles-dev con el alcance que exige cada rol (research R16). */
const CON_ALCANCE: Partial<Record<RolPersonal, string>> = {
  curador: 'curador@disciplina:teatro',
  coordinacion_provincial: 'coordinacion_provincial@provincia:Loja',
  jefe_sala: `jefe_sala@sede:${BOLIVAR}`,
  taquilla: `taquilla@sede:${BOLIVAR}`,
  validador: `validador@sede:${BOLIVAR}`,
};

const e = randomUUID();
const f = randomUUID();
const o = randomUUID();
type Op = { nombre: string; metodo: 'get' | 'post' | 'patch' | 'put' | 'delete'; ruta: string; cuerpo?: object; permitidos: RolPersonal[] };
const LECTURA_AGENDA: RolPersonal[] = ['programador', 'jefe_sala', 'direccion', 'administrador'];
const SUPERVISION: RolPersonal[] = ['programador', 'direccion', 'administrador'];
const OPERACIONES: Op[] = [
  { nombre: 'ver ediciones', metodo: 'get', ruta: '/api/operacion/ediciones', permitidos: LECTURA_AGENDA },
  { nombre: 'ver sedes', metodo: 'get', ruta: `/api/operacion/ediciones/${e}/sedes`, permitidos: LECTURA_AGENDA },
  { nombre: 'ver la grilla', metodo: 'get', ruta: `/api/operacion/ediciones/${e}/grilla?dia=2026-11-12`, permitidos: LECTURA_AGENDA },
  { nombre: 'ver una función', metodo: 'get', ruta: `/api/operacion/funciones/${f}`, permitidos: LECTURA_AGENDA },
  { nombre: 'programar una función', metodo: 'post', ruta: `/api/operacion/ediciones/${e}/funciones`, cuerpo: {}, permitidos: ['programador'] },
  { nombre: 'editar una función', metodo: 'patch', ruta: `/api/operacion/funciones/${f}`, cuerpo: {}, permitidos: ['programador'] },
  { nombre: 'eliminar un borrador', metodo: 'delete', ruta: `/api/operacion/funciones/${f}`, permitidos: ['programador'] },
  { nombre: 'ver obras', metodo: 'get', ruta: `/api/operacion/ediciones/${e}/obras`, permitidos: SUPERVISION },
  { nombre: 'crear una obra', metodo: 'post', ruta: `/api/operacion/ediciones/${e}/obras`, cuerpo: {}, permitidos: ['programador'] },
  { nombre: 'editar una obra', metodo: 'patch', ruta: `/api/operacion/obras/${o}`, cuerpo: {}, permitidos: ['programador'] },
  { nombre: 'validar la publicación', metodo: 'get', ruta: `/api/operacion/ediciones/${e}/publicacion/validacion`, permitidos: ['programador'] },
  { nombre: 'publicar la edición', metodo: 'post', ruta: `/api/operacion/ediciones/${e}/publicacion`, cuerpo: {}, permitidos: ['programador'] },
  { nombre: 'publicar una función', metodo: 'post', ruta: `/api/operacion/funciones/${f}/publicacion`, cuerpo: {}, permitidos: ['programador'] },
  { nombre: 'reprogramar', metodo: 'post', ruta: `/api/operacion/funciones/${f}/reprogramacion`, cuerpo: {}, permitidos: ['programador'] },
  { nombre: 'cancelar', metodo: 'post', ruta: `/api/operacion/funciones/${f}/cancelacion`, cuerpo: {}, permitidos: ['programador'] },
  { nombre: 'ver el historial de cambios', metodo: 'get', ruta: `/api/operacion/funciones/${f}/cambios`, permitidos: SUPERVISION },
  { nombre: 'ver incidencias', metodo: 'get', ruta: `/api/operacion/ediciones/${e}/incidencias`, permitidos: LECTURA_AGENDA },
  { nombre: 'registrar una incidencia', metodo: 'post', ruta: `/api/operacion/ediciones/${e}/incidencias`, cuerpo: {}, permitidos: ['programador', 'jefe_sala'] },
  { nombre: 'atender una incidencia', metodo: 'patch', ruta: `/api/operacion/incidencias/${randomUUID()}`, cuerpo: {}, permitidos: ['programador', 'jefe_sala'] },
  { nombre: 'registrar un conteo', metodo: 'post', ruta: `/api/operacion/funciones/${f}/conteos`, cuerpo: {}, permitidos: ['programador', 'jefe_sala'] },
  { nombre: 'ver indicadores', metodo: 'get', ruta: `/api/operacion/ediciones/${e}/indicadores?dimension=sede`, permitidos: SUPERVISION },
  { nombre: 'exportar el CSV', metodo: 'get', ruta: `/api/operacion/ediciones/${e}/indicadores.csv?dimension=sede`, permitidos: SUPERVISION },
  { nombre: 'ver el informe de cierre', metodo: 'get', ruta: `/api/operacion/ediciones/${e}/informe`, permitidos: ['direccion', 'administrador'] },
  { nombre: 'regenerar el informe', metodo: 'post', ruta: `/api/operacion/ediciones/${e}/informe`, permitidos: ['administrador'] },
  { nombre: 'crear una edición', metodo: 'post', ruta: '/api/operacion/ediciones', cuerpo: {}, permitidos: ['administrador'] },
  { nombre: 'ver una edición', metodo: 'get', ruta: `/api/operacion/ediciones/${e}`, permitidos: SUPERVISION },
  { nombre: 'editar una edición', metodo: 'patch', ruta: `/api/operacion/ediciones/${e}`, cuerpo: {}, permitidos: ['administrador'] },
  { nombre: 'crear una sede', metodo: 'post', ruta: `/api/operacion/ediciones/${e}/sedes`, cuerpo: {}, permitidos: ['administrador'] },
  { nombre: 'editar una sede', metodo: 'patch', ruta: `/api/operacion/sedes/${randomUUID()}`, cuerpo: {}, permitidos: ['administrador'] },
  { nombre: 'eliminar una sede', metodo: 'delete', ruta: `/api/operacion/sedes/${randomUUID()}`, permitidos: ['administrador'] },
  { nombre: 'listar dominios de estudiantes', metodo: 'get', ruta: '/api/identidad/dominios-institucionales', permitidos: ['administrador'] },
  { nombre: 'registrar un dominio de estudiantes', metodo: 'post', ruta: '/api/identidad/dominios-institucionales', cuerpo: {}, permitidos: ['administrador'] },
  { nombre: 'listar el personal', metodo: 'get', ruta: '/api/identidad/personal', permitidos: ['administrador'] },
  { nombre: 'crear personal', metodo: 'post', ruta: '/api/identidad/personal', cuerpo: {}, permitidos: ['administrador'] },
  { nombre: 'cambiar roles', metodo: 'put', ruta: `/api/identidad/personal/${randomUUID()}/roles`, cuerpo: {}, permitidos: ['administrador'] },
  { nombre: 'desactivar una cuenta', metodo: 'put', ruta: `/api/identidad/personal/${randomUUID()}/estado`, cuerpo: {}, permitidos: ['administrador'] },
  { nombre: 'restablecer el segundo factor', metodo: 'delete', ruta: `/api/identidad/personal/${randomUUID()}/segundo-factor`, cuerpo: {}, permitidos: ['administrador'] },
];

const CASOS = OPERACIONES.flatMap((op) => ROLES.map((rol) => ({ ...op, rol, permitido: op.permitidos.includes(rol) })));

describe('SC-007 · matriz de autorización', () => {
  it.each(CASOS)('$rol · $nombre ⇒ $permitido', async ({ metodo, ruta, cuerpo, rol, permitido }) => {
    let req = ctx.http()[metodo](ruta).set(conRol(CON_ALCANCE[rol] ?? rol)).set('Origin', process.env.WEB_URL ?? 'http://localhost:3100');
    if (cuerpo) req = req.send(cuerpo);
    const r = await req;
    if (permitido) expect([401, 403], `${rol} ${metodo.toUpperCase()} ${ruta} → ${r.status}`).not.toContain(r.status);
    else expect(r.status, `${rol} ${metodo.toUpperCase()} ${ruta}`).toBe(403);
  });

  it('sin sesión, cualquier operación del personal responde 401', async () => {
    for (const op of OPERACIONES) {
      const r = await ctx.http()[op.metodo](op.ruta).set('Origin', process.env.WEB_URL ?? 'http://localhost:3100');
      expect(r.status, `${op.metodo} ${op.ruta}`).toBe(401);
    }
  });
});

describe('RN-009 · alcance', () => {
  const contexto = (roles: ContextoIdentidad['roles']): ContextoIdentidad => ({
    cuentaId: randomUUID(), sesionId: randomUUID(), correo: 'x@fiavl.test', correoVerificado: true, estudianteAcreditado: false, segundoFactorOk: true, roles,
  });

  it('US9-AS1: taquilla del Teatro Bolívar no opera en el Teatro Segundo Cueva Celi', () => {
    const taquilla = contexto([{ rol: 'taquilla', alcance: { tipo: 'sede', valor: BOLIVAR } }]);
    expect(() => exigirAlcance(taquilla, ['taquilla'], { tipo: 'sede', valor: BOLIVAR })).not.toThrow();
    expect(() => exigirAlcance(taquilla, ['taquilla'], { tipo: 'sede', valor: CUEVA_CELI })).toThrow(expect.objectContaining({ codigo: 'fuera_de_alcance' }));
    expect(() => exigirAlcance(taquilla, ['validador'], { tipo: 'sede', valor: BOLIVAR })).toThrow();
  });

  it('un rol sin alcance cubre todas las sedes', () => {
    const programador = contexto([{ rol: 'programador', alcance: null }]);
    expect(() => exigirAlcance(programador, ['programador'], { tipo: 'sede', valor: CUEVA_CELI })).not.toThrow();
  });
});
