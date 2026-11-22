'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  type Conflicto,
  ErrorApiOperacion,
  type Funcion,
  type FuncionEntrada,
  type Obra,
  type Sede,
  apiOperacion,
  horaLoja,
} from '@/lib/operacion/api';
import estilos from './operacion.module.css';

type TipoAcceso = NonNullable<FuncionEntrada['tipoAcceso']>;
type Publico = FuncionEntrada['publico'];

const ACCESOS: { valor: TipoAcceso; nombre: string }[] = [
  { valor: 'pagada', nombre: 'Pagada' },
  { valor: 'gratuita_reserva', nombre: 'Gratuita con reserva' },
  { valor: 'gratuita_libre', nombre: 'Gratuita de acceso libre' },
  { valor: 'restringida', nombre: 'Restringida' },
];
const PUBLICOS: { valor: Publico; nombre: string }[] = [
  { valor: 'familiar', nombre: 'Familiar' },
  { valor: 'adultos', nombre: 'Adultos' },
  { valor: 'estudiantes', nombre: 'Solo estudiantes' },
];

interface Props {
  edicionId: string;
  fecha: string;
  sedes: Sede[];
  obras: Obra[];
  /** Función en edición (solo borradores se editan aquí; las publicadas se cambian en US3). */
  funcion: Funcion | null;
  /** Con la edición publicada, un borrador se puede publicar solo (US2-AS3). */
  edicionPublicada: boolean;
  onGuardada: (f: Funcion) => void;
  onEliminada: () => void;
  onConflictos: (ids: string[]) => void;
  onCancelar: () => void;
}

/** Instante ISO de una fecha y hora de Loja (UTC−5). */
const instante = (fecha: string, hora: string) => `${fecha}T${hora}:00-05:00`;

/**
 * Crear o editar una función en borrador (US1). La hora de fin la calcula el servidor con la
 * duración de la obra (RN-002). Si hay cruces, el resumen enfocable dice con qué función choca y
 * desde qué hora queda libre la sede (US1-AS2).
 */
export function FormularioFuncion({ edicionId, fecha, sedes, obras, funcion, edicionPublicada, onGuardada, onEliminada, onConflictos, onCancelar }: Props) {
  const id = useId();
  const resumenRef = useRef<HTMLDivElement>(null);
  const [obraId, setObraId] = useState('');
  const [sedeId, setSedeId] = useState('');
  const [hora, setHora] = useState('20:00');
  const [tipoAcceso, setTipoAcceso] = useState<TipoAcceso | ''>('pagada');
  const [publico, setPublico] = useState<Publico>('familiar');
  const [aforo, setAforo] = useState('');
  const [error, setError] = useState<{ mensaje: string; conflictos: Conflicto[] } | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  /** El cambio de `funcion` viene de guardar o eliminar aquí: se conserva el mensaje de confirmación. */
  const conservarMensaje = useRef(false);

  const editable = !funcion || funcion.estado === 'borrador';

  useEffect(() => {
    setError(null);
    if (!conservarMensaje.current) setMensaje('');
    conservarMensaje.current = false;
    if (funcion) {
      setObraId(funcion.obraId);
      setSedeId(funcion.sedeId);
      setHora(horaLoja(funcion.inicio));
      setTipoAcceso(funcion.tipoAcceso ?? '');
      setPublico(funcion.publico);
      setAforo(funcion.aforoHabilitado ? String(funcion.aforoHabilitado) : '');
    } else {
      setObraId('');
      setSedeId('');
      setAforo('');
    }
  }, [funcion]);

  useEffect(() => {
    if (error) resumenRef.current?.focus();
  }, [error]);

  const sede = sedes.find((s) => s.id === sedeId);
  const obra = obras.find((o) => o.id === obraId);

  const mostrarError = (e: unknown) => {
    if (e instanceof ErrorApiOperacion) {
      setError({ mensaje: e.message, conflictos: e.conflictos });
      onConflictos(e.conflictos.map((c) => c.funcionId));
    } else setError({ mensaje: 'No se pudo conectar con el servidor. Intenta de nuevo.', conflictos: [] });
  };

  const guardar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    setMensaje('');
    onConflictos([]);
    if (!obraId || !sedeId) {
      setError({ mensaje: 'Elige la obra y la sede.', conflictos: [] });
      return;
    }
    const aforoHabilitado = aforo ? Number(aforo) : null;
    setEnviando(true);
    try {
      const datos = { obraId, sedeId, inicio: instante(fecha, hora), tipoAcceso: tipoAcceso || null, publico, aforoHabilitado };
      const guardada = funcion
        ? await apiOperacion.editarFuncion(funcion.id, funcion.version, datos)
        : await apiOperacion.crearFuncion(edicionId, { ...datos, continua: false });
      setMensaje(`Guardada en borrador: ${guardada.obraTitulo}, ${horaLoja(guardada.inicio)}–${horaLoja(guardada.fin)}.`);
      conservarMensaje.current = true;
      onGuardada(guardada);
    } catch (e) {
      mostrarError(e);
    } finally {
      setEnviando(false);
    }
  };

  const publicarSola = async () => {
    if (!funcion) return;
    setError(null);
    setEnviando(true);
    try {
      const publicada = await apiOperacion.publicarFuncion(funcion.id, funcion.version);
      setMensaje(`Publicada: ${publicada.obraTitulo}, ${horaLoja(publicada.inicio)}. Llega a la cartelera en menos de un minuto.`);
      conservarMensaje.current = true;
      onGuardada(publicada);
    } catch (e) {
      if (e instanceof ErrorApiOperacion && e.errores.length > 0) {
        setError({ mensaje: e.errores.map((x) => x.mensaje).join(' '), conflictos: [] });
      } else mostrarError(e);
    } finally {
      setEnviando(false);
    }
  };

  const eliminar = async () => {
    if (!funcion) return;
    setEnviando(true);
    try {
      await apiOperacion.eliminarFuncion(funcion.id, funcion.version);
      setMensaje('Borrador eliminado.');
      conservarMensaje.current = true;
      onEliminada();
    } catch (e) {
      mostrarError(e);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form className={estilos.formulario} onSubmit={guardar} aria-labelledby={`${id}-titulo`} noValidate>
      <h2 id={`${id}-titulo`}>{funcion ? `Editar: ${funcion.obraTitulo}` : 'Nueva función'}</h2>

      <div role="status" aria-live="polite" className={mensaje ? estilos.exito : undefined}>
        {mensaje}
      </div>

      {error && (
        <div ref={resumenRef} tabIndex={-1} role="alert" className={estilos.resumen} id={`${id}-error`}>
          <strong>No se guardó.</strong> {error.mensaje}
          {error.conflictos.length > 0 && (
            <ul>
              {error.conflictos.map((c) => (
                <li key={`${c.tipo}-${c.funcionId}`}>
                  <span className={estilos.marcaConflicto}>⚠ {c.tipo === 'sede' ? 'Cruce de sede' : 'Cruce de elenco'}:</span>{' '}
                  <a href={`#funcion-${c.funcionId}`}>{c.obraTitulo}</a>, {horaLoja(c.inicio)}–{horaLoja(c.fin)}
                  {c.sedeNombre ? ` en ${c.sedeNombre}` : ''}.
                  {c.libreDesde && c.tipo === 'sede' && (
                    <>
                      {' '}
                      <button type="button" className={estilos.secundario} onClick={() => setHora(horaLoja(c.libreDesde!))}>
                        Usar {horaLoja(c.libreDesde)}
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!editable && (
        <p className={`nota ${estilos.resumen}`}>
          Esta función ya está {funcion?.estado}: el horario y la sede se cambian con reprogramación o cancelación, siempre con motivo.
        </p>
      )}

      <fieldset disabled={!editable || enviando} className={estilos.campos}>
        <legend className="solo-lectores">Datos de la función</legend>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-obra`}>Obra</label>
          <select id={`${id}-obra`} value={obraId} onChange={(e) => setObraId(e.target.value)} required aria-describedby={`${id}-obra-ayuda`}>
            <option value="">Elige una obra</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.titulo} · {o.elenco.nombre} ({o.duracionMin} min)
              </option>
            ))}
          </select>
          <span id={`${id}-obra-ayuda`} className={estilos.ayuda}>
            {obra ? `Termina ${obra.duracionMin} min después del inicio.` : 'La hora de fin se calcula con la duración de la obra.'}
          </span>
        </div>

        <div className={estilos.campo}>
          <label htmlFor={`${id}-sede`}>Sede</label>
          <select id={`${id}-sede`} value={sedeId} onChange={(e) => setSedeId(e.target.value)} required aria-describedby={`${id}-sede-ayuda`}>
            <option value="">Elige una sede</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
          <span id={`${id}-sede-ayuda`} className={estilos.ayuda}>
            {sede ? `Aforo ${sede.aforo ?? 'libre'} · ${sede.montajeMin} min de montaje entre funciones` : ' '}
          </span>
        </div>

        <div className={estilos.campo}>
          <label htmlFor={`${id}-hora`}>Hora de inicio</label>
          <input id={`${id}-hora`} type="time" value={hora} onChange={(e) => setHora(e.target.value)} required step={300} />
        </div>

        <div className={estilos.campo}>
          <label htmlFor={`${id}-acceso`}>Tipo de acceso</label>
          <select id={`${id}-acceso`} value={tipoAcceso} onChange={(e) => setTipoAcceso(e.target.value as TipoAcceso | '')} aria-describedby={`${id}-acceso-ayuda`}>
            <option value="">Sin definir (obligatorio para publicar)</option>
            {ACCESOS.map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.nombre}
              </option>
            ))}
          </select>
          <span id={`${id}-acceso-ayuda`} className={estilos.ayuda}>
            Puedes dejarlo sin definir en el borrador.
          </span>
        </div>

        <div className={estilos.campo}>
          <label htmlFor={`${id}-publico`}>Público</label>
          <select id={`${id}-publico`} value={publico} onChange={(e) => setPublico(e.target.value as Publico)}>
            {PUBLICOS.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className={estilos.campo}>
          <label htmlFor={`${id}-aforo`}>Aforo habilitado</label>
          <input
            id={`${id}-aforo`}
            type="number"
            inputMode="numeric"
            min={1}
            max={sede?.aforo ?? undefined}
            value={aforo}
            onChange={(e) => setAforo(e.target.value)}
            aria-describedby={`${id}-aforo-ayuda`}
          />
          <span id={`${id}-aforo-ayuda`} className={estilos.ayuda}>
            {sede?.aforo ? `Máximo ${sede.aforo}, el aforo de la sede.` : 'Vacío si es de acceso libre sin aforo.'}
          </span>
        </div>

      </fieldset>

      <div className={estilos.acciones}>
        <button type="submit" disabled={!editable || enviando}>
          {funcion ? 'Guardar cambios' : 'Crear en borrador'}
        </button>
        {funcion && funcion.estado === 'borrador' && edicionPublicada && (
          <button type="button" onClick={publicarSola} disabled={enviando}>
            Publicar esta función
          </button>
        )}
        {funcion && funcion.estado === 'borrador' && (
          <button type="button" className={estilos.secundario} onClick={eliminar} disabled={enviando}>
            Eliminar borrador
          </button>
        )}
        {funcion && (
          <button type="button" className={estilos.secundario} onClick={onCancelar}>
            Nueva función
          </button>
        )}
      </div>
    </form>
  );
}
