import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { obtener } from '@/lib/cartelera/api';
import type { EdicionConFacetas } from '@/lib/cartelera/tipos';

/** US1-AS1/AS2: abre el día de hoy, o el sugerido si no hay festival. */
export default async function Cartelera() {
  // Depende de la hora actual: se resuelve en cada visita (la consulta queda en la caché de datos 60 s)
  // y el build no necesita la API.
  await connection();
  const edicion = await obtener<EdicionConFacetas>('/ediciones/actual', ['edicion']);
  if (!edicion) {
    return (
      <section>
        <h1>Cartelera</h1>
        <p>Todavía no hay una edición publicada. Vuelve pronto.</p>
      </section>
    );
  }
  redirect(`/cartelera/${edicion.diaSugerido}`);
}
