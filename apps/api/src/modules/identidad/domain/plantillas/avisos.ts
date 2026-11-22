import type { Plantilla } from '../notificaciones';
import { type Correo, componer, escaparHtml } from './plantillas';

/**
 * Plantillas de los avisos que Identidad envía por los demás módulos (US10, FR-021, research R17).
 * Texto plano y HTML accesible en español; funciones puras. Las entradas llevan su QR como imagen
 * adjunta (`cid:`), que genera el caso de uso de envío.
 */
export interface FichaFuncion {
  titulo: string;
  sedeNombre: string;
  inicio: string;
}

export interface CorreoConQr extends Correo {
  /** QR por generar y adjuntar: `cid` referenciado en el HTML y el valor a codificar. */
  qrs: { cid: string; valor: string; codigoCorto: string }[];
}

const cuando = (iso: string) =>
  new Intl.DateTimeFormat('es-EC', { dateStyle: 'full', timeStyle: 'short', hourCycle: 'h23', timeZone: 'America/Guayaquil' }).format(new Date(iso));
const dolares = (centavos: number) => `USD ${(centavos / 100).toFixed(2).replace('.', ',')}`;
const funcionTexto = (f: FichaFuncion | null | undefined) => (f ? `«${f.titulo}» (${f.sedeNombre}, ${cuando(f.inicio)})` : 'tu función');

const MOTIVOS_DEVOLUCION: Record<string, string> = {
  funcion_cancelada: 'la función fue cancelada',
  funcion_reprogramada: 'pediste la devolución tras la reprogramación',
  pago_tardio_sin_cupo: 'el pago llegó cuando ya no quedaban lugares',
  plazo_7_dias_vencido: 'venció el plazo de cambio de 7 días',
  importe_distinto: 'el importe pagado no coincidía con el pedido',
};
const RESULTADOS: Record<string, string> = {
  seleccionada: 'Tu propuesta fue seleccionada. Pronto el equipo de programación se pondrá en contacto.',
  lista_espera: 'Tu propuesta quedó en lista de espera. Te avisaremos si se libera un lugar.',
  no_seleccionada: 'Tu propuesta no fue seleccionada en esta edición. Gracias por postular.',
  no_admitida: 'Tu postulación no fue admitida porque no cumplió los requisitos de la convocatoria.',
};

type Datos = Record<string, unknown>;

export function redactar(plantilla: Plantilla, d: Datos, urlWeb: string): CorreoConQr {
  const funcion = (d.funcion ?? null) as FichaFuncion | null;
  const sinQr = (c: Correo): CorreoConQr => ({ ...c, qrs: [] });
  switch (plantilla) {
    case 'entradas_emitidas': {
      const entradas = (d.entradas ?? []) as { entradaId?: string; codigoCorto: string; tokenQr?: string }[];
      const reserva = d.tipo === 'reserva';
      const titulo = reserva ? 'Tu reserva está confirmada' : 'Tus entradas';
      const parrafos = [
        `${reserva ? 'Reservaste' : 'Compraste'} ${entradas.length === 1 ? '1 entrada' : `${entradas.length} entradas`} para ${funcionTexto(funcion)}.`,
        ...(reserva ? [] : [`Importe: ${dolares(Number(d.importeCentavos ?? 0))}.`]),
        `Presenta en la puerta el código QR de cada entrada, desde el teléfono o impreso. Códigos: ${entradas.map((e) => e.codigoCorto).join(', ')}.`,
        'También las tienes en «Mis entradas».',
      ];
      const qrs = entradas.filter((e) => e.tokenQr).map((e, i) => ({ cid: `qr-${i + 1}@fiavl`, valor: e.tokenQr!, codigoCorto: e.codigoCorto }));
      const imagenes = qrs
        .map((q) => `<p style="margin:0 0 16px"><img src="cid:${q.cid}" width="200" height="200" alt="Código QR de la entrada ${escaparHtml(q.codigoCorto)}"><br>Entrada ${escaparHtml(q.codigoCorto)}</p>`)
        .join('');
      return { ...componer(titulo, parrafos, { texto: 'Ver mis entradas', url: `${urlWeb}/mis-entradas` }, imagenes), qrs };
    }
    case 'devolucion':
      return sinQr(
        componer('Te devolvimos tu dinero', [
          `Registramos la devolución de ${dolares(Number(d.importeCentavos ?? 0))} de tu pedido para ${funcionTexto(funcion)} porque ${MOTIVOS_DEVOLUCION[String(d.motivo)] ?? 'corresponde según las condiciones de venta'}.`,
          'El reintegro puede tardar unos días en verse según tu banco. Las entradas de ese pedido ya no son válidas.',
        ]),
      );
    case 'funcion_reprogramada': {
      const nuevo = d.nuevo as { inicio: string; sedeNombre: string };
      return sinQr(
        componer('Cambió el horario de tu función', [
          `${funcion ? `«${funcion.titulo}»` : 'Tu función'} pasa a ser el ${cuando(nuevo.inicio)} en ${nuevo.sedeNombre}.`,
          `Motivo: ${String(d.motivo ?? 'cambio de programación')}.`,
          'Tus entradas siguen siendo válidas para el nuevo horario. Si no puedes asistir, puedes pedir el cambio o la devolución desde «Mis entradas».',
        ], { texto: 'Ver mis entradas', url: `${urlWeb}/mis-entradas` }),
      );
    }
    case 'funcion_cancelada':
      return sinQr(
        componer('Tu función fue cancelada', [
          `Lamentamos avisarte que ${funcionTexto(funcion)} fue cancelada.`,
          'Si pagaste, te devolveremos el importe completo sin que tengas que hacer nada; te avisaremos cuando se registre.',
        ], { texto: 'Ver la cartelera', url: `${urlWeb}/cartelera` }),
      );
    case 'acuse_postulacion':
      return sinQr(
        componer('Recibimos tu postulación', [
          `Tu postulación ${String(d.numero)} quedó registrada. Guarda este número para cualquier consulta.`,
          'Te avisaremos por correo si hace falta corregir algo y cuando se publiquen los resultados.',
        ], { texto: 'Ver mi postulación', url: `${urlWeb}/convocatorias` }),
      );
    case 'subsanacion':
      return sinQr(
        componer('Tu postulación necesita una corrección', [
          `En la postulación ${String(d.numero)} hace falta corregir lo siguiente: ${String(d.detalle)}`,
          `Tienes plazo hasta el ${cuando(String(d.venceEn))}. Pasado ese plazo la postulación no podrá continuar.`,
        ], { texto: 'Corregir mi postulación', url: `${urlWeb}/convocatorias` }),
      );
    case 'resultado':
      return sinQr(
        componer('Resultado de tu postulación', [`Postulación ${String(d.numero)}.`, RESULTADOS[String(d.resultado)] ?? 'Ya se publicó el resultado de la convocatoria.'], {
          texto: 'Ver el resultado',
          url: `${urlWeb}/convocatorias`,
        }),
      );
    case 'novedad':
      return sinQr(componer(String(d.titulo ?? 'Novedades del festival'), [String(d.texto ?? '')]));
  }
}
