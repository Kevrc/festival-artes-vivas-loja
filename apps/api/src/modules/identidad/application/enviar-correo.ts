import type { Logger } from '@nestjs/common';
import { errorSeguro } from '../domain/notificaciones';
import type { Correo } from '../domain/plantillas/plantillas';
import type { ProveedorCorreo } from './puertos';

/**
 * Correos de la cuenta (verificación, recuperación, bloqueo, invitación): se envían después de
 * responder, sin bloquear ni fallar la petición (RNF-007), y nunca se registra el contenido. No van
 * por la cola de notificaciones (US10) a propósito: llevan el enlace con el token de un solo uso, y
 * guardarlo en `notificacion.datos` dejaría el token en claro en la base (research R17).
 */
export function enviarSinBloquear(proveedor: ProveedorCorreo, para: string, c: Correo, log: Logger): void {
  void proveedor.enviar({ para, ...c }).catch((err: unknown) => {
    // El error del servidor SMTP puede citar la dirección: se registra sin ella (Constitución IX).
    log.error({ asunto: c.asunto, error: errorSeguro(err) }, 'no se pudo enviar el correo');
  });
}
