import { notFound } from 'next/navigation';
import { API_CONVOCATORIAS } from '@/lib/convocatorias/api';
import { FormularioPostulacion } from './formulario-postulacion';

export const dynamic = 'force-dynamic';

export default async function PostularPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await fetch(`${API_CONVOCATORIAS}/${id}`, { cache: 'no-store' });
  if (!response.ok) notFound();
  const convocatoria = await response.json() as { codigo: string };
  return <section><p className="sobretitulo">{convocatoria.codigo}</p><h1>Postular una obra</h1><FormularioPostulacion convocatoriaId={id} /></section>;
}
