'use client';

import { type Funcion, type Grilla as GrillaDia, fechaLarga, horaDeInicio, horaLoja } from '@/lib/operacion/api';
import estilos from './operacion.module.css';

const ESTADOS: Record<Funcion['estado'], string> = {
  borrador: 'borrador',
  programada: 'programada',
  reprogramada: 'reprogramada',
  cancelada: 'cancelada',
  finalizada: 'finalizada',
};

/** Texto completo de una función para el lector de pantalla y para la vista visual. */
const etiqueta = (f: Funcion) => `${horaLoja(f.inicio)}–${horaLoja(f.fin)} ${f.obraTitulo ?? ''} (${ESTADOS[f.estado]})`;

interface Props {
  grilla: GrillaDia;
  seleccionada: string | null;
  enConflicto: ReadonlySet<string>;
  onElegir: (f: Funcion) => void;
}

function BotonFuncion({ f, seleccionada, enConflicto, onElegir, idPrefijo }: { f: Funcion; idPrefijo: string } & Omit<Props, 'grilla'>) {
  const conflicto = enConflicto.has(f.id);
  const clases = [estilos.funcion, f.estado === 'borrador' && estilos.borrador, f.estado === 'cancelada' && estilos.cancelada, conflicto && estilos.enConflicto]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" id={`${idPrefijo}-${f.id}`} className={clases} aria-pressed={seleccionada === f.id} onClick={() => onElegir(f)}>
      {conflicto && <span className={estilos.marcaConflicto}>⚠ En conflicto: </span>}
      {f.continua ? `Todo el día ${f.obraTitulo ?? ''} (${ESTADOS[f.estado]})` : etiqueta(f)}
    </button>
  );
}

/**
 * Grilla de un día (US1): una columna por sede y una fila por hora; en el móvil, lista por sede.
 * Accesibilidad según contracts/rutas-web.md: tabla con encabezados, cada función es un botón con
 * nombre, horario y estado, y el conflicto se dice con texto, no solo con color.
 */
export function Grilla({ grilla, seleccionada, enConflicto, onElegir }: Props) {
  const continuas = grilla.funciones.filter((f) => f.continua);
  const puntuales = grilla.funciones.filter((f) => !f.continua);
  const horas = [...new Set([8, ...puntuales.map((f) => horaDeInicio(f.inicio))])].sort((a, b) => a - b);
  const desde = Math.min(...horas);
  const hasta = Math.max(23, ...horas);
  const filas = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
  const enCelda = (sedeId: string, hora: number) => puntuales.filter((f) => f.sedeId === sedeId && horaDeInicio(f.inicio) === hora);
  const props = { seleccionada, enConflicto, onElegir };

  return (
    <>
      <div className={estilos.envoltura}>
        <table className={estilos.tabla}>
          <caption>
            Funciones del {fechaLarga(grilla.fecha)}: {grilla.funciones.length} en {grilla.sedes.length} sedes
          </caption>
          <thead>
            <tr>
              <th scope="col">Hora</th>
              {grilla.sedes.map((s) => (
                <th key={s.id} scope="col">
                  {s.nombre}
                  {s.aforo ? <span className={estilos.ayuda}> · aforo {s.aforo}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {continuas.length > 0 && (
              <tr>
                <th scope="row">Todo el día</th>
                {grilla.sedes.map((s) => (
                  <td key={s.id}>
                    {continuas.filter((f) => f.sedeId === s.id).map((f) => (
                      <BotonFuncion key={f.id} f={f} idPrefijo="funcion" {...props} />
                    ))}
                  </td>
                ))}
              </tr>
            )}
            {filas.map((hora) => (
              <tr key={hora}>
                <th scope="row">{`${String(hora).padStart(2, '0')}:00`}</th>
                {grilla.sedes.map((s) => (
                  <td key={s.id}>
                    {enCelda(s.id, hora).map((f) => (
                      <BotonFuncion key={f.id} f={f} idPrefijo="funcion" {...props} />
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={estilos.lista}>
        <h2 className="solo-lectores">Funciones por sede</h2>
        {grilla.sedes.map((s) => {
          const deSede = grilla.funciones.filter((f) => f.sedeId === s.id);
          return (
            <section key={s.id} aria-labelledby={`sede-${s.id}`}>
              <h3 id={`sede-${s.id}`}>{s.nombre}</h3>
              {deSede.length === 0 ? (
                <p className={estilos.ayuda}>Sin funciones este día.</p>
              ) : (
                <ul>
                  {deSede.map((f) => (
                    <li key={f.id}>
                      <BotonFuncion f={f} idPrefijo="funcion-lista" {...props} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
