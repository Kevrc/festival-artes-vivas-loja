import { describe, expect, it } from 'vitest';
import { cuentaExistente, escaparHtml, verificacion } from './plantillas';

const enlace = 'https://fiavl.ec/cuenta/verificar?token=abcDEF123_-';

describe('plantillas de correo (FR-021)', () => {
  it('verificación: texto y HTML con el enlace, la vigencia y el idioma', () => {
    const c = verificacion('Ana', enlace);
    expect(c.asunto).toBe('Verifica tu correo · FIAVL');
    expect(c.texto).toContain('Hola, Ana:');
    expect(c.texto).toContain(`Verificar mi correo: ${enlace}`);
    expect(c.texto).toContain('24 horas');
    expect(c.html).toContain('<html lang="es">');
    expect(c.html).toContain(`href="${enlace}"`);
    expect(c.html).toContain('<h1');
  });

  it('cuenta existente: no incluye ningún token ni dato de la cuenta', () => {
    const c = cuentaExistente('Ana', 'https://fiavl.ec/cuenta/ingresar');
    expect(c.texto).not.toMatch(/token=/);
    expect(c.html).not.toMatch(/token=/);
    expect(c.texto).toContain('No hicimos ningún cambio');
  });

  it('escapa el HTML de los datos del usuario', () => {
    const c = verificacion('<script>alert(1)</script>', enlace);
    expect(c.html).not.toContain('<script>');
    expect(c.html).toContain('&lt;script&gt;');
    expect(escaparHtml(`"'&<>`)).toBe('&quot;&#39;&amp;&lt;&gt;');
  });
});
