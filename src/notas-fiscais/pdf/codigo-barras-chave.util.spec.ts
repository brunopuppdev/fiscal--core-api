import { gerarCodigoBarrasChave } from './codigo-barras-chave.util';

// Chave de acesso fictícia (44 dígitos), só para exercitar a geração do código de barras.
const CHAVE_ACESSO_FIXTURE = '35260812345678000199650010000000011000000015';

describe('gerarCodigoBarrasChave', () => {
  it('gera um Buffer de imagem PNG válido (magic bytes) a partir da chave de acesso', async () => {
    const buffer = await gerarCodigoBarrasChave(CHAVE_ACESSO_FIXTURE);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    // Assinatura PNG: 0x89 'P' 'N' 'G' '\r' '\n' 0x1A '\n'.
    expect(buffer.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it('não lança exceção para uma chave de acesso válida (44 dígitos)', async () => {
    await expect(
      gerarCodigoBarrasChave(CHAVE_ACESSO_FIXTURE),
    ).resolves.toBeInstanceOf(Buffer);
  });
});
