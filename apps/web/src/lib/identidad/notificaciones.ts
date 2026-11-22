import type { Notificacion } from './api';

/** Textos para personas del estado de un aviso (US10-AS5). */
export const ESTADO_AVISO: Record<Notificacion['estado'], string> = {
  pendiente: 'En camino',
  enviada: 'Enviado',
  fallida: 'No se pudo enviar',
  omitida: 'No enviado (desactivaste las novedades)',
};

export const fechaAviso = (iso: string) =>
  new Date(iso).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Guayaquil' });
