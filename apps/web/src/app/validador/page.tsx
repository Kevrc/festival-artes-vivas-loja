'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PanelSesionDev } from '@/components/boleteria/panel-sesion-dev';
import { apiBoleteria } from '@/lib/boleteria/api-boleteria';
import { cargarCatalogoOperacion } from '@/lib/boleteria/cartelera-operacion';
import { type PaqueteLocal, crearAlmacenValidador } from '@/lib/boleteria/validador-offline';
import { diaDeInstante, formatoDia, formatoHora } from '@/lib/cartelera/formato';
import type { FuncionResumen } from '@/lib/cartelera/tipos';

/** Selección de función y descarga de paquete cifrado/firmado para operación sin conexión (T037). */
export default function ValidadorInicioPage() {
  const [funciones, setFunciones] = useState<FuncionResumen[]>([]);
  const [funcionId, setFuncionId] = useState('');
  const [paqueteLocal, setPaqueteLocal] = useState<PaqueteLocal | null>(null);
  const [colaCount, setColaCount] = useState(0);
  const [descargando, setDescargando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void cargarCatalogoOperacion().then((cat) => {
      const conAcceso = cat.funciones.filter((f) => f.tipoAcceso !== 'gratuita_libre');
      setFunciones(conAcceso);
      if (conAcceso[0]) setFuncionId((prev) => prev || conAcceso[0]!.id);
    });
  }, []);

  useEffect(() => {
    const id = funcionId.trim();
    if (!id) return;
    const almacen = crearAlmacenValidador();
    void Promise.all([almacen.obtenerPaquete(id), almacen.listarCola()]).then(([paq, cola]) => {
      setPaqueteLocal(paq);
      setColaCount(cola.filter((c) => c.funcionId === id).length);
    });
  }, [funcionId]);

  async function descargarPaquete(ev: React.FormEvent) {
    ev.preventDefault();
    const id = funcionId.trim();
    if (!id) return;
    setDescargando(true);
    setError(null);
    setMensaje(null);
    try {
      const paq = await apiBoleteria.descargarPaqueteValidador(id);
      const desfaseMs = Date.parse(paq.horaServidor) - Date.now();
      const local: PaqueteLocal = {
        ...paq,
        desfaseMs,
        descargadoEn: new Date().toISOString(),
      };
      const almacen = crearAlmacenValidador();
      await almacen.guardarPaquete(local);
      setPaqueteLocal(local);
      setMensaje(`Paquete descargado y guardado sin conexión (${local.entradas.length} entradas).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar el paquete de validación.');
    } finally {
      setDescargando(false);
    }
  }

  return (
    <section aria-labelledby="titulo-validador">
      <h1 id="titulo-validador">Control de acceso en puerta</h1>
      <PanelSesionDev rolSugerido="validador" onCambio={() => {}} />

      <form className="form-boleteria" onSubmit={descargarPaquete}>
        {funciones.length > 0 && (
          <div className="campo-boleteria">
            <label htmlFor="val-funcion-select">Función programada</label>
            <select
              id="val-funcion-select"
              value={funcionId}
              onChange={(e) => setFuncionId(e.target.value)}
            >
              {funciones.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.obra.titulo} · {formatoDia(diaDeInstante(f.inicio))} {formatoHora(f.inicio)} ({f.sede.nombre})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="campo-boleteria">
          <label htmlFor="val-funcion-id">ID de función (UUID)</label>
          <input
            id="val-funcion-id"
            type="text"
            required
            value={funcionId}
            onChange={(e) => setFuncionId(e.target.value)}
          />
        </div>
        <div className="tarjeta-acciones">
          <button type="submit" disabled={descargando || !funcionId.trim()}>
            {descargando ? 'Descargando…' : 'Descargar paquete sin conexión'}
          </button>
          {funcionId.trim() && (
            <Link className="boton boton-favorito" href={`/validador/${funcionId.trim()}`}>
              Ir a puerta de validación
            </Link>
          )}
        </div>
      </form>

      {mensaje && (
        <p className="aviso" role="status" aria-live="polite">
          {mensaje}
        </p>
      )}
      {error && (
        <p className="aviso" role="alert">
          {error}
        </p>
      )}

      {paqueteLocal && (
        <aside className="ficha" aria-label="Estado del paquete local">
          <h2>Paquete listo en el dispositivo</h2>
          <p className="detalle">
            Entradas cargadas: <strong>{paqueteLocal.entradas.length}</strong> · Ingresos pendientes de sincronizar:{' '}
            <strong>{colaCount}</strong>
          </p>
          <p>
            <Link className="boton" href={`/validador/${paqueteLocal.funcionId}`}>
              Abrir escáner y código manual
            </Link>
          </p>
        </aside>
      )}
    </section>
  );
}
