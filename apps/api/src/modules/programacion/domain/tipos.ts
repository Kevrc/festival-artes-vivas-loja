/** Vocabulario del dominio de la cartelera (data-model.md). */
export type TipoAcceso = 'pagada' | 'gratuita_reserva' | 'gratuita_libre' | 'restringida';
export type EstadoFuncion = 'programada' | 'reprogramada' | 'cancelada' | 'finalizada';
export type NivelGuardado = 'disponible' | 'ultimos_lugares' | 'agotado' | 'no_aplica';
/** `desconocida` solo existe en la API: nunca se guarda (research R4). */
export type NivelDisponibilidad = NivelGuardado | 'desconocida';
