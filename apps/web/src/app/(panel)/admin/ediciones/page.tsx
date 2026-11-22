'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import estilos from '@/components/operacion/operacion.module.css';
import { type Edicion, type EdicionEntrada, ErrorApiOperacion, apiOperacion } from '@/lib/operacion/api';
import { dolares } from '@/lib/operacion/formato';

const ESTADOS: Record<Edicion['estado'], string> = { planificacion: 'En planificación', publicada: 'Publicada', cerrada: 'Cerrada (solo lectura)' };
const aCentavos = (usd: string) => Math.round(Number(usd.replace(',', '.')) * 100);
const mensaje = (e: unknown) =>
  e instanceof ErrorApiOperacion && e.status === 401 ? 'Necesitas ingresar con una cuenta de administración.' : e instanceof ErrorApiOperacion && e.status === 403 ? 'Tu cuenta no tiene el rol de administración.' : e instanceof Error ? e.message : String(e);

/** Formulario de edición: crear (opcionalmente a partir de otra) o cambiar parámetros. */
function FormEdicion({ inicial, ediciones, onGuardar, etiqueta }: {
  inicial: Edicion | null;
  ediciones: Edicion[];
  onGuardar: (e: EdicionEntrada) => Promise<void>;
  etiqueta: string;
}) {
  const id = useId();
  const [numero, setNumero] = useState(inicial?.numero ?? '');
  const [anio, setAnio] = useState(String(inicial?.anio ?? new Date().getFullYear() + 1));
  const [inicio, setInicio] = useState(inicial?.fechaInicio ?? '');
  const [fin, setFin] = useState(inicial?.fechaFin ?? '');
  const [pais, setPais] = useState(inicial?.paisInvitado ?? '');
  const [precio, setPrecio] = useState(inicial?.precioCentavos !== undefined ? String(inicial.precioCentavos / 100) : '');
  const [pagadas, setPagadas] = useState(String(inicial?.maxPagadasPersona ?? ''));
  const [reservas, setReservas] = useState(String(inicial?.maxReservasPersona ?? ''));
  const [base, setBase] = useState('');
  const nueva = inicial === null;

  return (
    <form
      className={estilos.formulario}
      aria-label={etiqueta}
      onSubmit={async (e) => {
        e.preventDefault();
        await onGuardar({
          numero, anio: Number(anio), fechaInicio: inicio, fechaFin: fin, paisInvitado: pais.trim() || null,
          ...(precio ? { precioCentavos: aCentavos(precio) } : {}),
          ...(pagadas ? { maxPagadasPersona: Number(pagadas) } : {}),
          ...(reservas ? { maxReservasPersona: Number(reservas) } : {}),
          ...(nueva && base ? { aPartirDe: base } : {}),
        });
      }}
    >
      <h2>{etiqueta}</h2>
      {nueva && (
        <div className={estilos.campo}>
          <label htmlFor={`${id}-base`}>A partir de (copia sedes y parámetros, no funciones)</label>
          <select id={`${id}-base`} value={base} onChange={(e) => setBase(e.target.value)}>
            <option value="">Ninguna: edición en blanco</option>
            {ediciones.map((x) => (
              <option key={x.id} value={x.id}>{x.anio} · {x.numero}</option>
            ))}
          </select>
        </div>
      )}
      <div className={estilos.campo}>
        <label htmlFor={`${id}-numero`}>Número (por ejemplo, XII)</label>
        <input id={`${id}-numero`} value={numero} onChange={(e) => setNumero(e.target.value)} required maxLength={20} />
      </div>
      <div className={estilos.campo}>
        <label htmlFor={`${id}-anio`}>Año</label>
        <input id={`${id}-anio`} inputMode="numeric" value={anio} onChange={(e) => setAnio(e.target.value.replace(/\D/g, ''))} required maxLength={4} />
      </div>
      <div className={estilos.campo}>
        <label htmlFor={`${id}-inicio`}>Primer día</label>
        <input id={`${id}-inicio`} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
      </div>
      <div className={estilos.campo}>
        <label htmlFor={`${id}-fin`}>Último día</label>
        <input id={`${id}-fin`} type="date" value={fin} onChange={(e) => setFin(e.target.value)} required />
      </div>
      <div className={estilos.campo}>
        <label htmlFor={`${id}-pais`}>País invitado de honor (opcional)</label>
        <input id={`${id}-pais`} value={pais} onChange={(e) => setPais(e.target.value)} maxLength={80} />
      </div>
      <div className={estilos.campo}>
        <label htmlFor={`${id}-precio`}>Precio de la entrada (USD){nueva && base ? ', si cambia' : ''}</label>
        <input id={`${id}-precio`} inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} required={!(nueva && base)} />
      </div>
      <div className={estilos.campo}>
        <label htmlFor={`${id}-pagadas`}>Máximo de entradas pagadas por persona</label>
        <input id={`${id}-pagadas`} inputMode="numeric" value={pagadas} onChange={(e) => setPagadas(e.target.value.replace(/\D/g, ''))} required={!(nueva && base)} />
      </div>
      <div className={estilos.campo}>
        <label htmlFor={`${id}-reservas`}>Máximo de reservas gratuitas por persona</label>
        <input id={`${id}-reservas`} inputMode="numeric" value={reservas} onChange={(e) => setReservas(e.target.value.replace(/\D/g, ''))} required={!(nueva && base)} />
      </div>
      {!nueva && <p className={estilos.ayuda}>Cambiar el precio no afecta a los pedidos ya hechos: rige para los siguientes.</p>}
      <div className={estilos.acciones}>
        <button type="submit">{nueva ? 'Crear la edición' : 'Guardar los parámetros'}</button>
      </div>
    </form>
  );
}

/** `/admin/ediciones` (US6): crear ediciones a partir de otra y cambiar sus parámetros. */
export default function EdicionesPage() {
  const [ediciones, setEdiciones] = useState<Edicion[]>([]);
  const [elegida, setElegida] = useState<Edicion | null>(null);
  const [mensajeOk, setMensajeOk] = useState('');
  const [advertencias, setAdvertencias] = useState<string[]>([]);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      setEdiciones([...(await apiOperacion.ediciones())].sort((a, b) => b.anio - a.anio));
    } catch (e) {
      setError(mensaje(e));
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const resultado = async (accion: () => Promise<Edicion & { advertencias: string[] }>, texto: string) => {
    setError('');
    setMensajeOk('');
    try {
      const r = await accion();
      setAdvertencias(r.advertencias);
      setMensajeOk(texto.replace('{anio}', String(r.anio)));
      setElegida(null);
      await cargar();
    } catch (e) {
      setError(mensaje(e));
    }
  };

  return (
    <>
      <h1>Ediciones del festival</h1>
      <div role="status" aria-live="polite" className={mensajeOk ? estilos.exito : undefined}>
        {mensajeOk}
        {advertencias.length > 0 && <> Atención: {advertencias.join(' ')}</>}
      </div>
      {error && (
        <p role="alert" className={estilos.resumen}>
          {error}
        </p>
      )}
      <ul className={estilos.obras}>
        {ediciones.map((e) => (
          <li key={e.id} className={estilos.obra}>
            <h2>{e.anio} · Edición {e.numero}</h2>
            <p className={estilos.ayuda}>
              Del {e.fechaInicio} al {e.fechaFin} · {ESTADOS[e.estado]} · Entrada {dolares(e.precioCentavos ?? 0)} · Hasta {e.maxPagadasPersona} pagadas y {e.maxReservasPersona} reservas por persona
              {e.paisInvitado ? ` · País invitado: ${e.paisInvitado}` : ''}
            </p>
            {e.estado !== 'cerrada' && (
              <button type="button" className={estilos.secundario} onClick={() => setElegida(e)}>
                Cambiar parámetros<span className="solo-lectores"> de la edición {e.anio}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
      {elegida ? (
        <FormEdicion
          key={elegida.id}
          inicial={elegida}
          ediciones={ediciones}
          etiqueta={`Parámetros de la edición ${elegida.anio}`}
          onGuardar={(d) => resultado(() => apiOperacion.actualizarEdicion(elegida.id, elegida.version, d), 'Parámetros de la edición {anio} guardados.')}
        />
      ) : (
        <FormEdicion inicial={null} ediciones={ediciones} etiqueta="Crear una edición" onGuardar={(d) => resultado(() => apiOperacion.crearEdicion(d), 'Edición {anio} creada.')} />
      )}
    </>
  );
}
