import { describe, expect, it } from 'vitest';
import { calcularFaltantesPostulacion } from './reglas-borrador';

describe('US1-AS2 · requisitos del borrador', () => {
  it('informa perfil, ficha y documentos que faltan sin cambiar el estado', () => {
    const faltantes = calcularFaltantesPostulacion({
      elenco: { nombre: '', responsable: '', correoContacto: '', provinciaPais: '', trayectoria: '', integrantes: [] },
      obra: { titulo: '', disciplina: '', sinopsis: '', duracionMin: 0, publico: '', fichaTecnica: {}, videoUrl: '' },
      documentos: [],
    });
    expect(faltantes).toContain('elenco.nombre');
    expect(faltantes).toContain('obra.titulo');
    expect(faltantes).toContain('obra.integrantesEnGira');
    expect(faltantes).toContain('documentos.dossier');
    expect(faltantes).toContain('documentos.ficha_tecnica');
  });

  it('no informa faltantes para perfil, ficha y documentos completos', () => {
    expect(calcularFaltantesPostulacion({
      elenco: { nombre: 'Elenco', responsable: 'Ana', correoContacto: 'ana@example.ec', provinciaPais: 'Loja', trayectoria: 'Trayectoria', integrantes: ['Ana'] },
      obra: { titulo: 'La obra', disciplina: 'teatro', sinopsis: 'Una obra', duracionMin: 60, publico: 'todo público', fichaTecnica: { montaje: 'liviano', integrantesEnGira: 5 }, videoUrl: 'https://youtube.com/watch?v=abc' },
      documentos: ['dossier', 'ficha_tecnica'],
    })).toEqual([]);
  });
});
