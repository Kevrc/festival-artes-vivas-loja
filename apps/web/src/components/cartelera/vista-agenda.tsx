'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { avisosAgenda } from '@/lib/cartelera/agenda';
import { obtenerCliente } from '@/lib/cartelera/api';
import { useFavoritos } from '@/lib/cartelera/favoritos';
import { diaDeInstante, diasEntre, formatoDia, formatoHora } from '@/lib/cartelera/formato';
import type { DiaCartelera, EdicionConFacetas, FuncionResumen } from '@/lib/cartelera/tipos';
import { BotonFavorito } from './boton-favorito';
import { TarjetaFuncion } from './tarjeta-funcion';

/** US5: favoritos por día con avisos de cruce y traslado (RN-004). */
export function VistaAgenda() {
  const { ids } = useFavoritos();
  const [funciones, setFunciones] = useState<FuncionResumen[] | null>(null);

  useEffect(() => {
    (async () => {
      const ed = await obtenerCliente<EdicionConFacetas>('/ediciones/actual');
      const dias = await Promise.all(diasEntre(ed.fechaInicio, ed.fechaFin).map((d) => obtenerCliente<DiaCartelera>(`/dias/${d}`)));
      const unicas = new Map(dias.flatMap((d) => d.funciones).map((f) => [f.id, f]));
      setFunciones([...unicas.values()]);
    })().catch(() => setFunciones([]));
  }, []);

  const favoritas = useMemo(
    () => (funciones ?? []).filter((f) => ids.includes(f.id)).sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio)),
    [funciones, ids],
  );
  const avisos = useMemo(() => avisosAgenda(favoritas), [favoritas]);
  const titulo = (id: string) => favoritas.find((f) => f.id === id)?.obra.titulo ?? '';

  if (!funciones) return <p>Cargando tu agenda…</p>;
  if (!favoritas.length)
    return (
      <p className="vacio">
        Aún no tienes funciones en tu agenda. Márcalas con “Agregar a mi agenda” en la <Link href="/cartelera">cartelera</Link>.
      </p>
    );

  const porDia = new Map<string, FuncionResumen[]>();
  for (const f of favoritas) porDia.set(diaDeInstante(f.inicio), [...(porDia.get(diaDeInstante(f.inicio)) ?? []), f]);
  return (
    <>
      <div aria-live="polite">
        {avisos.map((a) => (
          <p key={`${a.tipo}-${a.primera}-${a.segunda}`} className="agenda-aviso" role="status">
            {a.tipo === 'cruce'
              ? `“${titulo(a.primera)}” y “${titulo(a.segunda)}” se cruzan en horario.`
              : `Solo tienes ${a.minutos} min para ir de “${titulo(a.primera)}” a “${titulo(a.segunda)}” en otra sede.`}
          </p>
        ))}
      </div>
      {[...porDia.entries()].map(([dia, lista]) => (
        <section key={dia} aria-labelledby={`d-${dia}`}>
          <h2 id={`d-${dia}`}>{formatoDia(dia)}</h2>
          <ol className="lista-funciones">
            {lista.map((f) => (
              <li key={f.id}>
                <TarjetaFuncion funcion={f} accion={<BotonFavorito funcionId={f.id} titulo={f.obra.titulo} />} />
              </li>
            ))}
          </ol>
        </section>
      ))}
      <p className="nota">Tu agenda se guarda en este dispositivo. Horas: {formatoHora(new Date().toISOString())} (hora de Ecuador).</p>
    </>
  );
}
