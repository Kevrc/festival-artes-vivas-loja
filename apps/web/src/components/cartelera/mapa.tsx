'use client';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { obtenerCliente } from '@/lib/cartelera/api';
import { formatoHora } from '@/lib/cartelera/formato';
import type { FichaSede, FuncionResumen } from '@/lib/cartelera/tipos';

const TESELAS = process.env.NEXT_PUBLIC_TILES_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function Mapa({ funciones }: { funciones: FuncionResumen[] }) {
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contenedor.current) return;
    const mapa = L.map(contenedor.current).setView([-3.9965, -79.2025], 15);
    L.tileLayer(TESELAS, { maxZoom: 19, attribution: '© colaboradores de OpenStreetMap' }).addTo(mapa);
    const porSede = new Map<string, FuncionResumen[]>();
    for (const f of funciones) porSede.set(f.sede.id, [...(porSede.get(f.sede.id) ?? []), f]);
    for (const lista of porSede.values()) {
      const sede = lista[0]!.sede;
      const html = `<strong><a href="/sedes/${sede.id}">${escapar(sede.nombre)}</a></strong><ul>${lista
        .map((f) => `<li>${f.continua ? 'Todo el día' : formatoHora(f.inicio)} · <a href="/obras/${f.obra.id}">${escapar(f.obra.titulo)}</a>${f.estado === 'cancelada' ? ' (cancelada)' : ''}</li>`)
        .join('')}</ul>`;
      L.circleMarker([sede.coordenadas.lat, sede.coordenadas.lng], { radius: 9, color: '#a3201c', weight: 2, fillOpacity: 0.7 })
        .bindPopup(html)
        .addTo(mapa);
      if (sede.tipo === 'recorrido') {
        obtenerCliente<FichaSede>(`/sedes/${sede.id}`)
          .then((s) => s.recorrido && L.polyline(s.recorrido.map((p) => [p.lat, p.lng]), { color: '#a3201c', dashArray: '6 6' }).addTo(mapa))
          .catch(() => undefined);
      }
    }
    return () => void mapa.remove();
  }, [funciones]);

  return (
    <>
      <div ref={contenedor} className="mapa" role="region" aria-label="Mapa de sedes del día" />
      <p className="solo-lectores">La lista de funciones con sus sedes está en la cartelera del día.</p>
    </>
  );
}
