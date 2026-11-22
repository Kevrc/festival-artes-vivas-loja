import type { Logger } from '@nestjs/common';
import type { Correo } from '../domain/plantillas/plantillas';
import type { ProveedorCorreo } from './puertos';

/**
 * shortcut hasta la cola de notificaciones (US10, ADR-0011): envía después de responder, no
 * bloquea ni falla la petición (RNF-007) y nunca registra el contenido (lleva enlaces de un solo uso).
 */
export function enviarSinBloquear(proveedor: ProveedorCorreo, para: string, c: Correo, log: Logger): void {
  void proveedor.enviar({ para, ...c }).catch((err: unknown) => {
    log.error({ asunto: c.asunto, error: err instanceof Error ? err.message : String(err) }, 'no se pudo enviar el correo');
  });
}
