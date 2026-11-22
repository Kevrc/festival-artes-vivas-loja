import { Logger } from '@nestjs/common';
import type { ContextoIdentidad } from '@fiavl/contracts';
import { ErrorConCodigo } from '../../../../common/http/problema-codigo.filter';
import { dominioDeCorreo, finDelDiaEnLoja, normalizarDominio } from '../../domain/estudiantes';
import { verificacionEstudiante } from '../../domain/plantillas/plantillas';
import { estadoToken, expiracionDe, generarToken, hashToken, normalizarCorreo, puedeReenviar } from '../../domain/tokens';
import { enviarSinBloquear } from '../enviar-correo';
import type { AuditoriaIdentidad, ProveedorCorreo, RelojIdentidad, RepositorioIdentidad } from '../puertos';

const HORA = 60 * 60_000;

/**
 * Condición de estudiante (US12, FR-025, RN-012, research R19). El asistente confirma un correo de
 * un dominio institucional registrado con un enlace de un solo uso; la acreditación dura hasta el
 * fin de la edición vigente y Boletería la usa para las funciones restringidas.
 */
export class EstudiantesServicio {
  private readonly log = new Logger(EstudiantesServicio.name);

  constructor(
    private readonly repo: RepositorioIdentidad,
    private readonly correo: ProveedorCorreo,
    private readonly auditoria: AuditoriaIdentidad,
    private readonly reloj: RelojIdentidad,
    private readonly urlWeb: string,
  ) {}

  async solicitar(ctx: ContextoIdentidad, correoBruto: string, correlacionId: string): Promise<void> {
    const correo = normalizarCorreo(correoBruto);
    const dominio = dominioDeCorreo(correo);
    const registrado = dominio ? await this.repo.dominioDe(dominio) : null;
    if (!registrado) {
      throw new ErrorConCodigo(400, 'dominio_no_institucional', 'Ese correo no es de una institución educativa registrada en el festival. Usa el correo que te dio tu institución.');
    }
    if (!(await this.repo.finEdicionVigente())) throw new ErrorConCodigo(409, 'sin_edicion_vigente', 'Aún no hay una edición publicada: podrás acreditarte cuando se publique la programación.');
    const ahora = this.reloj();
    if (!puedeReenviar(await this.repo.contarTokens(ctx.cuentaId, 'estudiante', new Date(ahora.getTime() - HORA)))) {
      throw new ErrorConCodigo(429, 'limite_reenvios', 'Ya pediste 3 enlaces en la última hora. Revisa tu correo institucional o espera un poco.');
    }
    const cuenta = await this.repo.cuenta(ctx.cuentaId);
    const { token, hash } = generarToken();
    await this.repo.crearToken({ cuentaId: ctx.cuentaId, tipo: 'estudiante', hash, expiraEn: expiracionDe('estudiante', ahora), dato: { correoInstitucional: correo, dominio: registrado.dominio } });
    await this.auditoria.registrar({ accion: 'estudiante.solicitado', actorId: ctx.cuentaId, entidad: 'cuenta', entidadId: ctx.cuentaId, nuevo: { dominio: registrado.dominio }, correlacionId });
    enviarSinBloquear(this.correo, correo, verificacionEstudiante(cuenta?.nombre ?? '', registrado.institucion, `${this.urlWeb}/mi-cuenta/estudiante?token=${token}`), this.log);
  }

  /** El enlace solo vale para la cuenta que lo pidió (se abre con su sesión iniciada). */
  async confirmar(ctx: ContextoIdentidad, token: string, correlacionId: string): Promise<{ vigenteHasta: string; institucion: string }> {
    const ahora = this.reloj();
    const t = await this.repo.tokenPorHash(hashToken(token));
    if (!t || t.tipo !== 'estudiante' || t.cuentaId !== ctx.cuentaId) throw new ErrorConCodigo(410, 'enlace_vencido', 'El enlace no es válido o es de otra cuenta. Pide uno nuevo desde tu cuenta.');
    const estado = estadoToken(t, ahora);
    if (estado === 'usado') throw new ErrorConCodigo(410, 'enlace_usado', 'Este enlace ya se usó.');
    if (estado === 'vencido') throw new ErrorConCodigo(410, 'enlace_vencido', 'El enlace venció (vale 24 horas). Pide uno nuevo.');
    const fin = await this.repo.finEdicionVigente();
    if (!fin) throw new ErrorConCodigo(409, 'sin_edicion_vigente', 'Aún no hay una edición publicada.');
    const vigenteHasta = finDelDiaEnLoja(fin);
    if (vigenteHasta <= ahora) throw new ErrorConCodigo(409, 'sin_edicion_vigente', 'La edición vigente ya terminó.');
    const dato = (await this.repo.datoToken(t.id)) as { dominio?: string } | null;
    const dominio = dato?.dominio ?? '';
    const registrado = dominio ? await this.repo.dominioDe(dominio) : null;
    await this.repo.enTransaccion(async () => {
      if (!(await this.repo.usarToken(t.id, ahora))) throw new ErrorConCodigo(410, 'enlace_usado', 'Este enlace ya se usó.');
      // La evidencia es el dominio verificado, no el correo institucional (minimización, LOPDP).
      await this.repo.acreditarEstudiante(ctx.cuentaId, dominio, vigenteHasta);
      await this.auditoria.registrar({ accion: 'estudiante.acreditado', actorId: ctx.cuentaId, entidad: 'cuenta', entidadId: ctx.cuentaId, nuevo: { dominio, vigenteHasta: vigenteHasta.toISOString() }, correlacionId });
    });
    return { vigenteHasta: vigenteHasta.toISOString(), institucion: registrado?.institucion ?? dominio };
  }

  dominios() {
    return this.repo.dominios();
  }

  async agregarDominio(admin: ContextoIdentidad, dominioBruto: string, institucion: string, correlacionId: string): Promise<{ dominio: string; institucion: string }> {
    const dominio = normalizarDominio(dominioBruto);
    if (!dominio) throw new ErrorConCodigo(400, 'dominio_invalido', 'Escribe un dominio como utpl.edu.ec.');
    if (!(await this.repo.guardarDominio({ dominio, institucion: institucion.trim(), creadoPor: admin.cuentaId }))) {
      throw new ErrorConCodigo(409, 'dominio_existente', 'Ese dominio ya está registrado.');
    }
    await this.auditoria.registrar({ accion: 'estudiante.dominio_agregado', actorId: admin.cuentaId, rol: 'administrador', entidad: 'dominio_institucional', nuevo: { dominio, institucion }, correlacionId });
    return { dominio, institucion: institucion.trim() };
  }
}
