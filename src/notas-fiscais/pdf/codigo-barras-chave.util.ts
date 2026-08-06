import * as bwipjs from 'bwip-js';

/** Gera um PNG (Code128) da chave de acesso, para o corpo do DANFE (NF-e retrato). */
export async function gerarCodigoBarrasChave(
  chaveAcesso: string,
): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text: chaveAcesso,
    scale: 3,
    height: 12,
    includetext: false,
  });
}
