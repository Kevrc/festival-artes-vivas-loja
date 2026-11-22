'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import estilos from '@/components/operacion/operacion.module.css';
import { ErrorApiIdentidad, apiIdentidad } from '@/lib/identidad/api';

/** `/admin/estudiantes` (US12): dominios institucionales con los que se acredita a estudiantes. */
export default function DominiosPage() {
  const id = useId();
  const [dominios, setDominios] = useState<{ dominio: string; institucion: string }[]>([]);
  const [dominio, setDominio] = useState('');
  const [institucion, setInstitucion] = useState('');
  const [ok, setOk] = useState('');
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      setDominios(await apiIdentidad.dominios());
    } catch (e) {
      setError(e instanceof ErrorApiIdentidad && (e.status === 401 || e.status === 403) ? 'Necesitas una cuenta de administración con el segundo factor verificado.' : String(e));
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  return (
    <>
      <h1>Dominios de estudiantes</h1>
      <p>Quien confirme un correo de estos dominios (o de sus subdominios) queda acreditado como estudiante hasta el fin de la edición.</p>
      <div role="status" aria-live="polite" className={ok ? estilos.exito : undefined}>
        {ok}
      </div>
      {error && (
        <p role="alert" className={estilos.resumen}>
          {error}
        </p>
      )}
      <ul>
        {dominios.map((d) => (
          <li key={d.dominio}>
            <strong>{d.dominio}</strong> · {d.institucion}
          </li>
        ))}
      </ul>
      <form
        className={estilos.formulario}
        aria-label="Registrar un dominio institucional"
        onSubmit={async (e) => {
          e.preventDefault();
          setError('');
          setOk('');
          try {
            const r = await apiIdentidad.agregarDominio(dominio, institucion);
            setOk(`Dominio ${r.dominio} registrado.`);
            setDominio('');
            setInstitucion('');
            await cargar();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
      >
        <h2>Registrar un dominio</h2>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-dominio`}>Dominio (por ejemplo, utpl.edu.ec)</label>
          <input id={`${id}-dominio`} value={dominio} onChange={(e) => setDominio(e.target.value)} required minLength={4} maxLength={120} />
        </div>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-institucion`}>Institución</label>
          <input id={`${id}-institucion`} value={institucion} onChange={(e) => setInstitucion(e.target.value)} required minLength={2} maxLength={160} />
        </div>
        <div className={estilos.acciones}>
          <button type="submit">Registrar el dominio</button>
        </div>
      </form>
    </>
  );
}
