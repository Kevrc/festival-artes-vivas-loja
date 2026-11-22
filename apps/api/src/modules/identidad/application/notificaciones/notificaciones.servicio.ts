import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import QRCode from 'qrcode';
import { redactar } from '../../domain/plantillas/avisos';
import { type Plantilla, categoriaDe, claveDedup, datosTrasEnvio, errorSeguro, estadoInicial, vencida } from '../../domain/notificaciones';
import { identidadNotificacionesTotal } from '../../infrastructure/metricas-identidad';
import type { ColaNotificaciones, NotificacionGuardada, ProveedorCorreo, RelojIdentidad, RepositorioIdentidad } from '../puertos';

export interface PedidoDeAviso {
  plantilla: Plantilla;
  /** Evento que origina el aviso: da la clave de deduplicación (RN-011). */
  evento: { id: string; tipo: string; correlacionId?: string };
  cuentaId: string | null;
  /** Si no se indica, el correo de la cuenta. */
  correo?: string | null;
  datos: Record<string, unknown>;
}

/**
 * Notificaciones (US10, ADR-0011). `crear` registra la fila con su clave de deduplicación y encola
 * el envío en la misma transacción; `enviar` lo ejecuta el trabajo `identidad.enviar-notificacion`
 * con reintentos crecientes. Pasadas 24 h sin éxito queda `fallida` (US10-AS2). Un fallo del correo
 * nunca afecta al módulo que originó el evento (RNF-007): solo publicó su evento.
 */
export class NotificacionesServicio {
  private readonly log = new Logger(NotificacionesServicio.name);

  constructor(
    private readonly repo: RepositorioIdentidad,
    private readonly cola: ColaNotificaciones,
    private readonly correo: ProveedorCorreo,
    private readonly reloj: RelojIdentidad,
    private readonly urlWeb: string,
  ) {}

  /** Devuelve el id creado, o null si no hay destinatario o el aviso ya existía (evento repetido). */
  async crear(p: PedidoDeAviso): Promise<string | null> {
    const contacto = p.cuentaId ? await this.repo.contacto(p.cuentaId) : null;
    const correo = (p.correo ?? contacto?.correo)?.trim().toLowerCase();
    if (!correo) return null;
    const categoria = categoriaDe(p.plantilla);
    const estado = estadoInicial(categoria, contacto?.novedades === true);
    const id = await this.repo.crearNotificacion({
      id: randomUUID(),
      cuentaId: p.cuentaId,
      correoDestino: correo,
      plantilla: p.plantilla,
      categoria,
      eventoOrigenId: p.evento.id,
      claveDedup: claveDedup(p.evento.tipo, p.evento.id, correo),
      datos: p.datos,
      estado,
      creadaEn: this.reloj(),
    });
    if (id && estado === 'pendiente') await this.cola.encolar(id, p.evento.correlacionId);
    if (id && estado === 'omitida') identidadNotificacionesTotal.inc({ plantilla: p.plantilla, estado: 'omitida' });
    return id;
  }

  /**
   * Un intento de envío. Lanza si el correo falla y aún hay plazo, para que pg-boss reintente con
   * espera creciente; pasadas 24 h la marca `fallida` y no lanza (no hay más reintentos).
   */
  async enviar(notificacionId: string, correlacionId?: string): Promise<NotificacionGuardada['estado'] | null> {
    const n = await this.repo.notificacion(notificacionId);
    if (!n || n.estado !== 'pendiente') return n?.estado ?? null;
    const ahora = this.reloj();
    if (vencida(n.creadaEn, ahora)) {
      await this.repo.marcarFallida(n.id, n.ultimoError ?? 'Sin enviar en 24 horas');
      identidadNotificacionesTotal.inc({ plantilla: n.plantilla, estado: 'fallida' });
      this.log.warn({ correlacionId, notificacionId: n.id, plantilla: n.plantilla, intentos: n.intentos }, 'notificación fallida tras 24 h');
      return 'fallida';
    }
    const c = redactar(n.plantilla, n.datos, this.urlWeb);
    try {
      const adjuntos = await Promise.all(
        c.qrs.map(async (q) => ({ nombre: `entrada-${q.codigoCorto}.png`, cid: q.cid, tipo: 'image/png', contenido: await QRCode.toBuffer(q.valor, { errorCorrectionLevel: 'M', margin: 1, width: 400 }) })),
      );
      await this.correo.enviar({ para: n.correoDestino, asunto: c.asunto, texto: c.texto, html: c.html, ...(adjuntos.length ? { adjuntos } : {}) });
    } catch (e) {
      await this.repo.registrarFalloEnvio(n.id, errorSeguro(e));
      this.log.warn({ correlacionId, notificacionId: n.id, plantilla: n.plantilla, intento: n.intentos + 1 }, 'no se pudo enviar la notificación; se reintentará');
      throw e;
    }
    await this.repo.marcarEnviada(n.id, this.reloj(), datosTrasEnvio(n.datos));
    identidadNotificacionesTotal.inc({ plantilla: n.plantilla, estado: 'enviada' });
    this.log.log({ correlacionId, notificacionId: n.id, plantilla: n.plantilla }, 'notificación enviada');
    return 'enviada';
  }
}
