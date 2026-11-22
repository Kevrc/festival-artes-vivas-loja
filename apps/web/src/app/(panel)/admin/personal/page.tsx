'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import estilos from '@/components/operacion/operacion.module.css';
import { type CuentaPersonal, ErrorApiIdentidad, type RolAsignado, apiIdentidad } from '@/lib/identidad/api';
import { DISCIPLINAS, ROLES_PERSONAL, alcanceDeRol, armarRol, describirRol, mismoRol } from '@/lib/identidad/roles';
import { apiOperacion } from '@/lib/operacion/api';

type Sede = { id: string; nombre: string };
const ESTADOS: Record<CuentaPersonal['estado'], string> = {
  pendiente_verificacion: 'Pendiente: aún no elige su contraseña',
  verificada: 'Activa',
  desactivada: 'Desactivada',
};

/** Rol y, si lo exige, su alcance (caso borde: taquilla sin sede no se guarda). */
function CamposRol({ prefijo, rol, alcance, sedes, onRol, onAlcance }: {
  prefijo: string; rol: string; alcance: string; sedes: Sede[]; onRol: (r: string) => void; onAlcance: (v: string) => void;
}) {
  const tipo = alcanceDeRol(rol);
  return (
    <>
      <div className={estilos.campo}>
        <label htmlFor={`${prefijo}-rol`}>Rol</label>
        <select id={`${prefijo}-rol`} value={rol} onChange={(e) => { onRol(e.target.value); onAlcance(''); }} required>
          {ROLES_PERSONAL.map((r) => (
            <option key={r.rol} value={r.rol}>{r.nombre}</option>
          ))}
        </select>
      </div>
      {tipo === 'sede' && (
        <div className={estilos.campo}>
          <label htmlFor={`${prefijo}-alcance`}>Sede</label>
          <select id={`${prefijo}-alcance`} value={alcance} onChange={(e) => onAlcance(e.target.value)} required>
            <option value="">Elige la sede</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </div>
      )}
      {tipo === 'disciplina' && (
        <div className={estilos.campo}>
          <label htmlFor={`${prefijo}-alcance`}>Disciplina</label>
          <select id={`${prefijo}-alcance`} value={alcance} onChange={(e) => onAlcance(e.target.value)} required>
            <option value="">Elige la disciplina</option>
            {DISCIPLINAS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      )}
      {tipo === 'provincia' && (
        <div className={estilos.campo}>
          <label htmlFor={`${prefijo}-alcance`}>Provincia</label>
          <input id={`${prefijo}-alcance`} value={alcance} onChange={(e) => onAlcance(e.target.value)} required maxLength={120} />
        </div>
      )}
    </>
  );
}

/**
 * `/admin/personal` (US9, FR-019): el administrador crea cuentas del personal, cambia sus roles y
 * alcance, las desactiva y restablece el segundo factor. Cada acción queda en la auditoría.
 */
export default function PersonalPage() {
  const id = useId();
  const alerta = useRef<HTMLParagraphElement>(null);
  const [lista, setLista] = useState<CuentaPersonal[] | null>(null);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [acceso, setAcceso] = useState<'ok' | 'sin_sesion' | 'segundo_factor' | 'prohibido'>('ok');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [rol, setRol] = useState<string>('validador');
  const [alcance, setAlcance] = useState('');
  const nombresSede = useMemo(() => new Map(sedes.map((s) => [s.id, s.nombre])), [sedes]);

  const cargar = useCallback(async () => {
    try {
      setLista(await apiIdentidad.personal());
    } catch (e) {
      if (e instanceof ErrorApiIdentidad && e.status === 401) setAcceso('sin_sesion');
      else if (e instanceof ErrorApiIdentidad && e.codigo === 'segundo_factor_requerido') setAcceso('segundo_factor');
      else if (e instanceof ErrorApiIdentidad && e.status === 403) setAcceso('prohibido');
      else setError(String(e));
    }
  }, []);

  useEffect(() => {
    void cargar();
    (async () => {
      try {
        const ediciones = await apiOperacion.ediciones();
        const ultima = [...ediciones].sort((a, b) => b.anio - a.anio)[0];
        if (ultima) setSedes((await apiOperacion.sedes(ultima.id)).map((s) => ({ id: s.id, nombre: s.nombre })));
      } catch {
        // sin sedes: los roles con sede no se podrán asignar hasta que carguen
      }
    })();
  }, [cargar]);

  useEffect(() => {
    if (error) alerta.current?.focus();
  }, [error]);

  const hacer = async (accion: () => Promise<unknown>, exito: string) => {
    setError('');
    setMensaje('');
    try {
      await accion();
      setMensaje(exito);
      await cargar();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  if (acceso !== 'ok') {
    return (
      <>
        <h1>Personal del festival</h1>
        {acceso === 'sin_sesion' && (
          <p>
            Necesitas ingresar con una cuenta de administración. <Link href="/cuenta/ingresar?volver=/admin/personal">Ingresar</Link>
          </p>
        )}
        {acceso === 'segundo_factor' && (
          <p>
            Antes de continuar, verifica tu segundo factor. <Link href="/cuenta/segundo-factor?volver=/admin/personal">Ir al segundo factor</Link>
          </p>
        )}
        {acceso === 'prohibido' && <p>Tu cuenta no tiene el rol de administración.</p>}
      </>
    );
  }

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = armarRol(rol, alcance);
    if (!r) {
      setError('Ese rol necesita un alcance: elige la sede, la disciplina o la provincia.');
      return;
    }
    const ok = await hacer(() => apiIdentidad.crearPersonal({ nombre, correo, roles: [r] }), `Cuenta de ${nombre} creada. Le enviamos un enlace para elegir su contraseña.`);
    if (ok) {
      setNombre('');
      setCorreo('');
      setAlcance('');
    }
  };

  return (
    <>
      <h1>Personal del festival</h1>
      <div role="status" aria-live="polite" className={mensaje ? estilos.exito : undefined}>
        {mensaje}
      </div>
      {error && (
        <p ref={alerta} tabIndex={-1} role="alert" className={estilos.resumen}>
          {error}
        </p>
      )}

      <form className={estilos.formulario} aria-label="Crear una cuenta del personal" onSubmit={crear}>
        <h2>Crear una cuenta del personal</h2>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-nombre`}>Nombre</label>
          <input id={`${id}-nombre`} value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={2} maxLength={120} autoComplete="off" />
        </div>
        <div className={estilos.campo}>
          <label htmlFor={`${id}-correo`}>Correo</label>
          <input id={`${id}-correo`} type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required autoComplete="off" />
        </div>
        <CamposRol prefijo={`${id}-nuevo`} rol={rol} alcance={alcance} sedes={sedes} onRol={setRol} onAlcance={setAlcance} />
        <div className={estilos.acciones}>
          <button type="submit">Crear la cuenta</button>
        </div>
      </form>

      <h2 style={{ marginTop: 24 }}>Cuentas ({lista?.length ?? 0})</h2>
      {lista && (
        <ul className={estilos.obras}>
          {lista.map((c) => (
            <FichaPersonal key={c.cuentaId} cuenta={c} sedes={sedes} nombresSede={nombresSede} hacer={hacer} />
          ))}
        </ul>
      )}
    </>
  );
}

function FichaPersonal({ cuenta: c, sedes, nombresSede, hacer }: {
  cuenta: CuentaPersonal;
  sedes: Sede[];
  nombresSede: ReadonlyMap<string, string>;
  hacer: (accion: () => Promise<unknown>, exito: string) => Promise<boolean>;
}) {
  const id = useId();
  const [rol, setRol] = useState<string>('taquilla');
  const [alcance, setAlcance] = useState('');
  const [motivo, setMotivo] = useState('');
  const titulo = `t-${c.cuentaId}`;
  const cambiarRoles = (roles: RolAsignado[], exito: string) => hacer(() => apiIdentidad.cambiarRoles(c.cuentaId, roles), exito);

  return (
    <li>
      <article className={estilos.obra} aria-labelledby={titulo}>
        <h3 id={titulo}>{c.nombre}</h3>
        <dl>
          <dt>Correo</dt>
          <dd>{c.correo}</dd>
          <dt>Estado</dt>
          <dd>{ESTADOS[c.estado]}</dd>
          <dt>Segundo factor</dt>
          <dd>{c.segundoFactorActivo ? 'Configurado' : 'Sin configurar'}</dd>
        </dl>
        <h4>Roles</h4>
        {c.roles.length === 0 ? (
          <p>Sin roles.</p>
        ) : (
          <ul>
            {c.roles.map((r) => (
              <li key={`${r.rol}-${r.alcance?.valor ?? ''}`}>
                {describirRol(r, nombresSede)}{' '}
                <button
                  type="button"
                  className={estilos.secundario}
                  onClick={() => cambiarRoles(c.roles.filter((x) => !mismoRol(x, r)), `Rol ${describirRol(r, nombresSede)} quitado a ${c.nombre}.`)}
                >
                  Quitar<span className="solo-lectores"> el rol {describirRol(r, nombresSede)} de {c.nombre}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className={estilos.formulario}
          aria-label={`Añadir un rol a ${c.nombre}`}
          onSubmit={async (e) => {
            e.preventDefault();
            const nuevo = armarRol(rol, alcance);
            if (!nuevo) return;
            if (await cambiarRoles([...c.roles, nuevo], `Rol ${describirRol(nuevo, nombresSede)} añadido a ${c.nombre}.`)) setAlcance('');
          }}
        >
          <CamposRol prefijo={`${id}-rol`} rol={rol} alcance={alcance} sedes={sedes} onRol={setRol} onAlcance={setAlcance} />
          <div className={estilos.acciones}>
            <button type="submit">Añadir el rol<span className="solo-lectores"> a {c.nombre}</span></button>
          </div>
        </form>
        <div className={estilos.acciones} style={{ marginTop: 12 }}>
          {c.estado === 'desactivada' ? (
            <button type="button" onClick={() => hacer(() => apiIdentidad.cambiarEstado(c.cuentaId, 'verificada'), `Cuenta de ${c.nombre} reactivada.`)}>
              Reactivar<span className="solo-lectores"> la cuenta de {c.nombre}</span>
            </button>
          ) : (
            <button
              type="button"
              className={estilos.secundario}
              onClick={() => hacer(() => apiIdentidad.cambiarEstado(c.cuentaId, 'desactivada'), `Cuenta de ${c.nombre} desactivada: perdió el acceso de inmediato.`)}
            >
              Desactivar<span className="solo-lectores"> la cuenta de {c.nombre}</span>
            </button>
          )}
        </div>
        {c.segundoFactorActivo && (
          <form
            className={estilos.formulario}
            aria-label={`Restablecer el segundo factor de ${c.nombre}`}
            onSubmit={async (e) => {
              e.preventDefault();
              if (await hacer(() => apiIdentidad.restablecerTotp(c.cuentaId, motivo), `Segundo factor de ${c.nombre} restablecido: lo configurará al volver a ingresar.`)) setMotivo('');
            }}
          >
            <div className={estilos.campo}>
              <label htmlFor={`${id}-motivo`}>Motivo para restablecer el segundo factor (tras verificar su identidad)</label>
              <input id={`${id}-motivo`} value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} maxLength={500} />
            </div>
            <div className={estilos.acciones}>
              <button type="submit" className={estilos.secundario}>
                Restablecer el segundo factor<span className="solo-lectores"> de {c.nombre}</span>
              </button>
            </div>
          </form>
        )}
      </article>
    </li>
  );
}
