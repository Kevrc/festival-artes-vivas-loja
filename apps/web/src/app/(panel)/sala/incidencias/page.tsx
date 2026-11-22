'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import estilos from '@/components/operacion/operacion.module.css';
import { type Edicion, ErrorApiOperacion, type Funcion, type Incidencia, type IncidenciaEntrada, type Sede, apiOperacion } from '@/lib/operacion/api';
import { diaFestival, horaLoja } from '@/lib/operacion/formato';

const TIPOS: { valor: IncidenciaEntrada['tipo']; nombre: string }[] = [
  { valor: 'retraso', nombre: 'Retraso' },
  { valor: 'falla_tecnica', nombre: 'Falla técnica' },
  { valor: 'clima', nombre: 'Clima' },
  { valor: 'emergencia_medica', nombre: 'Emergencia médica' },
  { valor: 'aforo_superado', nombre: 'Aforo superado' },
  { valor: 'otra', nombre: 'Otra' },
];
const NOMBRE_TIPO: Record<Incidencia['tipo'], string> = {
  retraso: 'Retraso', falla_tecnica: 'Falla técnica', clima: 'Clima', emergencia_medica: 'Emergencia médica',
  aforo_superado: 'Aforo superado', conflicto_ingreso: 'Conflicto de ingreso', desistimiento: 'Desistimiento', otra: 'Otra',
};
const clave = () => crypto.randomUUID();
const mensaje = (e: unknown) => (e instanceof ErrorApiOperacion && e.status === 401 ? 'Necesitas ingresar con tu cuenta de jefatura de sala.' : e instanceof Error ? e.message : String(e));

/**
 * `/sala/incidencias` (US4): el jefe de sala registra incidencias y el conteo estimado de público
 * en funciones de acceso libre, desde el teléfono. El alcance de su sede lo comprueba la API.
 */
export default function IncidenciasPage() {
  const id = useId();
  const alerta = useRef<HTMLParagraphElement>(null);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [sedeId, setSedeId] = useState('');
  const [fecha, setFecha] = useState('');
  const [funciones, setFunciones] = useState<Funcion[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [reprogramar, setReprogramar] = useState<string | null>(null);
  // Formulario de incidencia
  const [funcionId, setFuncionId] = useState('');
  const [tipo, setTipo] = useState<IncidenciaEntrada['tipo']>('retraso');
  const [descripcion, setDescripcion] = useState('');
  const [afecta, setAfecta] = useState(false);
  // Formulario de conteo
  const [conteoFuncion, setConteoFuncion] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [metodo, setMetodo] = useState('Conteo por cuadrantes');

  useEffect(() => {
    (async () => {
      try {
        const ediciones = await apiOperacion.ediciones();
        const e = [...ediciones].sort((a, b) => b.anio - a.anio)[0];
        if (!e) return;
        setEdicion(e);
        const hoy = diaFestival(new Date().toISOString());
        setFecha(hoy < e.fechaInicio ? e.fechaInicio : hoy > e.fechaFin ? e.fechaFin : hoy);
        const s = await apiOperacion.sedes(e.id);
        setSedes(s);
        setSedeId(s[0]?.id ?? '');
      } catch (e) {
        setError(mensaje(e));
      }
    })();
  }, []);

  const cargar = useCallback(async () => {
    if (!edicion || !sedeId || !fecha) return;
    try {
      const [g, inc] = await Promise.all([apiOperacion.grilla(edicion.id, fecha), apiOperacion.incidencias(edicion.id, { sedeId, fecha })]);
      setFunciones(g.funciones.filter((f) => f.sedeId === sedeId && f.estado !== 'cancelada'));
      setIncidencias(inc);
    } catch (e) {
      setError(mensaje(e));
    }
  }, [edicion, sedeId, fecha]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (error) alerta.current?.focus();
  }, [error]);

  const sede = sedes.find((s) => s.id === sedeId);
  const contables = useMemo(
    () => funciones.filter((f) => f.tipoAcceso === 'gratuita_libre' || sede?.tipo === 'espacio_publico' || sede?.tipo === 'recorrido'),
    [funciones, sede],
  );
  const titulo = (fid?: string) => funciones.find((f) => f.id === fid)?.obraTitulo;

  const hecho = (texto: string) => {
    setError('');
    setAviso(texto);
  };

  return (
    <>
      <h1>Incidencias y conteos de sala</h1>
      {error && (
        <p ref={alerta} tabIndex={-1} role="alert" className={estilos.resumen}>
          {error} {error.startsWith('Necesitas') && <Link href="/cuenta/ingresar?volver=/sala/incidencias">Ingresar</Link>}
        </p>
      )}
      <div role="status" aria-live="polite" className={aviso ? estilos.exito : undefined}>
        {aviso}
        {reprogramar && (
          <>
            {' '}
            <Link href={`/programacion/funciones/${reprogramar}`}>Reprogramar la función</Link>
          </>
        )}
      </div>

      <div className={estilos.formulario} style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-sede`}>Sede</label>
          <select id={`${id}-sede`} value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </div>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-fecha`}>Día</label>
          <input id={`${id}-fecha`} type="date" value={fecha} min={edicion?.fechaInicio} max={edicion?.fechaFin} onChange={(e) => setFecha(e.target.value)} />
        </div>
      </div>

      <form
        className={estilos.formulario}
        aria-label="Registrar una incidencia"
        style={{ gridTemplateColumns: '1fr', marginTop: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!edicion) return;
          try {
            const r = await apiOperacion.registrarIncidencia(edicion.id, { sedeId, ...(funcionId ? { funcionId } : {}), tipo, descripcion, afectaPublico: afecta }, clave());
            hecho(r.ofrecerReprogramar ? 'Incidencia registrada. Afecta al público: puedes reprogramar la función.' : 'Incidencia registrada.');
            setReprogramar(r.ofrecerReprogramar && r.funcionId ? r.funcionId : null);
            setDescripcion('');
            setAfecta(false);
            // La API fecha la incidencia con su reloj: se muestra el día en que quedó registrada.
            const dia = diaFestival(r.ocurridaEn);
            if (dia !== fecha) setFecha(dia);
            else await cargar();
          } catch (err) {
            setError(mensaje(err));
          }
        }}
      >
        <h2>Registrar una incidencia</h2>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-funcion`}>Función (opcional)</label>
          <select id={`${id}-funcion`} value={funcionId} onChange={(e) => setFuncionId(e.target.value)}>
            <option value="">Toda la sede</option>
            {funciones.map((f) => (
              <option key={f.id} value={f.id}>{horaLoja(f.inicio)} · {f.obraTitulo}</option>
            ))}
          </select>
        </div>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-tipo`}>Tipo</label>
          <select id={`${id}-tipo`} value={tipo} onChange={(e) => setTipo(e.target.value as IncidenciaEntrada['tipo'])}>
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>{t.nombre}</option>
            ))}
          </select>
        </div>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-descripcion`}>Qué pasó</label>
          <textarea id={`${id}-descripcion`} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required minLength={3} maxLength={1000} rows={3} />
        </div>
        <label>
          <input type="checkbox" checked={afecta} onChange={(e) => setAfecta(e.target.checked)} /> Afecta al público
        </label>
        <div className={estilos.acciones}>
          <button type="submit">Registrar la incidencia</button>
        </div>
      </form>

      <form
        className={estilos.formulario}
        aria-label="Registrar un conteo de público"
        style={{ gridTemplateColumns: '1fr', marginTop: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const c = await apiOperacion.registrarConteo(conteoFuncion, Number(cantidad), metodo, clave());
            hecho(`Conteo de ${c.cantidad.toLocaleString('es-EC')} personas registrado para ${titulo(c.funcionId) ?? 'la función'}. Suma a la asistencia estimada del día.`);
            setReprogramar(null);
            setCantidad('');
          } catch (err) {
            setError(mensaje(err));
          }
        }}
      >
        <h2>Conteo estimado de público</h2>
        {contables.length === 0 ? (
          <p className={estilos.ayuda}>No hay funciones de acceso libre en esta sede ese día: las demás cuentan los ingresos validados en puerta.</p>
        ) : (
          <>
            <div className={estilos.campo}>
              <label htmlFor={`${id}-conteo-funcion`}>Función</label>
              <select id={`${id}-conteo-funcion`} value={conteoFuncion} onChange={(e) => setConteoFuncion(e.target.value)} required>
                <option value="">Elige la función</option>
                {contables.map((f) => (
                  <option key={f.id} value={f.id}>{horaLoja(f.inicio)} · {f.obraTitulo}</option>
                ))}
              </select>
            </div>
            <div className={estilos.campo}>
              <label htmlFor={`${id}-cantidad`}>Personas (estimado)</label>
              <input id={`${id}-cantidad`} inputMode="numeric" pattern="[0-9]*" value={cantidad} onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ''))} required maxLength={6} />
            </div>
            <div className={estilos.campo}>
              <label htmlFor={`${id}-metodo`}>Método</label>
              <input id={`${id}-metodo`} value={metodo} onChange={(e) => setMetodo(e.target.value)} required minLength={2} maxLength={120} />
            </div>
            <div className={estilos.acciones}>
              <button type="submit">Registrar el conteo</button>
            </div>
          </>
        )}
      </form>

      <h2 style={{ marginTop: 24 }}>Incidencias del día ({incidencias.length})</h2>
      {incidencias.length === 0 ? (
        <p>Sin incidencias registradas.</p>
      ) : (
        <ul className={estilos.obras}>
          {incidencias.map((i) => (
            <li key={i.id} className={estilos.obra}>
              <h3>
                {NOMBRE_TIPO[i.tipo]}
                {i.funcionId && titulo(i.funcionId) ? ` · ${titulo(i.funcionId)}` : ''}
              </h3>
              <p>{i.descripcion}</p>
              <p className={estilos.ayuda}>
                {horaLoja(i.ocurridaEn)} · {i.origen === 'automatica' ? 'Aviso automático' : 'Registrada en sala'} · {i.estado === 'abierta' ? 'Abierta' : 'Atendida'}
                {i.afectaPublico ? ' · Afecta al público' : ''}
              </p>
              {i.estado === 'abierta' && (
                <button
                  type="button"
                  className={estilos.secundario}
                  onClick={async () => {
                    try {
                      await apiOperacion.atenderIncidencia(i.id);
                      hecho('Incidencia marcada como atendida.');
                      await cargar();
                    } catch (err) {
                      setError(mensaje(err));
                    }
                  }}
                >
                  Marcar como atendida<span className="solo-lectores"> ({NOMBRE_TIPO[i.tipo]}, {horaLoja(i.ocurridaEn)})</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
