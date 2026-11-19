'use client';
import { useEffect, useState } from 'react';
import { obtenerCliente } from '@/lib/cartelera/api';
import type { Disponibilidad, NivelDisponibilidad } from '@/lib/cartelera/tipos';

/**
 * Disponibilidad aparte de la página, cada 60 s (research R4, R5).
 * Si cambia la versión del día, avisa que la programación se actualizó.
 */
export function useDisponibilidad(fecha: string, versionPagina: string) {
  const [niveles, setNiveles] = useState<Record<string, NivelDisponibilidad>>({});
  const [desactualizada, setDesactualizada] = useState(false);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      try {
        const r = await obtenerCliente<{ version: string; items: Disponibilidad[] }>(`/disponibilidad?fecha=${fecha}`);
        if (!vivo) return;
        setNiveles(Object.fromEntries(r.items.map((i) => [i.funcionId, i.nivel])));
        setDesactualizada(r.version !== versionPagina);
        setFallo(false);
      } catch {
        // RNF-003: sin respuesta, la cartelera sigue y se muestra "Consultar disponibilidad"
        if (vivo) {
          setNiveles({});
          setFallo(true);
        }
      }
    };
    void cargar();
    const t = setInterval(cargar, 60_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [fecha, versionPagina]);

  /** Nivel de una función: `desconocida` si la API no respondió. */
  const nivelDe = (id: string): NivelDisponibilidad | undefined => niveles[id] ?? (fallo ? 'desconocida' : undefined);
  return { nivelDe, desactualizada };
}
