import type { IngresoOfflineItem, PaqueteValidador, ResultadoValidacion } from './api-boleteria';

export interface PaqueteLocal extends PaqueteValidador {
  desfaseMs: number;
  descargadoEn: string;
}

export interface AlmacenValidador {
  guardarPaquete(paquete: PaqueteLocal): Promise<void>;
  obtenerPaquete(funcionId: string): Promise<PaqueteLocal | null>;
  encolarIngreso(item: IngresoOfflineItem): Promise<void>;
  listarCola(): Promise<IngresoOfflineItem[]>;
  limpiarCola(funcionId?: string): Promise<void>;
}

const DB_NOMBRE = 'fiavl-validador';
const DB_VERSION = 1;
const STORE_PAQUETES = 'paquetes';
const STORE_COLA = 'colaIngresos';

function bytesDesdeBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesDesdeBase64Url(b64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  return bytesDesdeBase64(b64url.replace(/-/g, '+').replace(/_/g, '/') + pad);
}

/** Verifica la firma Ed25519 del QR en el navegador sin conocer la llave privada (ADR-0005). */
export async function verificarTokenQrWeb(
  tokenQr: string,
  llavePublicaSpkiBase64: string,
): Promise<{ valido: true; entradaId: string; funcionId: string } | { valido: false }> {
  const partes = tokenQr.trim().split('.');
  if (partes.length !== 5 || partes[0] !== 'v1') return { valido: false };
  const [, entradaId, funcionId, epochStr, firmaB64Url] = partes;
  if (!entradaId || !funcionId || !epochStr || !firmaB64Url) return { valido: false };
  try {
    const carga = new TextEncoder().encode(`v1.${entradaId}.${funcionId}.${epochStr}`);
    const llave = await globalThis.crypto.subtle.importKey(
      'spki',
      bytesDesdeBase64(llavePublicaSpkiBase64),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    const ok = await globalThis.crypto.subtle.verify(
      'Ed25519',
      llave,
      bytesDesdeBase64Url(firmaB64Url),
      carga,
    );
    return ok ? { valido: true, entradaId, funcionId } : { valido: false };
  } catch {
    return { valido: false };
  }
}

export function normalizarCodigo(codigo: string): string {
  return codigo.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Almacén en IndexedDB con fallback en memoria para entornos de prueba sin DOM. */
export function crearAlmacenValidador(): AlmacenValidador {
  if (typeof indexedDB === 'undefined') {
    const paquetes = new Map<string, PaqueteLocal>();
    let cola: IngresoOfflineItem[] = [];
    return {
      async guardarPaquete(p) {
        paquetes.set(p.funcionId, p);
      },
      async obtenerPaquete(id) {
        return paquetes.get(id) ?? null;
      },
      async encolarIngreso(item) {
        cola.push(item);
      },
      async listarCola() {
        return [...cola];
      },
      async limpiarCola(funcionId) {
        cola = funcionId ? cola.filter((c) => c.funcionId !== funcionId) : [];
      },
    };
  }

  /* v8 ignore start -- adaptador DOM IndexedDB cubierto por pruebas E2E en navegador real */
  const abrir = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NOMBRE, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_PAQUETES)) {
          db.createObjectStore(STORE_PAQUETES, { keyPath: 'funcionId' });
        }
        if (!db.objectStoreNames.contains(STORE_COLA)) {
          db.createObjectStore(STORE_COLA, { autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

  return {
    async guardarPaquete(paquete) {
      const db = await abrir();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_PAQUETES, 'readwrite');
        tx.objectStore(STORE_PAQUETES).put(paquete);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    async obtenerPaquete(funcionId) {
      const db = await abrir();
      const res = await new Promise<PaqueteLocal | null>((resolve, reject) => {
        const tx = db.transaction(STORE_PAQUETES, 'readonly');
        const r = tx.objectStore(STORE_PAQUETES).get(funcionId);
        r.onsuccess = () => resolve((r.result as PaqueteLocal | undefined) ?? null);
        r.onerror = () => reject(r.error);
      });
      db.close();
      return res;
    },
    async encolarIngreso(item) {
      const db = await abrir();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_COLA, 'readwrite');
        tx.objectStore(STORE_COLA).add(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    async listarCola() {
      const db = await abrir();
      const res = await new Promise<IngresoOfflineItem[]>((resolve, reject) => {
        const tx = db.transaction(STORE_COLA, 'readonly');
        const r = tx.objectStore(STORE_COLA).getAll();
        r.onsuccess = () => resolve((r.result as IngresoOfflineItem[]) ?? []);
        r.onerror = () => reject(r.error);
      });
      db.close();
      return res;
    },
    async limpiarCola(funcionId) {
      const db = await abrir();
      if (!funcionId) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_COLA, 'readwrite');
          tx.objectStore(STORE_COLA).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } else {
        const actuales = await this.listarCola();
        const restantes = actuales.filter((c) => c.funcionId !== funcionId);
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_COLA, 'readwrite');
          const store = tx.objectStore(STORE_COLA);
          store.clear();
          for (const item of restantes) store.add(item);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
      db.close();
    },
  };
  /* v8 ignore stop */
}

/** Valida localmente en < 2 s contra el paquete descargado y encola el ingreso offline. */
export async function validarLocalmenteOffline(p: {
  almacen: AlmacenValidador;
  funcionId: string;
  tokenQr?: string;
  codigoCorto?: string;
  dispositivoId: string;
  puerta: string;
  ahora?: Date;
}): Promise<ResultadoValidacion> {
  const paquete = await p.almacen.obtenerPaquete(p.funcionId);
  if (!paquete) {
    return {
      semaforo: 'rojo',
      codigo: 'no_encontrada',
      mensaje: 'No hay paquete descargado para operar sin conexión.',
      entradaId: null,
      usadaEn: null,
      puertaAnterior: null,
      funcionCorrecta: null,
    };
  }

  let entradaIdBuscada: string | undefined;
  if (p.tokenQr) {
    const verif = await verificarTokenQrWeb(p.tokenQr, paquete.llavePublicaEd25519Spki);
    if (!verif.valido) {
      return {
        semaforo: 'rojo',
        codigo: 'firma_invalida',
        mensaje: 'Código QR inválido o alterado.',
        entradaId: null,
        usadaEn: null,
        puertaAnterior: null,
        funcionCorrecta: null,
      };
    }
    if (verif.funcionId !== p.funcionId) {
      return {
        semaforo: 'rojo',
        codigo: 'otra_funcion',
        mensaje: 'Esta entrada corresponde a otra función.',
        entradaId: verif.entradaId,
        usadaEn: null,
        puertaAnterior: null,
        funcionCorrecta: null,
      };
    }
    entradaIdBuscada = verif.entradaId;
  }

  const codigoLimpio = p.codigoCorto ? normalizarCodigo(p.codigoCorto) : undefined;
  const entrada = paquete.entradas.find((e) =>
    entradaIdBuscada ? e.id === entradaIdBuscada : e.codigoCorto === codigoLimpio,
  );

  if (!entrada) {
    return {
      semaforo: 'rojo',
      codigo: 'no_encontrada',
      mensaje: 'Entrada no encontrada en la lista descargada.',
      entradaId: null,
      usadaEn: null,
      puertaAnterior: null,
      funcionCorrecta: null,
    };
  }

  const ahoraLocal = p.ahora ?? new Date();
  const ahoraEfectivoMs = ahoraLocal.getTime() + paquete.desfaseMs;
  const ventanaInicioMs = Date.parse(paquete.ventanaInicio);
  const finMs = Date.parse(paquete.fin);
  if (ahoraEfectivoMs < ventanaInicioMs || ahoraEfectivoMs > finMs) {
    return {
      semaforo: 'rojo',
      codigo: 'fuera_de_horario',
      mensaje: 'Validación disponible desde 60 minutos antes hasta el fin de la función.',
      entradaId: entrada.id,
      usadaEn: null,
      puertaAnterior: null,
      funcionCorrecta: null,
    };
  }

  if (entrada.estado === 'anulada') {
    return {
      semaforo: 'rojo',
      codigo: 'anulada',
      mensaje: 'Entrada anulada por cancelación o devolución.',
      entradaId: entrada.id,
      usadaEn: null,
      puertaAnterior: null,
      funcionCorrecta: null,
    };
  }

  if (entrada.estado === 'liberada') {
    return {
      semaforo: 'rojo',
      codigo: 'liberada',
      mensaje: 'Reserva liberada 10 minutos antes del inicio.',
      entradaId: entrada.id,
      usadaEn: null,
      puertaAnterior: null,
      funcionCorrecta: null,
    };
  }

  if (entrada.estado === 'usada') {
    const usadaMs = entrada.usadaEn ? Date.parse(entrada.usadaEn) : 0;
    const mismoDisp = entrada.dispositivoId === p.dispositivoId;
    if (mismoDisp && ahoraLocal.getTime() - usadaMs < 60_000) {
      return {
        semaforo: 'ambar',
        codigo: 'doble_lectura_reciente',
        mensaje: 'Ya validada hace menos de 1 minuto en este dispositivo.',
        entradaId: entrada.id,
        usadaEn: entrada.usadaEn ?? null,
        puertaAnterior: entrada.puerta ?? null,
        funcionCorrecta: null,
      };
    }
    return {
      semaforo: 'rojo',
      codigo: 'ya_usada',
      mensaje: `Entrada ya usada${entrada.puerta ? ` en ${entrada.puerta}` : ''}.`,
      entradaId: entrada.id,
      usadaEn: entrada.usadaEn ?? null,
      puertaAnterior: entrada.puerta ?? null,
      funcionCorrecta: null,
    };
  }

  const escaneadoIso = ahoraLocal.toISOString();
  entrada.estado = 'usada';
  entrada.usadaEn = escaneadoIso;
  entrada.puerta = p.puerta;
  entrada.dispositivoId = p.dispositivoId;
  await p.almacen.guardarPaquete(paquete);
  await p.almacen.encolarIngreso({
    entradaId: entrada.id,
    funcionId: p.funcionId,
    dispositivoId: p.dispositivoId,
    puerta: p.puerta,
    escaneadoEn: escaneadoIso,
    desfaseMs: paquete.desfaseMs,
  });

  return {
    semaforo: 'verde',
    codigo: 'valida',
    mensaje: 'Entrada válida (modo sin conexión).',
    entradaId: entrada.id,
    usadaEn: escaneadoIso,
    puertaAnterior: p.puerta,
    funcionCorrecta: null,
  };
}
