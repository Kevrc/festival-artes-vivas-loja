'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatoCodigoCorto, nuevaClaveIdempotencia } from '@/components/boleteria/formato-boleteria';
import { PanelSesionDev } from '@/components/boleteria/panel-sesion-dev';
import { type ResultadoValidacion, apiBoleteria } from '@/lib/boleteria/api-boleteria';
import { crearAlmacenValidador, validarLocalmenteOffline } from '@/lib/boleteria/validador-offline';
import { formatoHora } from '@/lib/cartelera/formato';

const CLAVE_DISPOSITIVO = 'fiavl.validador.dispositivoId';

/** Escaneo QR, ingreso manual de código corto y sincronización offline en puerta (T037). */
export default function ValidadorPuertaPage() {
  const params = useParams<{ funcionId: string }>();
  const funcionId = params.funcionId;

  const [dispositivoId, setDispositivoId] = useState('dispositivo-puerta');
  const [puerta, setPuerta] = useState('Puerta Principal');
  const [valorInput, setValorInput] = useState('');
  const [enLinea, setEnLinea] = useState(true);
  const [simularOffline, setSimularOffline] = useState(false);
  const [colaCount, setColaCount] = useState(0);
  const [resultado, setResultado] = useState<ResultadoValidacion | null>(null);
  const [mensajeSync, setMensajeSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [camaraActiva, setCamaraActiva] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const refrescarCola = useCallback(async () => {
    const cola = await crearAlmacenValidador().listarCola();
    setColaCount(cola.filter((c) => c.funcionId === funcionId).length);
  }, [funcionId]);

  useEffect(() => {
    let guardado = window.localStorage.getItem(CLAVE_DISPOSITIVO);
    if (!guardado) {
      guardado = nuevaClaveIdempotencia();
      window.localStorage.setItem(CLAVE_DISPOSITIVO, guardado);
    }
    setDispositivoId(guardado);
    setEnLinea(navigator.onLine);
    void refrescarCola();

    const alConectar = () => setEnLinea(true);
    const alDesconectar = () => setEnLinea(false);
    window.addEventListener('online', alConectar);
    window.addEventListener('offline', alDesconectar);
    return () => {
      window.removeEventListener('online', alConectar);
      window.removeEventListener('offline', alDesconectar);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [refrescarCola]);

  const procesarCodigo = useCallback(
    async (crudo: string) => {
      const limpio = crudo.trim();
      if (!limpio) return;
      setError(null);
      setMensajeSync(null);
      const esTokenQr = limpio.startsWith('v1.');
      const payload = {
        funcionId,
        dispositivoId,
        puerta: puerta.trim() || 'Puerta Principal',
        ...(esTokenQr ? { tokenQr: limpio } : { codigoCorto: limpio }),
      };

      const almacen = crearAlmacenValidador();
      const usarOffline = simularOffline || !enLinea || !navigator.onLine;
      if (!usarOffline) {
        try {
          const res = await apiBoleteria.validarEnLinea(payload);
          setResultado(res);
          setValorInput('');
          return;
        } catch (e) {
          if (!(e instanceof TypeError)) {
            setError(e instanceof Error ? e.message : 'Error al validar la entrada.');
            return;
          }
        }
      }

      const resOffline = await validarLocalmenteOffline({
        almacen,
        funcionId,
        dispositivoId,
        puerta: payload.puerta,
        ...(esTokenQr ? { tokenQr: limpio } : { codigoCorto: limpio }),
      });
      setResultado(resOffline);
      setValorInput('');
      await refrescarCola();
    },
    [dispositivoId, enLinea, funcionId, puerta, refrescarCola, simularOffline],
  );

  async function manejarFormulario(ev: React.FormEvent) {
    ev.preventDefault();
    await procesarCodigo(valorInput);
  }

  async function sincronizar() {
    setError(null);
    setMensajeSync(null);
    try {
      const almacen = crearAlmacenValidador();
      const cola = (await almacen.listarCola()).filter((c) => c.funcionId === funcionId);
      if (cola.length === 0) {
        setMensajeSync('No hay ingresos pendientes por sincronizar.');
        return;
      }
      const res = await apiBoleteria.sincronizarIngresos(cola);
      await almacen.limpiarCola(funcionId);
      await refrescarCola();
      setMensajeSync(
        `Sincronización completa: ${res.aplicados} aplicado(s), ${res.duplicados} duplicado(s), ${res.conflictos.length} conflicto(s).`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo sincronizar con el servidor.');
    }
  }

  async function alternarCamara() {
    if (camaraActiva) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCamaraActiva(false);
      return;
    }
    const Detector = (window as unknown as {
      BarcodeDetector?: new (opts?: { formats: string[] }) => {
        detect(src: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
      };
    }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador no dispone de cámara o lector QR nativo; usa el código corto manual.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setCamaraActiva(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new Detector({ formats: ['qr_code'] });
      const detectar = async () => {
        if (!streamRef.current || !videoRef.current) return;
        const encontrados = await detector.detect(videoRef.current);
        const primero = encontrados[0]?.rawValue;
        if (primero) {
          await procesarCodigo(primero);
          return;
        }
        requestAnimationFrame(() => void detectar());
      };
      requestAnimationFrame(() => void detectar());
    } catch {
      setError('No se pudo acceder a la cámara; usa el ingreso manual.');
    }
  }

  const tituloSemaforo: Record<ResultadoValidacion['semaforo'], string> = {
    verde: '✓ ACCESO PERMITIDO',
    ambar: '⚠ AVISO: LECTURA RECIENTE',
    rojo: '✕ ACCESO DENEGADO',
  };

  return (
    <section aria-labelledby="titulo-puerta">
      <p className="sobretitulo">
        <Link href="/validador">← Cambiar función</Link> · <Link href={`/sala/${funcionId}`}>Ocupación en vivo</Link>
      </p>
      <h1 id="titulo-puerta">Validación en puerta</h1>
      <PanelSesionDev rolSugerido="validador" onCambio={() => {}} />

      <p className="aviso" role="status" aria-live="polite">
        Estado de red:{' '}
        <strong data-testid="modo-red">
          {simularOffline || !enLinea ? 'Sin conexión (paquete local)' : 'En línea'}
        </strong>{' '}
        · Pendientes por sincronizar: <strong data-testid="cola-pendiente">{colaCount}</strong>
      </p>

      <form className="form-boleteria" onSubmit={manejarFormulario}>
        <div className="campo-boleteria">
          <label htmlFor="puerta-nombre">Puerta</label>
          <input
            id="puerta-nombre"
            type="text"
            value={puerta}
            onChange={(e) => setPuerta(e.target.value)}
          />
        </div>
        <div className="campo-boleteria">
          <label htmlFor="codigo-manual">Código corto o contenido QR</label>
          <input
            id="codigo-manual"
            type="text"
            placeholder="Ej. AB34-CD56 o token v1..."
            value={valorInput}
            onChange={(e) => setValorInput(e.target.value)}
          />
        </div>
        <div>
          <label>
            <input
              type="checkbox"
              checked={simularOffline}
              onChange={(e) => setSimularOffline(e.target.checked)}
            />{' '}
            Operar en modo sin conexión local
          </label>
        </div>
        <div className="tarjeta-acciones">
          <button type="submit">Validar entrada</button>
          <button type="button" className="boton-favorito" onClick={() => void alternarCamara()}>
            {camaraActiva ? 'Detener cámara' : 'Escanear con cámara'}
          </button>
          <button type="button" className="boton-favorito" onClick={() => void sincronizar()}>
            Sincronizar ingresos ({colaCount})
          </button>
        </div>
      </form>

      {camaraActiva && (
        <div>
          <video ref={videoRef} muted playsInline style={{ maxWidth: '100%', borderRadius: '8px' }} />
        </div>
      )}

      {mensajeSync && (
        <p className="aviso" role="status" aria-live="polite">
          {mensajeSync}
        </p>
      )}
      {error && (
        <p className="aviso" role="alert">
          {error}
        </p>
      )}

      {resultado && (
        <div
          className={`panel-semaforo semaforo-${resultado.semaforo}`}
          role="status"
          aria-live="assertive"
          data-testid="resultado-semaforo"
          data-semaforo={resultado.semaforo}
        >
          <h2>{tituloSemaforo[resultado.semaforo]}</h2>
          <p>{resultado.mensaje}</p>
          <p className="detalle">
            Motivo: <code>{resultado.codigo}</code>
            {resultado.entradaId ? ` · Entrada ${formatoCodigoCorto(resultado.entradaId.slice(0, 8))}` : ''}
            {resultado.puertaAnterior ? ` · ${resultado.puertaAnterior}` : ''}
          </p>
          {resultado.funcionCorrecta && (
            <p className="detalle">
              Función correcta: <strong>{resultado.funcionCorrecta.obraTitulo}</strong>
              {resultado.funcionCorrecta.inicio ? ` · ${formatoHora(resultado.funcionCorrecta.inicio)}` : ''}
              {resultado.funcionCorrecta.sedeNombre ? ` · ${resultado.funcionCorrecta.sedeNombre}` : ''}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
