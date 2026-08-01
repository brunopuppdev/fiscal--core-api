/**
 * Geração da chave de acesso da NF-e/NFC-e (44 dígitos) conforme
 * Manual de Orientação do Contribuinte, e cálculo do dígito verificador (módulo 11).
 */
export interface DadosChaveAcesso {
  uf: string; // código IBGE da UF (ex: 35 para SP)
  dataEmissao: Date;
  cnpj: string;
  modelo: string; // '55' ou '65'
  serie: number;
  numero: number;
  tipoEmissao: number; // tpEmis: 1 = normal
  codigoNumerico: string; // cNF: 8 dígitos aleatórios
}

function modulo11(chave43: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += parseInt(chave43[i], 10) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  return dv >= 10 ? 0 : dv;
}

export function gerarCodigoNumerico(): string {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

export function montarChaveAcesso(dados: DadosChaveAcesso): string {
  const aamm =
    dados.dataEmissao.getFullYear().toString().slice(2) +
    (dados.dataEmissao.getMonth() + 1).toString().padStart(2, '0');

  const chave43 =
    dados.uf.padStart(2, '0') +
    aamm +
    dados.cnpj.padStart(14, '0') +
    dados.modelo +
    dados.serie.toString().padStart(3, '0') +
    dados.numero.toString().padStart(9, '0') +
    dados.tipoEmissao.toString() +
    dados.codigoNumerico.padStart(8, '0');

  const dv = modulo11(chave43);
  return chave43 + dv.toString();
}

/** Códigos IBGE das UFs usados na chave de acesso. */
export const CODIGO_UF: Record<string, string> = {
  SP: '35',
  RJ: '33',
  MG: '31',
  ES: '32',
  PR: '41',
  SC: '42',
  RS: '43',
  BA: '29',
  GO: '52',
  DF: '53',
};
