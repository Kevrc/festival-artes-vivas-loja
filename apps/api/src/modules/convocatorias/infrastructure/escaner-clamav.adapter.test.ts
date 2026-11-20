import { describe, expect, it } from 'vitest';
import { ClamAvTcpEscaner } from './escaner-clamav.adapter';

describe('ClamAvTcpEscaner', () => {
  it('falla cerrado si el demonio no está disponible', async () => {
    await expect(new ClamAvTcpEscaner('127.0.0.1', 1, 100).escanear(Buffer.from('fixture'))).rejects.toThrow();
  });
});
