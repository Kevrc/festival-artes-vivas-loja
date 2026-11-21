'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from '../../(publico)/convocatorias/convocatorias.module.css';
import { documentosVigentes, encabezadosCoordinacion, fechaEcuador, respuestaApi } from '@/lib/convocatorias/api';

interface Resumen {
  id: string; numero: string; estado: string; tituloObra: string; disciplina: string; enviadaEn: string | null; subsanarHasta: string | null;
  convocatoria: { codigo: string; componente: string; provincia: string | null };
  elenco: { nombre: string; responsable: string; provinciaPais: string };
  documentos: Array<{ id: string; tipo: string; nombreOriginal: string; bytes: number }>;
}
type Decision = 'admitir' | 'subsanar' | 'no_admitir';

const ESTADOS = [
  { valor: '', etiqueta: 'Pendientes (enviadas y en subsanación)' },
  { valor: 'enviada', etiqueta: 'Enviadas' },
  { valor: 'requiere_subsanacion', etiqueta: 'En subsanación' },
  { valor: 'admitida', etiqueta: 'Admitidas' },
  { valor: 'no_admitida', etiqueta: 'No admitidas' },
];

export function PanelAdmisibilidad() {
  const [estado, setEstado] = useState('');
  const [items, setItems] = useState<Resumen[] | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    try {
      setError('');
      setItems(await respuestaApi<Resumen[]>(`/panel/postulaciones${estado ? `?estado=${estado}` : ''}`, { headers: encabezadosCoordinacion() }));
    } catch (e) { setError((e as Error).message); }
  }, [estado]);
  useEffect(() => { void cargar(); }, [cargar]);

  async function resolver(id: string, numero: string, decision: Decision, texto: string) {
    setError(''); setAviso('');
    try {
      const cuerpo = decision === 'subsanar' ? { decision, detalle: texto } : { decision, motivo: texto || null };
      const r = await respuestaApi<{ estado: string }>(`/panel/postulaciones/${id}/admisibilidad`, { method: 'POST', body: JSON.stringify(cuerpo), headers: encabezadosCoordinacion() });
      setAviso(`Postulación ${numero}: ahora está ${r.estado.replace('_', ' ')}.`);
      await cargar();
    } catch (e) { setError((e as Error).message); }
  }

  async function descargar(id: string) {
    try {
      const { url } = await respuestaApi<{ url: string }>(`/documentos/${id}/descarga`, { headers: encabezadosCoordinacion() });
      window.location.assign(url);
    } catch (e) { setError((e as Error).message); }
  }

  return <>
    <p className="sobretitulo">Coordinación de convocatorias</p>
    <h1>Admisibilidad de postulaciones</h1>
    <p>Revisa cada postulación, pide una corrección (el elenco dispone de 72 horas) o decide su admisión.</p>
    <label className={styles.campo} htmlFor="filtro-estado">Estado
      <select id="filtro-estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
        {ESTADOS.map((e) => <option key={e.valor} value={e.valor}>{e.etiqueta}</option>)}
      </select>
    </label>
    {error ? <div role="alert" className={styles.errores}><strong>No se pudo completar la acción</strong><p>{error}</p></div> : null}
    <p role="status">{aviso}</p>
    {items === null ? <p role="status">Cargando postulaciones…</p> : items.length === 0 ? <p>No hay postulaciones en este estado.</p> :
      <ul className={styles.lista} aria-label="Postulaciones">{items.map((p) => <li key={p.id}>
        <Tarjeta p={p} onResolver={resolver} onDescargar={descargar} />
      </li>)}</ul>}
  </>;
}

function Tarjeta({ p, onResolver, onDescargar }: {
  p: Resumen; onResolver: (id: string, numero: string, d: Decision, texto: string) => Promise<void>; onDescargar: (id: string) => Promise<void>;
}) {
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [local, setLocal] = useState('');
  const revisable = p.estado === 'enviada';
  const idTexto = `texto-${p.id}`;

  async function decidir(decision: Decision) {
    if (decision !== 'admitir' && !texto.trim()) {
      setLocal(decision === 'subsanar' ? 'Describe qué debe corregir el elenco.' : 'El motivo es obligatorio para no admitir.');
      return;
    }
    setLocal(''); setOcupado(true);
    await onResolver(p.id, p.numero, decision, texto.trim());
    setOcupado(false);
  }

  return <article className={styles.tarjeta} aria-labelledby={`t-${p.id}`}>
    <h2 id={`t-${p.id}`}>{p.numero} · {p.tituloObra}</h2>
    <p><span className={styles.estado}>Estado: {p.estado.replace('_', ' ')}</span></p>
    <p>Elenco: {p.elenco.nombre} ({p.elenco.responsable}) · {p.elenco.provinciaPais}</p>
    <p>Convocatoria {p.convocatoria.codigo} · {p.disciplina}</p>
    {p.subsanarHasta ? <p>Plazo de corrección hasta {fechaEcuador(p.subsanarHasta)} (hora de Ecuador)</p> : null}
    {p.documentos.length ? <ul>{documentosVigentes(p.documentos).map((d) => <li key={d.id}>
      <button type="button" className="boton-favorito" onClick={() => void onDescargar(d.id)}>Descargar {d.nombreOriginal} ({p.numero})</button>
    </li>)}</ul> : <p>Sin documentos.</p>}
    {revisable ? <div>
      <label className={styles.campo} htmlFor={idTexto}>Detalle de la corrección o motivo
        <textarea id={idTexto} value={texto} onChange={(e) => setTexto(e.target.value)} aria-describedby={local ? `${idTexto}-error` : undefined} />
      </label>
      {local ? <p id={`${idTexto}-error`} role="alert" className={styles.errores}>{local}</p> : null}
      <div className={styles.acciones}>
        <button type="button" disabled={ocupado} aria-label={`Admitir ${p.numero}`} onClick={() => void decidir('admitir')}>Admitir</button>
        <button type="button" disabled={ocupado} className="boton-favorito" aria-label={`Pedir subsanación de ${p.numero}`} onClick={() => void decidir('subsanar')}>Pedir subsanación</button>
        <button type="button" disabled={ocupado} className="boton-favorito" aria-label={`No admitir ${p.numero}`} onClick={() => void decidir('no_admitir')}>No admitir</button>
      </div>
    </div> : null}
  </article>;
}
