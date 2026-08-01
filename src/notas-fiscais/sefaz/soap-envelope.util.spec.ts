import {
  extrairConteudoNfeDadosMsg,
  montarEnvelopeSoap,
} from './soap-envelope.util';

describe('montarEnvelopeSoap', () => {
  const namespaceServico =
    'http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4';
  const corpoXml =
    '<consStatServ versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">' +
    '<tpAmb>2</tpAmb><cUF>35</cUF><xServ>STATUS</xServ></consStatServ>';

  it('inicia com a declaração XML UTF-8', () => {
    const envelope = montarEnvelopeSoap(namespaceServico, corpoXml);

    expect(envelope.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(
      true,
    );
  });

  it('usa o namespace SOAP 1.2 correto (soap12, http://www.w3.org/2003/05/soap-envelope)', () => {
    const envelope = montarEnvelopeSoap(namespaceServico, corpoXml);

    expect(envelope).toContain(
      'xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"',
    );
    expect(envelope).toMatch(/<soap12:Envelope[^>]*>/);
    expect(envelope).toContain('<soap12:Body>');
    expect(envelope).toContain('</soap12:Body>');
    expect(envelope).toContain('</soap12:Envelope>');
  });

  it('inclui os namespaces auxiliares xsi e xsd exigidos pelo layout', () => {
    const envelope = montarEnvelopeSoap(namespaceServico, corpoXml);

    expect(envelope).toContain(
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    );
    expect(envelope).toContain('xmlns:xsd="http://www.w3.org/2001/XMLSchema"');
  });

  it('não usa nfeCabecMsg (removido desde a versão 4.00 do layout)', () => {
    const envelope = montarEnvelopeSoap(namespaceServico, corpoXml);

    expect(envelope).not.toContain('nfeCabecMsg');
  });

  it('embute o corpo dentro de <nfeDadosMsg> com o namespace do serviço informado', () => {
    const envelope = montarEnvelopeSoap(namespaceServico, corpoXml);

    expect(envelope).toContain(
      `<nfeDadosMsg xmlns="${namespaceServico}">${corpoXml}</nfeDadosMsg>`,
    );
  });

  it('coloca o <nfeDadosMsg> dentro do <soap12:Body>', () => {
    const envelope = montarEnvelopeSoap(namespaceServico, corpoXml);

    const indiceBodyAbre = envelope.indexOf('<soap12:Body>');
    const indiceNfeDadosMsg = envelope.indexOf('<nfeDadosMsg');
    const indiceBodyFecha = envelope.indexOf('</soap12:Body>');

    expect(indiceBodyAbre).toBeGreaterThanOrEqual(0);
    expect(indiceNfeDadosMsg).toBeGreaterThan(indiceBodyAbre);
    expect(indiceNfeDadosMsg).toBeLessThan(indiceBodyFecha);
  });

  it('usa o namespace de cada webservice diferente entre chamadas distintas', () => {
    const envelopeStatus = montarEnvelopeSoap(
      'http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4',
      corpoXml,
    );
    const envelopeAutorizacao = montarEnvelopeSoap(
      'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4',
      corpoXml,
    );

    expect(envelopeStatus).toContain('NFeStatusServico4');
    expect(envelopeAutorizacao).toContain('NFeAutorizacao4');
    expect(envelopeStatus).not.toContain('NFeAutorizacao4');
  });
});

describe('extrairConteudoNfeDadosMsg', () => {
  it('extrai o conteúdo entre as tags <nfeResultMsg> sem prefixo de namespace', () => {
    const respostaSoap =
      '<soap:Envelope><soap:Body>' +
      '<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4">' +
      '<retConsStatServ><cStat>107</cStat></retConsStatServ>' +
      '</nfeResultMsg>' +
      '</soap:Body></soap:Envelope>';

    const conteudo = extrairConteudoNfeDadosMsg(respostaSoap);

    expect(conteudo).toBe(
      '<retConsStatServ><cStat>107</cStat></retConsStatServ>',
    );
  });

  it('extrai o conteúdo mesmo quando a tag tem um prefixo de namespace (ex.: soap:nfeResultMsg)', () => {
    const respostaSoap =
      '<env:Envelope><env:Body>' +
      '<soap:nfeResultMsg xmlns:soap="http://algum-namespace">' +
      '<retConsStatServ><cStat>107</cStat></retConsStatServ>' +
      '</soap:nfeResultMsg>' +
      '</env:Body></env:Envelope>';

    const conteudo = extrairConteudoNfeDadosMsg(respostaSoap);

    expect(conteudo).toBe(
      '<retConsStatServ><cStat>107</cStat></retConsStatServ>',
    );
  });

  it('retorna a resposta original quando não encontra a tag nfeResultMsg', () => {
    const respostaSoap =
      '<soap:Envelope><soap:Body>algo inesperado</soap:Body></soap:Envelope>';

    const conteudo = extrairConteudoNfeDadosMsg(respostaSoap);

    expect(conteudo).toBe(respostaSoap);
  });
});
