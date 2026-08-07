import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { EmitenteConfig } from '../../config/configuration';
import { ModeloDocumento } from '../../common/enums/modelo-documento.enum';
import { StatusNota } from '../../common/enums/status-nota.enum';
import { ItemNota } from '../entities/item-nota.entity';
import { NotaFiscal } from '../entities/nota-fiscal.entity';
import { DanfePdfService } from './danfe-pdf.service';

// PNG 1x1 transparente mínimo, só para exercitar `doc.image()` com um arquivo real e válido.
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

// Chave de acesso fictícia (44 dígitos), só para exercitar a geração do DANFE.
const CHAVE_ACESSO_FIXTURE = '35260812345678000199550010000000421000000010';

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
    valorUnitario: '12.5000',
    valorTotal: '25.00',
    csosn: '102',
    ...overrides,
  };
}

/** `<nfeProc>` fictício, mas com a estrutura real esperada por `parseXmlAutorizado`. */
function xmlAutorizadoFixture(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">' +
    '<NFe xmlns="http://www.portalfiscal.inf.br/nfe">' +
    `<infNFe Id="NFe${CHAVE_ACESSO_FIXTURE}" versao="4.00">` +
    '<ide><mod>55</mod><serie>1</serie><nNF>42</nNF></ide>' +
    '<det nItem="1"><prod><cProd>PROD-1</cProd><xProd>Produto de teste</xProd>' +
    '<NCM>20098990</NCM><CFOP>5102</CFOP></prod></det>' +
    '<total><ICMSTot><vProd>25.00</vProd><vNF>25.00</vNF></ICMSTot></total>' +
    '<infAdic><infCpl>Documento emitido por Microempreendedor Individual (MEI) optante ' +
    'pelo Simples Nacional. Não gera direito a crédito fiscal de ICMS/IPI/PIS/COFINS.</infCpl></infAdic>' +
    '</infNFe>' +
    '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo /></Signature>' +
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
    modelo: ModeloDocumento.NFE,
    serie: 1,
    numero: 42,
    chaveAcesso: CHAVE_ACESSO_FIXTURE,
    status: StatusNota.AUTORIZADA,
    ambiente: 2,
    naturezaOperacao: 'VENDA',
    destinatarioNome: 'Cliente Empresa LTDA',
    destinatarioDocumento: '98765432000188', // fictício
    destinatarioEmail: 'cliente@example.com',
    destinatarioEndereco: {
      logradouro: 'Avenida Paulista',
      numero: '1000',
      bairro: 'Bela Vista',
      municipio: 'São Paulo',
      uf: 'SP',
      cep: '01310100',
    },
    valorTotal: '25.00',
    formaPagamento: '17', // PIX
    troco: '0.00',
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

describe('DanfePdfService', () => {
  let service: DanfePdfService;
  let diretorioTemporario: string;
  let logoValido: string;

  beforeAll(() => {
    diretorioTemporario = mkdtempSync(join(tmpdir(), 'danfe-logo-'));
    logoValido = join(diretorioTemporario, 'logo.png');
    writeFileSync(logoValido, Buffer.from(PNG_1X1_BASE64, 'base64'));
  });

  afterAll(() => {
    rmSync(diretorioTemporario, { recursive: true, force: true });
  });

  beforeEach(() => {
    service = new DanfePdfService();
  });

  it('gera um Buffer de PDF válido (magic bytes %PDF-) para uma NF-e autorizada completa', async () => {
    const buffer = await service.gerar(notaFixture(), emitenteFixture);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('não lança exceção quando o destinatário não tem endereço (só nome/documento)', async () => {
    const nota = notaFixture({ destinatarioEndereco: null });

    await expect(service.gerar(nota, emitenteFixture)).resolves.toBeInstanceOf(
      Buffer,
    );
  });

  it('não lança exceção quando a nota não tem destinatário identificado', async () => {
    const nota = notaFixture({
      destinatarioNome: null,
      destinatarioDocumento: null,
      destinatarioEmail: null,
      destinatarioEndereco: null,
    });

    await expect(service.gerar(nota, emitenteFixture)).resolves.toBeInstanceOf(
      Buffer,
    );
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
    });

    await expect(service.gerar(nota, emitenteFixture)).resolves.toBeInstanceOf(
      Buffer,
    );
  });

  it('não lança exceção quando o emitente não tem nomeFantasia/telefone/complemento (campos opcionais)', async () => {
    const emitenteMinimo: EmitenteConfig = {
      ...emitenteFixture,
      nomeFantasia: '',
      telefone: undefined,
      complemento: undefined,
    };

    await expect(
      service.gerar(notaFixture(), emitenteMinimo),
    ).resolves.toBeInstanceOf(Buffer);
  });

  it('não marca o aviso de homologação quando a nota é de produção (ambiente 1)', async () => {
    const buffer = await service.gerar(
      notaFixture({ ambiente: 1 }),
      emitenteFixture,
    );

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('quebra para uma nova página (com cabeçalho de tabela repetido e canhoto) quando a lista de itens não cabe em uma única página', async () => {
    const muitosItens = Array.from({ length: 40 }, (_, indice) =>
      itemFixture({
        id: `item-${indice + 1}`,
        numeroItem: indice + 1,
        codigo: `PROD-${indice + 1}`,
        descricao: `Produto de teste número ${indice + 1}`,
      }),
    );
    const nota = notaFixture({ itens: muitosItens, valorTotal: '1000.00' });

    const buffer = await service.gerar(nota, emitenteFixture);

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('desenha o logotipo no cabeçalho quando logoPath aponta para um PNG válido', async () => {
    const emitenteComLogo: EmitenteConfig = {
      ...emitenteFixture,
      logoPath: logoValido,
    };

    const buffer = await service.gerar(notaFixture(), emitenteComLogo);

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('não lança exceção quando logoPath está vazio ou aponta para um arquivo inexistente', async () => {
    const emitenteSemLogo: EmitenteConfig = {
      ...emitenteFixture,
      logoPath: '',
    };
    const emitenteLogoInexistente: EmitenteConfig = {
      ...emitenteFixture,
      logoPath: join(diretorioTemporario, 'nao-existe.png'),
    };

    await expect(
      service.gerar(notaFixture(), emitenteSemLogo),
    ).resolves.toBeInstanceOf(Buffer);
    await expect(
      service.gerar(notaFixture(), emitenteLogoInexistente),
    ).resolves.toBeInstanceOf(Buffer);
  });
});
