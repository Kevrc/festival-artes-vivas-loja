'use client';
import dynamic from 'next/dynamic';
import type { FuncionResumen } from '@/lib/cartelera/tipos';

// Leaflet solo se descarga al abrir el mapa (research R7)
const Mapa = dynamic(() => import('./mapa').then((m) => m.Mapa), { ssr: false, loading: () => <p>Cargando mapa…</p> });

export function MapaCargable({ funciones }: { funciones: FuncionResumen[] }) {
  return <Mapa funciones={funciones} />;
}
