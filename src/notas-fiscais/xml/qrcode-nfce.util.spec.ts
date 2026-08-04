import { montarUrlQrCodeNfce } from './qrcode-nfce.util';

// Chave de acesso fictícia (44 dígitos), só para exercitar o util.
const CHAVE_ACESSO_FIXTURE = '35260812345678000199650010000000011234567890';
const CSC_FIXTURE = 'ABCD1234-EFGH-5678-IJKL-MNOPQRSTUVWX';
const URL_QRCODE_FIXTURE = 'https://homologacao.exemplo.gov.br/qrcode';

describe('montarUrlQrCodeNfce', () => {
  it('monta a URL com o parâmetro p (chave|versão|tpAmb|idCSC|hash) e hash SHA-1 correto', () => {
    const url = montarUrlQrCodeNfce({
      chaveAcesso: CHAVE_ACESSO_FIXTURE,
      ambiente: 2,
      csc: CSC_FIXTURE,
      cscId: '1',
      urlQrCode: URL_QRCODE_FIXTURE,
    });

    // Hash calculado de forma independente (Node crypto, fora da implementação) para o
    // mesmo conjunto de entradas, servindo de vetor de teste da fórmula da NT 2015.002:
    // SHA-1(chave|2|tpAmb|idCSC + CSC), hex maiúsculo.
    expect(url).toBe(
      `${URL_QRCODE_FIXTURE}?p=${CHAVE_ACESSO_FIXTURE}|2|2|1|9955DD074F4E088806D053C6C5E32B1D5B6F9CBD`,
    );
  });

  it('usa tpAmb=1 quando ambiente=1 (produção), refletido no parâmetro p e no hash', () => {
    const url = montarUrlQrCodeNfce({
      chaveAcesso: CHAVE_ACESSO_FIXTURE,
      ambiente: 1,
      csc: CSC_FIXTURE,
      cscId: '1',
      urlQrCode: URL_QRCODE_FIXTURE,
    });

    expect(url).toContain(`${CHAVE_ACESSO_FIXTURE}|2|1|1|`);
    // Muda o tpAmb, muda a string que entra no hash, então o hash também muda.
    expect(url).not.toContain('9955DD074F4E088806D053C6C5E32B1D5B6F9CBD');
  });

  it('remove zeros não significativos do CSC ID (ex.: "01" vira "1")', () => {
    const url = montarUrlQrCodeNfce({
      chaveAcesso: CHAVE_ACESSO_FIXTURE,
      ambiente: 2,
      csc: CSC_FIXTURE,
      cscId: '01',
      urlQrCode: URL_QRCODE_FIXTURE,
    });

    expect(url).toContain(`${CHAVE_ACESSO_FIXTURE}|2|2|1|`);
  });

  it('produz hashes diferentes para CSCs diferentes com os mesmos demais parâmetros', () => {
    const base = {
      chaveAcesso: CHAVE_ACESSO_FIXTURE,
      ambiente: 2,
      cscId: '1',
      urlQrCode: URL_QRCODE_FIXTURE,
    };

    const url1 = montarUrlQrCodeNfce({ ...base, csc: CSC_FIXTURE });
    const url2 = montarUrlQrCodeNfce({ ...base, csc: 'OUTRO-CSC-DIFERENTE' });

    expect(url1).not.toBe(url2);
  });

  it('usa a urlQrCode informada como prefixo da URL final', () => {
    const url = montarUrlQrCodeNfce({
      chaveAcesso: CHAVE_ACESSO_FIXTURE,
      ambiente: 2,
      csc: CSC_FIXTURE,
      cscId: '1',
      urlQrCode: URL_QRCODE_FIXTURE,
    });

    expect(url.startsWith(`${URL_QRCODE_FIXTURE}?p=`)).toBe(true);
  });
});
