'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import estilos from '@/components/operacion/operacion.module.css';
import { type Edicion, ErrorApiOperacion, type Sede, type SedeEntrada, apiOperacion } from '@/lib/operacion/api';
import { leerRecorrido } from '@/lib/operacion/formato';

const TIPOS: { valor: SedeEntrada['tipo']; nombre: string }[] = [
  { valor: 'teatro', nombre: 'Teatro' },
  { valor: 'centro_cultural', nombre: 'Centro cultural' },
  { valor: 'museo', nombre: 'Museo' },
  { valor: 'espacio_publico', nombre: 'Espacio público' },
  { valor: 'recorrido', nombre: 'Recorrido' },
];
const nombreTipo = (t: string) => TIPOS.find((x) => x.valor === t)?.nombre ?? t;
const mensaje = (e: unknown) =>
  e instanceof ErrorApiOperacion && e.status === 401 ? 'Necesitas ingresar con una cuenta de administración.' : e instanceof ErrorApiOperacion && e.status === 403 ? 'Tu cuenta no tiene el rol de administración.' : e instanceof Error ? e.message : String(e);

/** La sede de la API como entrada editable. */
const aEntrada = (s: Sede): SedeEntrada => ({
  nombre: s.nombre, tipo: s.tipo, direccion: s.direccion ?? '', lat: s.lat ?? 0, lng: s.lng ?? 0,
  recorrido: (s.recorrido as SedeEntrada['recorrido']) ?? null, aforo: s.aforo ?? null,
  accesibilidad: { sillaRuedas: !!s.accesibilidad?.sillaRuedas, banoAccesible: !!s.accesibilidad?.banoAccesible, rampa: !!s.accesibilidad?.rampa },
  montajeMin: s.montajeMin ?? 30, horarioTaquilla: s.horarioTaquilla ?? null, activa: s.activa !== false,
});

/** `/admin/sedes` (US6): sedes de cada edición con su aforo, accesibilidad y montaje. */
export default function SedesPage() {
  const id = useId();
  const [ediciones, setEdiciones] = useState<Edicion[]>([]);
  const [edicionId, setEdicionId] = useState('');
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');
  // Formulario de sede nueva
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<SedeEntrada['tipo']>('teatro');
  const [direccion, setDireccion] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [aforo, setAforo] = useState('');
  const [recorrido, setRecorrido] = useState('');
  const [acc, setAcc] = useState({ sillaRuedas: false, banoAccesible: false, rampa: false });
  const [montaje, setMontaje] = useState('30');
  const [horario, setHorario] = useState('');

  useEffect(() => {
    apiOperacion
      .ediciones()
      .then((e) => {
        const orden = [...e].sort((a, b) => b.anio - a.anio);
        setEdiciones(orden);
        setEdicionId(orden[0]?.id ?? '');
      })
      .catch((e) => setError(mensaje(e)));
  }, []);

  const cargar = useCallback(async () => {
    if (!edicionId) return;
    try {
      setSedes(await apiOperacion.sedes(edicionId));
    } catch (e) {
      setError(mensaje(e));
    }
  }, [edicionId]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const hacer = async (accion: () => Promise<unknown>, texto: string) => {
    setError('');
    setOk('');
    try {
      await accion();
      setOk(texto);
      await cargar();
      return true;
    } catch (e) {
      setError(mensaje(e));
      return false;
    }
  };
  const cerrada = ediciones.find((e) => e.id === edicionId)?.estado === 'cerrada';

  return (
    <>
      <h1>Sedes</h1>
      <div className={estilos.campo} style={{ maxWidth: 320 }}>
        <label htmlFor={`${id}-edicion`}>Edición</label>
        <select id={`${id}-edicion`} value={edicionId} onChange={(e) => setEdicionId(e.target.value)}>
          {ediciones.map((e) => (
            <option key={e.id} value={e.id}>{e.anio} · {e.numero}</option>
          ))}
        </select>
      </div>
      <div role="status" aria-live="polite" className={ok ? estilos.exito : undefined}>
        {ok}
      </div>
      {error && (
        <p role="alert" className={estilos.resumen}>
          {error}
        </p>
      )}
      {cerrada && <p className="nota">Esta edición está cerrada: sus sedes son de solo lectura.</p>}

      <ul className={estilos.obras}>
        {sedes.map((s) => (
          <li key={s.id} className={estilos.obra}>
            <h2>{s.nombre}</h2>
            <p className={estilos.ayuda}>
              {nombreTipo(s.tipo)} · {s.aforo ? `aforo ${s.aforo}` : 'sin aforo fijo'} · montaje {s.montajeMin ?? 30} min · {s.activa ? 'Activa' : 'Desactivada'}
            </p>
            <p className={estilos.ayuda}>
              Accesibilidad: {[s.accesibilidad?.sillaRuedas && 'silla de ruedas', s.accesibilidad?.banoAccesible && 'baño accesible', s.accesibilidad?.rampa && 'rampa'].filter(Boolean).join(', ') || 'sin adaptaciones registradas'}
            </p>
            {!cerrada && (
              <div className={estilos.acciones}>
                <button
                  type="button"
                  className={estilos.secundario}
                  onClick={() => hacer(() => apiOperacion.actualizarSede(s.id, s.version, { ...aEntrada(s), activa: !s.activa }), s.activa ? `${s.nombre} desactivada.` : `${s.nombre} activada.`)}
                >
                  {s.activa ? 'Desactivar' : 'Activar'}<span className="solo-lectores"> {s.nombre}</span>
                </button>
                <button type="button" className={estilos.secundario} onClick={() => hacer(() => apiOperacion.eliminarSede(s.id), `${s.nombre} eliminada.`)}>
                  Eliminar<span className="solo-lectores"> {s.nombre}</span>
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {!cerrada && edicionId && (
        <form
          className={estilos.formulario}
          aria-label="Crear una sede"
          onSubmit={async (e) => {
            e.preventDefault();
            const creada = await hacer(
              () =>
                apiOperacion.crearSede(edicionId, {
                  nombre, tipo, direccion, lat: Number(lat), lng: Number(lng),
                  recorrido: tipo === 'recorrido' ? leerRecorrido(recorrido) : null,
                  aforo: aforo ? Number(aforo) : null, accesibilidad: acc, montajeMin: Number(montaje || 0), horarioTaquilla: horario.trim() || null, activa: true,
                }),
              `Sede ${nombre} creada.`,
            );
            if (creada) {
              setNombre('');
              setDireccion('');
              setAforo('');
              setRecorrido('');
            }
          }}
        >
          <h2>Crear una sede</h2>
          <div className={estilos.campo}>
            <label htmlFor={`${id}-nombre`}>Nombre</label>
            <input id={`${id}-nombre`} value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={2} maxLength={120} />
          </div>
          <div className={estilos.campo}>
            <label htmlFor={`${id}-tipo`}>Tipo</label>
            <select id={`${id}-tipo`} value={tipo} onChange={(e) => setTipo(e.target.value as SedeEntrada['tipo'])}>
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>{t.nombre}</option>
              ))}
            </select>
          </div>
          <div className={estilos.campo}>
            <label htmlFor={`${id}-direccion`}>Dirección</label>
            <input id={`${id}-direccion`} value={direccion} onChange={(e) => setDireccion(e.target.value)} required minLength={3} maxLength={200} />
          </div>
          <div className={estilos.campo}>
            <label htmlFor={`${id}-lat`}>Latitud</label>
            <input id={`${id}-lat`} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} required />
          </div>
          <div className={estilos.campo}>
            <label htmlFor={`${id}-lng`}>Longitud</label>
            <input id={`${id}-lng`} inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} required />
          </div>
          <div className={estilos.campo}>
            <label htmlFor={`${id}-aforo`}>Aforo{tipo === 'espacio_publico' || tipo === 'recorrido' ? ' (opcional)' : ''}</label>
            <input id={`${id}-aforo`} inputMode="numeric" value={aforo} onChange={(e) => setAforo(e.target.value.replace(/\D/g, ''))} required={tipo !== 'espacio_publico' && tipo !== 'recorrido'} />
          </div>
          {tipo === 'recorrido' && (
            <div className={estilos.campo} style={{ gridColumn: '1 / -1' }}>
              <label htmlFor={`${id}-recorrido`}>Puntos de paso (latitud, longitud; separados por punto y coma)</label>
              <textarea id={`${id}-recorrido`} value={recorrido} onChange={(e) => setRecorrido(e.target.value)} rows={2} required />
            </div>
          )}
          <div className={estilos.campo}>
            <label htmlFor={`${id}-montaje`}>Montaje entre funciones (minutos)</label>
            <input id={`${id}-montaje`} inputMode="numeric" value={montaje} onChange={(e) => setMontaje(e.target.value.replace(/\D/g, ''))} required />
          </div>
          <div className={estilos.campo}>
            <label htmlFor={`${id}-horario`}>Horario de taquilla (opcional)</label>
            <input id={`${id}-horario`} value={horario} onChange={(e) => setHorario(e.target.value)} maxLength={200} />
          </div>
          <fieldset style={{ gridColumn: '1 / -1' }}>
            <legend>Accesibilidad</legend>
            {(
              [
                ['sillaRuedas', 'Acceso en silla de ruedas'],
                ['banoAccesible', 'Baño accesible'],
                ['rampa', 'Rampa'],
              ] as const
            ).map(([k, t]) => (
              <label key={k} style={{ display: 'block' }}>
                <input type="checkbox" checked={acc[k]} onChange={(e) => setAcc({ ...acc, [k]: e.target.checked })} /> {t}
              </label>
            ))}
          </fieldset>
          <div className={estilos.acciones}>
            <button type="submit">Crear la sede</button>
          </div>
        </form>
      )}
    </>
  );
}
