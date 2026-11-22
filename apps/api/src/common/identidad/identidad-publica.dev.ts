import { Logger } from '@nestjs/common';
import {
  type AlcanceRol,
  type ContextoIdentidad,
  type IdentidadPublica,
  type PeticionConCabeceras,
  RolPersonal,
} from '@fiavl/contracts';
import { z } from 'zod';

/**
 * shortcut: IdentidadPublica para desarrollo y pruebas, desde cabeceras `x-*-dev`, mientras no
 * haya sesión real (spec 004, T024). Solo con NODE_ENV=development o test; en cualquier otro
 * entorno devuelve null (falla cerrado). Lo sustituye el proveedor de Identidad (T075).
 *
 * | Cabecera                  | Valor                                                   |
 * |---------------------------|---------------------------------------------------------|
 * | x-cuenta-dev              | uuid de la cuenta (obligatoria)                         |
 * | x-roles-dev               | roles separados por coma; cada uno `rol` o `rol@tipo:valor` |
 * | x-correo-dev              | correo (por defecto `<cuenta>@fiavl.test`)              |
 * | x-correo-verificado-dev   | `false` para simular cuenta sin verificar               |
 * | x-estudiante-dev          | `true` para simular acreditación vigente                |
 * | x-segundo-factor-dev      | `false` para simular sesión sin TOTP                    |
 */
export const ENTORNOS_DEV = ['development', 'test'] as const;

const Uuid = z.string().uuid();
const TipoAlcance = z.enum(['sede', 'provincia', 'disciplina']);

function cabecera(req: PeticionConCabeceras, nombre: string): string | undefined {
  const v = req.headers[nombre];
  return Array.isArray(v) ? v[0] : v;
}

/** `validador@sede:<uuid>` → { rol, alcance } ; null si no es válido. */
export function leerRolDev(texto: string): ContextoIdentidad['roles'][number] | null {
  const [rolTxt, alcanceTxt] = texto.trim().split('@');
  const rol = RolPersonal.safeParse(rolTxt);
  if (!rol.success) return null;
  if (!alcanceTxt) return { rol: rol.data, alcance: null };
  const sep = alcanceTxt.indexOf(':');
  const tipo = TipoAlcance.safeParse(alcanceTxt.slice(0, sep));
  const valor = alcanceTxt.slice(sep + 1);
  if (sep < 1 || !tipo.success || !valor) return null;
  const alcance: AlcanceRol = { tipo: tipo.data, valor };
  return { rol: rol.data, alcance };
}

export class IdentidadPublicaDevProvider implements IdentidadPublica {
  private readonly log = new Logger(IdentidadPublicaDevProvider.name);

  constructor(private readonly entorno: string | undefined = process.env.NODE_ENV) {}

  async resolverSesion(req: PeticionConCabeceras): Promise<ContextoIdentidad | null> {
    if (!ENTORNOS_DEV.includes(this.entorno as (typeof ENTORNOS_DEV)[number])) {
      this.log.warn('IdentidadPublicaDevProvider usado fuera de development/test: acceso denegado');
      return null;
    }
    const cuenta = Uuid.safeParse(cabecera(req, 'x-cuenta-dev'));
    if (!cuenta.success) return null;
    const roles = (cabecera(req, 'x-roles-dev') ?? 'asistente')
      .split(',')
      .filter((r) => r.trim())
      .map(leerRolDev);
    if (roles.some((r) => r === null)) return null;
    return {
      cuentaId: cuenta.data,
      sesionId: cuenta.data,
      correo: cabecera(req, 'x-correo-dev') ?? `${cuenta.data}@fiavl.test`,
      correoVerificado: cabecera(req, 'x-correo-verificado-dev') !== 'false',
      estudianteAcreditado: cabecera(req, 'x-estudiante-dev') === 'true',
      segundoFactorOk: cabecera(req, 'x-segundo-factor-dev') !== 'false',
      roles: roles as ContextoIdentidad['roles'],
    };
  }
}
