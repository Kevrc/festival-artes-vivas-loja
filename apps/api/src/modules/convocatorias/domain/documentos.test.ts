import { describe, expect, it } from 'vitest';
import { validarDocumento } from './documentos';

describe('validación de documentos', () => {
  it('acepta PDF, JPEG y PNG cuando extensión, MIME y firma coinciden', () => {
    expect(validarDocumento('bases.pdf', 'application/pdf', Buffer.from('%PDF-1.7'))).toMatchObject({ valido: true });
    expect(validarDocumento('foto.jpg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toMatchObject({ valido: true });
    expect(validarDocumento('foto.png', 'image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toMatchObject({ valido: true });
  });
  it('rechaza MIME/extensión/firma inconsistentes y excede solo sobre 10 000 000 bytes', () => {
    expect(validarDocumento('foto.pdf', 'image/png', Buffer.from('%PDF-1.7')).valido).toBe(false);
    expect(validarDocumento('foto.png', 'image/png', Buffer.from('not png')).valido).toBe(false);
    expect(validarDocumento('archivo.exe', 'application/octet-stream', Buffer.from('MZ')).valido).toBe(false);
    const pdfEnTope = Buffer.alloc(10_000_000, 0x41);
    Buffer.from('%PDF').copy(pdfEnTope);
    const pdfGrande = Buffer.alloc(10_000_001, 0x41);
    Buffer.from('%PDF').copy(pdfGrande);
    expect(validarDocumento('tope.pdf', 'application/pdf', pdfEnTope)).toMatchObject({ valido: true });
    expect(validarDocumento('grande.pdf', 'application/pdf', pdfGrande).valido).toBe(false);
  });
});
