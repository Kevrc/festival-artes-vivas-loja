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
