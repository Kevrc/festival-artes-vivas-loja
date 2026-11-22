import { Logger } from '@nestjs/common';
import { COOKIE_SESION, type ContextoIdentidad, type IdentidadPublica, type PeticionConCabeceras } from '@fiavl/contracts';
import { ENTORNOS_DEV, IdentidadPublicaDevProvider } from '../../../common/identidad/identidad-publica.dev';
import type { SesionServicio } from '../application/sesion/sesion.servicio';

/** Valor de una cookie de la cabecera `Cookie`, sin dependencias. */
export function leerCookie(req: PeticionConCabeceras, nombre: string): string | null {
  const bruto = req.headers.cookie;
  const cabecera = Array.isArray(bruto) ? bruto.join('; ') : bruto;
  if (!cabecera) return null;
  for (const parte of cabecera.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nombre) {
      try {
        return decodeURIComponent(parte.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Contrato IdentidadPublica de verdad (ADR-0009, T075): sesión de la cookie `fiavl_sesion`, con
 * estado y roles leídos en cada petición. Falla cerrado: cualquier error ⇒ null (401).
 *
 * shortcut: en development/test, sin cookie, cae al proveedor de cabeceras `x-*-dev` que usan el
 * panel de Operación y las pruebas. Con cookie (aunque no sea válida) nunca cae al puente. En
 * cualquier otro entorno el proveedor de desarrollo ya devuelve null.
 */
export class IdentidadPublicaSesionProvider implements IdentidadPublica {
  private readonly log = new Logger(IdentidadPublicaSesionProvider.name);
  private readonly dev: IdentidadPublicaDevProvider | null;

  constructor(
    private readonly sesiones: SesionServicio,
    entorno: string | undefined = process.env.NODE_ENV,
  ) {
    this.dev = ENTORNOS_DEV.includes(entorno as (typeof ENTORNOS_DEV)[number]) ? new IdentidadPublicaDevProvider(entorno) : null;
  }

  async resolverSesion(req: PeticionConCabeceras): Promise<ContextoIdentidad | null> {
    try {
      const token = leerCookie(req, COOKIE_SESION);
      // Con cookie manda la sesión real: vencida, revocada o inventada ⇒ null, nunca el puente dev.
      if (token !== null) return /^[A-Za-z0-9_-]{43}$/.test(token) ? await this.sesiones.resolver(token) : null;
      return this.dev ? await this.dev.resolverSesion(req) : null;
    } catch (e) {
      this.log.error({ error: e instanceof Error ? e.message : String(e) }, 'no se pudo resolver la sesión: acceso denegado');
      return null;
    }
  }
}
