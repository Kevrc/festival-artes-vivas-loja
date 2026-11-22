'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormularioFuncion } from '@/components/operacion/formulario-funcion';
import { Grilla } from '@/components/operacion/grilla';
import { SesionDevOperacion as SelectorSesion } from '@/components/operacion/sesion-dev-operacion';
import estilos from '@/components/operacion/operacion.module.css';
import {
  type Edicion,
  ErrorApiOperacion,
  type Funcion,
  type Grilla as GrillaDia,
  type Obra,
  type SesionDevOperacion,
  apiOperacion,
  diaFestival,
  diasEntre,
  fechaLarga,
} from '@/lib/operacion/api';

/** `/programacion`: grilla de un día por sede y formulario de funciones (US1, contracts/rutas-web.md). */
export default function ProgramacionPage() {
  const [sesion, setSesion] = useState<SesionDevOperacion | null>(null);
  const [ediciones, setEdiciones] = useState<Edicion[]>([]);
  const [edicionId, setEdicionId] = useState('');
  const [fecha, setFecha] = useState('');
  const [grilla, setGrilla] = useState<GrillaDia | null>(null);
  const [obras, setObras] = useState<Obra[]>([]);
  const [seleccionada, setSeleccionada] = useState<Funcion | null>(null);
  const [enConflicto, setEnConflicto] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const edicion = ediciones.find((e) => e.id === edicionId);
  const dias = useMemo(() => (edicion ? diasEntre(edicion.fechaInicio, edicion.fechaFin) : []), [edicion]);
  const puedeProgramar = sesion?.rol === 'programador';
  const alCambiarSesion = useCallback((s: SesionDevOperacion | null) => setSesion(s), []);

  const avisar = (e: unknown) =>
    setError(e instanceof ErrorApiOperacion && (e.status === 401 || e.status === 403) ? 'Necesitas una sesión con rol de programación para ver esta página.' : e instanceof Error ? e.message : 'Error inesperado');

  useEffect(() => {
    if (!sesion) return;
    apiOperacion
      .ediciones()
      .then((lista) => {
        setEdiciones(lista);
        const actual = lista.find((e) => e.estado !== 'cerrada') ?? lista[0];
        if (actual) {
          setEdicionId(actual.id);
          // Si se llegó con ?funcion=, ese día ya está elegido.
          setFecha((f) => f || actual.fechaInicio);
        }
        setError('');
      })
      .catch(avisar);
  }, [sesion]);

  const recargar = useCallback(async () => {
    if (!edicionId || !fecha) return;
    setCargando(true);
    try {
      setGrilla(await apiOperacion.grilla(edicionId, fecha));
      setError('');
    } catch (e) {
      avisar(e);
    } finally {
      setCargando(false);
    }
  }, [edicionId, fecha]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  useEffect(() => {
    if (edicionId && puedeProgramar) apiOperacion.obras(edicionId).then(setObras).catch(avisar);
  }, [edicionId, puedeProgramar]);

  // Enlace desde "Publicar" (US2-AS2): /programacion?funcion=<id> abre su día y la selecciona.
  const [pedida, setPedida] = useState<string | null>(null);
  useEffect(() => {
    setPedida(new URLSearchParams(window.location.search).get('funcion'));
  }, []);
  useEffect(() => {
    if (!pedida || !sesion) return;
    apiOperacion
      .funcion(pedida)
      .then((f) => {
        setFecha(diaFestival(f.inicio));
        setSeleccionada(f);
        setPedida(null);
      })
      .catch(avisar);
  }, [pedida, sesion]);

  return (
    <>
      <h1>Programación</h1>
      <SelectorSesion onCambio={alCambiarSesion} />

      {error && (
        <p role="alert" className={estilos.resumen}>
          {error}
        </p>
      )}

      {edicion && (
        <div className={estilos.barra}>
          {ediciones.length > 1 && (
            <div className={estilos.campo}>
              <label htmlFor="edicion">Edición</label>
              <select id="edicion" value={edicionId} onChange={(e) => setEdicionId(e.target.value)}>
                {ediciones.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.numero} · {e.anio}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className={estilos.campo}>
            <label htmlFor="dia">Día</label>
            <select id="dia" value={fecha} onChange={(e) => { setFecha(e.target.value); setSeleccionada(null); setEnConflicto(new Set()); }}>
              {dias.map((d) => (
                <option key={d} value={d}>
                  {fechaLarga(d)}
                </option>
              ))}
            </select>
          </div>
          <p className={estilos.ayuda} aria-live="polite">
            {cargando ? 'Cargando grilla…' : grilla?.feriado ? `${grilla.feriado}: es solo informativo, no bloquea la programación.` : ''}
          </p>
        </div>
      )}

      {grilla && puedeProgramar && edicion && (
        <FormularioFuncion
          edicionId={edicion.id}
          fecha={fecha}
          sedes={grilla.sedes}
          obras={obras}
          funcion={seleccionada}
          edicionPublicada={edicion.estado === 'publicada'}
          onGuardada={(f) => {
            setSeleccionada(f);
            setEnConflicto(new Set());
            void recargar();
          }}
          onEliminada={() => {
            setSeleccionada(null);
            void recargar();
          }}
          onConflictos={(ids) => setEnConflicto(new Set(ids))}
          onCancelar={() => {
            setSeleccionada(null);
            setEnConflicto(new Set());
          }}
        />
      )}

      {grilla && <Grilla grilla={grilla} seleccionada={seleccionada?.id ?? null} enConflicto={enConflicto} onElegir={(f) => setSeleccionada(f)} />}
    </>
  );
}
