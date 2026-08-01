import {
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as https from 'https';
import * as forge from 'node-forge';
import { AppConfig } from '../config/configuration';

export interface CertificadoCarregado {
  /** Chave privada em PEM, usada para assinar o XML (xml-crypto). */
  chavePrivadaPem: string;
  /** Certificado do titular em PEM, incluído na assinatura (KeyInfo/X509Certificate). */
  certificadoPem: string;
  /** CNPJ extraído do certificado (subject), para conferência com o .env. */
  cnpj: string | null;
  /** Data de validade do certificado. */
  validade: Date;
}

/**
 * Carrega o certificado digital A1 (.pfx) do MEI e disponibiliza:
 * - chave privada + certificado em PEM (para assinatura XML via xml-crypto)
 * - um https.Agent com mTLS (pfx + senha) para as chamadas SOAP à SEFAZ
 *
 * O certificado é lido do disco uma única vez, na inicialização do módulo.
 */
@Injectable()
export class CertificadoService implements OnModuleInit {
  private certificado: CertificadoCarregado | null = null;
  private pfxBuffer: Buffer | null = null;
  private senha = '';

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  onModuleInit() {
    this.carregar();
  }

  private carregar(): void {
    const { path, senha } = this.configService.get('certificado', {
      infer: true,
    });

    if (!fs.existsSync(path)) {
      // Não derruba a aplicação: permite subir o serviço (ex.: para ver o Swagger)
      // mesmo sem certificado configurado ainda. A emissão real falhará com erro claro.
      return;
    }

    this.pfxBuffer = fs.readFileSync(path);
    this.senha = senha;

    try {
      const p12Asn1 = forge.asn1.fromDer(this.pfxBuffer.toString('binary'));
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senha);

      const keyBags = p12.getBags({
        bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
      });
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });

      const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
      const certBag = certBags[forge.pki.oids.certBag]?.[0];

      if (!keyBag?.key || !certBag?.cert) {
        throw new Error(
          'Não foi possível extrair chave privada e certificado do arquivo .pfx.',
        );
      }

      const chavePrivadaPem = forge.pki.privateKeyToPem(keyBag.key);
      const certificadoPem = forge.pki.certificateToPem(certBag.cert);

      const cnpjAttr = certBag.cert.subject.attributes.find(
        (attr) => attr.name === 'commonName' || attr.shortName === 'CN',
      );
      const cnMatch = cnpjAttr?.value
        ? String(cnpjAttr.value).match(/(\d{14})/)
        : null;

      this.certificado = {
        chavePrivadaPem,
        certificadoPem,
        cnpj: cnMatch ? cnMatch[1] : null,
        validade: certBag.cert.validity.notAfter,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        `Falha ao carregar certificado digital (.pfx). Verifique o caminho e a senha configurados. Detalhe: ${
          (error as Error).message
        }`,
      );
    }
  }

  /** Certificado em PEM (chave privada + cert) pronto para assinatura XML. */
  obter(): CertificadoCarregado {
    if (!this.certificado) {
      throw new InternalServerErrorException(
        'Certificado digital não carregado. Configure CERTIFICADO_PATH e CERTIFICADO_SENHA no .env e reinicie a aplicação.',
      );
    }
    return this.certificado;
  }

  /** https.Agent com mTLS (pfx + senha) para chamadas SOAP diretas à SEFAZ. */
  obterHttpsAgent(): https.Agent {
    if (!this.pfxBuffer) {
      throw new InternalServerErrorException(
        'Certificado digital não carregado. Configure CERTIFICADO_PATH e CERTIFICADO_SENHA no .env e reinicie a aplicação.',
      );
    }
    return new https.Agent({
      pfx: this.pfxBuffer,
      passphrase: this.senha,
      minVersion: 'TLSv1.2',
    });
  }

  estaCarregado(): boolean {
    return this.certificado !== null;
  }
}
