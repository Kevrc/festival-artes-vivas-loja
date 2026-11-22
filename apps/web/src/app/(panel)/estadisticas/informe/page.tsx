'use client';

import { useCallback, useEffect, useState } from 'react';
import estilos from '@/components/operacion/operacion.module.css';
import { SesionDevOperacion } from '@/components/operacion/sesion-dev-operacion';
import { type Edicion, ErrorApiOperacion, type InformeCierre, apiOperacion } from '@/lib/operacion/api';
import { dolares, entero, porcentaje, variacionTexto } from '@/lib/operacion/formato';

const FILAS: { clave: keyof InformeCierre & string; nombre: string; valor: (i: InformeCierre) => string }[] = [
  { clave: 'actividades', nombre: 'Actividades realizadas', valor: (i) => entero(i.actividades) },
  { clave: 'elencos', nombre: 'Elencos', valor: (i) => entero(i.elencos) },
  { clave: 'obras', nombre: 'Obras', valor: (i) => entero(i.obras) },
  { clave: 'paises', nombre: 'Países', valor: (i) => entero(i.paises) },
  { clave: 'asistenciaValidada', nombre: 'Asistencia validada en puerta', valor: (i) => entero(i.asistenciaValidada) },
  { clave: 'asistenciaEstimada', nombre: 'Asistencia estimada en espacios públicos', valor: (i) => entero(i.asistenciaEstimada) },
  { clave: 'asistenciaTotal', nombre: 'Asistencia total', valor: (i) => entero(i.asistenciaTotal) },
  { clave: 'ocupacionMedia', nombre: 'Ocupación media de salas', valor: (i) => porcentaje(i.ocupacionMedia) },
  { clave: 'recaudacionCentavos', nombre: 'Recaudación', valor: (i) => dolares(i.recaudacionCentavos) },
];

/** `/estadisticas/informe` (US5-AS4): informe de cierre congelado y su variación frente a la edición anterior. */
export default function InformePage() {
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [informe, setInforme] = useState<InformeCierre | null>(null);
  const [aviso, setAviso] = useState('');
  const [sesionLista, setSesionLista] = useState(0);
  const alCambiarSesion = useCallback(() => setSesionLista((n) => n + 1), []);

  useEffect(() => {
    (async () => {
      try {
        setAviso('');
        const ediciones = await apiOperacion.ediciones();
        const e = [...ediciones].sort((a, b) => b.anio - a.anio)[0];
        if (!e) return;
        setEdicion(e);
        setInforme(await apiOperacion.informe(e.id));
      } catch (err) {
        setInforme(null);
        if (err instanceof ErrorApiOperacion && err.codigo === 'edicion_abierta') setAviso('El informe de cierre estará disponible el día siguiente a la última función, cuando la edición se cierre.');
        else if (err instanceof ErrorApiOperacion && err.status === 403) setAviso('El informe de cierre es para Dirección y Administración.');
        else if (err instanceof ErrorApiOperacion && err.status === 401) setAviso('Necesitas ingresar con una cuenta de Dirección.');
        else setAviso(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [sesionLista]);

  return (
    <>
      <h1>Informe de cierre {edicion ? edicion.anio : ''}</h1>
      <SesionDevOperacion onCambio={alCambiarSesion} />
      {aviso && <p role="status">{aviso}</p>}
      {informe && (
        <div className={estilos.desplazable} tabIndex={0} role="region" aria-label="Tabla del informe (se desplaza)">
          <table className={estilos.tabla}>
            <caption>
              Edición {informe.anio}
              {informe.anterior ? ` comparada con ${informe.anterior.anio}${informe.anterior.fuente === 'cifras_historicas' ? ' (cifras publicadas)' : ''}` : ''}
            </caption>
            <thead>
              <tr>
                <th scope="col">Cifra</th>
                <th scope="col">{informe.anio}</th>
                <th scope="col">Variación</th>
              </tr>
            </thead>
            <tbody>
              {FILAS.map((f) => (
                <tr key={f.clave}>
                  <th scope="row">{f.nombre}</th>
                  <td>{f.valor(informe)}</td>
                  <td>{variacionTexto(informe.variacion?.[f.clave])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {informe && <p className="detalle">Generado el {new Date(informe.generadoEn).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}.</p>}
    </>
  );
}
