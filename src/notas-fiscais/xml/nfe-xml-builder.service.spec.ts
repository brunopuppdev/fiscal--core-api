import { XMLParser } from 'fast-xml-parser';
import { EmitenteConfig } from '../../config/configuration';
import { ModeloDocumento } from '../../common/enums/modelo-documento.enum';
import { DestinatarioDto } from '../dto/destinatario.dto';
import { ItemNotaDto } from '../dto/item-nota.dto';
import {
  DadosMontagemNfe,
  NfeXmlBuilderService,
} from './nfe-xml-builder.service';

// 44 dígitos, apenas para exercitar o builder (não segue o algoritmo real da chave de acesso).
const CHAVE_ACESSO_FIXTURE = '1234567890'.repeat(4) + '1234';

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
  telefone: '11999990000',
};

function itemFixture(overrides: Partial<ItemNotaDto> = {}): ItemNotaDto {
  return {
    codigo: 'PROD-1',
    descricao: 'Produto de teste',
    ncm: '20098990',
    cfop: '5102',
    unidade: 'UN',
    quantidade: 2,
    valorUnitario: 12.5,
    ...overrides,
  };
}

function dadosFixture(
  overrides: Partial<DadosMontagemNfe> = {},
): DadosMontagemNfe {
  return {
    chaveAcesso: CHAVE_ACESSO_FIXTURE,
    codigoNumerico: '12345678',
    modelo: ModeloDocumento.NFCE,
    serie: 1,
    numero: 42,
    naturezaOperacao: 'VENDA',
    dataEmissao: new Date(2026, 0, 15, 10, 30, 0),
    ambiente: 2,
    emitente: emitenteFixture,
    itens: [itemFixture()],
    ...overrides,
  };
}

// parseTagValue/parseAttributeValue desligados de propósito: comparamos sempre contra o
// texto literal escrito pelo builder (`fmt`/`String(...)`), sem depender da inferência de
// tipo (número/booleano) do fast-xml-parser.
const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  parseAttributeValue: false,
});

// Tipos mínimos do XML parseado (só os campos exercitados pelos testes), usados para tirar
// o `parser.parse(...)` (tipado `any` pela lib) do caminho antes de acessar propriedades —
// evita os alertas de "unsafe member access" do eslint sem precisar de `any` em nenhum ponto.
interface XmlIde {
  mod: string;
  serie: string;
  nNF: string;
  cUF: string;
  natOp: string;
  idDest: string;
  tpImp: string;
  cDV: string;
}
interface XmlEmit {
  CNPJ: string;
  xNome: string;
  IE: string;
  CRT: string;
  enderEmit: { UF: string };
}
interface XmlEnderDest {
  xLgr: string;
  nro: string;
  xBairro: string;
  cMun: string;
  xMun: string;
  UF: string;
  CEP: string;
  cPais: string;
  xPais: string;
}
interface XmlDest {
  CNPJ?: string;
  CPF?: string;
  xNome?: string;
  enderDest?: XmlEnderDest;
  email?: string;
}
interface XmlProd {
  cProd: string;
}
interface XmlIcmsSN {
  CSOSN: string;
}
interface XmlDet {
  '@_nItem': string;
  prod: XmlProd;
  imposto: { ICMS: Record<string, XmlIcmsSN> };
}
interface XmlNfeDoc {
  NFe: {
    infNFe: {
      '@_Id': string;
      ide: XmlIde;
      emit: XmlEmit;
      dest?: XmlDest;
      det: XmlDet | XmlDet[];
      total: { ICMSTot: { vProd: string; vNF: string } };
    };
  };
}

function parseXml(xml: string): XmlNfeDoc {
  return parser.parse(xml) as XmlNfeDoc;
}

describe('NfeXmlBuilderService', () => {
  let service: NfeXmlBuilderService;

  beforeEach(() => {
    service = new NfeXmlBuilderService();
  });

  describe('montar - NFC-e (modelo 65, sem destinatário identificado)', () => {
    it('monta o elemento ide com os dados da emissão e idDest interno por padrão', () => {
      const xml = service.montar(dadosFixture());
      const doc = parseXml(xml);
      const ide = doc.NFe.infNFe.ide;

      expect(ide.mod).toBe('65');
      expect(ide.serie).toBe('1');
      expect(ide.nNF).toBe('42');
      expect(ide.cUF).toBe('35');
      expect(ide.natOp).toBe('VENDA');
      expect(ide.idDest).toBe('1');
      expect(ide.tpImp).toBe('4'); // DANFE NFC-e
      expect(ide.cDV).toBe(CHAVE_ACESSO_FIXTURE.slice(-1));
    });

    it('monta o elemento emit com os dados do emitente configurado', () => {
      const xml = service.montar(dadosFixture());
      const doc = parseXml(xml);
      const emit = doc.NFe.infNFe.emit;

      expect(emit.CNPJ).toBe('12345678000199');
      expect(emit.xNome).toBe('Empresa Teste MEI LTDA');
      expect(emit.IE).toBe('ISENTO');
      expect(emit.CRT).toBe('1');
      expect(emit.enderEmit.UF).toBe('SP');
    });

    it('não inclui o elemento dest quando não há destinatário informado', () => {
      const xml = service.montar(dadosFixture());
      const doc = parseXml(xml);

      expect(doc.NFe.infNFe.dest).toBeUndefined();
    });

    it('define o Id do infNFe como "NFe" + chave de acesso', () => {
      const xml = service.montar(dadosFixture());
      const doc = parseXml(xml);

      expect(doc.NFe.infNFe['@_Id']).toBe(`NFe${CHAVE_ACESSO_FIXTURE}`);
    });

    it('monta um elemento det por item da venda, numerando nItem sequencialmente', () => {
      const xml = service.montar(
        dadosFixture({
          itens: [
            itemFixture({ codigo: 'A', descricao: 'Item A' }),
            itemFixture({ codigo: 'B', descricao: 'Item B' }),
          ],
        }),
      );
      const doc = parseXml(xml);
      const det = doc.NFe.infNFe.det as XmlDet[];

      expect(Array.isArray(det)).toBe(true);
      expect(det).toHaveLength(2);
      expect(det[0]['@_nItem']).toBe('1');
      expect(det[0].prod.cProd).toBe('A');
      expect(det[1]['@_nItem']).toBe('2');
      expect(det[1].prod.cProd).toBe('B');
    });

    it('usa o CSOSN informado no item (ou 102 como padrão) no grupo ICMSSN correspondente', () => {
      const xml = service.montar(
        dadosFixture({ itens: [itemFixture({ csosn: '500' })] }),
      );
      const doc = parseXml(xml);
      const det = doc.NFe.infNFe.det as XmlDet;
      const icms = det.imposto.ICMS;

      expect(icms.ICMSSN500.CSOSN).toBe('500');
    });

    it('usa CSOSN 102 como padrão quando o item não informa csosn', () => {
      const xml = service.montar(dadosFixture());
      const doc = parseXml(xml);
      const det = doc.NFe.infNFe.det as XmlDet;
      const icms = det.imposto.ICMS;

      expect(icms.ICMSSN102.CSOSN).toBe('102');
    });

    it('soma o valor dos itens (quantidade x valor unitário) em vProd e vNF do total', () => {
      const xml = service.montar(
        dadosFixture({
          itens: [
            itemFixture({ quantidade: 2, valorUnitario: 12.5 }), // 25.00
            itemFixture({ quantidade: 1, valorUnitario: 9.9 }), // 9.90
          ],
        }),
      );
      const doc = parseXml(xml);
      const total = doc.NFe.infNFe.total.ICMSTot;

      expect(total.vProd).toBe('34.90');
      expect(total.vNF).toBe('34.90');
    });
  });

  describe('montar - NF-e (modelo 55, com destinatário)', () => {
    it('monta o destinatário pessoa jurídica usando o elemento CNPJ', () => {
      const destinatario: DestinatarioDto = {
        nome: 'Cliente Empresa LTDA',
        documento: '98.765.432/0001-88', // CNPJ fictício, com máscara
      };
      const xml = service.montar(
        dadosFixture({ modelo: ModeloDocumento.NFE, destinatario }),
      );
      const doc = parseXml(xml);
      const dest = doc.NFe.infNFe.dest!;

      expect(dest.CNPJ).toBe('98765432000188');
      expect(dest.CPF).toBeUndefined();
      expect(dest.xNome).toBe('Cliente Empresa LTDA');
    });

    it('monta o destinatário pessoa física usando o elemento CPF', () => {
      const destinatario: DestinatarioDto = {
        nome: 'Fulano de Tal',
        documento: '111.222.333-44', // CPF fictício, com máscara
      };
      const xml = service.montar(
        dadosFixture({ modelo: ModeloDocumento.NFE, destinatario }),
      );
      const doc = parseXml(xml);
      const dest = doc.NFe.infNFe.dest!;

      expect(dest.CPF).toBe('11122233344');
      expect(dest.CNPJ).toBeUndefined();
    });

    it('marca idDest=2 (interestadual) quando a UF do destinatário difere da UF do emitente', () => {
      const destinatario: DestinatarioDto = {
        documento: '98765432000188',
        endereco: { uf: 'RJ' },
      };
      const xml = service.montar(
        dadosFixture({ modelo: ModeloDocumento.NFE, destinatario }),
      );
      const doc = parseXml(xml);

      expect(doc.NFe.infNFe.ide.idDest).toBe('2');
    });

    it('lança Error quando NF-e (modelo 55) chega ao builder sem destinatario.documento válido', () => {
      const destinatario: DestinatarioDto = { nome: 'Sem documento' };

      expect(() =>
        service.montar(
          dadosFixture({ modelo: ModeloDocumento.NFE, destinatario }),
        ),
      ).toThrow(/destinatario\.documento é obrigatório/);
    });

    it('não lança erro para NFC-e (modelo 65) mesmo sem destinatario.documento', () => {
      const destinatario: DestinatarioDto = {
        nome: 'Consumidor não identificado',
      };

      expect(() =>
        service.montar(
          dadosFixture({ modelo: ModeloDocumento.NFCE, destinatario }),
        ),
      ).not.toThrow();
    });

    it('monta enderDest e email quando o destinatário informa endereço completo e email', () => {
      const destinatario: DestinatarioDto = {
        nome: 'Cliente Empresa LTDA',
        documento: '98765432000188',
        email: 'cliente@example.com',
        endereco: {
          logradouro: 'Avenida Paulista',
          numero: '1000',
          bairro: 'Bela Vista',
          codMunicipio: '3550308',
          municipio: 'São Paulo',
          uf: 'SP',
          cep: '01310-100',
        },
      };
      const xml = service.montar(
        dadosFixture({ modelo: ModeloDocumento.NFE, destinatario }),
      );
      const doc = parseXml(xml);
      const dest = doc.NFe.infNFe.dest!;

      expect(dest.enderDest).toBeDefined();
      expect(dest.enderDest?.xLgr).toBe('Avenida Paulista');
      expect(dest.enderDest?.nro).toBe('1000');
      expect(dest.enderDest?.xBairro).toBe('Bela Vista');
      expect(dest.enderDest?.cMun).toBe('3550308');
      expect(dest.enderDest?.xMun).toBe('São Paulo');
      expect(dest.enderDest?.UF).toBe('SP');
      expect(dest.enderDest?.CEP).toBe('01310100');
      expect(dest.enderDest?.cPais).toBe('1058');
      expect(dest.enderDest?.xPais).toBe('Brasil');
      expect(dest.email).toBe('cliente@example.com');
    });

    it('usa "VENDA" como natOp quando naturezaOperacao vem como string vazia', () => {
      const xml = service.montar(dadosFixture({ naturezaOperacao: '' }));
      const doc = parseXml(xml);

      expect(doc.NFe.infNFe.ide.natOp).toBe('VENDA');
    });

    it('usa cUF "35" quando a UF do emitente não está no mapa CODIGO_UF', () => {
      const xml = service.montar(
        dadosFixture({
          emitente: { ...emitenteFixture, uf: 'ZZ' },
        }),
      );
      const doc = parseXml(xml);

      expect(doc.NFe.infNFe.ide.cUF).toBe('35');
    });

    it('omite xFant/xCpl/fone quando o emitente não informa nomeFantasia/telefone, e inclui xCpl quando há complemento', () => {
      const xml = service.montar(
        dadosFixture({
          emitente: {
            ...emitenteFixture,
            nomeFantasia: '',
            telefone: undefined,
            complemento: 'Sala 2',
          },
        }),
      );
      const doc = parseXml(xml);
      const infNFe = doc.NFe.infNFe as unknown as {
        emit: { xFant?: string; enderEmit: { xCpl?: string; fone?: string } };
      };

      expect(infNFe.emit.xFant).toBeUndefined();
      expect(infNFe.emit.enderEmit.fone).toBeUndefined();
      expect(infNFe.emit.enderEmit.xCpl).toBe('Sala 2');
    });

    it('aplica os fallbacks de enderDest (S/N, cMun/UF do emitente, campos vazios) quando o endereço só informa logradouro', () => {
      const destinatario: DestinatarioDto = {
        documento: '98765432000188',
        endereco: { logradouro: 'Rua Só o Logradouro' },
      };
      const xml = service.montar(
        dadosFixture({ modelo: ModeloDocumento.NFE, destinatario }),
      );
      const doc = parseXml(xml);
      const enderDest = doc.NFe.infNFe.dest!.enderDest!;

      expect(enderDest.xLgr).toBe('Rua Só o Logradouro');
      expect(enderDest.nro).toBe('S/N');
      expect(enderDest.xBairro).toBe('');
      expect(enderDest.cMun).toBe(emitenteFixture.codMunicipio);
      expect(enderDest.xMun).toBe('');
      expect(enderDest.UF).toBe(emitenteFixture.uf);
      expect(enderDest.CEP).toBe('');
    });

    it('usa "UN" como unidade do item (uCom/uTrib) quando o item não informa unidade', () => {
      const xml = service.montar(
        dadosFixture({ itens: [itemFixture({ unidade: undefined })] }),
      );
      const doc = parseXml(xml);
      const prod = (doc.NFe.infNFe.det as XmlDet).prod as unknown as {
        uCom: string;
        uTrib: string;
      };

      expect(prod.uCom).toBe('UN');
      expect(prod.uTrib).toBe('UN');
    });
  });
});
