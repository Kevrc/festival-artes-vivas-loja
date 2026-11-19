'use client';
import { useSyncExternalStore } from 'react';
import { obtenerCliente } from './api';

/** Favoritos en el dispositivo (US5-AS3, research R8). localStorage puede fallar: nunca rompe la página. */
const CLAVE = 'fiavl.favoritos';
const EVENTO = 'fiavl:favoritos';
const VACIO: string[] = [];
let cache: { crudo: string | null; ids: string[] } = { crudo: null, ids: VACIO };

function leer(): string[] {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (crudo !== cache.crudo) {
      const ids = JSON.parse(crudo ?? '[]');
      cache = { crudo, ids: Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : VACIO };
    }
    return cache.ids;
  } catch {
    return VACIO;
  }
}

function guardar(ids: string[]) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify([...new Set(ids)]));
  } catch {
    // modo privado o almacenamiento lleno: el favorito dura solo en esta pestaña
  }
  window.dispatchEvent(new Event(EVENTO));
}

function suscribir(aviso: () => void) {
  window.addEventListener(EVENTO, aviso);
  window.addEventListener('storage', aviso);
  return () => {
    window.removeEventListener(EVENTO, aviso);
    window.removeEventListener('storage', aviso);
  };
}

export function useFavoritos() {
  const ids = useSyncExternalStore(suscribir, leer, () => VACIO);
  const alternar = (id: string) => guardar(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  return { ids, esFavorito: (id: string) => ids.includes(id), alternar };
}

/**
 * Al iniciar sesión (Identidad, spec 004) se fusionan los favoritos del dispositivo con los de la
 * cuenta sin duplicar (POST /favoritos/fusion) y el dispositivo queda con la lista resultante.
 */
export async function fusionarConCuenta(): Promise<string[]> {
  const resultado = await obtenerCliente<string[]>('/favoritos/fusion', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ funcionIds: leer() }),
  });
  guardar(resultado);
  return resultado;
}
