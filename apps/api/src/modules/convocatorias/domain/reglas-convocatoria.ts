import { createHash } from 'node:crypto';

export interface FichaObraFingerprint { titulo: string; disciplina: string; duracionMin: number; sinopsis: string }

const normalizar = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');

export function calcularObraFingerprint(ficha: FichaObraFingerprint): string {
  const canonica = JSON.stringify({
    titulo: normalizar(ficha.titulo), disciplina: normalizar(ficha.disciplina),
    duracionMin: ficha.duracionMin, sinopsis: normalizar(ficha.sinopsis),
  });
  return createHash('sha256').update(canonica, 'utf8').digest('hex');
}

export const puedePostularOtraObra = (obrasEnviadas: number, maxObras: number): boolean => obrasEnviadas < maxObras;

export function calcularPuntajePonderado(calificaciones: number[], pesos: number[]): number {
  if (calificaciones.length === 0 || calificaciones.length !== pesos.length || pesos.reduce((s, n) => s + n, 0) !== 100) {
    throw new Error('Calificaciones y pesos incompletos');
  }
  if (calificaciones.some((n) => !Number.isInteger(n) || n < 0 || n > 100) || pesos.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new Error('Puntaje o peso fuera de rango');
  }
  const hundredths = calificaciones.reduce((sum, score, i) => sum + score * pesos[i], 0);
  return hundredths / 100;
}

export function calcularResultadoCuraduria(puntajes: number[]): { promedio: number; requiereDeliberacion: boolean } {
  if (puntajes.length === 0) throw new Error('Se requiere al menos un puntaje');
  const promedio = Math.round((puntajes.reduce((a, b) => a + b, 0) / puntajes.length) * 100) / 100;
  return { promedio, requiereDeliberacion: Math.max(...puntajes) - Math.min(...puntajes) > 25 };
}
