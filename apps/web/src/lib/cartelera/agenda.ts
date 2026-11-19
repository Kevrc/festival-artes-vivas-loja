/** RN-004: avisos de cruce y de traslado ajustado (< 15 min entre sedes distintas). */
export const MINUTOS_TRASLADO = 15;

type Agendable = { id: string; inicio: string; fin: string; estado: string; sede: { id: string } };

export type AvisoAgenda =
  | { tipo: 'cruce'; primera: string; segunda: string }
  | { tipo: 'traslado'; primera: string; segunda: string; minutos: number };

export function avisosAgenda(favoritas: readonly Agendable[]): AvisoAgenda[] {
  const activas = favoritas
    .filter((f) => f.estado !== 'cancelada')
    .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
  const avisos: AvisoAgenda[] = [];
  for (let i = 0; i < activas.length; i++) {
    for (let j = i + 1; j < activas.length; j++) {
      const a = activas[i]!;
      const b = activas[j]!;
      const hueco = (Date.parse(b.inicio) - Date.parse(a.fin)) / 60_000;
      if (hueco < 0) avisos.push({ tipo: 'cruce', primera: a.id, segunda: b.id });
      else if (hueco < MINUTOS_TRASLADO && a.sede.id !== b.sede.id) avisos.push({ tipo: 'traslado', primera: a.id, segunda: b.id, minutos: hueco });
    }
  }
  return avisos;
}
