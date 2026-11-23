/**
 * Fotos ilustrativas por obra (licencia Unsplash: uso libre, sin atribución obligatoria).
 * No son fotos de los elencos reales; en producción las sube la coordinación o llegan con la postulación.
 */
const foto = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=960&h=600&q=70`;

export const IMAGEN_OBRA: Record<string, string> = {
  'Bondi Beach': foto('1503095396549-807759245b35'),
  'Buddy Bears': foto('1738391788925-d130a4993d50'),
  'Classics Clowns': foto('1602514328225-24d95071ec93'),
  Cometa: foto('1547153760-18fc86324498'),
  'Cuidado!! Un Payaso Malo Puede Arruinar tu Vida': foto('1705849441124-a109b0e53956'),
  'Don Medardo Sinfónico': foto('1465847899084-d164df4dedc6'),
  'El Cura sin cabeza': foto('1558970439-add78fc68990'),
  'El Miche en la plaza': foto('1590156795150-ef7b31bad1ed'),
  'El hazmerreír': foto('1630050525402-06c617847d27'),
  'El lugar del otro': foto('1579539760267-b2e78d9d735e'),
  'La Artista': foto('1773459516717-c772070071c7'),
  Monás: foto('1565798846807-2af22c843402'),
  'Nada era un misterio: El enigmático caso de la Continental Company': foto('1576724196706-3f23f51ea351'),
  'Pinceladas en movimiento': foto('1767039442825-745ba15752ee'),
  'Semillas de Fuego': foto('1777732165370-d598945abb76'),
  'Taller de clown para estudiantes': foto('1550026593-cb89847b168d'),
  Tuttotorna: foto('1542732935-0750da3c04b5'),
  'Zombi Manifiesto': foto('1529229504105-4ea795dcbf59'),
};
