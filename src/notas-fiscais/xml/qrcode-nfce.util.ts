import { createHash } from 'crypto';

/**
 * Monta a URL do QR Code da NFC-e (grupo infNFeSupl), conforme NT 2015.002 (QR Code
 * versão 2, emissão online — não cobre o cenário de contingência offline).
 */
export interface ParametrosQrCodeNfce {
  chaveAcesso: string;
  ambiente: number; // 1 produção, 2 homologação (== tpAmb)
  csc: string; // Código de Segurança do Contribuinte, do credenciamento NFC-e na SEFAZ
  cscId: string; // identificador do CSC no cadastro da SEFAZ
  urlQrCode: string; // URL raiz de consulta por QR Code (SP: getNfceConsultaUrls)
}

const VERSAO_QRCODE = '2';

/**
 * p = chaveAcesso|versaoQRCode|tpAmb|idCSC|hash
 * hash = SHA-1( chaveAcesso|versaoQRCode|tpAmb|idCSC + CSC ), hex maiúsculo — o CSC entra
 * concatenado direto ao final, sem "|" antes dele (assim define a NT 2015.002).
 */
export function montarUrlQrCodeNfce(params: ParametrosQrCodeNfce): string {
  const { chaveAcesso, ambiente, csc, cscId, urlQrCode } = params;
  const idCscSemZeros = String(parseInt(cscId, 10));
  const camposHash = `${chaveAcesso}|${VERSAO_QRCODE}|${ambiente}|${idCscSemZeros}`;
  const hash = createHash('sha1')
    .update(camposHash + csc)
    .digest('hex')
    .toUpperCase();

  return `${urlQrCode}?p=${camposHash}|${hash}`;
}
