import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { calcularFaltantesPostulacion } from './reglas-borrador';
import type { DatosPostulacion, PostulacionRegistro, PostulacionesRepositorioPort } from './postulaciones.port';

export class PostulacionesServicio {
  constructor(private readonly repo: PostulacionesRepositorioPort, private readonly reloj: () => Date = () => new Date()) {}

  listarAbiertas() { return this.repo.listarAbiertas(this.reloj()); }

  async obtenerConvocatoria(id: string) {
    const convocatoria = await this.repo.obtenerConvocatoria(id);
    if (!convocatoria) throw new NotFoundException('Convocatoria inexistente');
    return convocatoria;
  }

  async crear(cuentaId: string, datos: DatosPostulacion) {
    const convocatoria = await this.obtenerConvocatoria(datos.convocatoriaId);
    this.exigirAbierta(convocatoria);
    this.validarVideo(datos.obra.videoUrl);
    return this.repo.crearBorrador(cuentaId, datos);
  }

  async editar(id: string, cuentaId: string, datos: Omit<DatosPostulacion, 'convocatoriaId'>) {
    const p = await this.obtenerPropia(id, cuentaId);
    this.exigirAbierta(p.convocatoria);
    if (p.estado !== 'borrador') throw new ConflictException('Retira la postulación antes de editarla');
    this.validarVideo(datos.obra.videoUrl);
    return this.repo.editarBorrador(id, cuentaId, datos, this.reloj());
  }

  async enviar(id: string, cuentaId: string) {
    const p = await this.obtenerPropia(id, cuentaId);
    this.exigirAbierta(p.convocatoria);
    if (p.estado !== 'borrador') throw new ConflictException('Solo se puede enviar un borrador');
    const documentos = await this.repo.listarDocumentos(id);
    const faltantes = calcularFaltantesPostulacion({ elenco: p.elenco, obra: this.obra(p), documentos: documentos.map((d) => d.tipo) });
    if (faltantes.length) throw new BadRequestException({ message: 'La postulación está incompleta', faltantes });
    return this.repo.enviar(id, cuentaId, this.reloj());
  }

  async retirar(id: string, cuentaId: string) {
    const p = await this.obtenerPropia(id, cuentaId);
    if (p.estado !== 'enviada') throw new ConflictException('Solo se puede retirar una postulación enviada');
    return this.repo.retirar(id, cuentaId, this.reloj());
  }

  async obtenerPropia(id: string, cuentaId: string) {
    const p = await this.repo.obtenerPostulacion(id);
    if (!p) throw new NotFoundException('Postulación inexistente');
    if (p.elenco.cuentaId !== cuentaId) throw new ForbiddenException('La postulación pertenece a otra cuenta');
    return p;
  }

  async crearBorradorCompleto(id: string, cuentaId: string) {
    const p = await this.obtenerPropia(id, cuentaId);
    return { postulacion: p, faltantes: calcularFaltantesPostulacion({ elenco: p.elenco, obra: this.obra(p), documentos: p.documentos.map((d: { tipo: string }) => d.tipo) }) };
  }

  private obra(p: PostulacionRegistro) {
    const fichaTecnica = typeof p.fichaTecnica === 'object' && p.fichaTecnica !== null && !Array.isArray(p.fichaTecnica) ? p.fichaTecnica as Record<string, unknown> : {};
    return { titulo: p.tituloObra, disciplina: p.disciplina, sinopsis: p.sinopsis, duracionMin: p.duracionMin, publico: p.publico, fichaTecnica, videoUrl: p.videoUrl };
  }
  private exigirAbierta(c: { abreEn: Date; cierraEn: Date; estado: string }) {
    const ahora = this.reloj();
    if (c.estado !== 'abierta' || ahora < c.abreEn || ahora > c.cierraEn) throw new ConflictException('La convocatoria no está abierta');
  }
  private validarVideo(url?: string | null) {
    if (url && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com)\//i.test(url)) throw new BadRequestException('El video debe enlazar a YouTube o Vimeo por HTTPS');
  }
}
