import { AhoraController } from './ahora.controller';
import { BusquedaController } from './busqueda.controller';
import { CalendarioController } from './calendario.controller';
import { CarteleraController } from './cartelera.controller';
import { FavoritosController } from './favoritos.controller';
import { FichasController } from './fichas.controller';

// Una clase por historia (hallazgo F1): cada una se registra con una línea.
export const CONTROLADORES = [
  CarteleraController, // US1
  BusquedaController, // US2
  FichasController, // US3
  AhoraController, // US4
  FavoritosController, // US5
  CalendarioController, // US6
];
