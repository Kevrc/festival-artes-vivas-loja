import { ejemplo, type EventoCartelera } from '@fiavl/contracts';
import { idDe } from './ids';
import { IMAGEN_OBRA } from './imagenes';

/**
 * Edición XI (12–22 nov 2026) con obras, elencos y sedes reales de docs/investigacion-festival.md.
 * Coordenadas aproximadas. Los estados "cancelada", "reprogramada" y "agotado" son de demostración
 * (quickstart.md), no hechos reales.
 */
export const EDICION_2026 = idDe('edicion-2026');

type Disciplina = 'teatro' | 'danza' | 'circo' | 'musica' | 'titeres' | 'exposicion' | 'taller' | 'calle' | 'cine';
type Acceso = 'pagada' | 'gratuita_reserva' | 'gratuita_libre' | 'restringida';
type Componente = 'internacional' | 'nacional' | 'camino_a_loja' | 'escuela' | 'salud_arte';

export const SEDES = {
  nacional: { nombre: 'Teatro Nacional Benjamín Carrión Mora', tipo: 'teatro', direccion: 'Av. Universitaria y Mercadillo', lat: -3.9989, lng: -79.2034, aforo: 800, accesibilidad: { sillaRuedas: true, banoAccesible: true, rampa: true } },
  bolivar: { nombre: 'Teatro Bolívar', tipo: 'teatro', direccion: 'Calle Bolívar y Rocafuerte', lat: -3.9978, lng: -79.2018, aforo: 400, accesibilidad: { sillaRuedas: true } },
  cueva: { nombre: 'Teatro Segundo Cueva Celi', tipo: 'teatro', direccion: 'Calle Bernardo Valdivieso', lat: -3.9944, lng: -79.2024, aforo: 350, accesibilidad: {} },
  moraReyes: { nombre: 'Centro Cultural Alfredo Mora Reyes', tipo: 'centro_cultural', direccion: 'Av. Orillas del Zamora', lat: -3.9925, lng: -79.2047, aforo: 300, accesibilidad: { sillaRuedas: true, rampa: true } },
  museo: { nombre: 'Museo de Loja', tipo: 'museo', direccion: 'Parque Central', lat: -3.9960, lng: -79.2021, aforo: 120, accesibilidad: { rampa: true } },
  sanSebastian: { nombre: 'Plaza San Sebastián', tipo: 'espacio_publico', direccion: 'Calle Bolívar y Lourdes', lat: -4.0011, lng: -79.2011, accesibilidad: { sillaRuedas: true } },
  parqueCentral: { nombre: 'Parque Central', tipo: 'espacio_publico', direccion: 'Bolívar y 10 de Agosto', lat: -3.9963, lng: -79.2016, accesibilidad: { sillaRuedas: true } },
  desfile: {
    nombre: 'Recorrido del desfile inaugural', tipo: 'recorrido', direccion: 'Av. Eduardo Kingman, calle Bolívar y calle Colón', lat: -4.0062, lng: -79.2003, accesibilidad: {},
    recorrido: [
      { lat: -4.0062, lng: -79.2003, nombre: 'Cabo Minacho' },
      { lat: -4.0031, lng: -79.2009, nombre: 'Av. Eduardo Kingman' },
      { lat: -3.9978, lng: -79.2018, nombre: 'Calle Bolívar' },
      { lat: -3.9952, lng: -79.2021, nombre: 'Calle Colón' },
    ],
  },
} as const;

type ClaveSede = keyof typeof SEDES;

interface Fn {
  clave: string;
  obra: string;
  elenco: string;
  pais: string;
  disciplina: Disciplina;
  componente: Componente;
  sede: ClaveSede;
  inicio: string;
  duracion: number;
  acceso: Acceso;
  publico?: 'familiar' | 'adultos' | 'estudiantes';
  edad?: number;
  continua?: { hasta: string };
  sinopsis?: string;
}

const F: Fn[] = [
  { clave: 'desfile', obra: 'Pinceladas en movimiento', elenco: '11 delegaciones del Ecuador', pais: 'Ecuador', disciplina: 'calle', componente: 'nacional', sede: 'desfile', inicio: '2026-11-12T18:00', duracion: 150, acceso: 'gratuita_libre', sinopsis: 'Desfile inaugural por las calles de Loja.' },
  { clave: 'cura', obra: 'El Cura sin cabeza', elenco: 'Cano Artes Escénicas', pais: 'Ecuador', disciplina: 'teatro', componente: 'nacional', sede: 'nacional', inicio: '2026-11-12T20:00', duracion: 90, acceso: 'pagada', edad: 12, sinopsis: 'Obra inaugural basada en la leyenda andina.' },
  { clave: 'zombi', obra: 'Zombi Manifiesto', elenco: 'Santiago Sanguineti', pais: 'Uruguay', disciplina: 'teatro', componente: 'internacional', sede: 'bolivar', inicio: '2026-11-12T20:30', duracion: 80, acceso: 'pagada', edad: 16, publico: 'adultos' },
  { clave: 'buddy', obra: 'Buddy Bears', elenco: 'Embajada de Alemania', pais: 'Alemania', disciplina: 'exposicion', componente: 'internacional', sede: 'museo', inicio: '2026-11-12T09:00', duracion: 480, acceso: 'gratuita_libre', continua: { hasta: '2026-11-22T17:00' }, sinopsis: 'Exposición de osos pintados por artistas de varios países.' },
  { clave: 'miche', obra: 'El Miche en la plaza', elenco: 'Carlos Michelena', pais: 'Ecuador', disciplina: 'calle', componente: 'nacional', sede: 'sanSebastian', inicio: '2026-11-13T18:50', duracion: 60, acceso: 'gratuita_libre' },
  { clave: 'bondi', obra: 'Bondi Beach', elenco: 'Deus Ex Machina', pais: 'Alemania', disciplina: 'teatro', componente: 'internacional', sede: 'bolivar', inicio: '2026-11-13T20:00', duracion: 75, acceso: 'pagada', edad: 14 },
  { clave: 'clowns', obra: 'Classics Clowns', elenco: 'Classics Clowns', pais: 'Costa Rica', disciplina: 'circo', componente: 'internacional', sede: 'parqueCentral', inicio: '2026-11-14T16:00', duracion: 50, acceso: 'gratuita_libre' },
  { clave: 'chacovachi', obra: 'Cuidado!! Un Payaso Malo Puede Arruinar tu Vida', elenco: 'Chacovachi', pais: 'Argentina', disciplina: 'circo', componente: 'internacional', sede: 'sanSebastian', inicio: '2026-11-14T17:00', duracion: 60, acceso: 'gratuita_libre' },
  { clave: 'lugar', obra: 'El lugar del otro', elenco: 'La Congregación Teatro', pais: 'Colombia', disciplina: 'teatro', componente: 'internacional', sede: 'nacional', inicio: '2026-11-14T20:00', duracion: 85, acceso: 'pagada', edad: 14 },
  { clave: 'cometa-1', obra: 'Cometa', elenco: 'Roser López Espinosa y Vorpommern Tanz', pais: 'España', disciplina: 'danza', componente: 'internacional', sede: 'moraReyes', inicio: '2026-11-15T17:00', duracion: 55, acceso: 'gratuita_reserva' },
  { clave: 'cometa-2', obra: 'Cometa', elenco: 'Roser López Espinosa y Vorpommern Tanz', pais: 'España', disciplina: 'danza', componente: 'internacional', sede: 'moraReyes', inicio: '2026-11-15T19:30', duracion: 55, acceso: 'gratuita_reserva' },
  { clave: 'taller', obra: 'Taller de clown para estudiantes', elenco: 'Escuela del festival', pais: 'Ecuador', disciplina: 'taller', componente: 'escuela', sede: 'moraReyes', inicio: '2026-11-16T10:00', duracion: 120, acceso: 'restringida', publico: 'estudiantes' },
  { clave: 'tuttotorna', obra: 'Tuttotorna', elenco: 'Guillari del Diavolo', pais: 'Italia', disciplina: 'calle', componente: 'internacional', sede: 'parqueCentral', inicio: '2026-11-16T18:00', duracion: 50, acceso: 'gratuita_libre' },
  { clave: 'hazmerreir-1', obra: 'El hazmerreír', elenco: 'Ovejas Negras Humor y Sociedad', pais: 'Perú', disciplina: 'teatro', componente: 'internacional', sede: 'bolivar', inicio: '2026-11-17T19:00', duracion: 70, acceso: 'pagada', edad: 16, publico: 'adultos' },
  { clave: 'hazmerreir-2', obra: 'El hazmerreír', elenco: 'Ovejas Negras Humor y Sociedad', pais: 'Perú', disciplina: 'teatro', componente: 'internacional', sede: 'bolivar', inicio: '2026-11-18T19:00', duracion: 70, acceso: 'pagada', edad: 16, publico: 'adultos' },
  { clave: 'artista', obra: 'La Artista', elenco: 'Los Nadies Circo', pais: 'Chile', disciplina: 'circo', componente: 'internacional', sede: 'nacional', inicio: '2026-11-19T20:00', duracion: 70, acceso: 'pagada' },
  { clave: 'semillas', obra: 'Semillas de Fuego', elenco: 'Mascha Louana', pais: 'Alemania', disciplina: 'calle', componente: 'internacional', sede: 'sanSebastian', inicio: '2026-11-20T19:00', duracion: 45, acceso: 'gratuita_libre' },
  { clave: 'monas', obra: 'Monás', elenco: 'Teatringestazione', pais: 'Italia', disciplina: 'teatro', componente: 'internacional', sede: 'cueva', inicio: '2026-11-21T19:00', duracion: 60, acceso: 'pagada' },
  { clave: 'medardo', obra: 'Don Medardo Sinfónico', elenco: 'Don Medardo y sus Players', pais: 'Ecuador', disciplina: 'musica', componente: 'nacional', sede: 'parqueCentral', inicio: '2026-11-21T20:00', duracion: 120, acceso: 'gratuita_libre' },
  { clave: 'misterio', obra: 'Nada era un misterio: El enigmático caso de la Continental Company', elenco: 'La Mona Ilustre', pais: 'Chile', disciplina: 'teatro', componente: 'internacional', sede: 'nacional', inicio: '2026-11-22T20:00', duracion: 80, acceso: 'pagada' },
];

const conZona = (local: string) => `${local}:00-05:00`;
const masMinutos = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString();

export const funcionId = (clave: string) => idDe(`funcion:${clave}`);

/** Eventos en el orden real: funciones, publicación y luego estados de demostración. */
export function eventosEdicion2026(): EventoCartelera[] {
  const e = EDICION_2026;
  const programadas = F.map((f) => {
    const inicio = conZona(f.inicio);
    const sede = SEDES[f.sede];
    return ejemplo.funcionProgramada(e, {
      funcion: {
        id: funcionId(f.clave),
        version: 1,
        inicio,
        fin: f.continua ? conZona(f.continua.hasta) : masMinutos(inicio, f.duracion),
        continua: Boolean(f.continua),
        tipoAcceso: f.acceso,
        publico: f.publico ?? 'familiar',
        aforoHabilitado: f.acceso === 'gratuita_libre' ? null : ('aforo' in sede ? sede.aforo : null),
      },
      obra: {
        id: idDe(`obra:${f.obra}`),
        titulo: f.obra,
        sinopsis: f.sinopsis ?? '',
        disciplina: f.disciplina,
        duracionMin: f.duracion,
        edadMinima: f.edad ?? 0,
        imagenes: [IMAGEN_OBRA[f.obra]].filter((url): url is string => url !== undefined),
        fichaArtistica: [{ rol: 'Compañía', nombre: f.elenco }],
        componente: f.componente,
      },
      elenco: { id: idDe(`elenco:${f.elenco}`), nombre: f.elenco, pais: f.pais },
      sede: { id: idDe(`sede:${f.sede}`), ...sede, recorrido: 'recorrido' in sede ? [...sede.recorrido] : undefined },
    });
  });
  const publicada = ejemplo.programacionPublicada(e, {
    edicion: { id: e, anio: 2026, numero: 'XI', fechaInicio: '2026-11-12', fechaFin: '2026-11-22', paisInvitado: 'Alemania' },
    funcionIds: F.map((f) => funcionId(f.clave)),
  });
  const bolivar = idDe('sede:bolivar');
  const demo: EventoCartelera[] = [
    ejemplo.funcionCancelada(e, { funcionId: funcionId('monas'), version: 2 }),
    ejemplo.funcionReprogramada(e, {
      funcionId: funcionId('hazmerreir-1'),
      version: 2,
      anterior: { inicio: '2026-11-17T19:00:00-05:00', fin: '2026-11-17T20:10:00-05:00', sedeId: bolivar },
      nuevo: { inicio: '2026-11-17T21:00:00-05:00', fin: '2026-11-17T22:10:00-05:00', sedeId: bolivar },
      motivo: 'Retraso del vuelo del elenco',
    }),
    ejemplo.disponibilidadCambiada(e, { funcionId: funcionId('artista'), lugaresRestantes: 0, aforoHabilitado: 800, calculadoEn: new Date().toISOString() }),
    ejemplo.disponibilidadCambiada(e, { funcionId: funcionId('cura'), lugaresRestantes: 40, aforoHabilitado: 800, calculadoEn: new Date().toISOString() }),
  ];
  return [...programadas, publicada, ...demo];
}
