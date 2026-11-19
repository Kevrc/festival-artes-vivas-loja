import { diaFestival } from '../../domain/dia-festival';
import { ordenarDia } from '../../domain/reglas-dia';
import type { NivelDisponibilidad } from '../../domain/tipos';
import { aEdicion, aFuncion, versionDe, type PrismaCarteleraLectura } from '../../infrastructure/prisma-cartelera.lectura';
import type { Reloj } from '../puertos';
import type { Disponibilidad } from '../vistas';

/** Disponibilidad más vieja que esto se informa como `desconocida` (research R4). */
export const VIGENCIA_DISPONIBILIDAD_MS = 5 * 60_000;

/** Consultas de la US1: edición visible, funciones del día y disponibilidad. */
export class ConsultasDia {
  constructor(
    private readonly lectura: PrismaCarteleraLectura,
    private readonly reloj: Reloj,
  ) {}

  /** US1-AS2: hoy si hay festival; si no, el primer día de la próxima o el último de la más reciente. */
  async edicionActual() {
    const hoy = diaFestival(this.reloj());
    const ediciones = (await this.lectura.edicionesVisibles()).map(aEdicion);
    const actual = ediciones.find((e) => e.fechaInicio <= hoy && hoy <= e.fechaFin);
    const proxima = ediciones.find((e) => e.fechaInicio > hoy);
    const reciente = ediciones.at(-1);
    const elegida = actual ?? proxima ?? reciente;
    if (!elegida) return null;
    const diaSugerido = actual ? hoy : proxima ? proxima.fechaInicio : elegida.fechaFin;
    return { ...elegida, diaSugerido, facetas: await this.lectura.facetas(elegida.id) };
  }

  async dia(fecha: string) {
    const edicion = await this.lectura.edicionQueContiene(fecha);
    if (!edicion) return null;
    const ahora = this.reloj();
    const filas = await this.lectura.funcionesDelDia(fecha);
    return {
      fecha,
      edicion: aEdicion(edicion),
      version: versionDe(filas),
      funciones: ordenarDia(filas.map((f) => aFuncion(f, ahora))),
    };
  }

  async disponibilidad(fecha: string): Promise<{ version: string; items: Disponibilidad[] }> {
    const ahora = this.reloj().getTime();
    const filas = await this.lectura.funcionesDelDia(fecha);
    return {
      version: versionDe(filas),
      items: filas.map((f) => {
        const vigente = f.disponibilidadActualizadaEn && ahora - f.disponibilidadActualizadaEn.getTime() <= VIGENCIA_DISPONIBILIDAD_MS;
        const nivel: NivelDisponibilidad = f.disponibilidad === 'no_aplica' ? 'no_aplica' : vigente ? f.disponibilidad : 'desconocida';
        return {
          funcionId: f.id,
          nivel,
          ...(f.disponibilidadActualizadaEn ? { actualizadaEn: f.disponibilidadActualizadaEn.toISOString() } : {}),
        };
      }),
    };
  }
}
