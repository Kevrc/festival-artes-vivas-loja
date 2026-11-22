import { randomBytes, randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { ContextoIdentidad } from '@fiavl/contracts';
import { ErrorConCodigo } from '../../../../common/http/problema-codigo.filter';
import { hashContrasena } from '../../domain/contrasenas';
import { invitacionPersonal } from '../../domain/plantillas/plantillas';
import { esPersonal, esRolDePersonal, validarAsignacion } from '../../domain/roles';
import { expiracionDe, generarToken, normalizarCorreo } from '../../domain/tokens';
import { enviarSinBloquear } from '../enviar-correo';
import type {
  AuditoriaIdentidad,
  CuentaPersonal,
  ProveedorCorreo,
  PublicadorIdentidad,
  RelojIdentidad,
  RepositorioIdentidad,
  RolVista,
} from '../puertos';

const SIN_EDICION = '00000000-0000-0000-0000-000000000000';
const MENSAJES_ALCANCE = {
  alcance_requerido: (r: string) => `El rol ${r} necesita un alcance (sede, provincia o disciplina).`,
  alcance_invalido: (r: string) => `El alcance no corresponde al rol ${r}.`,
  alcance_no_aplica: (r: string) => `El rol ${r} no lleva alcance.`,
} as const;

const claveRol = (r: RolVista) => `${r.rol}|${r.alcance?.tipo ?? ''}|${r.alcance?.valor ?? ''}`;

/**
 * Cuentas del personal (US9, FR-019, FR-024, research R16). Solo el administrador. Los roles se
 * leen en cada petición, así que un cambio rige desde la siguiente (US9-AS4). `cuenta.es_personal`
 * se deriva de los roles vigentes; cada acción queda en la auditoría.
 */
export class PersonalServicio {
  private readonly log = new Logger(PersonalServicio.name);

  constructor(
    private readonly repo: RepositorioIdentidad,
    private readonly correo: ProveedorCorreo,
    private readonly publicador: PublicadorIdentidad,
    private readonly auditoria: AuditoriaIdentidad,
    private readonly reloj: RelojIdentidad,
    private readonly urlWeb: string,
  ) {}

  listar(): Promise<CuentaPersonal[]> {
    return this.repo.listarPersonal();
  }

  /**
   * Crea la cuenta pendiente con sus roles y envía el enlace para elegir contraseña (24 h). Si el
   * correo ya tiene cuenta (p. ej. del público), se le suman los roles: no se duplican personas.
   */
  async crear(admin: ContextoIdentidad, e: { nombre: string; correo: string; roles: RolVista[] }, correlacionId: string): Promise<CuentaPersonal> {
    const roles = normalizarRoles(e.roles);
    if (!roles.some((r) => esRolDePersonal(r.rol))) {
      throw new ErrorConCodigo(400, 'rol_personal_requerido', 'Asigna al menos un rol del personal (asistente y postulante son roles del público).');
    }
    const correo = normalizarCorreo(e.correo);
    const existente = await this.repo.cuentaPorCorreo(correo);
    if (existente) {
      if (existente.estado === 'eliminada') throw new ErrorConCodigo(409, 'cuenta_eliminada', 'Ese correo pertenece a una cuenta eliminada.');
      const actuales = await this.repo.rolesVigentes(existente.id);
      return this.reemplazarRoles(admin, existente.id, [...actuales, ...roles], correlacionId);
    }

    const id = randomUUID();
    const ahora = this.reloj();
    // Contraseña aleatoria que nadie conoce: la cuenta no se puede usar hasta abrir el enlace.
    const hash = await hashContrasena(randomBytes(32).toString('base64url'));
    const { token, hash: hashEnlace } = generarToken();
    await this.repo.enTransaccion(async () => {
      await this.repo.crearCuenta({ id, nombre: e.nombre.trim(), correo, hashContrasena: hash, consentimientos: [] });
      await this.repo.crearToken({ cuentaId: id, tipo: 'recuperacion', hash: hashEnlace, expiraEn: expiracionDe('verificacion', ahora) });
      await this.aplicarRoles(admin, id, [], roles, ahora, correlacionId);
      await this.auditar(admin, 'personal.creado', id, null, { roles }, correlacionId);
    });
    enviarSinBloquear(this.correo, correo, invitacionPersonal(e.nombre.trim(), `${this.urlWeb}/cuenta/recuperar/nueva?token=${token}`), this.log);
    return (await this.repo.cuentaPersonal(id))!;
  }

  /** US9-AS4: reemplaza los roles; auditado y publicado como `RolAsignado` por cada alta o baja. */
  async reemplazarRoles(admin: ContextoIdentidad, cuentaId: string, rolesBrutos: RolVista[], correlacionId: string): Promise<CuentaPersonal> {
    const roles = normalizarRoles(rolesBrutos);
    const cuenta = await this.cuentaDe(cuentaId);
    if (cuentaId === admin.cuentaId && cuenta.roles.some((r) => r.rol === 'administrador') && !roles.some((r) => r.rol === 'administrador')) {
      throw new ErrorConCodigo(409, 'accion_sobre_si_mismo', 'No puedes quitarte el rol de administrador: pídeselo a otra persona administradora.');
    }
    const ahora = this.reloj();
    await this.repo.enTransaccion(async () => {
      const cambio = await this.aplicarRoles(admin, cuentaId, cuenta.roles, roles, ahora, correlacionId);
      if (cambio) await this.auditar(admin, 'personal.roles_cambiados', cuentaId, { roles: cuenta.roles }, { roles }, correlacionId);
    });
    return (await this.repo.cuentaPersonal(cuentaId))!;
  }

  /** US9-AS5: desactivar cierra todas sus sesiones al instante y conserva su historial. */
  async cambiarEstado(admin: ContextoIdentidad, cuentaId: string, estado: 'verificada' | 'desactivada', correlacionId: string): Promise<void> {
    if (cuentaId === admin.cuentaId) throw new ErrorConCodigo(409, 'accion_sobre_si_mismo', 'No puedes desactivar tu propia cuenta.');
    const cuenta = await this.cuentaDe(cuentaId);
    if (cuenta.estado === estado) return;
    if (estado === 'verificada' && cuenta.estado !== 'desactivada') return; // reactivar solo aplica a desactivadas
    const ahora = this.reloj();
    await this.repo.enTransaccion(async () => {
      await this.repo.cambiarEstado(cuentaId, estado);
      const cerradas = estado === 'desactivada' ? await this.repo.revocarSesionesDe(cuentaId, ahora) : 0;
      await this.auditar(admin, estado === 'desactivada' ? 'personal.desactivada' : 'personal.reactivada', cuentaId, { estado: cuenta.estado }, { estado, sesionesCerradas: cerradas }, correlacionId);
    });
  }

  /** Caso borde (teléfono perdido): borra el TOTP y cierra sus sesiones; al volver a ingresar lo configura de nuevo. */
  async restablecerSegundoFactor(admin: ContextoIdentidad, cuentaId: string, motivo: string, correlacionId: string): Promise<void> {
    if (cuentaId === admin.cuentaId) throw new ErrorConCodigo(409, 'accion_sobre_si_mismo', 'Otra persona administradora debe restablecer tu segundo factor.');
    await this.cuentaDe(cuentaId);
    const ahora = this.reloj();
    await this.repo.enTransaccion(async () => {
      await this.repo.restablecerSegundoFactor(cuentaId);
      const cerradas = await this.repo.revocarSesionesDe(cuentaId, ahora);
      await this.auditar(admin, 'segundo_factor.restablecido', cuentaId, null, { motivo: motivo.trim(), sesionesCerradas: cerradas }, correlacionId);
    });
  }

  private async cuentaDe(cuentaId: string): Promise<CuentaPersonal> {
    const c = await this.repo.cuentaPersonal(cuentaId);
    if (!c) throw new ErrorConCodigo(404, 'no_encontrado', 'No existe esa cuenta.');
    return c;
  }

  /** Aplica la diferencia; devuelve si hubo cambios. Al pasar a ser personal se cierran sus sesiones del público. */
  private async aplicarRoles(admin: ContextoIdentidad, cuentaId: string, antes: RolVista[], despues: RolVista[], ahora: Date, correlacionId: string): Promise<boolean> {
    const previas = new Map(antes.map((r) => [claveRol(r), r]));
    const nuevas = new Map(despues.map((r) => [claveRol(r), r]));
    const altas = [...nuevas].filter(([k]) => !previas.has(k)).map(([, r]) => r);
    const bajas = [...previas].filter(([k]) => !nuevas.has(k)).map(([, r]) => r);
    if (altas.length === 0 && bajas.length === 0) return false;
    for (const r of bajas) await this.repo.revocarRol(cuentaId, r, ahora);
    for (const r of altas) await this.repo.asignarRol(cuentaId, r, admin.cuentaId, ahora);
    const eraPersonal = esPersonal(antes.map((r) => r.rol));
    const seraPersonal = esPersonal(despues.map((r) => r.rol));
    if (eraPersonal !== seraPersonal) await this.repo.marcarPersonal(cuentaId, seraPersonal);
    // Una sesión abierta del público no pasó por el segundo factor: debe volver a ingresar.
    if (!eraPersonal && seraPersonal) await this.repo.revocarSesionesDe(cuentaId, ahora);
    const edicionId = (await this.repo.edicionVigente()) ?? SIN_EDICION;
    for (const [r, operacion] of [...altas.map((r) => [r, 'asignado'] as const), ...bajas.map((r) => [r, 'revocado'] as const)]) {
      await this.publicador.publicar({
        id: randomUUID(),
        tipo: 'RolAsignado',
        version: 1,
        ocurridoEn: ahora.toISOString(),
        edicionId,
        correlacionId,
        datos: { cuentaId, rol: r.rol, alcance: r.alcance, operacion, asignadoPor: admin.cuentaId },
      });
    }
    return true;
  }

  private auditar(admin: ContextoIdentidad, accion: string, cuentaId: string, anterior: unknown, nuevo: unknown, correlacionId: string) {
    return this.auditoria.registrar({ accion, actorId: admin.cuentaId, rol: 'administrador', entidad: 'cuenta', entidadId: cuentaId, anterior, nuevo, correlacionId });
  }
}

/** Valida el alcance de cada rol (caso borde: taquilla sin sede no se guarda) y quita duplicados. */
function normalizarRoles(roles: RolVista[]): RolVista[] {
  const unicos = new Map<string, RolVista>();
  for (const r of roles) {
    const alcance = r.alcance ? { tipo: r.alcance.tipo, valor: r.alcance.valor.trim() } : null;
    const v = validarAsignacion(r.rol, alcance);
    if (!v.ok) throw new ErrorConCodigo(400, v.codigo, MENSAJES_ALCANCE[v.codigo](r.rol));
    const rol = { rol: r.rol, alcance };
    unicos.set(claveRol(rol), rol);
  }
  return [...unicos.values()];
}
