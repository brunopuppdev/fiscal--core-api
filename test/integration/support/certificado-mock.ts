import * as forge from 'node-forge';
import {
  CertificadoCarregado,
  CertificadoService,
} from '../../../src/certificado/certificado.service';

/**
 * Gera um par chave/certificado autoassinado em memória via node-forge — nunca um
 * certificado real do usuário. Usado pelos testes de integração que exercitam a
 * assinatura XML de verdade (NfeXmlSignerService real), sem depender de um .pfx.
 */
export function gerarCertificadoTeste(): CertificadoCarregado {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  const attrs = [
    { name: 'commonName', value: 'EMPRESA TESTE MEI:12345678000199' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    chavePrivadaPem: forge.pki.privateKeyToPem(keys.privateKey),
    certificadoPem: forge.pki.certificateToPem(cert),
    cnpj: '12345678000199',
    validade: cert.validity.notAfter,
  };
}

/** Substitui o CertificadoService real nos testes de integração — nunca lê um .pfx do disco. */
export function certificadoServiceMock(): Partial<CertificadoService> {
  const certificado = gerarCertificadoTeste();
  return {
    obter: () => certificado,
    obterHttpsAgent: () =>
      ({}) as ReturnType<CertificadoService['obterHttpsAgent']>,
    estaCarregado: () => true,
  };
}
