export type EstadoPostulacion =
  | 'borrador' | 'enviada' | 'requiere_subsanacion' | 'no_admitida' | 'admitida'
  | 'en_evaluacion' | 'evaluada' | 'requiere_deliberacion' | 'seleccionada'
  | 'lista_espera' | 'no_seleccionada' | 'desistida';
export type EstadoAsignacion = 'asignada' | 'en_evaluacion' | 'completada' | 'reasignada';
export type EstadoEvaluacion = 'borrador' | 'enviada' | 'reabierta';

export function transicionarPostulacion(
  estado: EstadoPostulacion,
  evento: 'enviar' | 'retirar' | 'pedir_subsanacion' | 'subsanar' | 'vencer_subsanacion' | 'admitir' | 'no_admitir' | 'iniciar_evaluacion' | 'evaluar' | 'deliberar' | 'desistir',
  contexto?: { ahora: Date; cierraEn?: Date; venceEn?: Date },
): EstadoPostulacion {
  const tabla: Partial<Record<EstadoPostulacion, Partial<Record<typeof evento, EstadoPostulacion>>>> = {
    borrador: { enviar: 'enviada', desistir: 'desistida' },
    enviada: { retirar: 'borrador', pedir_subsanacion: 'requiere_subsanacion', admitir: 'admitida', no_admitir: 'no_admitida', desistir: 'desistida' },
    requiere_subsanacion: { subsanar: 'enviada', vencer_subsanacion: 'no_admitida' },
    admitida: { iniciar_evaluacion: 'en_evaluacion' },
    en_evaluacion: { evaluar: 'evaluada' },
    evaluada: { deliberar: 'requiere_deliberacion' },
    requiere_deliberacion: { deliberar: 'evaluada' },
  };
  const siguiente = tabla[estado]?.[evento];
  if (!siguiente) throw new Error(`Transición no permitida: ${estado}/${evento}`);
  if (estado === 'enviada' && evento === 'retirar' && (!contexto?.cierraEn || contexto.ahora >= contexto.cierraEn)) {
    throw new Error('Solo se puede retirar antes del cierre');
  }
  if (estado === 'requiere_subsanacion' && evento === 'subsanar' && contexto?.venceEn && contexto.ahora > contexto.venceEn) {
    throw new Error('Plazo de subsanación vencido');
  }
  if (estado === 'requiere_subsanacion' && evento === 'vencer_subsanacion' && contexto?.venceEn && contexto.ahora < contexto.venceEn) {
    throw new Error('La subsanación aún no vence');
  }
  return siguiente;
}

export function transicionarAsignacion(estado: EstadoAsignacion, evento: 'iniciar' | 'completar' | 'reasignar'): EstadoAsignacion {
  const tabla: Record<EstadoAsignacion, Partial<Record<typeof evento, EstadoAsignacion>>> = {
    asignada: { iniciar: 'en_evaluacion', reasignar: 'reasignada' },
    en_evaluacion: { completar: 'completada', reasignar: 'reasignada' },
    completada: {}, reasignada: {},
  };
  const siguiente = tabla[estado][evento];
  if (!siguiente) throw new Error(`Transición de asignación no permitida: ${estado}/${evento}`);
  return siguiente;
}

export function transicionarEvaluacion(estado: EstadoEvaluacion, evento: 'enviar' | 'reabrir'): EstadoEvaluacion {
  const tabla: Record<EstadoEvaluacion, Partial<Record<typeof evento, EstadoEvaluacion>>> = {
    borrador: { enviar: 'enviada' }, enviada: { reabrir: 'reabierta' }, reabierta: { enviar: 'enviada' },
  };
  const siguiente = tabla[estado][evento];
  if (!siguiente) throw new Error(`Transición de evaluación no permitida: ${estado}/${evento}`);
  return siguiente;
}
