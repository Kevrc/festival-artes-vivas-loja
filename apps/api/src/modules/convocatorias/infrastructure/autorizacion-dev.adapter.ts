import { z } from 'zod';
import { ROLES_IDENTIDAD, type ContextoConvocatorias } from '../application/puertos';

function cookieSesion(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  const pair = value.split(';').map((part) => part.trim()).find((part) => part.startsWith('sesion_dev='));
  if (!pair) return {};
  try {
    return JSON.parse(decodeURIComponent(pair.slice('sesion_dev='.length))) as Record<string, unknown>;
  } catch {
    const [cuentaId, rol] = decodeURIComponent(pair.slice('sesion_dev='.length)).split('|');
    return { cuentaId, rol };
  }
}

export class AutorizacionConvocatoriasDevAdapter {
  constructor(private readonly entorno = process.env.NODE_ENV) {}

  async resolverDesdePeticion(req: { headers: Record<string, string | string[] | undefined> }): Promise<ContextoConvocatorias | null> {
    if (this.entorno === 'production') return null;
    const h = req.headers;
    const cookie = cookieSesion(Array.isArray(h.cookie) ? h.cookie[0] : h.cookie);
    const header = (key: string) => Array.isArray(h[key]) ? h[key]?.[0] : h[key];
    const cuentaId = z.string().uuid().safeParse(header('x-cuenta-dev') ?? cookie.cuentaId);
    const rol = z.enum(ROLES_IDENTIDAD).safeParse(header('x-rol-dev') ?? cookie.rol);
    if (!cuentaId.success || !rol.success) return null;
    const provincia = header('x-provincia-dev');
    const disciplina = header('x-disciplina-dev');
    return {
      cuentaId: cuentaId.data,
      correo: header('x-correo-dev') ?? (typeof cookie.correo === 'string' ? cookie.correo : undefined),
      correoVerificado: (header('x-correo-verificado-dev') ?? String(cookie.correoVerificado ?? true)) !== 'false',
      roles: [{ rol: rol.data, ...(provincia || disciplina ? { alcance: { ...(provincia ? { provincia } : {}), ...(disciplina ? { disciplina } : {}) } } : {}) }],
    };
  }
}
