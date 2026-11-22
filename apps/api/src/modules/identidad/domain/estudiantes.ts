/** Reglas de la condición de estudiante (US12, RN-012). Funciones puras. */
const HORA = 60 * 60_000;
/** Loja está en UTC−5 todo el año: el último día de la edición termina a las 24:00 de Loja. */
const DESFASE_LOJA_MS = 5 * HORA;

/** RN-012: la acreditación vence al terminar el último día de la edición vigente (hora de Loja). */
export const finDelDiaEnLoja = (fecha: string): Date => new Date(Date.parse(`${fecha}T00:00:00Z`) + 24 * HORA + DESFASE_LOJA_MS - 1);

/** `Ana@UTPL.edu.ec` → `utpl.edu.ec`; null si no es un correo con dominio. */
export function dominioDeCorreo(correo: string): string | null {
  const m = /^[^@\s]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/i.exec(correo.trim());
  return m ? m[1]!.toLowerCase() : null;
}

/** Dominio escrito por el administrador, normalizado: sin `@` inicial, en minúsculas. */
export function normalizarDominio(texto: string): string | null {
  const d = texto.trim().toLowerCase().replace(/^@/, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(d) ? d : null;
}

