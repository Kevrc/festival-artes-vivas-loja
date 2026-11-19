import Link from 'next/link';

export default function NoEncontrado() {
  return (
    <section>
      <h1>No encontramos esa página</h1>
      <p>Puede que la función o el día no pertenezcan a una edición publicada.</p>
      <p><Link href="/cartelera">Volver a la cartelera</Link></p>
    </section>
  );
}
