import { parseXmlAutorizado } from './xml-nota-autorizada-parser.util';

// Chave de acesso fictícia (44 dígitos), só para compor os fixtures de XML abaixo.
const CHAVE_ACESSO_FIXTURE = '35260812345678000199650010000000011000000015';

/**
 * Monta um `<nfeProc>` completo (NFe + protNFe), com a mesma estrutura montada por
 * `NfeXmlBuilderService`/`NfeXmlSignerService`/`SefazClientService.montarXmlProtNfe` em
 * produção — só os campos exercitados pelo parser precisam ser fiéis ao layout real.
 */
function nfeProcFixture(
  options: {
    descricaoItem1?: string;
    segundoItem?: boolean;
    comInfNFeSupl?: boolean;
    comInfAdic?: boolean;
  } = {},
): string {
  const {
    descricaoItem1 = 'Suco de Laranja 1L',
    segundoItem = false,
    comInfNFeSupl = true,
    comInfAdic = true,
  } = options;

  const det2 = segundoItem
    ? '<det nItem="2"><prod><cProd>PROD-2</cProd><xProd>Item 2</xProd><NCM>20098990</NCM>' +
      '<CFOP>5102</CFOP></prod></det>'
    : '';

  const infAdic = comInfAdic
    ? '<infAdic><infCpl>Documento emitido por Microempreendedor Individual (MEI) optante ' +
      'pelo Simples Nacional.</infCpl></infAdic>'
    : '';

  const infNFeSupl = comInfNFeSupl
    ? '<infNFeSupl>' +
      `<qrCode>https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode?p=${CHAVE_ACESSO_FIXTURE}|2|1|1|ABCDEF1234567890</qrCode>` +
      `<urlChave>https://www.homologacao.nfce.fazenda.sp.gov.br/consulta</urlChave>` +
      '</infNFeSupl>'
    : '';

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">' +
    '<NFe xmlns="http://www.portalfiscal.inf.br/nfe">' +
    `<infNFe Id="NFe${CHAVE_ACESSO_FIXTURE}" versao="4.00">` +
    '<ide><mod>65</mod><serie>1</serie><nNF>1</nNF></ide>' +
    `<det nItem="1"><prod><cProd>PROD-1</cProd><xProd>${descricaoItem1}</xProd>` +
    '<NCM>20098990</NCM><CFOP>5102</CFOP></prod></det>' +
    det2 +
    '<total><ICMSTot><vProd>20.00</vProd><vNF>20.00</vNF></ICMSTot></total>' +
    infAdic +
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

describe('parseXmlAutorizado', () => {
  it('extrai dhRecbto, qrCode, urlChave, infCpl e a descrição do item 1 exatamente como estão no XML', () => {
    const xml = nfeProcFixture({ descricaoItem1: 'Suco de Laranja 1L' });

    const resultado = parseXmlAutorizado(xml);

    expect(resultado.dhRecbto).toBe('2026-01-15T10:31:00-03:00');
    expect(resultado.qrCode).toBe(
      `https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode?p=${CHAVE_ACESSO_FIXTURE}|2|1|1|ABCDEF1234567890`,
    );
    expect(resultado.urlChave).toBe(
      'https://www.homologacao.nfce.fazenda.sp.gov.br/consulta',
    );
    expect(resultado.infCpl).toBe(
      'Documento emitido por Microempreendedor Individual (MEI) optante pelo Simples Nacional.',
    );
    expect(resultado.descricaoItem1).toBe('Suco de Laranja 1L');
  });

  it('extrai a descrição do item 1 sobrescrita pelo aviso de ambiente de homologação, e não a de outros itens', () => {
    const xml = nfeProcFixture({
      descricaoItem1:
        'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL',
      segundoItem: true,
    });

    const resultado = parseXmlAutorizado(xml);

    expect(resultado.descricaoItem1).toBe(
      'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL',
    );
  });

  it('extrai a descrição do item 1 quando <det> vem como objeto único (nota com um só item, sem virar array)', () => {
    const xml = nfeProcFixture({ segundoItem: false });

    const resultado = parseXmlAutorizado(xml);

    expect(resultado.descricaoItem1).toBe('Suco de Laranja 1L');
  });

  it('extrai o primeiro item (nItem=1) mesmo quando a nota tem múltiplos itens', () => {
    const xml = nfeProcFixture({
      descricaoItem1: 'Item 1 de vários',
      segundoItem: true,
    });

    const resultado = parseXmlAutorizado(xml);

    expect(resultado.descricaoItem1).toBe('Item 1 de vários');
  });

  it('retorna qrCode e urlChave null quando o XML não tem infNFeSupl (caso da NF-e, modelo 55)', () => {
    const xml = nfeProcFixture({ comInfNFeSupl: false });

    const resultado = parseXmlAutorizado(xml);

    expect(resultado.qrCode).toBeNull();
    expect(resultado.urlChave).toBeNull();
    // Os demais campos continuam extraídos normalmente, sem depender de infNFeSupl.
    expect(resultado.dhRecbto).toBe('2026-01-15T10:31:00-03:00');
  });

  it('retorna infCpl null quando o XML não tem infAdic', () => {
    const xml = nfeProcFixture({ comInfAdic: false });

    const resultado = parseXmlAutorizado(xml);

    expect(resultado.infCpl).toBeNull();
  });

  it('retorna null quando um campo vem como objeto (ex.: tag com atributo) em vez de texto simples', () => {
    // Tag com atributo faz o fast-xml-parser devolver { '@_x': ..., '#text': ... } em vez de
    // string — não é o formato esperado pelo layout da NF-e, mas o parser não deve quebrar.
    const xmlComAtributo =
      '<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00">' +
      '<protNFe><infProt><dhRecbto formato="iso">2026-01-15T10:31:00-03:00</dhRecbto></infProt></protNFe>' +
      '</nfeProc>';

    const resultado = parseXmlAutorizado(xmlComAtributo);

    expect(resultado.dhRecbto).toBeNull();
  });

  it('retorna todos os campos null quando o XML não tem nenhuma das seções esperadas', () => {
    const xmlVazio =
      '<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00">' +
      '<NFe><infNFe Id="NFe1"><ide><mod>55</mod></ide></infNFe></NFe>' +
      '</nfeProc>';

    const resultado = parseXmlAutorizado(xmlVazio);

    expect(resultado).toEqual({
      dhRecbto: null,
      qrCode: null,
      urlChave: null,
      infCpl: null,
      descricaoItem1: null,
    });
  });
});
