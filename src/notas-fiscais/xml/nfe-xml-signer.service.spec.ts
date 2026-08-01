import * as forge from 'node-forge';
import { CertificadoService } from '../../certificado/certificado.service';
import { AppLogger } from '../../common/logger/app-logger';
import { NfeXmlSignerService } from './nfe-xml-signer.service';

// 44 dígitos fictícios, só para compor o Id do infNFe (não segue o algoritmo real da chave de acesso).
const CHAVE_ACESSO_FIXTURE = '1234567890'.repeat(4) + '1234';

/**
 * Gera um par de chave/certificado autoassinado em memória via node-forge, só para o teste
 * (nunca um .pfx real do usuário). O CNPJ embutido no commonName é fictício.
 */
function gerarCertificadoTeste(cnpjFicticio = '12345678000199') {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  const attrs = [
    { name: 'commonName', value: `EMPRESA TESTE MEI:${cnpjFicticio}` },
    { name: 'countryName', value: 'BR' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    chavePrivadaPem: forge.pki.privateKeyToPem(keys.privateKey),
    certificadoPem: forge.pki.certificateToPem(cert),
  };
}

function xmlNfeFixture(): string {
  return (
    '<NFe xmlns="http://www.portalfiscal.inf.br/nfe">' +
    `<infNFe versao="4.00" Id="NFe${CHAVE_ACESSO_FIXTURE}">` +
    '<ide><cUF>35</cUF></ide>' +
    '</infNFe>' +
    '</NFe>'
  );
}

describe('NfeXmlSignerService', () => {
  let certificadoTeste: { chavePrivadaPem: string; certificadoPem: string };
  let certificadoServiceMock: { obter: jest.Mock };
  let service: NfeXmlSignerService;
  let errorSpy: jest.SpiedFunction<typeof AppLogger.prototype.error>;

  beforeAll(() => {
    certificadoTeste = gerarCertificadoTeste();
  });

  beforeEach(() => {
    errorSpy = jest
      .spyOn(AppLogger.prototype, 'error')
      .mockImplementation(() => undefined);
    certificadoServiceMock = {
      obter: jest.fn().mockReturnValue(certificadoTeste),
    };
    service = new NfeXmlSignerService(
      certificadoServiceMock as unknown as CertificadoService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('assina o XML usando o certificado obtido de CertificadoService', () => {
    service.assinar(xmlNfeFixture());
    expect(certificadoServiceMock.obter).toHaveBeenCalledTimes(1);
  });

  it('produz um XML assinado contendo o elemento Signature com o namespace XML-DSig', () => {
    const xmlAssinado = service.assinar(xmlNfeFixture());

    expect(xmlAssinado).toContain(
      '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">',
    );
  });

  it('referencia no Signature o Id do infNFe que foi assinado (URI="#NFe<chave>")', () => {
    const xmlAssinado = service.assinar(xmlNfeFixture());

    expect(xmlAssinado).toContain(`URI="#NFe${CHAVE_ACESSO_FIXTURE}"`);
  });

  it('usa RSA-SHA1 como algoritmo de assinatura, exigência do layout da NF-e', () => {
    const xmlAssinado = service.assinar(xmlNfeFixture());

    expect(xmlAssinado).toContain(
      'Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"',
    );
  });

  it('mantém o conteúdo original do infNFe no XML assinado (assinatura enveloped)', () => {
    const xmlAssinado = service.assinar(xmlNfeFixture());

    expect(xmlAssinado).toContain(`Id="NFe${CHAVE_ACESSO_FIXTURE}"`);
    expect(xmlAssinado).toContain('<cUF>35</cUF>');
  });

  it('loga e relança o erro quando a assinatura falha (ex.: chave privada inválida)', () => {
    certificadoServiceMock.obter.mockReturnValue({
      chavePrivadaPem: 'isto-nao-e-uma-chave-pem-valida',
      certificadoPem: certificadoTeste.certificadoPem,
    });

    expect(() => service.assinar(xmlNfeFixture())).toThrow();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [mensagem] = errorSpy.mock.calls[0];
    expect(mensagem).toContain('Falha ao assinar XML da NFe');
  });
});
