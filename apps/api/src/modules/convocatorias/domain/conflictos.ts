/**
 * RN-004: un curador tiene conflicto si es integrante, familiar declarado o representante del elenco.
 * `curador.conflictos` es la declaración del propio curador: nombres (texto) o `{ nombre, relacion? }` de personas
 * o elencos con los que tiene vínculo. Se compara sin tildes ni mayúsculas contra el elenco, su responsable y sus integrantes.
 */
export interface CuradorConflicto { cuentaId: string; conflictos: unknown }
export interface ElencoConflicto { cuentaId: string; nombre: string; responsable: string; integrantes: unknown }
export type ResultadoConflicto = { conflicto: false } | { conflicto: true; motivo: string };

export function normalizarNombre(valor: string): string {
  return valor.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();
}

function declarados(conflictos: unknown): string[] {
  if (!Array.isArray(conflictos)) return [];
  return conflictos
    .map((c) => (typeof c === 'string' ? c : typeof c === 'object' && c !== null && 'nombre' in c ? (c as { nombre: unknown }).nombre : null))
    .filter((c): c is string => typeof c === 'string' && c.trim() !== '')
    .map(normalizarNombre);
}

export function detectarConflicto(curador: CuradorConflicto, elenco: ElencoConflicto): ResultadoConflicto {
  if (curador.cuentaId === elenco.cuentaId) return { conflicto: true, motivo: 'El curador representa al elenco' };
  const declaracion = new Set(declarados(curador.conflictos));
  if (!declaracion.size) return { conflicto: false };
  const integrantes = Array.isArray(elenco.integrantes) ? elenco.integrantes.filter((i): i is string => typeof i === 'string') : [];
  const coincidencias: Array<[string, string]> = [
    [elenco.nombre, 'elenco declarado'],
    [elenco.responsable, 'representante declarado'],
    ...integrantes.map((i): [string, string] => [i, 'integrante o familiar declarado']),
  ];
  for (const [nombre, tipo] of coincidencias) {
    if (declaracion.has(normalizarNombre(nombre))) return { conflicto: true, motivo: `Conflicto de interés: ${tipo}` };
  }
  return { conflicto: false };
}
