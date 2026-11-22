'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { SesionDevOperacion as SelectorSesion } from '@/components/operacion/sesion-dev-operacion';
import estilos from '@/components/operacion/operacion.module.css';
import {
  type CambioFuncion,
  ErrorApiOperacion,
  type Funcion,
  type Sede,
  type SesionDevOperacion,
  apiOperacion,
  diaFestival,
  fechaLarga,
  horaLoja,
} from '@/lib/operacion/api';

const TIPOS: Record<CambioFuncion['tipo'], string> = {
  reprogramacion: 'Reprogramación',
  cambio_sede: 'Cambio de sede',
  cancelacion: 'Cancelación',
  cambio_aforo: 'Cambio de aforo',
  edicion: 'Edición',
};
const ESTADOS: Record<Funcion['estado'], string> = {
  borrador: 'Borrador',
  programada: 'Programada',
  reprogramada: 'Reprogramada',
  cancelada: 'Cancelada',
  finalizada: 'Finalizada',
};

/** Resumen legible de un valor del historial (horario, sede o estado). */
function describir(v: Record<string, unknown>, sedes: Sede[]): string {
  const partes: string[] = [];
  if (typeof v.inicio === 'string') partes.push(`${fechaLarga(diaFestival(v.inicio))}, ${horaLoja(v.inicio)}${typeof v.fin === 'string' ? `–${horaLoja(v.fin)}` : ''}`);
  if (typeof v.sedeId === 'string') partes.push(sedes.find((s) => s.id === v.sedeId)?.nombre ?? 'otra sede');
  if (typeof v.aforoHabilitado === 'number') partes.push(`aforo ${v.aforoHabilitado}`);
  if (typeof v.estado === 'string') partes.push(v.estado);
  if (typeof v.publico === 'string') partes.push(`público ${v.publico}`);
  return partes.join(' · ') || '—';
}

/**
 * `/programacion/funciones/[id]` (US3): historial de cambios y formularios para reprogramar o
 * cancelar, siempre con motivo. El aviso de exceso de aforo (US3-AS2) es un diálogo modal accesible.
 */
export default function FuncionPage() {
  const { id } = useParams<{ id: string }>();
  const ids = useId();
  const [sesion, setSesion] = useState<SesionDevOperacion | null>(null);
  const [funcion, setFuncion] = useState<Funcion | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [historial, setHistorial] = useState<CambioFuncion[]>([]);
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [sedeId, setSedeId] = useState('');
  const [motivoR, setMotivoR] = useState('');
  const [motivoC, setMotivoC] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [exceso, setExceso] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const dialogo = useRef<HTMLDialogElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const alCambiarSesion = useCallback((s: SesionDevOperacion | null) => setSesion(s), []);

  const cargar = useCallback(async () => {
    try {
      const f = await apiOperacion.funcion(id);
      setFuncion(f);
      setFecha(diaFestival(f.inicio));
      setHora(horaLoja(f.inicio));
      setSedeId(f.sedeId);
      const [s, h] = await Promise.all([apiOperacion.sedes(f.edicionId), apiOperacion.historial(id)]);
      setSedes(s);
      setHistorial(h);
    } catch (e) {
      setError(e instanceof ErrorApiOperacion && e.status === 403 ? 'Tu rol no puede ver esta función.' : String(e));
    }
  }, [id]);

  useEffect(() => {
    if (sesion) void cargar();
  }, [sesion, cargar]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (exceso !== null) dialogo.current?.showModal();
    else dialogo.current?.close();
  }, [exceso]);

  const cambiable = funcion && (funcion.estado === 'programada' || funcion.estado === 'reprogramada');

  const reprogramar = async (confirmarExceso: boolean) => {
    if (!funcion) return;
    setError('');
    setMensaje('');
    setEnviando(true);
    try {
      const f = await apiOperacion.reprogramar(funcion.id, funcion.version, {
        inicio: `${fecha}T${hora}:00-05:00`,
        ...(sedeId !== funcion.sedeId ? { sedeId } : {}),
        motivo: motivoR,
        confirmarExceso,
      });
      setExceso(null);
      setMotivoR('');
      setMensaje(`Reprogramada: ${fechaLarga(diaFestival(f.inicio))}, ${horaLoja(f.inicio)}. La cartelera, la boletería y los asistentes reciben el cambio.`);
      await cargar();
    } catch (e) {
      if (e instanceof ErrorApiOperacion && e.codigo === 'exceso_aforo' && e.exceso) setExceso(e.exceso);
      else {
        setExceso(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setEnviando(false);
    }
  };

  const cancelar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!funcion) return;
    setError('');
    setMensaje('');
    setEnviando(true);
    try {
      await apiOperacion.cancelar(funcion.id, funcion.version, motivoC);
      setMotivoC('');
      setMensaje('Función cancelada. Boletería anula las entradas e inicia las devoluciones.');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <p>
        <Link href={funcion ? `/programacion?funcion=${funcion.id}` : '/programacion'}>← Volver a la grilla</Link>
      </p>
      <h1>{funcion ? funcion.obraTitulo : 'Función'}</h1>
      <SelectorSesion onCambio={alCambiarSesion} />

      {error && (
        <p ref={errorRef} tabIndex={-1} role="alert" className={estilos.resumen}>
          <strong>No se guardó.</strong> {error}
        </p>
      )}
      <div role="status" aria-live="polite" className={mensaje ? estilos.exito : undefined}>
        {mensaje}
      </div>

      {funcion && (
        <dl className={estilos.obra}>
          <dt>Estado</dt>
          <dd>
            <strong>{ESTADOS[funcion.estado]}</strong>
          </dd>
          <dt>Horario</dt>
          <dd>
            {fechaLarga(diaFestival(funcion.inicio))}, {horaLoja(funcion.inicio)}–{horaLoja(funcion.fin)}
          </dd>
          <dt>Sede</dt>
          <dd>{sedes.find((s) => s.id === funcion.sedeId)?.nombre ?? '—'}</dd>
          <dt>Aforo habilitado</dt>
          <dd>{funcion.aforoHabilitado ?? 'libre'}</dd>
          <dt>Entradas activas</dt>
          <dd>{funcion.entradasActivas ?? 0}</dd>
        </dl>
      )}

      {funcion && !cambiable && (
        <p className="nota">
          {funcion.estado === 'borrador'
            ? 'Es un borrador: edítalo o elimínalo desde la grilla.'
            : `Está ${ESTADOS[funcion.estado].toLowerCase()}: ya no se puede reprogramar ni cancelar.`}
        </p>
      )}

      {funcion && cambiable && (
        <>
          <form
            className={estilos.formulario}
            aria-labelledby={`${ids}-rep`}
            onSubmit={(e) => {
              e.preventDefault();
              void reprogramar(false);
            }}
          >
            <h2 id={`${ids}-rep`}>Reprogramar</h2>
            <fieldset className={estilos.campos} disabled={enviando}>
              <legend className="solo-lectores">Nuevo horario o sede</legend>
              <div className={estilos.campo}>
                <label htmlFor={`${ids}-fecha`}>Día</label>
                <input id={`${ids}-fecha`} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
              </div>
              <div className={estilos.campo}>
                <label htmlFor={`${ids}-hora`}>Hora de inicio</label>
                <input id={`${ids}-hora`} type="time" value={hora} onChange={(e) => setHora(e.target.value)} required step={300} />
              </div>
              <div className={estilos.campo}>
                <label htmlFor={`${ids}-sede`}>Sede</label>
                <select id={`${ids}-sede`} value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
                  {sedes.filter((s) => s.activa).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                      {s.aforo ? ` (aforo ${s.aforo})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className={estilos.campo} style={{ gridColumn: '1 / -1' }}>
                <label htmlFor={`${ids}-motivo-r`}>Motivo (obligatorio)</label>
                <textarea id={`${ids}-motivo-r`} value={motivoR} onChange={(e) => setMotivoR(e.target.value)} required minLength={3} maxLength={500} rows={2} aria-describedby={`${ids}-motivo-r-ayuda`} />
                <span id={`${ids}-motivo-r-ayuda`} className={estilos.ayuda}>
                  Queda en el historial y se comunica a la cartelera y a los asistentes.
                </span>
              </div>
            </fieldset>
            <div className={estilos.acciones}>
              <button type="submit" disabled={enviando}>
                Reprogramar
              </button>
            </div>
          </form>

          <form className={estilos.formulario} aria-labelledby={`${ids}-can`} onSubmit={cancelar} style={{ marginTop: 16 }}>
            <h2 id={`${ids}-can`}>Cancelar la función</h2>
            <div className={estilos.campo} style={{ gridColumn: '1 / -1' }}>
              <label htmlFor={`${ids}-motivo-c`}>Motivo de la cancelación (obligatorio)</label>
              <textarea id={`${ids}-motivo-c`} value={motivoC} onChange={(e) => setMotivoC(e.target.value)} required minLength={3} maxLength={500} rows={2} aria-describedby={`${ids}-motivo-c-ayuda`} />
              <span id={`${ids}-motivo-c-ayuda`} className={estilos.ayuda}>
                Boletería anulará las {funcion.entradasActivas ?? 0} entradas activas e iniciará las devoluciones.
              </span>
            </div>
            <div className={estilos.acciones}>
              <button type="submit" disabled={enviando}>
                Cancelar la función
              </button>
            </div>
          </form>
        </>
      )}

      <dialog ref={dialogo} aria-labelledby={`${ids}-exceso-titulo`} aria-describedby={`${ids}-exceso-texto`} onCancel={() => setExceso(null)}>
        <h2 id={`${ids}-exceso-titulo`}>Hay más entradas que lugares</h2>
        <p id={`${ids}-exceso-texto`}>
          En la nueva sede sobran <strong>{exceso}</strong> entradas activas. Si confirmas, Boletería resolverá el excedente (cambio o devolución) con los asistentes.
        </p>
        <div className={estilos.acciones}>
          <button type="button" onClick={() => void reprogramar(true)} disabled={enviando} autoFocus>
            Confirmar y reprogramar
          </button>
          <button type="button" className={estilos.secundario} onClick={() => setExceso(null)}>
            Volver sin cambiar
          </button>
        </div>
      </dialog>

      {historial.length > 0 && (
        <section aria-labelledby={`${ids}-hist`}>
          <h2 id={`${ids}-hist`}>Historial de cambios</h2>
          <ol>
            {historial.map((c) => (
              <li key={c.id}>
                <strong>{TIPOS[c.tipo]}</strong> ({new Date(c.registradoEn).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })})
                {c.motivo ? ` — motivo: ${c.motivo}` : ''}
                <br />
                Antes: {describir(c.anterior, sedes)}. Después: {describir(c.nuevo, sedes)}.
                {c.excesoConfirmado ? ` Exceso confirmado: ${c.excesoConfirmado} entradas.` : ''}
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
