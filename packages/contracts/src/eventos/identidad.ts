import { z } from 'zod';
import { sobre } from './sobre';

/**
 * Eventos publicados por Identidad (spec 004, contracts/eventos-operacion-identidad.md §2).
 * En v1 ningún módulo está obligado a consumirlos. Nunca llevan correo ni nombre.
 */
const instante = z.string().datetime({ offset: true });

/** Los 11 roles de FR-019 como códigos (research R16). */
export const RolPersonal = z.enum([
  'asistente',
  'postulante',
  'curador',
  'coordinacion_convocatorias',
  'coordinacion_provincial',
  'programador',
  'jefe_sala',
  'taquilla',
  'validador',
  'direccion',
  'administrador',
]);
export type RolPersonal = z.infer<typeof RolPersonal>;

export const TipoAlcanceRol = z.enum(['sede', 'provincia', 'disciplina']);
export const AlcanceRolDto = z.object({ tipo: TipoAlcanceRol, valor: z.string().min(1) });

export const CuentaVerificada = sobre(
  'CuentaVerificada',
  z.object({ cuentaId: z.string().uuid(), verificadaEn: instante }),
);

export const RolAsignado = sobre(
  'RolAsignado',
  z.object({
    cuentaId: z.string().uuid(),
    rol: RolPersonal,
    alcance: AlcanceRolDto.nullable(),
    operacion: z.enum(['asignado', 'revocado']),
    asignadoPor: z.string().uuid(),
  }),
);

export const CuentaEliminada = sobre(
  'CuentaEliminada',
  z.object({ cuentaId: z.string().uuid(), eliminadaEn: instante }),
);

export const EventoPublicadoIdentidad = z.discriminatedUnion('tipo', [CuentaVerificada, RolAsignado, CuentaEliminada]);
export type EventoPublicadoIdentidad = z.infer<typeof EventoPublicadoIdentidad>;
