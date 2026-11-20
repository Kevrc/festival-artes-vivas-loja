import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { AutorizacionBoleteriaPort, ContextoUsuario } from '../application/puertos';
import type { RolBoleteria } from '../domain/tipos';

export const CABECERA_CUENTA_DEV = 'x-cuenta-dev';
export const CABECERA_CORREO_DEV = 'x-correo-dev';
export const CABECERA_VERIFICADO_DEV = 'x-correo-verificado-dev';
export const CABECERA_ESTUDIANTE_DEV = 'x-estudiante-dev';
export const CABECERA_ROL_DEV = 'x-rol-dev';
export const CABECERA_SEDE_DEV = 'x-sede-dev';
export const COOKIE_SESION_DEV = 'sesion_dev';

const RolSchema = z.enum(['asistente', 'taquilla', 'validador', 'jefe_sala', 'programador', 'administrador']);

function leerCookie(cookieHeader: string | undefined, nombre: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const parte of cookieHeader.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/**
 * Adaptador temporal hasta que exista Identidad (spec 004).
 * Falla cerrada (null -> 401) en cualquier entorno distinto de development o test (Constitución VI).
 */
@Injectable()
export class AutorizacionDevAdapter implements AutorizacionBoleteriaPort {
  async resolverDesdePeticion(req: {
    headers: Record<string, string | string[] | undefined>;
  }): Promise<ContextoUsuario | null> {
    if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
      return null;
    }

    const header = (k: string) => {
      const val = req.headers[k];
      return Array.isArray(val) ? val[0] : val;
    };

    let cuentaStr = header(CABECERA_CUENTA_DEV);
    let rolStr = header(CABECERA_ROL_DEV);
    let sedeStr = header(CABECERA_SEDE_DEV);
    let estudianteStr = header(CABECERA_ESTUDIANTE_DEV);
    let verificadoStr = header(CABECERA_VERIFICADO_DEV);
    let correoStr = header(CABECERA_CORREO_DEV);

    if (!cuentaStr) {
      const cookieVal = leerCookie(header('cookie'), COOKIE_SESION_DEV);
      if (cookieVal) {
        try {
          const parsed = JSON.parse(cookieVal) as Record<string, unknown>;
          cuentaStr = typeof parsed.cuentaId === 'string' ? parsed.cuentaId : undefined;
          rolStr = typeof parsed.rol === 'string' ? parsed.rol : rolStr;
          sedeStr = typeof parsed.sedeId === 'string' ? parsed.sedeId : sedeStr;
          estudianteStr = typeof parsed.estudiante === 'boolean' ? String(parsed.estudiante) : estudianteStr;
          verificadoStr = typeof parsed.correoVerificado === 'boolean' ? String(parsed.correoVerificado) : verificadoStr;
          correoStr = typeof parsed.correo === 'string' ? parsed.correo : correoStr;
        } catch {
          const [c, r, s, est] = cookieVal.split('|');
          cuentaStr = c;
          if (r) rolStr = r;
          if (s) sedeStr = s;
          if (est) estudianteStr = est;
        }
      }
    }

    const cuenta = z.string().uuid().safeParse(cuentaStr);
    if (!cuenta.success) return null;

    const rolParsed = RolSchema.safeParse(rolStr ?? 'asistente');
    const sedeParsed = sedeStr ? z.string().uuid().safeParse(sedeStr) : null;
    const rol: RolBoleteria = rolParsed.success ? rolParsed.data : 'asistente';
    const roles: { rol: RolBoleteria; sedeId?: string }[] = [
      { rol, ...(sedeParsed?.success ? { sedeId: sedeParsed.data } : {}) },
    ];

    return {
      cuentaId: cuenta.data,
      correo: correoStr ?? `${cuenta.data}@fiavl.ec`,
      correoVerificado: verificadoStr !== 'false',
      estudianteAcreditado: estudianteStr === 'true',
      roles,
    };
  }
}
