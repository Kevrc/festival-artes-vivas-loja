/**
 * Requisitos de contraseña que se muestran mientras se escribe (US7-AS4). Solo orientan: el
 * servidor es quien decide, incluida la lista de contraseñas filtradas (RN-008).
 */
export interface Requisito {
  texto: string;
  cumple: boolean;
}

export function requisitosContrasena(contrasena: string, correo: string): Requisito[] {
  const largo = [...contrasena].length;
  const usuario = correo.split('@')[0]?.toLowerCase() ?? '';
  return [
    { texto: 'Al menos 10 caracteres', cumple: largo >= 10 },
    { texto: 'Como máximo 128 caracteres', cumple: largo <= 128 },
    { texto: 'Distinta de tu correo', cumple: contrasena.length > 0 && (usuario.length < 3 || !contrasena.toLowerCase().includes(usuario)) },
  ];
}
