import { NotFoundException } from '@nestjs/common';
import { ModeloDocumento } from '../common/enums/modelo-documento.enum';
import { StatusNota } from '../common/enums/status-nota.enum';
import { CriarNotaFiscalDto } from './dto/criar-nota.dto';
import { NotaFiscal } from './entities/nota-fiscal.entity';
import { NotasFiscaisController } from './notas-fiscais.controller';
import { NotasFiscaisService } from './notas-fiscais.service';

function notaFixture(overrides: Partial<NotaFiscal> = {}): NotaFiscal {
  return {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    modelo: ModeloDocumento.NFCE,
    serie: 1,
    numero: 1,
    chaveAcesso: '35260812345678000199650010000000011000000015',
    status: StatusNota.AUTORIZADA,
    ambiente: 2,
    naturezaOperacao: 'VENDA',
    destinatarioNome: null,
    destinatarioDocumento: null,
    destinatarioEmail: null,
    destinatarioEndereco: null,
    valorTotal: '20.00',
    xmlAssinado: '<NFe>ASSINADO</NFe>',
    xmlAutorizado: '<nfeProc>AUTORIZADO</nfeProc>',
    protocolo: '135260000012345',
    motivoStatus: 'Autorizado o uso da NF-e',
    codigoStatus: '100',
    dataEmissao: new Date('2026-01-01T12:00:00Z'),
    dataAutorizacao: new Date('2026-01-01T12:00:05Z'),
    itens: [],
    createdAt: new Date('2026-01-01T12:00:00Z'),
    updatedAt: new Date('2026-01-01T12:00:05Z'),
    ...overrides,
  };
}

describe('NotasFiscaisController', () => {
  let controller: NotasFiscaisController;
  let serviceMock: {
    emitir: jest.Mock;
    listar: jest.Mock;
    statusServicoSefaz: jest.Mock;
    buscarPorId: jest.Mock;
  };

  beforeEach(() => {
    serviceMock = {
      emitir: jest.fn(),
      listar: jest.fn(),
      statusServicoSefaz: jest.fn(),
      buscarPorId: jest.fn(),
    };
    controller = new NotasFiscaisController(
      serviceMock as unknown as NotasFiscaisService,
    );
  });

  describe('emitir (POST /notas-fiscais)', () => {
    it('delega o DTO recebido diretamente para NotasFiscaisService.emitir', async () => {
      const dto: CriarNotaFiscalDto = {
        modelo: ModeloDocumento.NFCE,
        itens: [
          {
            codigo: 'PROD-1',
            descricao: 'Produto teste',
            ncm: '20098990',
            cfop: '5102',
            quantidade: 1,
            valorUnitario: 10,
          },
        ],
      };
      const notaCriada = notaFixture();
      serviceMock.emitir.mockResolvedValue(notaCriada);

      const resultado = await controller.emitir(dto);

      expect(serviceMock.emitir).toHaveBeenCalledWith(dto);
      expect(resultado).toBe(notaCriada);
    });

    it('propaga o erro lançado pelo service (ex.: BadRequestException) sem tratá-lo', async () => {
      const erro = new Error('destinatario.documento é obrigatório');
      serviceMock.emitir.mockRejectedValue(erro);

      await expect(
        controller.emitir({
          modelo: ModeloDocumento.NFE,
          itens: [],
        }),
      ).rejects.toThrow(erro);
    });
  });

  describe('listar (GET /notas-fiscais)', () => {
    it('repassa status, modelo e converte pagina/tamanhoPagina de string para número', async () => {
      serviceMock.listar.mockResolvedValue({ dados: [], total: 0 });

      await controller.listar(
        StatusNota.AUTORIZADA,
        ModeloDocumento.NFCE,
        '2',
        '50',
      );

      expect(serviceMock.listar).toHaveBeenCalledWith({
        status: StatusNota.AUTORIZADA,
        modelo: ModeloDocumento.NFCE,
        pagina: 2,
        tamanhoPagina: 50,
      });
    });

    it('repassa pagina e tamanhoPagina como undefined quando os query params não são informados', async () => {
      serviceMock.listar.mockResolvedValue({ dados: [], total: 0 });

      await controller.listar();

      expect(serviceMock.listar).toHaveBeenCalledWith({
        status: undefined,
        modelo: undefined,
        pagina: undefined,
        tamanhoPagina: undefined,
      });
    });

    it('retorna o resultado (dados + total) devolvido pelo service', async () => {
      const listaMock = { dados: [notaFixture()], total: 1 };
      serviceMock.listar.mockResolvedValue(listaMock);

      const resultado = await controller.listar();

      expect(resultado).toBe(listaMock);
    });
  });

  describe('statusSefaz (GET /notas-fiscais/status-sefaz)', () => {
    it('delega para NotasFiscaisService.statusServicoSefaz', async () => {
      const statusMock = {
        cStat: '107',
        xMotivo: 'Em Operação',
        emOperacao: true,
      };
      serviceMock.statusServicoSefaz.mockResolvedValue(statusMock);

      const resultado = await controller.statusSefaz();

      expect(serviceMock.statusServicoSefaz).toHaveBeenCalledTimes(1);
      expect(resultado).toBe(statusMock);
    });
  });

  describe('buscarPorId (GET /notas-fiscais/:id)', () => {
    it('delega o id recebido para NotasFiscaisService.buscarPorId', async () => {
      const nota = notaFixture();
      serviceMock.buscarPorId.mockResolvedValue(nota);

      const resultado = await controller.buscarPorId(nota.id);

      expect(serviceMock.buscarPorId).toHaveBeenCalledWith(nota.id);
      expect(resultado).toBe(nota);
    });

    it('propaga NotFoundException quando o service não encontra a nota', async () => {
      serviceMock.buscarPorId.mockRejectedValue(
        new NotFoundException('Nota fiscal id-inexistente não encontrada.'),
      );

      await expect(controller.buscarPorId('id-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('baixarXml (GET /notas-fiscais/:id/xml)', () => {
    it('retorna o xmlAutorizado quando disponível, mesmo havendo xmlAssinado', async () => {
      const nota = notaFixture({
        xmlAssinado: '<NFe>ASSINADO</NFe>',
        xmlAutorizado: '<nfeProc>AUTORIZADO</nfeProc>',
      });
      serviceMock.buscarPorId.mockResolvedValue(nota);

      const resultado = await controller.baixarXml(nota.id);

      expect(resultado).toBe('<nfeProc>AUTORIZADO</nfeProc>');
    });

    it('retorna o xmlAssinado quando xmlAutorizado ainda não está disponível', async () => {
      const nota = notaFixture({
        xmlAssinado: '<NFe>ASSINADO</NFe>',
        xmlAutorizado: null,
      });
      serviceMock.buscarPorId.mockResolvedValue(nota);

      const resultado = await controller.baixarXml(nota.id);

      expect(resultado).toBe('<NFe>ASSINADO</NFe>');
    });

    it('lança NotFoundException quando nem xmlAutorizado nem xmlAssinado estão disponíveis', async () => {
      const nota = notaFixture({ xmlAssinado: null, xmlAutorizado: null });
      serviceMock.buscarPorId.mockResolvedValue(nota);

      await expect(controller.baixarXml(nota.id)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('propaga NotFoundException quando a nota em si não existe', async () => {
      serviceMock.buscarPorId.mockRejectedValue(
        new NotFoundException('Nota fiscal id-inexistente não encontrada.'),
      );

      await expect(controller.baixarXml('id-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
