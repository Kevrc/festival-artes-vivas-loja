import Link from 'next/link';
import { ETIQUETA_ACCESO, ETIQUETA_DISCIPLINA, ETIQUETA_PUBLICO, ICONO_DISCIPLINA, formatoDia, formatoDiaCorto, formatoHora, diaDeInstante } from '@/lib/cartelera/formato';
import type { FuncionResumen, NivelDisponibilidad } from '@/lib/cartelera/tipos';

const TEXTO_NIVEL: Partial<Record<NivelDisponibilidad, string>> = {
  disponible: 'Disponible',
  ultimos_lugares: 'Últimos lugares',
  agotado: 'Agotado',
  desconocida: 'Consultar disponibilidad',
};

const TEXTO_ESTADO: Record<string, string> = { cancelada: 'Cancelada', reprogramada: 'Reprogramada', finalizada: 'Finalizada' };

/** Una función en la cartelera (US1): estados con texto, no solo color (FR-013). */
export function TarjetaFuncion({
  funcion: f,
  nivel,
  mostrarDia = false,
  accion,
}: {
  funcion: FuncionResumen;
  nivel?: NivelDisponibilidad;
  mostrarDia?: boolean;
  accion?: React.ReactNode;
}) {
  const cancelada = f.estado === 'cancelada';
  const finalizada = f.estado === 'finalizada';
  const conEntrada = (f.tipoAcceso === 'pagada' || f.tipoAcceso === 'gratuita_reserva') && !cancelada && !finalizada;
  const edad = f.obra.edadMinima ?? 0;
  return (
    <article className={`tarjeta${cancelada ? ' cancelada' : ''}`} aria-labelledby={`t-${f.id}`}>
      <div className="tarjeta-hora">
        {f.continua ? (
          <span>Todo el día</span>
        ) : (
          <time dateTime={f.inicio}>
            {mostrarDia ? `${formatoDiaCorto(diaDeInstante(f.inicio))} · ` : ''}
            {formatoHora(f.inicio)}
          </time>
        )}
      </div>
      <div className="tarjeta-cuerpo">
        <h3 id={`t-${f.id}`}>
          <Link href={`/obras/${f.obra.id}`}>{f.obra.titulo}</Link>
        </h3>
        {f.estado in TEXTO_ESTADO && <p className={`estado estado-${f.estado}`}>{TEXTO_ESTADO[f.estado]}</p>}
        {f.horarioAnterior && f.estado === 'reprogramada' && (
          <p className="nota">
            Antes: {formatoDia(diaDeInstante(f.horarioAnterior.inicio))} a las {formatoHora(f.horarioAnterior.inicio)}
          </p>
        )}
        <p className="detalle">
          <span aria-hidden="true">{ICONO_DISCIPLINA[f.obra.disciplina] ?? '🎭'} </span>
          {ETIQUETA_DISCIPLINA[f.obra.disciplina]} · {f.obra.elenco.nombre} ({f.obra.elenco.pais})
        </p>
        <p className="detalle">
          <Link href={`/sedes/${f.sede.id}`}>{f.sede.nombre}</Link>
          {!f.continua && <> · hasta {formatoHora(f.fin)}</>}
          {edad > 0 && <strong className="edad"> · +{edad} años</strong>}
        </p>
        <p className="etiquetas">
          <span className={`etiqueta acceso-${f.tipoAcceso}`}>{ETIQUETA_ACCESO[f.tipoAcceso]}</span>
          {f.publico !== 'familiar' && <span className="etiqueta">{ETIQUETA_PUBLICO[f.publico]}</span>}
          {conEntrada && nivel && TEXTO_NIVEL[nivel] && (
            <span className={`etiqueta nivel-${nivel}`} data-testid="nivel">
              {TEXTO_NIVEL[nivel]}
            </span>
          )}
        </p>
        {f.tipoAcceso === 'restringida' && !cancelada && (
          <p className="nota">Solo para el público indicado; no hay entradas para el público general.</p>
        )}
      </div>
      <div className="tarjeta-acciones">
        {conEntrada && nivel !== 'agotado' && (
          <Link className="boton" href={`/entradas/${f.id}`}>
            {f.tipoAcceso === 'pagada' ? 'Obtener entrada' : 'Reservar'}
            <span className="solo-lectores"> para {f.obra.titulo}</span>
          </Link>
        )}
        {accion}
      </div>
    </article>
  );
}
