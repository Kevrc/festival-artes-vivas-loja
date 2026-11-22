import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../apps/api/src/generated/prisma/index.js';
import { hashContrasena } from '../../apps/api/src/modules/identidad/domain/contrasenas';
import { desdeBase32 } from '../../apps/api/src/modules/identidad/domain/totp';
import { cifradorDelEntorno } from '../../apps/api/src/modules/identidad/infrastructure/cifrador-aes-gcm';
import { idDe } from './ids';

/**
 * Semilla del esquema `identidad` (spec 004): la política de privacidad v1 que exige el registro
 * (US7-AS5) y, fuera de producción, las cuentas de prueba del quickstart (T086). Idempotente.
 */
export const POLITICA_VIGENTE = { version: 1, url: '/privacidad', vigenteDesde: new Date('2026-01-01T00:00:00-05:00') };

/** Solo desarrollo y pruebas: contraseña y secreto TOTP conocidos (documentados en el quickstart). */
export const CUENTAS_PRUEBA = {
  contrasena: 'Festival-de-Loja-2026',
  /** Base32 de "TestSecretTestSecret"; cualquier aplicación de códigos lo acepta. */
  secretoTotp: 'KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU',
} as const;

type Rol = 'programador' | 'direccion' | 'administrador' | 'jefe_sala' | 'taquilla' | 'validador';
const BOLIVAR = { alcanceTipo: 'sede' as const, alcanceValor: idDe('sede:bolivar') };

const CUENTAS: { correo: string; nombre: string; rol?: Rol; sede?: typeof BOLIVAR }[] = [
  { correo: 'programador@fiavl.test', nombre: 'Programación FIAVL', rol: 'programador' },
  { correo: 'direccion@fiavl.test', nombre: 'Dirección FIAVL', rol: 'direccion' },
  { correo: 'admin@fiavl.test', nombre: 'Administración FIAVL', rol: 'administrador' },
  { correo: 'sala.bolivar@fiavl.test', nombre: 'Jefatura de sala Bolívar', rol: 'jefe_sala', sede: BOLIVAR },
  { correo: 'taquilla.bolivar@fiavl.test', nombre: 'Taquilla Bolívar', rol: 'taquilla', sede: BOLIVAR },
  { correo: 'validador.bolivar@fiavl.test', nombre: 'Validación Bolívar', rol: 'validador', sede: BOLIVAR },
  { correo: 'asistente@fiavl.test', nombre: 'Asistente de prueba' },
];

export async function seedIdentidad(db: PrismaClient, opciones: { cuentasPrueba?: boolean } = {}): Promise<number> {
  await db.documentoLegal.upsert({
    where: { documento_version: { documento: 'politica_privacidad', version: POLITICA_VIGENTE.version } },
    create: { documento: 'politica_privacidad', ...POLITICA_VIGENTE },
    update: {},
  });
  const conCuentas = opciones.cuentasPrueba ?? process.env.NODE_ENV !== 'production';
  if (!conCuentas) return 0;

  const hash = await hashContrasena(CUENTAS_PRUEBA.contrasena);
  const secreto = cifradorDelEntorno().cifrar(desdeBase32(CUENTAS_PRUEBA.secretoTotp));
  const ahora = new Date();
  let creadas = 0;
  for (const c of CUENTAS) {
    if (await db.cuenta.findUnique({ where: { correo: c.correo }, select: { id: true } })) continue;
    const id = randomUUID();
    const creada = await db.cuenta.create({
      data: {
        id,
        nombre: c.nombre,
        correo: c.correo,
        estado: 'verificada',
        verificadaEn: ahora,
        esPersonal: Boolean(c.rol),
        credencial: {
          create: c.rol
            ? { hashContrasena: hash, totpSecretoCifrado: new Uint8Array(secreto), totpActivo: true }
            : { hashContrasena: hash },
        },
        consentimientos: { create: [{ id: randomUUID(), documento: 'politica_privacidad', version: POLITICA_VIGENTE.version }] },
        ...(c.rol ? { roles: { create: [{ id: randomUUID(), rol: c.rol, asignadoPor: id, ...(c.sede ?? {}) }] } } : {}),
      },
    }).then(() => true, (e: { code?: string }) => {
      if (e.code === 'P2002') return false; // otra semilla en paralelo (pruebas) la creó primero
      throw e;
    });
    if (creada) creadas++;
  }
  return creadas;
}
