'use client';
import { ETIQUETA_ACCESO, ETIQUETA_COMPONENTE, ETIQUETA_DISCIPLINA, ETIQUETA_PUBLICO } from '@/lib/cartelera/formato';
import { hayFiltros, type Filtros, type Parametro } from '@/lib/cartelera/filtros';
import type { Facetas } from '@/lib/cartelera/tipos';

const FRANJAS = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };

/** Filtros con controles nativos etiquetados (US2, FR-013). */
export function FiltrosPanel({
  facetas,
  filtros,
  alCambiar,
}: {
  facetas: Facetas;
  filtros: Filtros;
  alCambiar: (f: Filtros) => void;
}) {
  const grupos: { p: Parametro; titulo: string; opciones: [string, string][] }[] = [
    { p: 'acceso', titulo: 'Acceso', opciones: Object.entries(ETIQUETA_ACCESO) },
    { p: 'disciplina', titulo: 'Disciplina', opciones: (facetas.disciplinas ?? []).map((d) => [d, ETIQUETA_DISCIPLINA[d] ?? d]) },
    { p: 'franja', titulo: 'Horario', opciones: Object.entries(FRANJAS) },
    { p: 'sede', titulo: 'Sede', opciones: (facetas.sedes ?? []).map((s) => [s.id, s.nombre]) },
    { p: 'pais', titulo: 'País', opciones: (facetas.paises ?? []).map((x) => [x, x]) },
    { p: 'componente', titulo: 'Componente', opciones: (facetas.componentes ?? []).map((c) => [c, ETIQUETA_COMPONENTE[c] ?? c]) },
    { p: 'publico', titulo: 'Público', opciones: Object.entries(ETIQUETA_PUBLICO) },
  ];
  const alternar = (p: Parametro, valor: string, marcado: boolean) => {
    const actuales = filtros[p] ?? [];
    const nuevos = marcado ? [...actuales, valor] : actuales.filter((v) => v !== valor);
    const { [p]: _quitado, ...resto } = filtros;
    alCambiar(nuevos.length ? { ...resto, [p]: nuevos } : resto);
  };
  return (
    <details className="filtros" open={hayFiltros(filtros) || undefined}>
      <summary>Filtros</summary>
      <div className="filtros-grupos">
        {grupos
          .filter((g) => g.opciones.length)
          .map((g) => (
            <fieldset key={g.p}>
              <legend>{g.titulo}</legend>
              {g.opciones.map(([valor, texto]) => {
                const id = `f-${g.p}-${valor}`;
                return (
                  <label key={valor} htmlFor={id}>
                    <input
                      id={id}
                      type="checkbox"
                      checked={filtros[g.p]?.includes(valor) ?? false}
                      onChange={(e) => alternar(g.p, valor, e.currentTarget.checked)}
                    />{' '}
                    {texto}
                  </label>
                );
              })}
            </fieldset>
          ))}
      </div>
    </details>
  );
}
