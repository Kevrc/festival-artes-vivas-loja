import type { Metadata } from 'next';
import { VistaAgenda } from '@/components/cartelera/vista-agenda';

export const metadata: Metadata = { title: 'Mi agenda' };

export default function MiAgenda() {
  return (
    <section aria-labelledby="titulo-agenda">
      <h1 id="titulo-agenda">Mi agenda del festival</h1>
      <VistaAgenda />
    </section>
  );
}
