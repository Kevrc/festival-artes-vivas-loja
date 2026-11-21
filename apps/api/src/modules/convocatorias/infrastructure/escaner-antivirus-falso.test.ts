import { describe, expect, it } from 'vitest';
import { FalsoEscanerAntivirus } from './escaner-antivirus-falso';

describe('FalsoEscanerAntivirus', () => {
  it('simula limpio, infectado y caído', async () => {
    await expect(new FalsoEscanerAntivirus('limpio').escanear(Buffer.from('fixture'))).resolves.toEqual({ limpio: true });
    await expect(new FalsoEscanerAntivirus('infectado').escanear(Buffer.from('fixture'))).resolves.toEqual({ limpio: false, motivo: 'infectado' });
    await expect(new FalsoEscanerAntivirus('caido').escanear(Buffer.from('fixture'))).rejects.toThrow('escáner no disponible');
  });
});
