export interface RequisitosPostulacion {
  elenco: { nombre: string; responsable: string; correoContacto: string; provinciaPais: string; trayectoria: string; integrantes: unknown };
  obra: { titulo: string; disciplina: string; sinopsis: string; duracionMin: number; publico: string; fichaTecnica: Record<string, unknown>; videoUrl?: string | null };
  documentos: string[];
}

export function calcularFaltantesPostulacion(data: RequisitosPostulacion): string[] {
  const faltantes: string[] = [];
  for (const [campo, valor] of Object.entries(data.elenco)) {
    if (Array.isArray(valor) ? valor.length === 0 : typeof valor !== 'string' || !valor.trim()) faltantes.push(`elenco.${campo}`);
  }
  for (const campo of ['titulo', 'disciplina', 'sinopsis', 'publico'] as const) {
    if (!data.obra[campo].trim()) faltantes.push(`obra.${campo}`);
  }
  if (!Number.isInteger(data.obra.duracionMin) || data.obra.duracionMin <= 0) faltantes.push('obra.duracionMin');
  if (!Object.keys(data.obra.fichaTecnica).length) faltantes.push('obra.fichaTecnica');
  if (data.obra.videoUrl && !/^https:\/\//i.test(data.obra.videoUrl)) faltantes.push('obra.videoUrl');
  for (const requerido of ['dossier', 'ficha_tecnica']) {
    if (!data.documentos.includes(requerido)) faltantes.push(`documentos.${requerido}`);
  }
  return faltantes;
}
