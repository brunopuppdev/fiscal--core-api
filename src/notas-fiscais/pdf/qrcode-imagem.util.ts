import * as QRCode from 'qrcode';

/**
 * Gera um PNG do QR Code a partir de um texto literal (a URL de `infNFeSupl/qrCode` do XML
 * autorizado) — este util só desenha a imagem, não monta a URL (isso já é feito por
 * `qrcode-nfce.util.ts` no momento da emissão).
 */
export async function gerarImagemQrCode(texto: string): Promise<Buffer> {
  return QRCode.toBuffer(texto, {
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 4,
  });
}
