import { obtenerCliente } from '@/lib/cartelera/api';
import { diasEntre } from '@/lib/cartelera/formato';
import type { DiaCartelera, EdicionConFacetas, FuncionResumen, SedeResumen } from '@/lib/cartelera/tipos';

export interface CatalogoOperacion {
  sedes: SedeResumen[];
  funciones: FuncionResumen[];
}

/** Carga sedes y funciones publicadas de la edición vigente para pantallas operativas. */
export async function cargarCatalogoOperacion(): Promise<CatalogoOperacion> {
  try {
    const edicion = await obtenerCliente<EdicionConFacetas>('/ediciones/actual');
    const dias = diasEntre(edicion.fechaInicio, edicion.fechaFin);
    const diarios = await Promise.all(
      dias.map((d) => obtenerCliente<DiaCartelera>(`/dias/${d}`).catch(() => null)),
    );
    const funciones = diarios
      .filter((d): d is DiaCartelera => d !== null)
      .flatMap((d) => d.funciones);
    return { sedes: edicion.facetas.sedes ?? [], funciones };
  } catch {
    return { sedes: [], funciones: [] };
  }
}
