import { EmitenteConfig } from '../../config/configuration';
import { ModeloDocumento } from '../../common/enums/modelo-documento.enum';
import { StatusNota } from '../../common/enums/status-nota.enum';
import { NotaFiscal } from '../entities/nota-fiscal.entity';
import { DanfcePdfService } from './danfce-pdf.service';
import { DanfePdfService } from './danfe-pdf.service';
import { NotaFiscalPdfService } from './nota-fiscal-pdf.service';

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

function notaFixture(overrides: Partial<NotaFiscal> = {}): NotaFiscal {
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
    dataEmissao: new Date(2026, 0, 15, 10, 30, 0),
    dataAutorizacao: new Date(2026, 0, 15, 10, 31, 0),
    itens: [],
    createdAt: new Date(2026, 0, 15, 10, 30, 0),
    updatedAt: new Date(2026, 0, 15, 10, 31, 0),
    ...overrides,
  };
}

describe('NotaFiscalPdfService', () => {
  let service: NotaFiscalPdfService;
  let danfePdfServiceMock: { gerar: jest.Mock };
  let danfcePdfServiceMock: { gerar: jest.Mock };

  beforeEach(() => {
    danfePdfServiceMock = { gerar: jest.fn() };
    danfcePdfServiceMock = { gerar: jest.fn() };
    service = new NotaFiscalPdfService(
      danfePdfServiceMock as unknown as DanfePdfService,
      danfcePdfServiceMock as unknown as DanfcePdfService,
    );
  });

  it('delega para DanfePdfService quando a nota é NF-e (modelo 55)', async () => {
    const nota = notaFixture({ modelo: ModeloDocumento.NFE });
    const bufferFixture = Buffer.from('PDF-DANFE');
    danfePdfServiceMock.gerar.mockResolvedValue(bufferFixture);

    const resultado = await service.gerar(nota, emitenteFixture);

    expect(danfePdfServiceMock.gerar).toHaveBeenCalledWith(
      nota,
      emitenteFixture,
    );
    expect(danfcePdfServiceMock.gerar).not.toHaveBeenCalled();
    expect(resultado).toBe(bufferFixture);
  });

  it('delega para DanfcePdfService quando a nota é NFC-e (modelo 65)', async () => {
    const nota = notaFixture({ modelo: ModeloDocumento.NFCE });
    const bufferFixture = Buffer.from('PDF-DANFCE');
    danfcePdfServiceMock.gerar.mockResolvedValue(bufferFixture);

    const resultado = await service.gerar(nota, emitenteFixture);

    expect(danfcePdfServiceMock.gerar).toHaveBeenCalledWith(
      nota,
      emitenteFixture,
    );
    expect(danfePdfServiceMock.gerar).not.toHaveBeenCalled();
    expect(resultado).toBe(bufferFixture);
  });

  it('lança Error, sem chamar nenhum dos dois services, quando a nota não tem xml_autorizado persistido', async () => {
    const nota = notaFixture({ xmlAutorizado: null });

    await expect(service.gerar(nota, emitenteFixture)).rejects.toThrow(
      /não possui xml_autorizado persistido/,
    );
    expect(danfePdfServiceMock.gerar).not.toHaveBeenCalled();
    expect(danfcePdfServiceMock.gerar).not.toHaveBeenCalled();
  });
});
