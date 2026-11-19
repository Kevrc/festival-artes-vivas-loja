import type { ApiCartelera } from '@fiavl/contracts';

type S = ApiCartelera.components['schemas'];
export type FuncionResumen = S['FuncionResumen'];
export type ObraResumen = S['ObraResumen'];
export type SedeResumen = S['SedeResumen'];
export type DiaCartelera = S['DiaCartelera'];
export type EdicionConFacetas = S['EdicionConFacetas'];
export type Disponibilidad = S['Disponibilidad'];
export type NivelDisponibilidad = S['NivelDisponibilidad'];
export type FichaObra = S['FichaObra'];
export type FichaElenco = S['FichaElenco'];
export type FichaSede = S['FichaSede'];
export type Facetas = EdicionConFacetas['facetas'];
