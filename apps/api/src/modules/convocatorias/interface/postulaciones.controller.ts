import {
  BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, HttpCode, Inject,
  NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Req, StreamableFile, UploadedFile,
  UseFilters, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import type { Request } from 'express';
import { validar } from '../../../common/http/validar';
import { ALMACENAMIENTO_DOCUMENTOS, AUTORIZACION_CONVOCATORIAS, ESCANER_ANTIVIRUS, RELOJ_CONVOCATORIAS, type AlmacenamientoDocumentosPort, type AutorizacionConvocatoriasPort, type EscanerAntivirusPort, type RelojConvocatorias } from '../application/puertos';
import { GuardarDocumento } from '../application/guardar-documento';
import { puedeDescargarDocumento } from '../domain/permisos';
import { validarDocumento, BYTES_MAXIMO_DOCUMENTO } from '../domain/documentos';
import { PostulacionesServicio } from '../application/postulaciones/postulaciones.servicio';
import { PostulacionesPrismaRepository } from '../infrastructure/postulaciones-prisma.repository';
import { secretoFirmaDescarga, validarFirmaDescargaLocal } from '../infrastructure/firma-descarga-local';
import { AlcanceEnControlador, RolesConvocatorias, ConvocatoriasGuard } from './convocatorias.guard';
import { puedeCoordinarProvincia } from '../application/politicas-autorizacion';
import { validacionFallida } from '../infrastructure/observabilidad-convocatorias';
import type { ContextoConvocatorias } from '../application/puertos';
import { ConvocatoriasHttpFilter } from './convocatorias-http.filter';

const ElencoSchema = z.object({
  nombre: z.string().max(200), responsable: z.string().max(200), correoContacto: z.string().email(),
  provinciaPais: z.string().max(120), trayectoria: z.string().max(4000), integrantes: z.array(z.string().max(200)).max(100),
});
const ObraSchema = z.object({
  titulo: z.string().max(200), disciplina: z.string().max(120), sinopsis: z.string().max(4000),
  duracionMin: z.number().int().min(0).max(600), publico: z.string().max(120), fichaTecnica: z.record(z.string(), z.unknown()), videoUrl: z.string().max(500).optional().nullable(),
});
const CrearSchema = z.object({ convocatoriaId: z.string().uuid(), elenco: ElencoSchema, obra: ObraSchema });
const EditarSchema = z.object({ elenco: ElencoSchema, obra: ObraSchema });
const DocumentoSchema = z.object({ tipo: z.string().min(1).max(80) });

interface PeticionPostulante extends Request {
  contextoConvocatorias?: ContextoConvocatorias;
}

@Controller('api/convocatorias')
@UseFilters(ConvocatoriasHttpFilter)
export class PostulacionesController {
  private readonly servicio: PostulacionesServicio;
  constructor(
    @Inject(PostulacionesPrismaRepository) private readonly repo: PostulacionesPrismaRepository,
    @Inject(AUTORIZACION_CONVOCATORIAS) private readonly auth: AutorizacionConvocatoriasPort,
    @Inject(ALMACENAMIENTO_DOCUMENTOS) private readonly almacenamiento: AlmacenamientoDocumentosPort,
    @Inject(ESCANER_ANTIVIRUS) private readonly escaner: EscanerAntivirusPort,
    @Inject(RELOJ_CONVOCATORIAS) private readonly reloj: RelojConvocatorias,
  ) { this.servicio = new PostulacionesServicio(repo, reloj); }

  @Get()
  @Header('Cache-Control', 'no-store')
  listar() { return this.servicio.listarAbiertas(); }

  @Get(':convocatoriaId')
  @Header('Cache-Control', 'no-store')
  convocatoria(@Param('convocatoriaId', ParseUUIDPipe) id: string) { return this.servicio.obtenerConvocatoria(id); }

  @Post('postulaciones')
  @UseGuards(ConvocatoriasGuard)
  @RolesConvocatorias('postulante')
  async crear(@Req() req: PeticionPostulante, @Body() body: unknown) {
    const input = validar(CrearSchema, body);
    return this.servicio.crear(this.cuenta(req), input);
  }

  @Get('postulaciones/:id')
  @UseGuards(ConvocatoriasGuard)
  @RolesConvocatorias('postulante')
  async obtener(@Req() req: PeticionPostulante, @Param('id', ParseUUIDPipe) id: string) {
    const { postulacion, faltantes } = await this.servicio.crearBorradorCompleto(id, this.cuenta(req));
    const detalleSubsanacion = postulacion.estado === 'requiere_subsanacion'
      ? await this.repo.obtenerDetalleSubsanacion(id)
      : postulacion.estado === 'no_admitida'
        ? await this.repo.obtenerDetalleSubsanacion(id, ['postulacion_no_admitida', 'subsanacion_vencida'])
        : null;
    // ahoraServidor permite a la web calcular el tiempo restante sin depender del reloj del navegador.
    return { ...postulacion, faltantes, detalleSubsanacion, ahoraServidor: this.reloj().toISOString() };
  }

  @Get('postulaciones/:id/descarga')
  @UseGuards(ConvocatoriasGuard)
  @RolesConvocatorias('postulante')
  async descargarCopia(@Req() req: PeticionPostulante, @Param('id', ParseUUIDPipe) id: string) {
    const p = await this.servicio.obtenerPropia(id, this.cuenta(req));
    return { postulacionId: p.id, numero: p.numero, estado: p.estado, elenco: p.elenco, obra: {
      titulo: p.tituloObra, disciplina: p.disciplina, sinopsis: p.sinopsis, duracionMin: p.duracionMin,
      publico: p.publico, fichaTecnica: p.fichaTecnica, videoUrl: p.videoUrl,
    }, documentos: p.documentos.map((d: { tipo: string; nombreOriginal: string; bytes: number }) => ({ tipo: d.tipo, nombre: d.nombreOriginal, bytes: d.bytes })) };
  }

  @Patch('postulaciones/:id')
  @UseGuards(ConvocatoriasGuard)
  @RolesConvocatorias('postulante')
  async editar(@Req() req: PeticionPostulante, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.servicio.editar(id, this.cuenta(req), validar(EditarSchema, body));
  }

  @Post('postulaciones/:id/documentos')
  @UseGuards(ConvocatoriasGuard)
  @RolesConvocatorias('postulante')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: BYTES_MAXIMO_DOCUMENTO } }))
  async cargarDocumento(
    @Req() req: PeticionPostulante, @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown, @UploadedFile() archivo?: { originalname: string; mimetype: string; buffer: Buffer; size: number },
  ) {
    const p = await this.servicio.obtenerPropia(id, this.cuenta(req));
    const ahora = this.reloj();
    const corrigeEnPlazo = p.estado === 'requiere_subsanacion' && p.subsanarHasta !== null && ahora <= p.subsanarHasta;
    if ((p.estado !== 'borrador' && !corrigeEnPlazo) || ahora > p.convocatoria.cierraEn) throw new ConflictException('La postulación no admite cambios');
    if (!archivo) throw new BadRequestException('Debe adjuntar un archivo');
    const { tipo } = validar(DocumentoSchema, body);
    const validacion = validarDocumento(archivo.originalname, archivo.mimetype, archivo.buffer);
    if (!validacion.valido) { validacionFallida('documento'); throw new BadRequestException(validacion.motivo); }
    const objectKey = randomUUID();
    const input = { id: randomUUID(), postulacionId: id, tipo, nombreOriginal: archivo.originalname, objectKey, mimeType: archivo.mimetype, bytes: archivo.size, sha256: createHash('sha256').update(archivo.buffer).digest('hex'), contenido: archivo.buffer };
    try {
      await new GuardarDocumento(this.escaner, this.almacenamiento, this.repo).ejecutar(input);
    } catch (error) {
      validacionFallida('antivirus');
      throw error;
    }
    return { id: input.id, postulacionId: id, tipo, nombreOriginal: archivo.originalname, bytes: archivo.size };
  }

  @Get('documentos/:id/descarga')
  @UseGuards(ConvocatoriasGuard)
  @RolesConvocatorias('postulante', 'coordinación de convocatorias', 'coordinación provincial', 'curador')
  @AlcanceEnControlador()
  async solicitarDescarga(@Req() req: PeticionPostulante, @Param('id', ParseUUIDPipe) id: string) {
    const doc = await this.repo.obtenerDocumento(id);
    if (!doc) throw new NotFoundException('Documento inexistente');
    const sujeto = req.contextoConvocatorias!;
    const rol = sujeto.roles.find(({ rol }) => ['postulante', 'coordinación de convocatorias', 'coordinación provincial', 'curador'].includes(rol))!.rol;
    const asignado = doc.postulacion.asignaciones.some((a: { curador: { cuentaId: string } }) => a.curador.cuentaId === sujeto.cuentaId);
    const permitido = puedeDescargarDocumento({ postulanteCuentaId: doc.postulacion.elenco.cuentaId, actorCuentaId: sujeto.cuentaId, rol, curadorAsignado: asignado });
    if (!permitido) throw new ForbiddenException();
    if (rol === 'coordinación provincial' && !puedeCoordinarProvincia(sujeto, doc.postulacion.convocatoria.provincia ?? '')) {
      throw new ForbiddenException('El documento está fuera de su alcance provincial');
    }
    const expiraEn = new Date(Date.now() + 5 * 60_000);
    return { url: await this.almacenamiento.crearUrlDescarga(doc.objectKey, expiraEn), expiraEn: expiraEn.toISOString() };
  }

  @Get('documentos/contenido')
  @Header('Cache-Control', 'private, no-store')
  async contenido(@Query('key') key: string, @Query('exp') expRaw: string, @Query('sig') sig: string) {
    const exp = Number(expRaw);
    if (!key || !validarFirmaDescargaLocal(secretoFirmaDescarga(), key, exp, sig)) throw new ForbiddenException('URL vencida o inválida');
    const doc = await this.repoDocumentoPorKey(key);
    if (!doc) throw new NotFoundException('Documento inexistente');
    return new StreamableFile(await this.almacenamiento.leer(key), { type: doc.mimeType, disposition: `attachment; filename="${encodeURIComponent(doc.nombreOriginal)}"` });
  }

  @Post('postulaciones/:id/enviar')
  @UseGuards(ConvocatoriasGuard)
  @RolesConvocatorias('postulante')
  @HttpCode(200)
  async enviar(@Req() req: PeticionPostulante, @Param('id', ParseUUIDPipe) id: string) {
    const p = await this.servicio.enviar(id, this.cuenta(req)).catch((error: unknown) => {
      if (error instanceof BadRequestException && Array.isArray((error.getResponse() as { faltantes?: unknown }).faltantes)) validacionFallida('faltantes');
      throw error;
    });
    return { postulacionId: p.id, numero: p.numero, estado: p.estado, enviadaEn: p.enviadaEn?.toISOString() };
  }

  @Post('postulaciones/:id/retirar')
  @UseGuards(ConvocatoriasGuard)
  @RolesConvocatorias('postulante')
  @HttpCode(200)
  retirar(@Req() req: PeticionPostulante, @Param('id', ParseUUIDPipe) id: string) { return this.servicio.retirar(id, this.cuenta(req)); }

  private cuenta(req: PeticionPostulante) { return req.contextoConvocatorias?.cuentaId ?? (() => { throw new BadRequestException('Sesión no resuelta'); })(); }
  private repoDocumentoPorKey(key: string) { return this.repo.obtenerDocumentoPorKey(key); }
}
