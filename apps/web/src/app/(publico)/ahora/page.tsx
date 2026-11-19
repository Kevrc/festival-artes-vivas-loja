import type { Metadata } from 'next';
import { VistaAhora } from '@/components/cartelera/vista-ahora';

export const metadata: Metadata = { title: 'Ahora' };

export default function Ahora() {
  return (
    <section aria-labelledby="titulo-ahora">
      <h1 id="titulo-ahora">Qué hay ahora</h1>
      <p>Funciones en curso o que empiezan en la próxima hora.</p>
      <VistaAhora />
    </section>
  );
}
