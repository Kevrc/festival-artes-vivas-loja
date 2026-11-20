export const BYTES_MAXIMO_DOCUMENTO = 10_000_000;
const firmas: Record<string, { mime: string; prefijo: number[]; ascii?: string }> = {
  '.pdf': { mime: 'application/pdf', prefijo: [0x25, 0x50, 0x44, 0x46] },
  '.jpg': { mime: 'image/jpeg', prefijo: [0xff, 0xd8, 0xff] },
  '.jpeg': { mime: 'image/jpeg', prefijo: [0xff, 0xd8, 0xff] },
  '.png': { mime: 'image/png', prefijo: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
};

export function validarDocumento(nombre: string, mime: string, contenido: Buffer): { valido: boolean; motivo?: string } {
  const extension = nombre.toLowerCase().slice(nombre.lastIndexOf('.'));
  const firma = firmas[extension];
  if (!firma || firma.mime !== mime) return { valido: false, motivo: 'Formato no permitido' };
  if (contenido.length < firma.prefijo.length || !firma.prefijo.every((byte, i) => contenido[i] === byte)) {
    return { valido: false, motivo: 'La firma del archivo no coincide' };
  }
  if (contenido.length < 1 || contenido.length > BYTES_MAXIMO_DOCUMENTO) return { valido: false, motivo: 'Tamaño fuera de rango' };
  return { valido: true };
}
