import { FuncionesController } from './funciones.controller';
import { ObrasController } from './obras.controller';
import { PublicacionController } from './publicacion.controller';

/** Controladores HTTP de Operación (`/api/operacion`). Cada historia añade los suyos. */
export const CONTROLADORES_OPERACION: unknown[] = [FuncionesController, ObrasController, PublicacionController];
