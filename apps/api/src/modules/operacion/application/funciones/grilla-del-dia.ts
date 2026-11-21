import { diaFestival, feriadoDe, rangoDelDia } from '../../domain/agenda';
import { noEncontrado } from '../errores';
import type { FuncionVista, RepositorioOperacion, SedeVista } from '../puertos';

export interface Grilla {
  fecha: string;
  feriado: string | null;
  sedes: SedeVista[];
  funciones: FuncionVista[];
}

/**
 * Grilla de un día con una columna por sede (US1, RNF-001). Entran las funciones que empiezan ese
 * día (las que cruzan medianoche cuentan para su día de inicio) y las actividades continuas que lo
 * abarcan. El feriado solo se informa.
 */
export class GrillaDelDia {
  constructor(private readonly repo: RepositorioOperacion) {}

  async ejecutar(edicionId: string, fecha: string): Promise<Grilla> {
    if (!(await this.repo.edicion(edicionId))) throw noEncontrado('La edición');
    const { desde, hasta } = rangoDelDia(fecha);
    const [sedes, candidatas] = await Promise.all([
      this.repo.sedesDeEdicion(edicionId, true),
      this.repo.funcionesEntre(edicionId, desde, hasta),
    ]);
    const funciones = candidatas.filter((f) => f.continua || diaFestival(f.inicio) === fecha);
    return { fecha, feriado: feriadoDe(fecha), sedes, funciones };
  }
}
