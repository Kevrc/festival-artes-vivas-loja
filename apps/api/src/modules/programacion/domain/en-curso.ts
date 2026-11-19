/** RN-003: en curso desde la hora de inicio hasta la de fin. */
export const enCurso = (f: { inicio: Date; fin: Date }, ahora: Date) => f.inicio <= ahora && ahora <= f.fin;

/** FR-007: lo que está en curso o empieza en los próximos 60 minutos. */
export const VENTANA_AHORA_MS = 60 * 60_000;
export const ventanaAhora = (ahora: Date) => ({ desde: ahora, hasta: new Date(ahora.getTime() + VENTANA_AHORA_MS) });
