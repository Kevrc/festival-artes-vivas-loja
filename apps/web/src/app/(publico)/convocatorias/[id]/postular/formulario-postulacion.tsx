'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from '../../convocatorias.module.css';
import { API_CONVOCATORIAS, respuestaApi } from '@/lib/convocatorias/api';

interface DatosIniciales {
  id: string; elenco: Record<string, unknown>; tituloObra: string; disciplina: string; sinopsis: string;
  duracionMin: number; publico: string; fichaTecnica: Record<string, unknown>; videoUrl: string | null;
}

const vacio = {
  nombre: '', responsable: '', correoContacto: '', provinciaPais: '', trayectoria: '', integrantes: '',
  titulo: '', disciplina: '', sinopsis: '', duracionMin: '', publico: '', montaje: '', integrantesEnGira: '',
  videoUrl: '',
};

export function FormularioPostulacion({ convocatoriaId }: { convocatoriaId: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const editarId = search.get('postulacionId');
  const [postulacionId, setPostulacionId] = useState(editarId);
  const [campos, setCampos] = useState(vacio);
  const [cargando, setCargando] = useState(Boolean(editarId));
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [faltantes, setFaltantes] = useState<string[]>([]);
  const [dossier, setDossier] = useState<File | null>(null);
  const [ficha, setFicha] = useState<File | null>(null);

  useEffect(() => {
    if (!editarId) return;
    respuestaApi<DatosIniciales>(`/postulaciones/${editarId}`).then((p) => {
      const elenco = p.elenco;
      const fichaTecnica = p.fichaTecnica;
      setCampos({
        nombre: String(elenco.nombre ?? ''), responsable: String(elenco.responsable ?? ''), correoContacto: String(elenco.correoContacto ?? ''),
        provinciaPais: String(elenco.provinciaPais ?? ''), trayectoria: String(elenco.trayectoria ?? ''),
        integrantes: Array.isArray(elenco.integrantes) ? elenco.integrantes.join(', ') : '',
        titulo: p.tituloObra, disciplina: p.disciplina, sinopsis: p.sinopsis, duracionMin: String(p.duracionMin), publico: p.publico,
        montaje: String(fichaTecnica.montaje ?? ''), integrantesEnGira: String(fichaTecnica.integrantesEnGira ?? ''), videoUrl: p.videoUrl ?? '',
      });
    }).catch((error: Error) => setMensaje(error.message)).finally(() => setCargando(false));
  }, [editarId]);

  function cambiar(campo: keyof typeof vacio, valor: string) { setCampos((anterior) => ({ ...anterior, [campo]: valor })); }

  async function guardar(enviar: boolean) {
    setOcupado(true); setMensaje(''); setFaltantes([]);
    try {
      const body = {
        elenco: { nombre: campos.nombre, responsable: campos.responsable, correoContacto: campos.correoContacto, provinciaPais: campos.provinciaPais, trayectoria: campos.trayectoria,
          integrantes: campos.integrantes.split(',').map((nombre) => nombre.trim()).filter(Boolean) },
        obra: { titulo: campos.titulo, disciplina: campos.disciplina, sinopsis: campos.sinopsis, duracionMin: Number(campos.duracionMin) || 0,
          publico: campos.publico, fichaTecnica: { ...(campos.montaje ? { montaje: campos.montaje } : {}), ...(Number(campos.integrantesEnGira) ? { integrantesEnGira: Number(campos.integrantesEnGira) } : {}) }, videoUrl: campos.videoUrl || null },
      };
      const p = postulacionId
        ? await respuestaApi<{ id: string }>(`/postulaciones/${postulacionId}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await respuestaApi<{ id: string }>('/postulaciones', { method: 'POST', body: JSON.stringify({ ...body, convocatoriaId }) });
      setPostulacionId(p.id);
      for (const [archivo, tipo] of [[dossier, 'dossier'], [ficha, 'ficha_tecnica']] as const) {
        if (!archivo) continue;
        const data = new FormData(); data.set('tipo', tipo); data.set('archivo', archivo);
        const response = await fetch(`${API_CONVOCATORIAS}/postulaciones/${p.id}/documentos`, { method: 'POST', headers: { 'x-cuenta-dev': cuenta(), 'x-rol-dev': 'postulante' }, body: data });
        if (!response.ok) throw new Error((await response.json()).detail ?? `No se pudo cargar ${archivo.name}`);
      }
      if (enviar) {
        try {
          await respuestaApi(`/postulaciones/${p.id}/enviar`, { method: 'POST' });
        } catch (error) {
          const conFaltantes = error as Error & { faltantes?: string[] };
          setFaltantes(conFaltantes.faltantes ?? []);
          throw error;
        }
      }
      router.push(`/mis-postulaciones/${p.id}`);
      router.refresh();
    } catch (error) { setMensaje((error as Error).message); }
    finally { setOcupado(false); }
  }

  function cuenta() {
    let id = localStorage.getItem('fiavl-convocatorias-cuenta');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('fiavl-convocatorias-cuenta', id); }
    return id;
  }

  if (cargando) return <p role="status">Cargando borrador…</p>;
  return (
    <form className={styles.formulario} onSubmit={(event) => { event.preventDefault(); void guardar(false); }}>
      <p>Completa el perfil del elenco y la ficha de la obra. Puedes guardar avances y volver antes del cierre.</p>
      {mensaje ? <div className={styles.errores} role="alert"><strong>No se pudo completar la acción</strong><p>{mensaje}</p></div> : null}
      {faltantes.length ? <section className={styles.errores} aria-labelledby="faltantes-titulo"><h2 id="faltantes-titulo">Requisitos pendientes</h2><ul>{faltantes.map((f) => <li key={f}>{f}</li>)}</ul></section> : null}
      <fieldset>
        <legend>Perfil del elenco</legend>
        <div className={styles.grupo}>
          <Campo id="elenco-nombre" etiqueta="Nombre del elenco" value={campos.nombre} onChange={(v) => cambiar('nombre', v)} />
          <Campo id="responsable" etiqueta="Persona responsable" value={campos.responsable} onChange={(v) => cambiar('responsable', v)} />
          <Campo id="correo" etiqueta="Correo de contacto" type="email" value={campos.correoContacto} onChange={(v) => cambiar('correoContacto', v)} />
          <Campo id="provincia" etiqueta="Provincia o país" value={campos.provinciaPais} onChange={(v) => cambiar('provinciaPais', v)} />
          <Campo id="integrantes" etiqueta="Integrantes (separados por coma)" value={campos.integrantes} onChange={(v) => cambiar('integrantes', v)} />
        </div>
        <Campo id="trayectoria" etiqueta="Trayectoria" multiline value={campos.trayectoria} onChange={(v) => cambiar('trayectoria', v)} />
      </fieldset>
      <fieldset>
        <legend>Ficha de la obra</legend>
        <div className={styles.grupo}>
          <Campo id="titulo" etiqueta="Título de la obra" value={campos.titulo} onChange={(v) => cambiar('titulo', v)} />
          <Campo id="disciplina" etiqueta="Disciplina" value={campos.disciplina} onChange={(v) => cambiar('disciplina', v)} />
          <Campo id="duracion" etiqueta="Duración en minutos" type="number" value={campos.duracionMin} onChange={(v) => cambiar('duracionMin', v)} />
          <Campo id="publico" etiqueta="Público" value={campos.publico} onChange={(v) => cambiar('publico', v)} />
          <Campo id="montaje" etiqueta="Necesidades de montaje" value={campos.montaje} onChange={(v) => cambiar('montaje', v)} />
          <Campo id="integrantes-gira" etiqueta="Número de integrantes en gira" type="number" value={campos.integrantesEnGira} onChange={(v) => cambiar('integrantesEnGira', v)} />
          <Campo id="video" etiqueta="Enlace de video (YouTube o Vimeo)" type="url" value={campos.videoUrl} onChange={(v) => cambiar('videoUrl', v)} />
        </div>
        <Campo id="sinopsis" etiqueta="Sinopsis" multiline value={campos.sinopsis} onChange={(v) => cambiar('sinopsis', v)} />
      </fieldset>
      <fieldset>
        <legend>Documentos obligatorios</legend>
        <label className={styles.campo} htmlFor="dossier">Dossier (PDF, JPEG o PNG; máximo 10 MB = 10 000 000 bytes)
          <input id="dossier" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(e) => setDossier(e.target.files?.[0] ?? null)} />
        </label>
        <label className={styles.campo} htmlFor="ficha-tecnica">Ficha técnica (PDF, JPEG o PNG; máximo 10 MB = 10 000 000 bytes)
          <input id="ficha-tecnica" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(e) => setFicha(e.target.files?.[0] ?? null)} />
        </label>
      </fieldset>
      <div className={styles.acciones}>
        <button type="submit" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar borrador'}</button>
        <button type="button" disabled={ocupado} onClick={() => void guardar(true)}>Guardar y enviar</button>
      </div>
    </form>
  );
}

function Campo({ id, etiqueta, value, onChange, type = 'text', multiline = false }: { id: string; etiqueta: string; value: string; onChange: (value: string) => void; type?: string; multiline?: boolean }) {
  return <label className={styles.campo} htmlFor={id}>{etiqueta}{multiline
    ? <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    : <input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} />}</label>;
}
