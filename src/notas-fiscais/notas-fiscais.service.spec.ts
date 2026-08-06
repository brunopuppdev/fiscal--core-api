import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { AppConfig, EmitenteConfig } from '../config/configuration';
import { AppLogger } from '../common/logger/app-logger';
import { FormaPagamento } from '../common/enums/forma-pagamento.enum';
import { ModeloDocumento } from '../common/enums/modelo-documento.enum';
import { StatusNota } from '../common/enums/status-nota.enum';
import { CriarNotaFiscalDto } from './dto/criar-nota.dto';
import { ItemNotaDto } from './dto/item-nota.dto';
import { NumeracaoControle } from './entities/numeracao-controle.entity';
import { NotaFiscal } from './entities/nota-fiscal.entity';
import { NotasFiscaisService } from './notas-fiscais.service';
import { NotaFiscalPdfService } from './pdf/nota-fiscal-pdf.service';
import {
  RetornoAutorizacao,
  SefazClientService,
} from './sefaz/sefaz-client.service';
import { NfeXmlBuilderService } from './xml/nfe-xml-builder.service';
import { NfeXmlSignerService } from './xml/nfe-xml-signer.service';

const emitenteFixture: EmitenteConfig = {
  cnpj: '12345678000199', // fictício
  razaoSocial: 'Empresa Teste MEI LTDA',
  nomeFantasia: 'Teste MEI',
  ie: 'ISENTO',
  crt: 1,
  logradouro: 'Rua das Acácias',
  numero: '100',
  bairro: 'Centro',
  municipio: 'São Paulo',
  codMunicipio: '3550308',
  uf: 'SP',
  cep: '01001-000',
};

function itemDtoFixture(overrides: Partial<ItemNotaDto> = {}): ItemNotaDto {
  return {
    codigo: 'PROD-1',
    descricao: 'Produto de teste',
    ncm: '20098990',
    cfop: '5102',
    unidade: 'UN',
    quantidade: 2,
    valorUnitario: 10,
    ...overrides,
  };
}

function dtoNfce(
  overrides: Partial<CriarNotaFiscalDto> = {},
): CriarNotaFiscalDto {
  return {
    modelo: ModeloDocumento.NFCE,
    itens: [itemDtoFixture()],
    formaPagamento: FormaPagamento.PIX,
    ...overrides,
  };
}

function dtoNfe(
  overrides: Partial<CriarNotaFiscalDto> = {},
): CriarNotaFiscalDto {
  return {
    modelo: ModeloDocumento.NFE,
    destinatario: { documento: '11122233344' }, // CPF fictício
    itens: [itemDtoFixture()],
    formaPagamento: FormaPagamento.PIX,
    ...overrides,
  };
}

function retornoAutorizada(
  overrides: Partial<RetornoAutorizacao> = {},
): RetornoAutorizacao {
  return {
    cStat: '100',
    xMotivo: 'Autorizado o uso da NF-e',
    protocolo: '135260000012345',
    autorizada: true,
    xmlProtocolo:
      '<protNFe><infProt><nProt>135260000012345</nProt></infProt></protNFe>',
    ...overrides,
  };
}

describe('NotasFiscaisService', () => {
  let service: NotasFiscaisService;
  let notaFiscalRepoMock: {
    manager: { create: jest.Mock };
    create: jest.Mock;
    save: jest.Mock;
    findAndCount: jest.Mock;
    findOne: jest.Mock;
  };
  let txManagerMock: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let dataSourceMock: { transaction: jest.Mock };
  let configServiceMock: { get: jest.Mock };
  let xmlBuilderMock: { montar: jest.Mock };
  let xmlSignerMock: { assinar: jest.Mock };
  let sefazClientMock: {
    autorizar: jest.Mock;
    consultarStatusServico: jest.Mock;
  };
  let notaFiscalPdfServiceMock: { gerar: jest.Mock };
  /**
   * Snapshot (cópia rasa) do estado de `nota` em cada chamada de `save`. Necessário porque
   * o service reutiliza/mutação o mesmo objeto entre a primeira persistência (ASSINADA) e a
   * segunda (status final) — inspecionar `save.mock.calls` depois do fato só veria o estado
   * final, já mutado, em ambas as chamadas.
   */
  let notaSalvaSnapshots: Array<Record<string, unknown>>;

  beforeEach(() => {
    jest.spyOn(AppLogger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(AppLogger.prototype, 'warn').mockImplementation(() => undefined);
    jest
      .spyOn(AppLogger.prototype, 'error')
      .mockImplementation(() => undefined);
    jest
      .spyOn(AppLogger.prototype, 'success')
      .mockImplementation(() => undefined);

    notaSalvaSnapshots = [];
    notaFiscalRepoMock = {
      manager: { create: jest.fn((_entity: unknown, data: unknown) => data) },
      create: jest.fn((data: object) => ({ ...data })),
      save: jest.fn((nota: Record<string, unknown>) => {
        notaSalvaSnapshots.push({ ...nota });
        return Promise.resolve(nota);
      }),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      findOne: jest.fn().mockResolvedValue(null),
    };

    txManagerMock = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_entity: unknown, data: unknown) => ({
        ...(data as object),
      })),
      save: jest.fn((data: { ultimoNumero: number }) => Promise.resolve(data)),
    };

    dataSourceMock = {
      transaction: jest.fn((cb: (manager: unknown) => unknown) =>
        cb(txManagerMock),
      ),
    };

    configServiceMock = {
      get: jest.fn((chave: string) => {
        switch (chave) {
          case 'emitente':
            return emitenteFixture;
          case 'sefaz':
            return { ambiente: 2, uf: 'SP' };
          case 'numeracao':
            return { nfeSerie: 1, nfceSerie: 1 };
          case 'nfce':
            return { csc: 'CSC-FIXTURE', cscId: '1' };
          default:
            throw new Error(
              `Chave de configuração não mockada neste teste: ${chave}`,
            );
        }
      }),
    };

    xmlBuilderMock = {
      montar: jest.fn().mockReturnValue('<NFe>XML-FIXTURE</NFe>'),
    };
    xmlSignerMock = {
      assinar: jest.fn().mockReturnValue('<NFe>XML-ASSINADO-FIXTURE</NFe>'),
    };
    sefazClientMock = {
      autorizar: jest.fn(),
      consultarStatusServico: jest.fn(),
    };
    notaFiscalPdfServiceMock = { gerar: jest.fn() };

    service = new NotasFiscaisService(
      notaFiscalRepoMock as unknown as Repository<NotaFiscal>,
      dataSourceMock as unknown as DataSource,
      configServiceMock as unknown as ConfigService<AppConfig, true>,
      xmlBuilderMock as unknown as NfeXmlBuilderService,
      xmlSignerMock as unknown as NfeXmlSignerService,
      sefazClientMock as unknown as SefazClientService,
      notaFiscalPdfServiceMock as unknown as NotaFiscalPdfService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validação de destinatário', () => {
    it('rejeita NF-e (modelo 55) sem destinatario.documento com BadRequestException', async () => {
      const dto = dtoNfce({
        modelo: ModeloDocumento.NFE,
        destinatario: undefined,
      });

      await expect(service.emitir(dto)).rejects.toThrow(BadRequestException);
      expect(dataSourceMock.transaction).not.toHaveBeenCalled();
      expect(xmlBuilderMock.montar).not.toHaveBeenCalled();
      expect(sefazClientMock.autorizar).not.toHaveBeenCalled();
    });

    it('permite NFC-e (modelo 65) sem destinatário (consumidor não identificado)', async () => {
      sefazClientMock.autorizar.mockResolvedValue(retornoAutorizada());

      await expect(service.emitir(dtoNfce())).resolves.toBeDefined();
    });
  });

  describe('emitir - fluxo autorizado pela SEFAZ', () => {
    it('finaliza com status AUTORIZADA, protocolo setado e persiste a nota antes e depois do envio', async () => {
      sefazClientMock.autorizar.mockResolvedValue(retornoAutorizada());

      const resultado = await service.emitir(dtoNfe());

      expect(resultado.status).toBe(StatusNota.AUTORIZADA);
      expect(resultado.protocolo).toBe('135260000012345');
      expect(resultado.codigoStatus).toBe('100');
      expect(resultado.xmlAutorizado).toContain('<nfeProc');
      expect(resultado.xmlAutorizado).toContain(
        '<NFe>XML-ASSINADO-FIXTURE</NFe>',
      );
      expect(resultado.dataAutorizacao).toBeInstanceOf(Date);

      expect(notaFiscalRepoMock.save).toHaveBeenCalledTimes(2);
      expect(notaSalvaSnapshots[0].status).toBe(StatusNota.ASSINADA);
      expect(notaSalvaSnapshots[1].status).toBe(StatusNota.AUTORIZADA);
    });

    it('monta o XML, assina e envia à SEFAZ nessa ordem antes de persistir o resultado final', async () => {
      sefazClientMock.autorizar.mockResolvedValue(retornoAutorizada());

      await service.emitir(dtoNfe());

      expect(xmlBuilderMock.montar).toHaveBeenCalledTimes(1);
      expect(xmlSignerMock.assinar).toHaveBeenCalledWith(
        '<NFe>XML-FIXTURE</NFe>',
      );
      expect(sefazClientMock.autorizar).toHaveBeenCalledWith(
        '<NFe>XML-ASSINADO-FIXTURE</NFe>',
        expect.any(Number),
        ModeloDocumento.NFE,
      );
    });

    it('repassa CSC e CSC ID (config nfce) para o builder do XML', async () => {
      sefazClientMock.autorizar.mockResolvedValue(retornoAutorizada());

      await service.emitir(dtoNfce());

      expect(xmlBuilderMock.montar).toHaveBeenCalledWith(
        expect.objectContaining({ csc: 'CSC-FIXTURE', cscId: '1' }),
      );
    });
  });

  describe('emitir - dados derivados com valores padrão/opcionais', () => {
    it('usa cUF padrão "35" quando a UF do emitente não está no mapa CODIGO_UF', async () => {
      sefazClientMock.autorizar.mockResolvedValue(retornoAutorizada());
      configServiceMock.get.mockImplementation((chave: string) => {
        switch (chave) {
          case 'emitente':
            return { ...emitenteFixture, uf: 'XX' }; // UF inexistente/fora do mapa
          case 'sefaz':
            return { ambiente: 2, uf: 'SP' };
          case 'numeracao':
            return { nfeSerie: 1, nfceSerie: 1 };
          case 'nfce':
            return { csc: 'CSC-FIXTURE', cscId: '1' };
          default:
            throw new Error(
              `Chave de configuração não mockada neste teste: ${chave}`,
            );
        }
      });

      const resultado = await service.emitir(dtoNfce());

      // Mesmo sem mapeamento, a chave de acesso continua sendo gerada (cai no fallback '35').
      expect(resultado.chaveAcesso).toHaveLength(44);
      expect(resultado.chaveAcesso.slice(0, 2)).toBe('35');
    });

    it('usa "UN" como unidade do item persistido quando o DTO não informa unidade', async () => {
      sefazClientMock.autorizar.mockResolvedValue(retornoAutorizada());

      await service.emitir(
        dtoNfce({ itens: [itemDtoFixture({ unidade: undefined })] }),
      );

      const nota = notaSalvaSnapshots[0] as unknown as {
        itens: Array<{ unidade: string }>;
      };
      expect(nota.itens[0].unidade).toBe('UN');
    });

    it('persiste destinatarioEndereco com os dados do endereço quando informado no DTO', async () => {
      sefazClientMock.autorizar.mockResolvedValue(retornoAutorizada());
      const endereco = {
        logradouro: 'Avenida Paulista',
        numero: '1000',
        bairro: 'Bela Vista',
        codMunicipio: '3550308',
        municipio: 'São Paulo',
        uf: 'SP',
        cep: '01310-100',
      };

      await service.emitir(
        dtoNfe({
          destinatario: { documento: '11122233344', endereco },
        }),
      );

      expect(notaSalvaSnapshots[0].destinatarioEndereco).toEqual(endereco);
    });

    it('mantém destinatarioEndereco nulo quando o DTO não informa endereço', async () => {
      sefazClientMock.autorizar.mockResolvedValue(retornoAutorizada());

      await service.emitir(dtoNfe());

      expect(notaSalvaSnapshots[0].destinatarioEndereco).toBeNull();
    });

    it('define protocolo como null e xmlAutorizado igual ao XML assinado puro quando a SEFAZ autoriza sem protocolo/xmlProtocolo', async () => {
      sefazClientMock.autorizar.mockResolvedValue(
        retornoAutorizada({ protocolo: undefined, xmlProtocolo: undefined }),
      );

      const resultado = await service.emitir(dtoNfce());

      expect(resultado.status).toBe(StatusNota.AUTORIZADA);
      expect(resultado.protocolo).toBeNull();
      expect(resultado.xmlAutorizado).toBe('<NFe>XML-ASSINADO-FIXTURE</NFe>');
      expect(resultado.xmlAutorizado).not.toContain('<nfeProc');
    });
  });

  describe('emitir - rejeição pela SEFAZ', () => {
    it('finaliza com status REJEITADA quando a SEFAZ retorna cStat diferente de 100', async () => {
      sefazClientMock.autorizar.mockResolvedValue({
        cStat: '225',
        xMotivo: 'Rejeição: Falha no Schema XML',
        autorizada: false,
      });

      const resultado = await service.emitir(dtoNfce());

      expect(resultado.status).toBe(StatusNota.REJEITADA);
      expect(resultado.codigoStatus).toBe('225');
      expect(resultado.motivoStatus).toBe('Rejeição: Falha no Schema XML');
      expect(resultado.protocolo).toBeUndefined();
    });
  });

  describe('emitir - erro de comunicação com a SEFAZ', () => {
    it('finaliza com status ERRO e trunca motivoStatus em 255 caracteres, sem deixar a exceção subir', async () => {
      const mensagemGigante = 'Falha de rede: '.padEnd(400, 'x');
      sefazClientMock.autorizar.mockRejectedValue(new Error(mensagemGigante));

      const resultado = await service.emitir(dtoNfce());

      expect(resultado.status).toBe(StatusNota.ERRO);
      expect(resultado.motivoStatus).toHaveLength(255);
      expect(resultado.motivoStatus).toBe(mensagemGigante.slice(0, 255));
      // A nota assinada já tinha sido persistida antes da tentativa de envio.
      expect(notaFiscalRepoMock.save).toHaveBeenCalledTimes(2);
      expect(notaSalvaSnapshots[0].status).toBe(StatusNota.ASSINADA);
    });
  });

  describe('proximoNumero (reserva de numeração sequencial)', () => {
    it('busca o controle de numeração com lock pessimista dentro da transação', async () => {
      sefazClientMock.autorizar.mockResolvedValue(retornoAutorizada());

      await service.emitir(dtoNfce());

      expect(dataSourceMock.transaction).toHaveBeenCalledTimes(1);
      expect(txManagerMock.findOne).toHaveBeenCalledWith(NumeracaoControle, {
        where: { modelo: ModeloDocumento.NFCE, serie: 1 },
        lock: { mode: 'pessimistic_write' },
      });
    });

    it('inicia a numeração em 1 quando ainda não existe controle para o modelo/série', async () => {
      sefazClientMock.autorizar.mockResolvedValue(retornoAutorizada());
      txManagerMock.findOne.mockResolvedValue(null);

      const resultado = await service.emitir(dtoNfce());

      expect(resultado.numero).toBe(1);
      expect(txManagerMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ ultimoNumero: 1 }),
      );
    });

    it('incrementa sequencialmente o número reservado a cada emissão para o mesmo modelo/série', async () => {
      sefazClientMock.autorizar.mockResolvedValue(retornoAutorizada());
      const controleExistente = {
        modelo: ModeloDocumento.NFCE,
        serie: 1,
        ultimoNumero: 10,
      };
      txManagerMock.findOne.mockResolvedValue(controleExistente);

      const primeiraNota = await service.emitir(dtoNfce());
      const segundaNota = await service.emitir(dtoNfce());

      expect(primeiraNota.numero).toBe(11);
      expect(segundaNota.numero).toBe(12);
    });
  });

  describe('listar', () => {
    it('aplica os filtros de status e modelo na cláusula where quando informados', async () => {
      notaFiscalRepoMock.findAndCount.mockResolvedValue([[], 0]);

      await service.listar({
        status: StatusNota.AUTORIZADA,
        modelo: ModeloDocumento.NFCE,
      });

      expect(notaFiscalRepoMock.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: StatusNota.AUTORIZADA,
            modelo: ModeloDocumento.NFCE,
          },
        }),
      );
    });

    it('não inclui status/modelo na cláusula where quando os filtros não são informados', async () => {
      notaFiscalRepoMock.findAndCount.mockResolvedValue([[], 0]);

      await service.listar({});

      expect(notaFiscalRepoMock.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('usa página 1 e tamanhoPagina 20 como padrão quando não informados', async () => {
      notaFiscalRepoMock.findAndCount.mockResolvedValue([[], 0]);

      await service.listar({});

      expect(notaFiscalRepoMock.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('calcula skip a partir da página informada', async () => {
      notaFiscalRepoMock.findAndCount.mockResolvedValue([[], 0]);

      await service.listar({ pagina: 3, tamanhoPagina: 10 });

      expect(notaFiscalRepoMock.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });

    it('limita tamanhoPagina a 100 mesmo quando um valor maior é solicitado', async () => {
      notaFiscalRepoMock.findAndCount.mockResolvedValue([[], 0]);

      await service.listar({ tamanhoPagina: 500 });

      expect(notaFiscalRepoMock.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('trata página/tamanhoPagina não positivos como não informados (usa o padrão)', async () => {
      notaFiscalRepoMock.findAndCount.mockResolvedValue([[], 0]);

      await service.listar({ pagina: 0, tamanhoPagina: -5 });

      expect(notaFiscalRepoMock.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
    });

    it('retorna os dados e o total devolvidos pelo repositório', async () => {
      const notasEncontradas = [{ id: 'nota-1' }] as unknown as NotaFiscal[];
      notaFiscalRepoMock.findAndCount.mockResolvedValue([notasEncontradas, 1]);

      const resultado = await service.listar({});

      expect(resultado).toEqual({ dados: notasEncontradas, total: 1 });
    });
  });

  describe('buscarPorId', () => {
    it('retorna a nota quando encontrada pelo id', async () => {
      const nota = { id: 'nota-1' } as unknown as NotaFiscal;
      notaFiscalRepoMock.findOne.mockResolvedValue(nota);

      const resultado = await service.buscarPorId('nota-1');

      expect(notaFiscalRepoMock.findOne).toHaveBeenCalledWith({
        where: { id: 'nota-1' },
      });
      expect(resultado).toBe(nota);
    });

    it('lança NotFoundException quando a nota não é encontrada', async () => {
      notaFiscalRepoMock.findOne.mockResolvedValue(null);

      await expect(service.buscarPorId('id-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('statusServicoSefaz', () => {
    it('delega para SefazClientService.consultarStatusServico repassando o modelo e retorna o resultado', async () => {
      const statusMock = {
        cStat: '107',
        xMotivo: 'Serviço em Operação',
        emOperacao: true,
      };
      sefazClientMock.consultarStatusServico.mockResolvedValue(statusMock);

      const resultado = await service.statusServicoSefaz(ModeloDocumento.NFCE);

      expect(sefazClientMock.consultarStatusServico).toHaveBeenCalledWith(
        ModeloDocumento.NFCE,
      );
      expect(resultado).toBe(statusMock);
    });
  });

  describe('gerarPdf', () => {
    function notaAutorizadaFixture(
      overrides: Partial<NotaFiscal> = {},
    ): NotaFiscal {
      return {
        id: 'nota-1',
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
        formaPagamento: '17',
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

    it('lança ConflictException quando a nota não está AUTORIZADA', async () => {
      notaFiscalRepoMock.findOne.mockResolvedValue(
        notaAutorizadaFixture({ status: StatusNota.REJEITADA }),
      );

      await expect(service.gerarPdf('nota-1')).rejects.toThrow(
        ConflictException,
      );
      expect(notaFiscalPdfServiceMock.gerar).not.toHaveBeenCalled();
    });

    it('delega para NotaFiscalPdfService.gerar e monta o nome do arquivo pelo modelo (danfce para NFC-e)', async () => {
      const nota = notaAutorizadaFixture();
      notaFiscalRepoMock.findOne.mockResolvedValue(nota);
      const bufferFixture = Buffer.from('PDF-FAKE');
      notaFiscalPdfServiceMock.gerar.mockResolvedValue(bufferFixture);

      const resultado = await service.gerarPdf('nota-1');

      expect(notaFiscalPdfServiceMock.gerar).toHaveBeenCalledWith(
        nota,
        emitenteFixture,
      );
      expect(resultado.buffer).toBe(bufferFixture);
      expect(resultado.nomeArquivo).toBe(`danfce-${nota.chaveAcesso}.pdf`);
    });

    it('monta o nome do arquivo com prefixo "danfe" para NF-e (modelo 55)', async () => {
      const nota = notaAutorizadaFixture({ modelo: ModeloDocumento.NFE });
      notaFiscalRepoMock.findOne.mockResolvedValue(nota);
      notaFiscalPdfServiceMock.gerar.mockResolvedValue(Buffer.from('PDF'));

      const resultado = await service.gerarPdf('nota-1');

      expect(resultado.nomeArquivo).toBe(`danfe-${nota.chaveAcesso}.pdf`);
    });

    it('propaga NotFoundException quando a nota não existe', async () => {
      notaFiscalRepoMock.findOne.mockResolvedValue(null);

      await expect(service.gerarPdf('id-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
