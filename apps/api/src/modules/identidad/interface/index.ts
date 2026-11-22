import { MiCuentaController } from './mi-cuenta.controller';
import { RegistroController } from './registro.controller';
import { SesionController } from './sesion.controller';

/** Controladores HTTP de Identidad (`/api/identidad`). Cada historia añade los suyos. */
export const CONTROLADORES_IDENTIDAD: unknown[] = [RegistroController, SesionController, MiCuentaController];
