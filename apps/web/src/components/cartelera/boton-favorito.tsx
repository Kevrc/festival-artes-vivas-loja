'use client';
import { useFavoritos } from '@/lib/cartelera/favoritos';

/** Marca o quita una función de "Mi agenda" (US5). */
export function BotonFavorito({ funcionId, titulo }: { funcionId: string; titulo: string }) {
  const { esFavorito, alternar } = useFavoritos();
  const marcado = esFavorito(funcionId);
  return (
    <button type="button" className="boton-favorito" aria-pressed={marcado} onClick={() => alternar(funcionId)}>
      <span aria-hidden="true">{marcado ? '★' : '☆'}</span> {marcado ? 'En mi agenda' : 'Agregar a mi agenda'}
      <span className="solo-lectores">: {titulo}</span>
    </button>
  );
}
