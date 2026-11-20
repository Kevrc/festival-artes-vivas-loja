export const PLAZO_SUBSANACION_HORAS = 72;

export type DecisionAdmisibilidad = 'admitir' | 'subsanar' | 'no_admitir';

export function calcularVencimientoSubsanacion(ahora: Date, horas = PLAZO_SUBSANACION_HORAS): Date {
  return new Date(ahora.getTime() + horas * 3_600_000);
}

export function puedeSubsanar(ahora: Date, venceEn: Date): boolean {
  return ahora.getTime() <= venceEn.getTime();
}

export function validarDecisionAdmisibilidad(input: {
  decision: DecisionAdmisibilidad;
  motivo?: string | null;
  detalle?: string | null;
}): void {
  if (input.decision === 'no_admitir' && !input.motivo?.trim()) {
    throw new Error('El motivo es obligatorio para no admitir');
  }
  if (input.decision === 'subsanar' && !input.detalle?.trim()) {
    throw new Error('El detalle es obligatorio para solicitar subsanación');
  }
}

export function esCaminoALoja(componente: string): boolean {
  const normalizado = componente.trim().toLocaleLowerCase('es');
  return normalizado === 'camino a loja' || normalizado === 'camino_a_loja' || normalizado === 'camino-a-loja';
}
