import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as https from 'https';
import * as forge from 'node-forge';
import { AppConfig } from '../config/configuration';
import { AppLogger } from '../common/logger/app-logger';
import { CertificadoService } from './certificado.service';

// `fs.existsSync`/`fs.readFileSync` não são reconfiguráveis via jest.spyOn direto nesta
// versão do Node (propriedades não configuráveis do módulo nativo) — por isso o mock
// parcial do módulo, preservando o resto da implementação real.
jest.mock('fs', () => ({
  ...jest.requireActual<typeof fs>('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

const fsExistsSyncMock = fs.existsSync as jest.Mock;
const fsReadFileSyncMock = fs.readFileSync as jest.Mock;

const SENHA_TESTE = 'senha-teste-123';
const CNPJ_FICTICIO = '12345678000199';

/**
 * Gera um .pfx (PKCS#12) de teste inteiramente em memória via node-forge — nunca um
 * certificado real do usuário. O CNPJ embutido no commonName é fictício.
 */
function gerarPfxTeste(
  cnpjFicticio = CNPJ_FICTICIO,
  senha = SENHA_TESTE,
): Buffer {
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

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], senha);
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  return Buffer.from(p12Der, 'binary');
}

/** Igual a `gerarPfxTeste`, mas sem commonName no subject (nenhum CNPJ identificável). */
function gerarPfxTesteSemCommonName(senha = SENHA_TESTE): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  const attrs = [{ name: 'countryName', value: 'BR' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], senha);
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  return Buffer.from(p12Der, 'binary');
}

function configServiceMock(
  path: string,
  senha: string,
): ConfigService<AppConfig, true> {
  return {
    get: jest.fn().mockReturnValue({ path, senha }),
  } as unknown as ConfigService<AppConfig, true>;
}

describe('CertificadoService', () => {
  let warnSpy: jest.SpiedFunction<typeof AppLogger.prototype.warn>;
  let successSpy: jest.SpiedFunction<typeof AppLogger.prototype.success>;

  beforeEach(() => {
    warnSpy = jest
      .spyOn(AppLogger.prototype, 'warn')
      .mockImplementation(() => undefined);
    jest
      .spyOn(AppLogger.prototype, 'error')
      .mockImplementation(() => undefined);
    successSpy = jest
      .spyOn(AppLogger.prototype, 'success')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fsExistsSyncMock.mockReset();
    fsReadFileSyncMock.mockReset();
  });

  describe('onModuleInit', () => {
    it('não derruba a aplicação quando o arquivo .pfx não existe no caminho configurado', () => {
      fsExistsSyncMock.mockReturnValue(false);

      const service = new CertificadoService(
        configServiceMock('./certs/nao-existe.pfx', SENHA_TESTE),
      );

      expect(() => service.onModuleInit()).not.toThrow();
      expect(fsReadFileSyncMock).not.toHaveBeenCalled();
      expect(service.estaCarregado()).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('carrega com sucesso um .pfx válido e extrai CNPJ e validade do certificado', () => {
      const pfxBuffer = gerarPfxTeste();
      fsExistsSyncMock.mockReturnValue(true);
      fsReadFileSyncMock.mockReturnValue(pfxBuffer);

      const service = new CertificadoService(
        configServiceMock('./certs/certificado.pfx', SENHA_TESTE),
      );
      service.onModuleInit();

      expect(service.estaCarregado()).toBe(true);
      const certificado = service.obter();
      expect(certificado.cnpj).toBe(CNPJ_FICTICIO);
      expect(certificado.validade).toBeInstanceOf(Date);
      expect(certificado.chavePrivadaPem).toContain('BEGIN');
      expect(certificado.certificadoPem).toContain('BEGIN CERTIFICATE');
    });

    it('lança InternalServerErrorException quando o .pfx não pode ser decodificado (senha errada/arquivo corrompido)', () => {
      const pfxBuffer = gerarPfxTeste(CNPJ_FICTICIO, SENHA_TESTE);
      fsExistsSyncMock.mockReturnValue(true);
      fsReadFileSyncMock.mockReturnValue(pfxBuffer);

      const service = new CertificadoService(
        // senha configurada diferente da usada para gerar o .pfx
        configServiceMock('./certs/certificado.pfx', 'senha-errada'),
      );

      expect(() => service.onModuleInit()).toThrow(
        InternalServerErrorException,
      );
      expect(service.estaCarregado()).toBe(false);
    });

    it('lança InternalServerErrorException sem vazar segredo quando o .pfx decodifica mas não contém chave privada e certificado extraíveis', () => {
      const pfxBuffer = gerarPfxTeste();
      fsExistsSyncMock.mockReturnValue(true);
      fsReadFileSyncMock.mockReturnValue(pfxBuffer);

      // Simula um PKCS12 que decodifica com sucesso (senha correta), mas cujos bags de
      // chave/certificado vêm vazios — cenário difícil de reproduzir com um .pfx real
      // malformado byte a byte, por isso mockamos o retorno de getBags().
      const pkcs12FromAsn1Spy = jest
        .spyOn(forge.pkcs12, 'pkcs12FromAsn1')
        .mockReturnValue({
          getBags: () => ({}),
        } as unknown as forge.pkcs12.Pkcs12Pfx);

      const service = new CertificadoService(
        configServiceMock('./certs/certificado.pfx', SENHA_TESTE),
      );

      let erroCapturado: Error | undefined;
      try {
        service.onModuleInit();
      } catch (erro) {
        erroCapturado = erro as Error;
      }

      expect(erroCapturado).toBeInstanceOf(InternalServerErrorException);
      expect(erroCapturado?.message).toContain(
        'Não foi possível extrair chave privada e certificado',
      );
      expect(erroCapturado?.message).not.toContain(SENHA_TESTE);
      expect(erroCapturado?.message).not.toContain('BEGIN');
      expect(service.estaCarregado()).toBe(false);

      pkcs12FromAsn1Spy.mockRestore();
    });

    it('carrega com sucesso mesmo sem commonName no certificado, com cnpj=null e log indicando "não identificado"', () => {
      const pfxBuffer = gerarPfxTesteSemCommonName();
      fsExistsSyncMock.mockReturnValue(true);
      fsReadFileSyncMock.mockReturnValue(pfxBuffer);

      const service = new CertificadoService(
        configServiceMock('./certs/certificado.pfx', SENHA_TESTE),
      );
      service.onModuleInit();

      expect(service.estaCarregado()).toBe(true);
      expect(service.obter().cnpj).toBeNull();
      expect(successSpy).toHaveBeenCalledWith(
        expect.stringContaining('não identificado'),
      );
    });
  });

  describe('obter', () => {
    it('lança InternalServerErrorException quando chamado antes de o certificado ser carregado', () => {
      fsExistsSyncMock.mockReturnValue(false);
      const service = new CertificadoService(
        configServiceMock('./certs/nao-existe.pfx', SENHA_TESTE),
      );
      service.onModuleInit();

      expect(() => service.obter()).toThrow(InternalServerErrorException);
    });
  });

  describe('obterHttpsAgent', () => {
    it('lança InternalServerErrorException quando chamado antes de o certificado ser carregado', () => {
      fsExistsSyncMock.mockReturnValue(false);
      const service = new CertificadoService(
        configServiceMock('./certs/nao-existe.pfx', SENHA_TESTE),
      );
      service.onModuleInit();

      expect(() => service.obterHttpsAgent()).toThrow(
        InternalServerErrorException,
      );
    });

    it('retorna um https.Agent configurado com mTLS (pfx + senha) após carregar com sucesso', () => {
      const pfxBuffer = gerarPfxTeste();
      fsExistsSyncMock.mockReturnValue(true);
      fsReadFileSyncMock.mockReturnValue(pfxBuffer);

      const service = new CertificadoService(
        configServiceMock('./certs/certificado.pfx', SENHA_TESTE),
      );
      service.onModuleInit();

      const agent = service.obterHttpsAgent();
      expect(agent).toBeInstanceOf(https.Agent);
    });
  });
});
