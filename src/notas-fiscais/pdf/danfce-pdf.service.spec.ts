import { EmitenteConfig } from '../../config/configuration';
import { ModeloDocumento } from '../../common/enums/modelo-documento.enum';
import { StatusNota } from '../../common/enums/status-nota.enum';
import { ItemNota } from '../entities/item-nota.entity';
import { NotaFiscal } from '../entities/nota-fiscal.entity';
import { DanfcePdfService } from './danfce-pdf.service';

// Chave de acesso fictícia (44 dígitos), só para exercitar a geração do DANFCE.
const CHAVE_ACESSO_FIXTURE = '35260812345678000199650010000000011000000015';

const emitenteFixture: EmitenteConfig = {
  cnpj: '12345678000199', // fictício
  razaoSocial: 'Empresa Teste MEI LTDA',
  nomeFantasia: 'Teste MEI',
  ie: '110042490114',
  crt: 1,
  logradouro: 'Rua das Acácias',
  numero: '100',
  bairro: 'Centro',
  municipio: 'São Paulo',
  codMunicipio: '3550308',
  uf: 'SP',
  cep: '01001-000',
  telefone: '11999990000',
};

function itemFixture(overrides: Partial<ItemNota> = {}): ItemNota {
  return {
    id: 'item-1',
    notaFiscal: undefined as unknown as NotaFiscal,
    numeroItem: 1,
    codigo: 'PROD-1',
    descricao: 'Produto de teste',
    ncm: '20098990',
    cfop: '5102',
    unidade: 'UN',
    quantidade: '2.0000',
    valorUnitario: '10.0000',
    valorTotal: '20.00',
    csosn: '102',
    ...overrides,
  };
}

/** `<nfeProc>` fictício da NFC-e (com infNFeSupl/qrCode), estrutura real esperada pelo parser. */
function xmlAutorizadoFixture(comQrCode = true): string {
  const infNFeSupl = comQrCode
    ? '<infNFeSupl>' +
      `<qrCode>https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode?p=${CHAVE_ACESSO_FIXTURE}|2|1|1|ABCDEF1234567890</qrCode>` +
      '<urlChave>https://www.homologacao.nfce.fazenda.sp.gov.br/consulta</urlChave>' +
      '</infNFeSupl>'
    : '';

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">' +
    '<NFe xmlns="http://www.portalfiscal.inf.br/nfe">' +
    `<infNFe Id="NFe${CHAVE_ACESSO_FIXTURE}" versao="4.00">` +
    '<ide><mod>65</mod><serie>1</serie><nNF>1</nNF></ide>' +
    '<det nItem="1"><prod><cProd>PROD-1</cProd><xProd>Produto de teste</xProd>' +
    '<NCM>20098990</NCM><CFOP>5102</CFOP></prod></det>' +
    '<total><ICMSTot><vProd>20.00</vProd><vNF>20.00</vNF></ICMSTot></total>' +
    '<infAdic><infCpl>Documento emitido por Microempreendedor Individual (MEI) optante ' +
    'pelo Simples Nacional. Não gera direito a crédito fiscal de ICMS/IPI/PIS/COFINS.</infCpl></infAdic>' +
    '</infNFe>' +
    '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo /></Signature>' +
    infNFeSupl +
    '</NFe>' +
    '<protNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">' +
    '<infProt Id="ID135260000012345">' +
    '<tpAmb>2</tpAmb>' +
    `<chNFe>${CHAVE_ACESSO_FIXTURE}</chNFe>` +
    '<dhRecbto>2026-01-15T10:31:00-03:00</dhRecbto>' +
    '<nProt>135260000012345</nProt>' +
    '<cStat>100</cStat>' +
    '<xMotivo>Autorizado o uso da NF-e</xMotivo>' +
    '</infProt>' +
    '</protNFe>' +
    '</nfeProc>'
  );
}

function notaFixture(overrides: Partial<NotaFiscal> = {}): NotaFiscal {
  return {
    id: 'nota-1',
    modelo: ModeloDocumento.NFCE,
    serie: 1,
    numero: 1,
    chaveAcesso: CHAVE_ACESSO_FIXTURE,
    status: StatusNota.AUTORIZADA,
    ambiente: 2,
    naturezaOperacao: 'VENDA',
    destinatarioNome: null,
    destinatarioDocumento: null,
    destinatarioEmail: null,
    destinatarioEndereco: null,
    valorTotal: '20.00',
    formaPagamento: '17', // PIX
    xmlAssinado: '<NFe>ASSINADO</NFe>',
    xmlAutorizado: xmlAutorizadoFixture(),
    protocolo: '135260000012345',
    motivoStatus: 'Autorizado o uso da NF-e',
    codigoStatus: '100',
    dataEmissao: new Date(2026, 0, 15, 10, 30, 0),
    dataAutorizacao: new Date(2026, 0, 15, 10, 31, 0),
    itens: [itemFixture()],
    createdAt: new Date(2026, 0, 15, 10, 30, 0),
    updatedAt: new Date(2026, 0, 15, 10, 31, 0),
    ...overrides,
  };
}

describe('DanfcePdfService', () => {
  let service: DanfcePdfService;

  beforeEach(() => {
    service = new DanfcePdfService();
  });

  it('gera um Buffer de PDF válido (magic bytes %PDF-) para uma NFC-e autorizada completa, com QR Code', async () => {
    const buffer = await service.gerar(notaFixture(), emitenteFixture);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('não lança exceção quando o XML autorizado não tem QR Code (infNFeSupl ausente)', async () => {
    const nota = notaFixture({ xmlAutorizado: xmlAutorizadoFixture(false) });

    await expect(service.gerar(nota, emitenteFixture)).resolves.toBeInstanceOf(
      Buffer,
    );
  });

  it('não lança exceção com consumidor não identificado (sem destinatário, caso comum da NFC-e)', async () => {
    await expect(
      service.gerar(notaFixture(), emitenteFixture),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('não lança exceção quando o emitente não tem nomeFantasia e a nota não tem protocolo (campos opcionais)', async () => {
    const emitenteSemFantasia: EmitenteConfig = {
      ...emitenteFixture,
      nomeFantasia: '',
    };
    const nota = notaFixture({ protocolo: null });

    await expect(
      service.gerar(nota, emitenteSemFantasia),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('não lança exceção quando o emitente informa complemento de endereço', async () => {
    const emitenteComComplemento: EmitenteConfig = {
      ...emitenteFixture,
      complemento: 'Sala 2',
    };

    await expect(
      service.gerar(notaFixture(), emitenteComComplemento),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('não lança exceção com múltiplos itens, quebrando a tabela corretamente', async () => {
    const nota = notaFixture({
      itens: [
        itemFixture({
          id: 'item-1',
          numeroItem: 1,
          codigo: 'A',
          descricao: 'Item A',
        }),
        itemFixture({
          id: 'item-2',
          numeroItem: 2,
          codigo: 'B',
          descricao: 'Item B',
        }),
      ],
      valorTotal: '40.00',
    });

    await expect(service.gerar(nota, emitenteFixture)).resolves.toBeInstanceOf(
      Buffer,
    );
  });

  it('não marca o aviso de homologação quando a nota é de produção (ambiente 1)', async () => {
    const buffer = await service.gerar(
      notaFixture({ ambiente: 1 }),
      emitenteFixture,
    );

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('quebra para uma nova página (com cabeçalho de tabela repetido) quando a lista de itens não cabe em uma única página', async () => {
    const muitosItens = Array.from({ length: 40 }, (_, indice) =>
      itemFixture({
        id: `item-${indice + 1}`,
        numeroItem: indice + 1,
        codigo: `PROD-${indice + 1}`,
        descricao: `Produto de teste número ${indice + 1}`,
      }),
    );
    const nota = notaFixture({ itens: muitosItens, valorTotal: '800.00' });

    const buffer = await service.gerar(nota, emitenteFixture);

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
