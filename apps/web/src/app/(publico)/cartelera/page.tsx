import { redirect } from 'next/navigation';
import { obtener } from '@/lib/cartelera/api';
import type { EdicionConFacetas } from '@/lib/cartelera/tipos';

export const revalidate = 60;

/** US1-AS1/AS2: abre el día de hoy, o el sugerido si no hay festival. */
export default async function Cartelera() {
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
