import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { ConvocatoriasModule } from './convocatorias.module';

describe('ConvocatoriasModule', () => {
  it('inicializa su módulo sin requerir tablas ni proveedores de otros contextos', async () => {
    const testingModule = await Test.createTestingModule({ imports: [ConvocatoriasModule] }).compile();
    expect(testingModule.get(ConvocatoriasModule)).toBeInstanceOf(ConvocatoriasModule);
    await testingModule.close();
  });
});
