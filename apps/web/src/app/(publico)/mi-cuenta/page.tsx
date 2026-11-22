'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import estilos from '@/components/operacion/operacion.module.css';
import { ErrorApiIdentidad, type Yo, apiIdentidad } from '@/lib/identidad/api';

/**
 * `/mi-cuenta` (US8, FR-022, FR-023): datos, preferencia de novedades, cambio de contraseña y
 * cierre de sesión. La descarga y la eliminación de datos llegan con US11.
 */
export default function MiCuentaPage() {
  const id = useId();
  const [yo, setYo] = useState<Yo | null>(null);
  const [sinSesion, setSinSesion] = useState(false);
  const [nombre, setNombre] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');

  useEffect(() => {
    apiIdentidad
      .yo()
      .then((y) => {
        setYo(y);
        setNombre(y.nombre);
      })
      .catch((e) => (e instanceof ErrorApiIdentidad && e.status === 401 ? setSinSesion(true) : setError(String(e))));
  }, []);

  const avisar = (texto: string) => {
    setError('');
    setMensaje(texto);
  };
  const fallar = (e: unknown) => {
    setMensaje('');
    setError(e instanceof Error ? e.message : String(e));
  };

  if (sinSesion) {
    return (
      <>
        <h1>Mi cuenta</h1>
        <p>
          Necesitas ingresar para ver tu cuenta. <Link href="/cuenta/ingresar?volver=/mi-cuenta">Ingresar</Link>
        </p>
      </>
    );
  }
  if (!yo) return <h1>Mi cuenta</h1>;

  return (
    <>
      <h1>Mi cuenta</h1>
      <div role="status" aria-live="polite" className={mensaje ? estilos.exito : undefined}>
        {mensaje}
      </div>
      {error && (
        <p role="alert" className={estilos.resumen}>
          {error}
        </p>
      )}
      {!yo.correoVerificado && <p className="nota">Tu correo aún no está verificado: revisa el enlace que te enviamos para poder comprar o reservar.</p>}

      <form
        className={estilos.formulario}
        aria-label="Mis datos"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            setYo(await apiIdentidad.actualizar({ nombre }));
            avisar('Datos guardados.');
          } catch (err) {
            fallar(err);
          }
        }}
      >
        <h2>Mis datos</h2>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-nombre`}>Nombre</label>
          <input id={`${id}-nombre`} autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={2} />
        </div>
        <div className={estilos.campo}>
          <span id={`${id}-correo-etiqueta`} style={{ fontWeight: 700 }}>
            Correo
          </span>
          <span aria-labelledby={`${id}-correo-etiqueta`}>{yo.correo}</span>
        </div>
        <label style={{ gridColumn: '1 / -1' }}>
          <input
            type="checkbox"
            checked={yo.novedades}
            onChange={async (e) => {
              try {
                setYo(await apiIdentidad.actualizar({ novedades: e.target.checked }));
                avisar(e.target.checked ? 'Recibirás novedades del festival.' : 'Ya no recibirás novedades. Los avisos de tus entradas y funciones seguirán llegando.');
              } catch (err) {
                fallar(err);
              }
            }}
          />{' '}
          Quiero recibir novedades del festival (opcional)
        </label>
        <div className={estilos.acciones}>
          <button type="submit">Guardar mis datos</button>
        </div>
      </form>

      <form
        className={estilos.formulario}
        aria-label="Cambiar la contraseña"
        style={{ marginTop: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await apiIdentidad.cambiarContrasena(actual, nueva);
            setActual('');
            setNueva('');
            avisar('Contraseña cambiada. Cerramos tus sesiones en otros dispositivos.');
          } catch (err) {
            fallar(err);
          }
        }}
      >
        <h2>Cambiar la contraseña</h2>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-actual`}>Contraseña actual</label>
          <input id={`${id}-actual`} type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} required />
        </div>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-nueva`}>Contraseña nueva (al menos 10 caracteres)</label>
          <input id={`${id}-nueva`} type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} required minLength={10} />
        </div>
        <div className={estilos.acciones}>
          <button type="submit">Cambiar la contraseña</button>
        </div>
      </form>

      <ul style={{ marginTop: 16 }}>
        <li>
          <Link href="/mi-cuenta/sesiones">Mis sesiones abiertas</Link>
        </li>
        <li>
          <button
            type="button"
            className={estilos.secundario}
            onClick={async () => {
              await apiIdentidad.salir().catch(() => undefined);
              window.location.assign('/cuenta/ingresar');
            }}
          >
            Cerrar sesión
          </button>
        </li>
      </ul>
    </>
  );
}
