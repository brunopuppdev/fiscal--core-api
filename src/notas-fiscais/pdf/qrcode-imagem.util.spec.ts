import { gerarImagemQrCode } from './qrcode-imagem.util';

// URL fictícia, no mesmo formato do QR Code de NFC-e montado por qrcode-nfce.util.ts.
const URL_QRCODE_FIXTURE =
  'https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode?p=35260812345678000199650010000000011000000015|2|1|1|ABCDEF1234567890';

describe('gerarImagemQrCode', () => {
  it('gera um Buffer de imagem PNG válido (magic bytes) a partir da URL do QR Code', async () => {
    const buffer = await gerarImagemQrCode(URL_QRCODE_FIXTURE);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    // Assinatura PNG: 0x89 'P' 'N' 'G' '\r' '\n' 0x1A '\n'.
    expect(buffer.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it('não lança exceção para um texto válido', async () => {
    await expect(gerarImagemQrCode(URL_QRCODE_FIXTURE)).resolves.toBeInstanceOf(
      Buffer,
    );
  });
});
