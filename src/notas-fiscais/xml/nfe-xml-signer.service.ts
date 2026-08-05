import { Injectable } from '@nestjs/common';
import { SignedXml } from 'xml-crypto';
import { CertificadoService } from '../../certificado/certificado.service';
import { AppLogger } from '../../common/logger/app-logger';

/**
 * Assina o elemento <infNFe> conforme exigido pela NF-e (assinatura enveloped,
 * canonicalização C14N e SHA-1/RSA-SHA1 — sim, a NF-e ainda exige SHA-1;
 * é uma particularidade do padrão que não mudou nas versões mais recentes do layout).
 */
@Injectable()
export class NfeXmlSignerService {
  private readonly logger = new AppLogger(NfeXmlSignerService.name);

  constructor(private readonly certificadoService: CertificadoService) {}

  assinar(xml: string): string {
    const { chavePrivadaPem, certificadoPem } = this.certificadoService.obter();

    const sig = new SignedXml({
      privateKey: chavePrivadaPem,
      publicCert: certificadoPem,
      signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
      canonicalizationAlgorithm:
        'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    });

    // A URI da referência ("#NFe{chave}") é derivada automaticamente pelo xml-crypto
    // a partir do atributo Id já presente em <infNFe> (definido pelo builder do XML).
    sig.addReference({
      xpath: `//*[local-name(.)='infNFe']`,
      transforms: [
        'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
        'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
      ],
      digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    });

    try {
      // Insere <Signature> como último filho de <NFe> (não logo após infNFe): o schema
      // oficial da NFe exige a ordem infNFe → infNFeSupl → Signature — como infNFeSupl
      // (QR Code da NFC-e) já foi anexado ao NFe pelo builder antes da assinatura,
      // "append" garante a ordem certa nos dois casos (com ou sem infNFeSupl).
      sig.computeSignature(xml, {
        location: {
          reference: `//*[local-name(.)='NFe']`,
          action: 'append',
        },
      });
    } catch (error) {
      // Sem dado do certificado/chave na mensagem: só o tipo de falha, para diagnóstico.
      this.logger.error(
        `Falha ao assinar XML da NFe: ${(error as Error).message}`,
      );
      throw error;
    }

    return sig.getSignedXml();
  }
}
