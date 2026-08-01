import {
  CODIGO_UF,
  DadosChaveAcesso,
  gerarCodigoNumerico,
  montarChaveAcesso,
} from './chave-acesso.util';

/**
 * Reimplementação independente do módulo 11 usado nas chaves de acesso da NF-e,
 * conforme o Manual de Orientação do Contribuinte: pesos de 2 a 9 (cíclicos) a
 * partir do dígito menos significativo; resto 0 ou 1 => DV 0.
 */
function calcularDvEsperado(chave43: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += Number(chave43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

describe('montarChaveAcesso', () => {
  const dadosBase: DadosChaveAcesso = {
    uf: CODIGO_UF.SP,
    dataEmissao: new Date(2026, 0, 15, 10, 30, 0),
    cnpj: '12345678000199', // CNPJ fictício, apenas para teste
    modelo: '55',
    serie: 1,
    numero: 42,
    tipoEmissao: 1,
    codigoNumerico: '12345678',
  };

  it('gera uma chave com exatamente 44 dígitos numéricos', () => {
    const chave = montarChaveAcesso(dadosBase);
    expect(chave).toHaveLength(44);
    expect(chave).toMatch(/^\d{44}$/);
  });

  it('posiciona cada campo do layout da NF-e na ordem exigida (cUF-AAMM-CNPJ-mod-serie-nNF-tpEmis-cNF-DV)', () => {
    const chave = montarChaveAcesso(dadosBase);

    expect(chave.slice(0, 2)).toBe('35'); // cUF: SP
    expect(chave.slice(2, 6)).toBe('2601'); // AAMM: janeiro/2026
    expect(chave.slice(6, 20)).toBe('12345678000199'); // CNPJ (14 dígitos)
    expect(chave.slice(20, 22)).toBe('55'); // modelo
    expect(chave.slice(22, 25)).toBe('001'); // série (3 dígitos)
    expect(chave.slice(25, 34)).toBe('000000042'); // número (9 dígitos)
    expect(chave.slice(34, 35)).toBe('1'); // tpEmis
    expect(chave.slice(35, 43)).toBe('12345678'); // cNF (8 dígitos)
  });

  it('preenche com zeros à esquerda quando série, número e CNPJ vêm menores que o tamanho fixo', () => {
    const chave = montarChaveAcesso({
      ...dadosBase,
      cnpj: '199', // CNPJ curto de propósito, para checar o padStart
      serie: 2,
      numero: 7,
    });

    expect(chave.slice(6, 20)).toBe('00000000000199');
    expect(chave.slice(22, 25)).toBe('002');
    expect(chave.slice(25, 34)).toBe('000000007');
  });

  it('calcula o dígito verificador pelo módulo 11 conforme o Manual da NF-e', () => {
    const chave = montarChaveAcesso(dadosBase);
    const chave43 = chave.slice(0, 43);
    const dvObtido = Number(chave.slice(43));

    expect(dvObtido).toBe(calcularDvEsperado(chave43));
  });

  it('calcula o dígito verificador corretamente também para outro conjunto de dados (modelo NFC-e)', () => {
    const dadosNfce: DadosChaveAcesso = {
      uf: CODIGO_UF.RJ,
      dataEmissao: new Date(2025, 11, 1, 8, 0, 0),
      cnpj: '98765432000111',
      modelo: '65',
      serie: 3,
      numero: 999,
      tipoEmissao: 1,
      codigoNumerico: '87654321',
    };

    const chave = montarChaveAcesso(dadosNfce);
    const chave43 = chave.slice(0, 43);
    const dvObtido = Number(chave.slice(43));

    expect(dvObtido).toBe(calcularDvEsperado(chave43));
  });

  it('resulta em dígito verificador 0 quando o resto da divisão por 11 é 0 ou 1', () => {
    // Regressão específica da regra "resto < 2 => DV 0" (fácil de errar ao inverter a condição).
    let encontrouRestoBaixo = false;
    for (let numero = 1; numero <= 50 && !encontrouRestoBaixo; numero++) {
      const chave = montarChaveAcesso({ ...dadosBase, numero });
      const chave43 = chave.slice(0, 43);
      let soma = 0;
      let peso = 2;
      for (let i = chave43.length - 1; i >= 0; i--) {
        soma += Number(chave43[i]) * peso;
        peso = peso === 9 ? 2 : peso + 1;
      }
      const resto = soma % 11;
      if (resto < 2) {
        encontrouRestoBaixo = true;
        expect(Number(chave.slice(43))).toBe(0);
      }
    }
    expect(encontrouRestoBaixo).toBe(true);
  });
});

describe('gerarCodigoNumerico', () => {
  it('gera uma string numérica de 8 dígitos dentro do intervalo permitido para cNF', () => {
    for (let i = 0; i < 20; i++) {
      const codigo = gerarCodigoNumerico();
      expect(codigo).toMatch(/^\d{8}$/);
      const valor = Number(codigo);
      expect(valor).toBeGreaterThanOrEqual(10000000);
      expect(valor).toBeLessThanOrEqual(99999999);
    }
  });
});

describe('CODIGO_UF', () => {
  it('mapeia os códigos IBGE das UFs usados na chave de acesso', () => {
    expect(CODIGO_UF.SP).toBe('35');
    expect(CODIGO_UF.RJ).toBe('33');
    expect(CODIGO_UF.MG).toBe('31');
    expect(CODIGO_UF.DF).toBe('53');
  });
});
