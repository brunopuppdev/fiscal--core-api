import { ValidationPipe } from '@nestjs/common';
import { AppLogger } from './common/logger/app-logger';

/**
 * `main.ts` executa `bootstrap()` como efeito colateral do import (`void bootstrap()`),
 * então este teste mocka `NestFactory`/`SwaggerModule` inteiros e observa como eles são
 * chamados — sem isso, importar `main.ts` tentaria compilar o `AppModule` real, o que
 * puxaria `TypeOrmModule.forRootAsync` e abriria uma conexão real com o Postgres.
 *
 * Um único `require('./main')` para todas as asserções (em vez de um por teste com
 * `jest.resetModules()`): resetar módulos entre testes faria `main.ts` importar uma cópia
 * separada de `AppLogger`, quebrando o `toBeInstanceOf(AppLogger)` contra a classe
 * importada no topo deste arquivo (mesma classe, identidades de módulo diferentes).
 */
const appMock = {
  useGlobalPipes: jest.fn(),
  listen: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockReturnValue({ get: jest.fn().mockReturnValue(4000) }),
};

const createMock = jest.fn().mockResolvedValue(appMock);

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: (...args: unknown[]): unknown => createMock(...args),
  },
}));

const createDocumentMock = jest.fn().mockReturnValue({ paths: {} });
const setupMock = jest.fn();

jest.mock('@nestjs/swagger', () => {
  // Mantém o resto do módulo real (ApiProperty/ApiPropertyOptional etc., usados pelos
  // DTOs importados transitivamente via AppModule -> NotasFiscaisModule -> controller/DTOs)
  // e substitui só DocumentBuilder/SwaggerModule, que é o que este teste quer observar.
  const real =
    jest.requireActual<typeof import('@nestjs/swagger')>('@nestjs/swagger');
  class DocumentBuilderStub {
    setTitle(): this {
      return this;
    }
    setDescription(): this {
      return this;
    }
    setVersion(): this {
      return this;
    }
    build(): Record<string, unknown> {
      return { info: {} };
    }
  }
  return {
    ...real,
    DocumentBuilder: DocumentBuilderStub,
    SwaggerModule: {
      createDocument: (...args: unknown[]): unknown =>
        createDocumentMock(...args),
      setup: (...args: unknown[]): unknown => setupMock(...args),
    },
  };
});

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

const portFixture = 4000;

describe('bootstrap (main.ts)', () => {
  beforeAll(async () => {
    // `jest.requireActual` (em vez de `require(...)` direto) evita o import de main.ts
    // ser desviado pelos mocks acima e também mantém o eslint feliz com no-require-imports.
    jest.requireActual('./main');
    await flushPromises();
  });

  it('cria a aplicação com AppLogger como logger global', () => {
    expect(createMock).toHaveBeenCalledTimes(1);
    const [, opcoesCreate] = createMock.mock.calls[0] as [
      unknown,
      { logger: unknown },
    ];
    expect(opcoesCreate.logger).toBeInstanceOf(AppLogger);
  });

  it('configura o ValidationPipe global com whitelist, transform e forbidNonWhitelisted', () => {
    expect(appMock.useGlobalPipes).toHaveBeenCalledTimes(1);
    const [pipe] = appMock.useGlobalPipes.mock.calls[0] as [ValidationPipe];
    expect(pipe).toBeInstanceOf(ValidationPipe);
    // `whitelist`/`forbidNonWhitelisted` ficam agrupados em `validatorOptions` internamente
    // (tudo que a ValidationPipe não desestrutura para uma propriedade própria).
    expect(
      (pipe as unknown as { validatorOptions: Record<string, unknown> })
        .validatorOptions,
    ).toMatchObject({ whitelist: true, forbidNonWhitelisted: true });
    expect(
      (pipe as unknown as { isTransformEnabled: boolean }).isTransformEnabled,
    ).toBe(true);
  });

  it('monta o documento Swagger e expõe em /docs', () => {
    expect(createDocumentMock).toHaveBeenCalledTimes(1);
    const [appRecebido] = createDocumentMock.mock.calls[0] as [unknown];
    expect(appRecebido).toBe(appMock);
    const documentoGerado = createDocumentMock.mock.results[0]
      ?.value as unknown;
    expect(setupMock).toHaveBeenCalledWith('docs', appMock, documentoGerado);
  });

  it('sobe a aplicação na porta lida da config (chave "port")', () => {
    expect(appMock.listen).toHaveBeenCalledWith(portFixture);
  });
});
