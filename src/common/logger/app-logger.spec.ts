import { AppLogger } from './app-logger';

/**
 * O winston escreve a linha formatada diretamente no transport `Console` (stdout), sem
 * nenhum ponto de injeção mais alto para mockar — por isso interceptamos a escrita e
 * inspecionamos a string escrita, em vez de mockar o winston em si.
 *
 * O transport `Console` do winston escreve via `console._stdout.write(...)` (Node mapeia
 * `console._stdout` para `process.stdout`, mas quando os testes rodam em conjunto com
 * outras suítes no mesmo worker, o Jest pode substituir o `console` global por um
 * `BufferedConsole` próprio, cujo `_stdout` interno não é o mesmo objeto que
 * `process.stdout` — por isso resolvemos o alvo real a cada teste em vez de assumir
 * `process.stdout` diretamente.
 */
function alvoEscritaConsole(): NodeJS.WriteStream {
  return (
    (console as unknown as { _stdout?: NodeJS.WriteStream })._stdout ??
    process.stdout
  );
}

function ultimaLinhaEscrita(writeSpy: jest.SpyInstance): string {
  const chamadas = writeSpy.mock.calls as unknown as [string][];
  return chamadas[chamadas.length - 1][0];
}

describe('AppLogger', () => {
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    writeSpy = jest
      .spyOn(alvoEscritaConsole(), 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  describe('contexto fixado no construtor (uso normal dentro de um service)', () => {
    const logger = new AppLogger('MeuService');

    it('log() escreve no nível info com o ícone ℹ e a mensagem', () => {
      logger.log('Processo iniciado');

      const linha = ultimaLinhaEscrita(writeSpy);
      expect(linha).toContain('ℹ');
      expect(linha).toContain('Processo iniciado');
      expect(linha).toContain('[MeuService]');
    });

    it('success() escreve com o ícone ✔ e a mensagem', () => {
      logger.success('Operação concluída com sucesso');

      const linha = ultimaLinhaEscrita(writeSpy);
      expect(linha).toContain('✔');
      expect(linha).toContain('Operação concluída com sucesso');
      expect(linha).toContain('[MeuService]');
    });

    it('warn() escreve com o ícone ⚠ e a mensagem', () => {
      logger.warn('Algo merece atenção');

      const linha = ultimaLinhaEscrita(writeSpy);
      expect(linha).toContain('⚠');
      expect(linha).toContain('Algo merece atenção');
      expect(linha).toContain('[MeuService]');
    });

    it('error() sem trace escreve com o ícone ✖ e apenas a mensagem', () => {
      logger.error('Falha ao processar');

      const linha = ultimaLinhaEscrita(writeSpy);
      expect(linha).toContain('✖');
      expect(linha).toContain('Falha ao processar');
      expect(linha).toContain('[MeuService]');
    });

    it('error() com trace inclui o stack junto da mensagem', () => {
      const trace =
        'Error: Falha ao processar\n    at algumaFuncao (arquivo.ts:10:5)';

      logger.error('Falha ao processar', trace);

      const linha = ultimaLinhaEscrita(writeSpy);
      expect(linha).toContain('✖');
      expect(linha).toContain('Falha ao processar');
      expect(linha).toContain('at algumaFuncao (arquivo.ts:10:5)');
    });
  });

  describe('contexto por chamada (uso como logger global do Nest)', () => {
    const logger = new AppLogger();

    it('log() usa o contexto passado por chamada, não um contexto fixo', () => {
      logger.log('Aplicação iniciada na porta 3000', 'NestApplication');

      const linha = ultimaLinhaEscrita(writeSpy);
      expect(linha).toContain('ℹ');
      expect(linha).toContain('Aplicação iniciada na porta 3000');
      expect(linha).toContain('[NestApplication]');
    });

    it('error() com trace e contexto por chamada inclui todos os dados', () => {
      logger.error(
        'Erro não tratado',
        'Error: Erro não tratado\n    at bootstrap (main.ts:5:1)',
        'ExceptionsHandler',
      );

      const linha = ultimaLinhaEscrita(writeSpy);
      expect(linha).toContain('✖');
      expect(linha).toContain('Erro não tratado');
      expect(linha).toContain('at bootstrap (main.ts:5:1)');
      expect(linha).toContain('[ExceptionsHandler]');
    });

    it('não inclui colchetes de contexto quando nenhum contexto é informado', () => {
      logger.log('Mensagem sem contexto');

      const linha = ultimaLinhaEscrita(writeSpy);
      expect(linha).toContain('Mensagem sem contexto');
      // Os únicos colchetes esperados na linha são os dos códigos ANSI de cor (ex.: "[90m",
      // "[0m"), nunca um grupo "[Nome]" de contexto — por isso o regex exige letras dentro.
      expect(linha).not.toMatch(/\[[A-Za-z]+\]/);
    });
  });
});
