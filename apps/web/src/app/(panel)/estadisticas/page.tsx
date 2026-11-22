'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import estilos from '@/components/operacion/operacion.module.css';
import { SesionDevOperacion } from '@/components/operacion/sesion-dev-operacion';
import { type Dimension, type Edicion, ErrorApiOperacion, type FilaIndicador, type Indicadores, type Sede, apiOperacion } from '@/lib/operacion/api';
import { dolares, entero, horaLoja, porcentaje } from '@/lib/operacion/formato';

const DIMENSIONES: { valor: Dimension; nombre: string }[] = [
  { valor: 'dia', nombre: 'Día' },
  { valor: 'sede', nombre: 'Sede' },
  { valor: 'disciplina', nombre: 'Disciplina' },
  { valor: 'componente', nombre: 'Componente' },
  { valor: 'pais', nombre: 'País' },
  { valor: 'funcion', nombre: 'Función' },
];

/** Barra decorativa: los números están en la tabla, así que la barra se oculta a lectores de pantalla. */
function Barra({ valor, maximo }: { valor: number; maximo: number }) {
  const ancho = maximo > 0 ? Math.round((valor / maximo) * 100) : 0;
  return (
    <span aria-hidden="true" style={{ display: 'block', height: 8, marginTop: 4, width: `${ancho}%`, minWidth: valor > 0 ? 2 : 0, background: 'currentColor', opacity: 0.55, borderRadius: 4 }} />
  );
}

function Celdas({ f, maximo }: { f: FilaIndicador; maximo: number }) {
  return (
    <>
      <td>{entero(f.funcionesRealizadas)}</td>
      <td>{entero(f.funcionesCanceladas)}</td>
      <td>{entero(f.entradasEmitidas)}</td>
      <td>{entero(f.ingresosValidados)}</td>
      <td>{entero(f.asistenciaEstimada)}</td>
      <td>
        {entero(f.asistenciaTotal)}
        <Barra valor={f.asistenciaTotal} maximo={maximo} />
      </td>
      <td>{porcentaje(f.ocupacion)}</td>
      <td>{dolares(f.recaudacionCentavos)}</td>
    </>
  );
}

/**
 * `/estadisticas` (US5): indicadores por día, sede, disciplina, componente, país o función, con
 * filtros, el desglose de asistencia (validada + estimada, RN-004) y la exportación a CSV.
 */
export default function EstadisticasPage() {
  const id = useId();
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [dimension, setDimension] = useState<Dimension>('dia');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [sedeId, setSedeId] = useState('');
  const [datos, setDatos] = useState<Indicadores | null>(null);
  const [error, setError] = useState('');
  const [sesionLista, setSesionLista] = useState(0);
  const alCambiarSesion = useCallback(() => setSesionLista((n) => n + 1), []);

  useEffect(() => {
    (async () => {
      try {
        const ediciones = await apiOperacion.ediciones();
        const e = [...ediciones].sort((a, b) => b.anio - a.anio)[0];
        if (!e) return;
        setEdicion(e);
        setSedes(await apiOperacion.sedes(e.id));
      } catch (err) {
        setError(err instanceof ErrorApiOperacion && err.status === 401 ? 'Necesitas ingresar con una cuenta de Dirección o Programación.' : String(err));
      }
    })();
  }, [sesionLista]);

  const filtro = { dimension, desde: desde || undefined, hasta: hasta || undefined, sedeId: sedeId || undefined };
  const cargar = useCallback(async () => {
    if (!edicion) return;
    try {
      setError('');
      setDatos(await apiOperacion.indicadores(edicion.id, filtro));
    } catch (err) {
      setDatos(null);
      setError(err instanceof ErrorApiOperacion && err.status === 403 ? 'Tu rol no puede ver las estadísticas.' : err instanceof Error ? err.message : String(err));
    }
  }, [edicion, dimension, desde, hasta, sedeId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const exportar = async () => {
    if (!edicion) return;
    try {
      const archivo = await apiOperacion.indicadoresCsv(edicion.id, filtro);
      const url = URL.createObjectURL(archivo);
      const a = document.createElement('a');
      a.href = url;
      a.download = `indicadores-${dimension}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const maximo = datos ? Math.max(0, ...datos.filas.map((f) => f.asistenciaTotal)) : 0;
  const nombreDimension = DIMENSIONES.find((d) => d.valor === dimension)!.nombre;

  return (
    <>
      <h1>Estadísticas {edicion ? `de la edición ${edicion.anio}` : ''}</h1>
      <SesionDevOperacion onCambio={alCambiarSesion} />
      {error && (
        <p role="alert" className={estilos.resumen}>
          {error}
        </p>
      )}

      <form className={estilos.formulario} aria-label="Filtros de las estadísticas" onSubmit={(e) => e.preventDefault()}>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-dimension`}>Agrupar por</label>
          <select id={`${id}-dimension`} value={dimension} onChange={(e) => setDimension(e.target.value as Dimension)}>
            {DIMENSIONES.map((d) => (
              <option key={d.valor} value={d.valor}>{d.nombre}</option>
            ))}
          </select>
        </div>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-sede`}>Sede</label>
          <select id={`${id}-sede`} value={sedeId} onChange={(e) => setSedeId(e.target.value)}>
            <option value="">Todas</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </div>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-desde`}>Desde</label>
          <input id={`${id}-desde`} type="date" value={desde} min={edicion?.fechaInicio} max={edicion?.fechaFin} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-hasta`}>Hasta</label>
          <input id={`${id}-hasta`} type="date" value={hasta} min={edicion?.fechaInicio} max={edicion?.fechaFin} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className={estilos.acciones}>
          <button type="button" onClick={exportar} disabled={!datos}>
            Exportar CSV
          </button>
        </div>
      </form>

      {datos && (
        <>
          <section aria-labelledby={`${id}-resumen`} style={{ marginTop: 16 }}>
            <h2 id={`${id}-resumen`}>Asistencia total: {entero(datos.totales.asistenciaTotal)}</h2>
            <p>
              {entero(datos.totales.ingresosValidados)} validadas en puerta + {entero(datos.totales.asistenciaEstimada)} estimadas en espacios
              públicos · ocupación {porcentaje(datos.totales.ocupacion)} · recaudación {dolares(datos.totales.recaudacionCentavos)}
            </p>
            <p className={estilos.ayuda}>Datos al {new Date(datos.actualizadoEn).toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil' })} a las {horaLoja(datos.actualizadoEn)}.</p>
          </section>
          <div className={estilos.desplazable} tabIndex={0} role="region" aria-label="Tabla de indicadores (se desplaza)">
            <table className={estilos.tabla}>
              <caption>Indicadores por {nombreDimension.toLowerCase()} (la barra muestra la asistencia total)</caption>
              <thead>
                <tr>
                  <th scope="col">{nombreDimension}</th>
                  <th scope="col">Funciones realizadas</th>
                  <th scope="col">Canceladas</th>
                  <th scope="col">Entradas emitidas</th>
                  <th scope="col">Asistencia validada</th>
                  <th scope="col">Asistencia estimada</th>
                  <th scope="col">Asistencia total</th>
                  <th scope="col">Ocupación</th>
                  <th scope="col">Recaudación</th>
                </tr>
              </thead>
              <tbody>
                {datos.filas.map((f) => (
                  <tr key={f.clave}>
                    <th scope="row">{f.etiqueta}</th>
                    <Celdas f={f} maximo={maximo} />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  <Celdas f={datos.totales} maximo={0} />
                </tr>
              </tfoot>
            </table>
          </div>
          {datos.filas.length === 0 && <p>No hay funciones con esos filtros.</p>}
        </>
      )}
    </>
  );
}
