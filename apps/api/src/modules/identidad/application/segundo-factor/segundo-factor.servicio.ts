import type { ContextoIdentidad } from '@fiavl/contracts';
import QRCode from 'qrcode';
import { ErrorConCodigo } from '../../../../common/http/problema-codigo.filter';
import { BLOQUEO, bloqueadaHasta, debeBloquear } from '../../domain/bloqueo';
import { claveLegible, generarSecretoTotp, otpauthUri, verificarTotp } from '../../domain/totp';
import type { AuditoriaIdentidad, Cifrador, RelojIdentidad, RepositorioIdentidad } from '../puertos';

export interface AltaTotp {
  otpauthUri: string;
  qrSvg: string;
  /** La misma clave en texto, en grupos de 4, para escribirla a mano o con lector de pantalla. */
  clave: string;
}

/** Clave de `intento_acceso` para los códigos fallidos de una cuenta (no es un correo). */
const claveIntentos = (cuentaId: string) => `totp:${cuentaId}`;

/**
 * Segundo factor del personal (US9-AS3, FR-018, research R13). Una sesión del personal nace
 * restringida (`segundo_factor_ok = false`) y solo puede dar de alta o verificar el TOTP; al
 * verificar un código la sesión queda completa. Los códigos fallidos cuentan como intentos: 5 en
 * 15 minutos cierran la sesión y bloquean la cuenta igual que la contraseña (US8-AS2).
 */
export class SegundoFactorServicio {
  constructor(
    private readonly repo: RepositorioIdentidad,
    private readonly cifrador: Cifrador,
    private readonly auditoria: AuditoriaIdentidad,
    private readonly reloj: RelojIdentidad,
    private readonly relojTotp: RelojIdentidad,
  ) {}

  /** Genera un secreto pendiente y su QR. Con el TOTP ya activo no se puede: solo el administrador lo restablece. */
  async alta(ctx: ContextoIdentidad): Promise<AltaTotp> {
    await this.exigirPersonal(ctx);
    const actual = await this.repo.segundoFactor(ctx.cuentaId);
    if (actual?.activo) {
      throw new ErrorConCodigo(409, 'segundo_factor_activo', 'Tu segundo factor ya está configurado. Si perdiste el teléfono, pide al administrador que lo restablezca.');
    }
    const secreto = generarSecretoTotp();
    await this.repo.guardarSecretoPendiente(ctx.cuentaId, this.cifrador.cifrar(secreto));
    const uri = otpauthUri(secreto, ctx.correo);
    const qrSvg = await QRCode.toString(uri, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
    return { otpauthUri: uri, qrSvg, clave: claveLegible(secreto) };
  }

  /** Confirma el alta o completa el inicio de sesión. El mismo código no sirve dos veces. */
  async verificar(ctx: ContextoIdentidad, codigo: string, correlacionId: string): Promise<void> {
    await this.exigirPersonal(ctx);
    const ahora = this.reloj();
    const guardado = await this.repo.segundoFactor(ctx.cuentaId);
    if (!guardado?.secretoCifrado) {
      throw new ErrorConCodigo(409, 'sin_segundo_factor', 'Primero configura el segundo factor con tu aplicación de códigos.');
    }
    const secreto = this.cifrador.descifrar(guardado.secretoCifrado);
    const paso = verificarTotp(secreto, codigo, this.relojTotp(), guardado.ultimoPaso);
    if (paso === null || !(await this.repo.usarPasoTotp(ctx.cuentaId, paso))) {
      await this.fallo(ctx, ahora, correlacionId);
      throw new ErrorConCodigo(401, 'codigo_invalido', 'El código no es correcto o ya se usó. Espera el siguiente e intenta de nuevo.');
    }
    await this.repo.enTransaccion(async () => {
      await this.repo.registrarIntento(claveIntentos(ctx.cuentaId), true, ahora);
      await this.repo.marcarSegundoFactorOk(ctx.sesionId);
      await this.auditoria.registrar({
        accion: guardado.activo ? 'sesion.segundo_factor_ok' : 'segundo_factor.activado',
        actorId: ctx.cuentaId,
        entidad: 'sesion',
        entidadId: ctx.sesionId,
        correlacionId,
      });
    });
  }

  private async fallo(ctx: ContextoIdentidad, ahora: Date, correlacionId: string) {
    const clave = claveIntentos(ctx.cuentaId);
    await this.repo.registrarIntento(clave, false, ahora);
    const fallos = await this.repo.contarFallos(clave, new Date(ahora.getTime() - BLOQUEO.ventanaMs));
    if (!debeBloquear(fallos)) return;
    const hasta = bloqueadaHasta(ahora);
    await this.repo.enTransaccion(async () => {
      await this.repo.bloquear(ctx.cuentaId, hasta);
      await this.repo.revocarSesionesDe(ctx.cuentaId, ahora);
      await this.auditoria.registrar({ accion: 'cuenta.bloqueada', actorId: null, entidad: 'cuenta', entidadId: ctx.cuentaId, nuevo: { hasta: hasta.toISOString(), fallos, por: 'segundo_factor' }, correlacionId });
    });
  }

  /** El público no usa segundo factor en v1 (FR-018 es para el personal). */
  private async exigirPersonal(ctx: ContextoIdentidad) {
    const cuenta = await this.repo.cuentaPersonal(ctx.cuentaId);
    if (!cuenta?.esPersonal) throw new ErrorConCodigo(403, 'solo_personal', 'El segundo factor es solo para las cuentas del personal.');
  }
}
