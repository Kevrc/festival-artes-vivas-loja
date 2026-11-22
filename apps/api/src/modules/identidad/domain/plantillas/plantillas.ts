/**
 * Plantillas de correo del festival (FR-021): texto plano y HTML accesible (idioma, estructura
 * simple, enlaces con texto descriptivo). Funciones puras: no registran nada en logs.
 */
export interface Correo {
  asunto: string;
  texto: string;
  html: string;
}

const FIRMA = 'Festival Internacional de Artes Vivas de Loja';

export const escaparHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function html(titulo: string, parrafos: string[], accion?: { texto: string; url: string }): string {
  const cuerpo = parrafos.map((p) => `<p style="margin:0 0 16px">${escaparHtml(p)}</p>`).join('');
  const boton = accion
    ? `<p style="margin:0 0 16px"><a href="${escaparHtml(accion.url)}" style="display:inline-block;background:#a3201c;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">${escaparHtml(accion.texto)}</a></p>` +
      `<p style="margin:0 0 16px;font-size:14px;color:#5b544c">Si el botón no funciona, copia esta dirección en tu navegador: ${escaparHtml(accion.url)}</p>`
    : '';
  return (
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escaparHtml(titulo)}</title></head>` +
    `<body style="margin:0;padding:24px;background:#fbf8f3;color:#1d1a17;font:16px/1.5 system-ui,sans-serif">` +
    `<main style="max-width:560px;margin:0 auto;background:#ffffff;padding:24px;border-radius:10px">` +
    `<h1 style="font-size:22px;margin:0 0 16px">${escaparHtml(titulo)}</h1>${cuerpo}${boton}` +
    `<p style="margin:24px 0 0;font-size:14px;color:#5b544c">${FIRMA}</p></main></body></html>`
  );
}

const texto = (titulo: string, parrafos: string[], accion?: { texto: string; url: string }) =>
  [titulo, '', ...parrafos, ...(accion ? ['', `${accion.texto}: ${accion.url}`] : []), '', `— ${FIRMA}`].join('\n');

/** US7-AS1: enlace de verificación (24 h, un solo uso). */
export function verificacion(nombre: string, enlace: string): Correo {
  const titulo = 'Verifica tu correo';
  const parrafos = [
    `Hola, ${nombre}:`,
    'Gracias por crear tu cuenta en el festival. Para poder comprar, reservar o postular, confirma que este correo es tuyo.',
    'El enlace vale durante 24 horas y se puede usar una sola vez. Si no creaste esta cuenta, ignora este mensaje.',
  ];
  const accion = { texto: 'Verificar mi correo', url: enlace };
  return { asunto: `${titulo} · FIAVL`, texto: texto(titulo, parrafos, accion), html: html(titulo, parrafos, accion) };
}

/** US7-AS3: alguien intentó registrarse con un correo que ya tiene cuenta. No revela nada más. */
export function cuentaExistente(nombre: string, enlaceIngresar: string): Correo {
  const titulo = 'Ya tienes una cuenta';
  const parrafos = [
    `Hola, ${nombre}:`,
    'Alguien intentó crear una cuenta nueva con este correo, pero ya tienes una. No hicimos ningún cambio.',
    'Si fuiste tú, puedes ingresar o recuperar tu contraseña. Si no fuiste tú, no necesitas hacer nada.',
  ];
  const accion = { texto: 'Ingresar al festival', url: enlaceIngresar };
  return { asunto: `${titulo} · FIAVL`, texto: texto(titulo, parrafos, accion), html: html(titulo, parrafos, accion) };
}

/** US8-AS3: enlace para elegir una contraseña nueva (1 hora, un solo uso). */
export function recuperacion(nombre: string, enlace: string): Correo {
  const titulo = 'Elige una contraseña nueva';
  const parrafos = [
    `Hola, ${nombre}:`,
    'Pediste recuperar el acceso a tu cuenta del festival. El enlace vale durante 1 hora y se puede usar una sola vez.',
    'Al cambiar la contraseña se cerrarán tus sesiones abiertas en otros dispositivos. Si no lo pediste, ignora este mensaje: tu contraseña no cambia.',
  ];
  const accion = { texto: 'Elegir una contraseña nueva', url: enlace };
  return { asunto: `${titulo} · FIAVL`, texto: texto(titulo, parrafos, accion), html: html(titulo, parrafos, accion) };
}

/** US8-AS2: aviso al titular de que su cuenta se bloqueó por intentos fallidos. */
export function cuentaBloqueada(nombre: string, hastaLocal: string, enlaceRecuperar: string): Correo {
  const titulo = 'Bloqueamos tu cuenta por seguridad';
  const parrafos = [
    `Hola, ${nombre}:`,
    `Hubo 5 intentos fallidos de ingresar a tu cuenta. Por seguridad no se podrá ingresar hasta las ${hastaLocal}.`,
    'Si no fuiste tú, te recomendamos cambiar tu contraseña.',
  ];
  const accion = { texto: 'Cambiar mi contraseña', url: enlaceRecuperar };
  return { asunto: `${titulo} · FIAVL`, texto: texto(titulo, parrafos, accion), html: html(titulo, parrafos, accion) };
}

/** US9: el administrador creó una cuenta del personal; el titular elige su contraseña (24 h, un solo uso). */
export function invitacionPersonal(nombre: string, enlace: string): Correo {
  const titulo = 'Tu cuenta del equipo del festival';
  const parrafos = [
    `Hola, ${nombre}:`,
    'El equipo del festival creó una cuenta para ti. Para activarla, elige tu contraseña con el enlace de abajo; vale durante 24 horas y se puede usar una sola vez.',
    'Al ingresar por primera vez te pediremos configurar un segundo factor con una aplicación de códigos en tu teléfono.',
  ];
  const accion = { texto: 'Elegir mi contraseña', url: enlace };
  return { asunto: `${titulo} · FIAVL`, texto: texto(titulo, parrafos, accion), html: html(titulo, parrafos, accion) };
}
