import { generarIcs } from '../../domain/calendario';
import { ventanaAhora } from '../../domain/en-curso';
import { aFuncion, aObra, aSede, type PrismaCarteleraLectura } from '../../infrastructure/prisma-cartelera.lectura';
import type { Reloj } from '../puertos';

/** Consultas de US2 (búsqueda), US3 (fichas), US4 (Ahora) y US6 (calendario). */
export class ConsultasFichas {
  constructor(
    private readonly lectura: PrismaCarteleraLectura,
    private readonly reloj: Reloj,
    private readonly webUrl = process.env.WEB_URL ?? 'http://localhost:3100',
  ) {}

  async buscar(q: string) {
    const ahora = this.reloj();
    const obras = await this.lectura.buscar(q);
    return obras.map((o) => ({ ...aObra(o), funciones: o.funciones.map((f) => aFuncion(f, ahora)) }));
  }

  async obra(id: string) {
    const o = await this.lectura.obra(id);
    if (!o) return null;
    const ahora = this.reloj();
    return {
      ...aObra(o),
      sinopsis: o.sinopsis,
      duracionMin: o.duracionMin,
      ...(o.idioma ? { idioma: o.idioma } : {}),
      imagenes: o.imagenes as string[],
      fichaArtistica: o.fichaArtistica as { rol: string; nombre: string }[],
      funciones: o.funciones.map((f) => aFuncion(f, ahora)),
    };
  }

  async elenco(id: string) {
    const obras = await this.lectura.obrasDeElenco(id);
    const primera = obras[0];
    if (!primera) return null;
    return {
      id,
      nombre: primera.elencoNombre,
      pais: primera.elencoPais,
      ...(primera.elencoCiudad ? { ciudad: primera.elencoCiudad } : {}),
      componente: primera.componente,
      obras: obras.map(aObra),
    };
  }

  async sede(id: string) {
    const r = await this.lectura.sede(id);
    if (!r || r.funciones.length === 0) return null; // sin funciones visibles = edición no publicada
    const ahora = this.reloj();
    return {
      ...aSede(r.sede),
      direccion: r.sede.direccion,
      ...(r.sede.aforo ? { aforo: r.sede.aforo } : {}),
      ...(r.sede.recorrido ? { recorrido: r.sede.recorrido } : {}),
      accesibilidad: r.sede.accesibilidad as Record<string, boolean>,
      funciones: r.funciones.map((f) => aFuncion(f, ahora)),
    };
  }

  async ahora() {
    const ahora = this.reloj();
    const { desde, hasta } = ventanaAhora(ahora);
    const filas = await this.lectura.enVentana(desde, hasta);
    return { horaServidor: ahora.toISOString(), items: filas.map((f) => aFuncion(f, ahora)) };
  }

  async calendario(id: string) {
    const f = await this.lectura.funcion(id);
    if (!f) return null;
    return generarIcs(
      {
        id: f.id,
        titulo: f.obra.titulo,
        inicio: f.inicio,
        fin: f.fin,
        sede: f.sede.nombre,
        direccion: f.sede.direccion,
        url: `${this.webUrl}/obras/${f.obraId}`,
      },
      this.reloj(),
    );
  }
}
