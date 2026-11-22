import { MiCuentaController } from './mi-cuenta.controller';
import { NotificacionesController } from './notificaciones.controller';
import { PersonalController } from './personal.controller';
import { RegistroController } from './registro.controller';
import { SegundoFactorController } from './segundo-factor.controller';
import { SesionController } from './sesion.controller';

/** Controladores HTTP de Identidad (`/api/identidad`). Cada historia añade los suyos. */
export const CONTROLADORES_IDENTIDAD: unknown[] = [RegistroController, SesionController, MiCuentaController, SegundoFactorController, PersonalController, NotificacionesController];
