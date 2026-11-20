export type ResultadoFalsoAntivirus = 'limpio' | 'infectado' | 'caido';
export interface ResultadoEscaneo { limpio: boolean; motivo?: 'infectado' }

export class FalsoEscanerAntivirus {
  constructor(private readonly resultado: ResultadoFalsoAntivirus = 'limpio') {}

  async escanear(_contenido: Buffer): Promise<ResultadoEscaneo> {
    if (this.resultado === 'caido') throw new Error('escáner no disponible');
    return this.resultado === 'limpio' ? { limpio: true } : { limpio: false, motivo: 'infectado' };
  }
}
