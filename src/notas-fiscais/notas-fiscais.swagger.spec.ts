import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NotasFiscaisController } from './notas-fiscais.controller';
import { NotasFiscaisService } from './notas-fiscais.service';

/**
 * As arrow functions `type: () => X` passadas para `@ApiProperty`/`@ApiPropertyOptional`
 * (em `criar-nota.dto.ts`, `destinatario.dto.ts`, `nota-fiscal-response.dto.ts`) só são
 * de fato invocadas quando `SwaggerModule.createDocument()` roda — não ao simplesmente
 * importar as classes. Este teste não é sobre lógica de negócio (é geração de
 * documentação), mas tem valor real: pega erro de referência circular/anotação Swagger
 * que só aparece nesse momento, além de exercitar essas closures hoje 0% cobertas.
 */
@Module({
  controllers: [NotasFiscaisController],
  providers: [
    {
      provide: NotasFiscaisService,
      useValue: {
        emitir: jest.fn(),
        listar: jest.fn(),
        statusServicoSefaz: jest.fn(),
        buscarPorId: jest.fn(),
      },
    },
  ],
})
class NotasFiscaisSwaggerTestModule {}

describe('Documento Swagger de NotasFiscaisController', () => {
  it('gera o documento OpenAPI sem lançar exceção e inclui os paths esperados do controller', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [NotasFiscaisSwaggerTestModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const config = new DocumentBuilder()
      .setTitle('EmissorNF - teste')
      .setVersion('1.0')
      .build();

    let document: ReturnType<typeof SwaggerModule.createDocument>;
    expect(() => {
      document = SwaggerModule.createDocument(app, config);
    }).not.toThrow();

    expect(Object.keys(document!.paths)).toEqual(
      expect.arrayContaining([
        '/notas-fiscais',
        '/notas-fiscais/status-sefaz',
        '/notas-fiscais/{id}',
        '/notas-fiscais/{id}/xml',
      ]),
    );

    // Confirma que os schemas referenciados pelas closures `type: () => X` foram
    // gerados corretamente (não ficaram como referência quebrada/objeto vazio).
    expect(document!.components?.schemas?.CriarNotaFiscalDto).toBeDefined();
    expect(document!.components?.schemas?.DestinatarioDto).toBeDefined();
    expect(
      document!.components?.schemas?.EnderecoDestinatarioDto,
    ).toBeDefined();
    expect(document!.components?.schemas?.ItemNotaDto).toBeDefined();
    expect(document!.components?.schemas?.NotaFiscalResponseDto).toBeDefined();

    await app.close();
  });
});
