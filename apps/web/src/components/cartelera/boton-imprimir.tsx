'use client';

export function BotonImprimir() {
  return (
    <button type="button" onClick={() => window.print()}>
      Imprimir o guardar como PDF
    </button>
  );
}
