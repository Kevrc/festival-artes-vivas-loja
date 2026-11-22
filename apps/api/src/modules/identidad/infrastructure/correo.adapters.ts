import { Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import type { CorreoSaliente, ProveedorCorreo } from '../application/puertos';

/**
 * Proveedor de correo (ADR-0011). SMTP con nodemailer (Mailpit en desarrollo, un proveedor SMTP en
 * producción) cuando hay `SMTP_URL`; si no, en memoria (pruebas y CI). El contenido nunca se
 * registra en logs: puede llevar enlaces de un solo uso.
 */
export class CorreoSmtp implements ProveedorCorreo {
  private readonly transporte;
  constructor(
    url: string,
    private readonly remitente: string,
  ) {
    this.transporte = nodemailer.createTransport(url);
  }

  async enviar(c: CorreoSaliente): Promise<void> {
    await this.transporte.sendMail({
      from: this.remitente,
      to: c.para,
      subject: c.asunto,
      text: c.texto,
      html: c.html,
      attachments: c.adjuntos?.map((a) => ({ filename: a.nombre, cid: a.cid, content: a.contenido, contentType: a.tipo })),
    });
  }
}

export class CorreoMemoria implements ProveedorCorreo {
  readonly enviados: CorreoSaliente[] = [];
  /** Para simular una caída del servidor de correo en pruebas (RNF-007). */
  falla = false;

  async enviar(c: CorreoSaliente): Promise<void> {
    if (this.falla) throw new Error('Servidor de correo no disponible (simulado)');
    this.enviados.push(c);
    if (this.enviados.length > 200) this.enviados.shift();
  }
}

export function correoDelEntorno(entorno = process.env): ProveedorCorreo {
  if (entorno.SMTP_URL && entorno.NODE_ENV !== 'test') {
    return new CorreoSmtp(entorno.SMTP_URL, entorno.CORREO_REMITENTE ?? 'FIAVL <no-responder@fiavl.ec>');
  }
  if (entorno.NODE_ENV === 'production') {
    new Logger('Correo').error('SMTP_URL no está configurado: los correos no se entregarán');
  }
  return new CorreoMemoria();
}
