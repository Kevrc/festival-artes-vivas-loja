import {
  EntradasEmitidas,
  FuncionActualizada,
  FuncionCancelada,
  FuncionProgramada,
  FuncionReprogramada,
  PedidoReembolsado,
  PostulacionEnviada,
  ResultadoPublicado,
  SubsanacionSolicitada,
} from '@fiavl/contracts';
import type { z } from 'zod';
import type { NotificacionesServicio } from '../notificaciones/notificaciones.servicio';
import type { FuncionAviso, ManejadorEvento, RepositorioIdentidad } from '../puertos';
import type { ProcesarUnaVez } from './programacion-publicada';

/**
 * Consumidores que convierten eventos de Boletería (002), Operación y Convocatorias (003) en avisos
 * (US10, T098–T099). Cada evento se procesa una vez (`evento_procesado`) y la fila de la
 * notificación se crea en la misma transacción que la proyección.
 */
type Dependencias = { repo: RepositorioIdentidad; avisos: NotificacionesServicio; unaVez: ProcesarUnaVez };

const ficha = (f: FuncionAviso | null) => (f ? { titulo: f.titulo, sedeNombre: f.sedeNombre, inicio: f.inicio.toISOString() } : null);

abstract class Base<E extends { id: string; tipo: string; correlacionId: string }> implements ManejadorEvento<E> {
  abstract readonly tipo: string;
  abstract readonly esquema: z.ZodType<E>;
  constructor(protected readonly d: Dependencias) {}
  manejar(e: E): Promise<void> {
    return this.d.unaVez(e, () => this.aplicar(e)).then(() => undefined);
  }
  protected abstract aplicar(e: E): Promise<void>;

  /** Un aviso por persona destinataria de la función (varios pedidos de la misma persona ⇒ uno). */
  protected async avisarDestinatarios(e: E, funcionId: string, plantilla: 'funcion_reprogramada' | 'funcion_cancelada', datos: Record<string, unknown>) {
    for (const dest of await this.d.repo.destinatariosActivos(funcionId)) {
      await this.d.avisos.crear({ plantilla, evento: e, cuentaId: dest.cuentaId, correo: dest.correo, datos });
    }
  }
}

type EvEntradas = z.infer<typeof EntradasEmitidas>;
export class AlRecibirEntradasEmitidas extends Base<EvEntradas> {
  readonly tipo = 'EntradasEmitidas';
  readonly esquema = EntradasEmitidas;
  protected async aplicar(e: EvEntradas) {
    const x = e.datos;
    const correo = x.correoDestino ?? null;
    await this.d.repo.guardarDestinatario({ pedidoId: x.pedidoId, funcionId: x.funcionId, cuentaId: x.cuentaId ?? null, correo });
    await this.d.avisos.crear({
      plantilla: 'entradas_emitidas',
      evento: e,
      cuentaId: x.cuentaId ?? null,
      correo,
      datos: {
        pedidoId: x.pedidoId,
        funcionId: x.funcionId,
        funcion: ficha(await this.d.repo.funcionAviso(x.funcionId)),
        tipo: x.tipo,
        cantidad: x.cantidad,
        importeCentavos: x.importeCentavos,
        entradas: x.entradas.map((en) => ({ entradaId: en.entradaId, codigoCorto: en.codigoCorto, tokenQr: en.tokenQr })),
      },
    });
  }
}

type EvReembolso = z.infer<typeof PedidoReembolsado>;
export class AlRecibirPedidoReembolsado extends Base<EvReembolso> {
  readonly tipo = 'PedidoReembolsado';
  readonly esquema = PedidoReembolsado;
  protected async aplicar(e: EvReembolso) {
    const x = e.datos;
    await this.d.repo.desactivarDestinatario(x.pedidoId);
    await this.d.avisos.crear({
      plantilla: 'devolucion',
      evento: e,
      cuentaId: x.cuentaId ?? null,
      correo: x.correoDestino ?? null,
      datos: { pedidoId: x.pedidoId, funcion: ficha(await this.d.repo.funcionAviso(x.funcionId)), importeCentavos: x.importeCentavos, motivo: x.motivo },
    });
  }
}

type EvFuncion = z.infer<typeof FuncionProgramada> | z.infer<typeof FuncionActualizada>;
class AlRecibirFichaFuncion extends Base<EvFuncion> {
  readonly tipo: string = 'FuncionProgramada';
  readonly esquema: z.ZodType<EvFuncion> = FuncionProgramada as z.ZodType<EvFuncion>;
  protected async aplicar(e: EvFuncion) {
    const { funcion, obra, sede } = e.datos;
    await this.d.repo.guardarFuncionAviso({
      funcionId: funcion.id,
      titulo: obra.titulo,
      sedeNombre: sede.nombre,
      inicio: new Date(funcion.inicio),
      fin: new Date(funcion.fin),
      estado: 'programada',
      version: funcion.version,
    });
  }
}
export class AlRecibirFuncionProgramada extends AlRecibirFichaFuncion {}
export class AlRecibirFuncionActualizada extends AlRecibirFichaFuncion {
  override readonly tipo = 'FuncionActualizada';
  override readonly esquema = FuncionActualizada as z.ZodType<EvFuncion>;
}

type EvReprogramada = z.infer<typeof FuncionReprogramada>;
export class AlRecibirFuncionReprogramada extends Base<EvReprogramada> {
  readonly tipo = 'FuncionReprogramada';
  readonly esquema = FuncionReprogramada;
  protected async aplicar(e: EvReprogramada) {
    const x = e.datos;
    const previa = await this.d.repo.funcionAviso(x.funcionId);
    const sedeNombre = x.sede?.nombre ?? previa?.sedeNombre ?? '';
    if (previa) {
      await this.d.repo.guardarFuncionAviso({ ...previa, sedeNombre, inicio: new Date(x.nuevo.inicio), fin: new Date(x.nuevo.fin), estado: 'reprogramada', version: x.version });
    }
    await this.avisarDestinatarios(e, x.funcionId, 'funcion_reprogramada', {
      funcion: ficha(previa),
      anterior: { inicio: x.anterior.inicio },
      nuevo: { inicio: x.nuevo.inicio, sedeNombre: sedeNombre || 'la sede anunciada' },
      motivo: x.motivo,
    });
  }
}

type EvCancelada = z.infer<typeof FuncionCancelada>;
export class AlRecibirFuncionCancelada extends Base<EvCancelada> {
  readonly tipo = 'FuncionCancelada';
  readonly esquema = FuncionCancelada;
  protected async aplicar(e: EvCancelada) {
    const previa = await this.d.repo.funcionAviso(e.datos.funcionId);
    if (previa) await this.d.repo.guardarFuncionAviso({ ...previa, estado: 'cancelada', version: e.datos.version });
    await this.avisarDestinatarios(e, e.datos.funcionId, 'funcion_cancelada', { funcion: ficha(previa) });
  }
}

type EvPostulacion = z.infer<typeof PostulacionEnviada>;
export class AlRecibirPostulacionEnviada extends Base<EvPostulacion> {
  readonly tipo = 'PostulacionEnviada';
  readonly esquema = PostulacionEnviada;
  protected async aplicar(e: EvPostulacion) {
    const x = e.datos;
    // Un reenvío tras subsanar vuelve a `enviada` y genera un acuse nuevo (otro evento, otra clave).
    await this.d.repo.guardarPostulacion(x.postulacionId, x.cuentaPostulanteId, 'enviada');
    await this.d.avisos.crear({ plantilla: 'acuse_postulacion', evento: e, cuentaId: x.cuentaPostulanteId, datos: { postulacionId: x.postulacionId, numero: x.numero } });
  }
}

type EvSubsanacion = z.infer<typeof SubsanacionSolicitada>;
export class AlRecibirSubsanacionSolicitada extends Base<EvSubsanacion> {
  readonly tipo = 'SubsanacionSolicitada';
  readonly esquema = SubsanacionSolicitada;
  protected async aplicar(e: EvSubsanacion) {
    const x = e.datos;
    await this.d.repo.guardarPostulacion(x.postulacionId, x.cuentaPostulanteId, 'subsanacion');
    await this.d.avisos.crear({ plantilla: 'subsanacion', evento: e, cuentaId: x.cuentaPostulanteId, datos: { postulacionId: x.postulacionId, numero: x.numero, detalle: x.detalle, venceEn: x.venceEn } });
  }
}

type EvResultado = z.infer<typeof ResultadoPublicado>;
/** Contrato provisional (convocatorias-pendientes.ts) hasta que 003 lo publique. */
export class AlRecibirResultadoPublicado extends Base<EvResultado> {
  readonly tipo = 'ResultadoPublicado';
  readonly esquema = ResultadoPublicado;
  protected async aplicar(e: EvResultado) {
    const x = e.datos;
    await this.d.repo.guardarPostulacion(x.postulacionId, x.cuentaPostulanteId, 'cerrada');
    await this.d.avisos.crear({ plantilla: 'resultado', evento: e, cuentaId: x.cuentaPostulanteId, datos: { postulacionId: x.postulacionId, numero: x.numero, resultado: x.resultado } });
  }
}

export const crearManejadoresAvisos = (d: Dependencias): ManejadorEvento[] =>
  [
    new AlRecibirEntradasEmitidas(d),
    new AlRecibirPedidoReembolsado(d),
    new AlRecibirFuncionProgramada(d),
    new AlRecibirFuncionActualizada(d),
    new AlRecibirFuncionReprogramada(d),
    new AlRecibirFuncionCancelada(d),
    new AlRecibirPostulacionEnviada(d),
    new AlRecibirSubsanacionSolicitada(d),
    new AlRecibirResultadoPublicado(d),
  ] as unknown as ManejadorEvento[];
