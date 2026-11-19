import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

/** Revalidación bajo demanda llamada por el módulo Programación (research R5). */
export async function POST(req: Request) {
  const secreto = process.env.REVALIDATE_SECRET;
  if (!secreto || req.headers.get('x-revalidate-secret') !== secreto) {
    return NextResponse.json({ title: 'Forbidden', status: 403 }, { status: 403 });
  }
  const cuerpo = (await req.json().catch(() => null)) as { etiquetas?: unknown } | null;
  const etiquetas = Array.isArray(cuerpo?.etiquetas) ? cuerpo.etiquetas.filter((t): t is string => typeof t === 'string') : [];
  if (!etiquetas.length || etiquetas.length > 100) {
    return NextResponse.json({ title: 'Bad Request', status: 400 }, { status: 400 });
  }
  for (const etiqueta of etiquetas) revalidateTag(etiqueta);
  return NextResponse.json({ revalidadas: etiquetas.length });
}
