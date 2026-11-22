'use client';

import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import estilos from '@/components/operacion/operacion.module.css';
import { ErrorApiIdentidad, type EvaluacionEliminacion, type Yo, apiIdentidad } from '@/lib/identidad/api';

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
  if (yo.segundoFactorOk && yo.politicaPendiente) {
    return (
      <>
        <h1>Mi cuenta</h1>
        <p>
          Hay una versión nueva de la política de privacidad. <Link href="/cuenta/politica?volver=/mi-cuenta">Revísala y acéptala para continuar</Link>.
        </p>
        <MisDatos />
      </>
    );
  }
  if (!yo.segundoFactorOk) {
    return (
      <>
        <h1>Mi cuenta</h1>
        <p>
          Tu cuenta es del equipo del festival: antes de continuar, verifica tu segundo factor.{' '}
          <Link href="/cuenta/segundo-factor?volver=/mi-cuenta">Ir al segundo factor</Link>
        </p>
      </>
    );
  }

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
          <Link href="/mi-cuenta/notificaciones">Mis notificaciones</Link>
        </li>
        <li>
          <Link href="/mi-cuenta/estudiante">{yo.estudianteAcreditado ? 'Condición de estudiante (acreditada)' : 'Acreditarme como estudiante'}</Link>
        </li>
        <li>
          <Link href="/privacidad">Política de privacidad</Link>
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
      <MisDatos />
    </>
  );
}

/**
 * Mis datos personales (US11, FR-023): descarga y eliminación de la cuenta. Antes de eliminar se
 * explica qué se pierde y, si hay entradas para funciones futuras, se pide confirmarlo (US11-AS3).
 */
function MisDatos() {
  const id = useId();
  const [evaluacion, setEvaluacion] = useState<EvaluacionEliminacion | null>(null);
  const [contrasena, setContrasena] = useState('');
  const [asumo, setAsumo] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const pierde = !!evaluacion && (evaluacion.funcionesFuturas.length > 0 || evaluacion.postulacionesEnCurso > 0);

  const descargar = async () => {
    try {
      const archivo = await apiIdentidad.misDatos();
      const url = URL.createObjectURL(archivo);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mis-datos-fiavl.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section aria-labelledby={`${id}-titulo`} style={{ marginTop: 24 }}>
      <h2 id={`${id}-titulo`}>Mis datos personales</h2>
      <p>Puedes descargar todo lo que el festival guarda de ti: tu cuenta, tus consentimientos, tus sesiones y los avisos que te enviamos.</p>
      <button type="button" className={estilos.secundario} onClick={descargar}>
        Descargar mis datos
      </button>
      {error && (
        <p role="alert" className={estilos.resumen}>
          {error}
        </p>
      )}
      <h3 style={{ marginTop: 16 }}>Eliminar mi cuenta</h3>
      {!evaluacion ? (
        <button
          type="button"
          className={estilos.secundario}
          onClick={async () => {
            try {
              setEvaluacion(await apiIdentidad.evaluarEliminacion());
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          Quiero eliminar mi cuenta
        </button>
      ) : (
        <form
          className={estilos.formulario}
          aria-label="Eliminar mi cuenta"
          style={{ gridTemplateColumns: '1fr', maxWidth: 520 }}
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            setEnviando(true);
            try {
              await apiIdentidad.eliminarCuenta(contrasena, asumo);
              window.location.assign('/cartelera?cuenta=eliminada');
            } catch (err) {
              setError(err instanceof ErrorApiIdentidad ? err.message : String(err));
              setEnviando(false);
            }
          }}
        >
          <div className="nota">
            <p>
              Se borrarán tu nombre, tu correo, tu contraseña y tus sesiones. Ya no podrás ingresar. Los registros contables (pagos y
              devoluciones) se conservan sin datos que te identifiquen.
            </p>
            {evaluacion.funcionesFuturas.length > 0 && (
              <>
                <p>Tienes entradas para funciones que aún no se realizan:</p>
                <ul>
                  {evaluacion.funcionesFuturas.map((f) => (
                    <li key={f.funcionId}>
                      {f.titulo} · {new Date(f.inicio).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Guayaquil' })}
                    </li>
                  ))}
                </ul>
                <p>Seguirán valiendo con el QR que recibiste por correo, pero ya no las verás en tu cuenta. También puedes esperar a que termine el festival.</p>
              </>
            )}
            {evaluacion.postulacionesEnCurso > 0 && <p>Tienes {evaluacion.postulacionesEnCurso} postulación(es) en curso: ya no recibirás sus avisos.</p>}
          </div>
          {pierde && (
            <label>
              <input type="checkbox" checked={asumo} onChange={(e) => setAsumo(e.target.checked)} required /> Entiendo lo que pierdo y quiero continuar
            </label>
          )}
          <div className={estilos.campo}>
            <label htmlFor={`${id}-contrasena`}>Tu contraseña, para confirmar</label>
            <input id={`${id}-contrasena`} type="password" autoComplete="current-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} required />
          </div>
          <div className={estilos.acciones}>
            <button type="submit" disabled={enviando || (pierde && !asumo)}>
              Eliminar mi cuenta definitivamente
            </button>
            <button type="button" className={estilos.secundario} onClick={() => setEvaluacion(null)}>
              No, conservar mi cuenta
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
