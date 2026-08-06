import { FormaPagamento } from '../../common/enums/forma-pagamento.enum';

/** Formata CPF (11 dígitos) ou CNPJ (14 dígitos) para exibição. Sem máscara para outros tamanhos. */
export function formatarDocumento(
  documento: string | null | undefined,
): string {
  const digitos = (documento ?? '').replace(/\D/g, '');
  if (digitos.length === 11) {
    return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (digitos.length === 14) {
    return digitos.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      '$1.$2.$3/$4-$5',
    );
  }
  return digitos || '-';
}

/** Formata CEP (8 dígitos) para exibição. */
export function formatarCep(cep: string | null | undefined): string {
  const digitos = (cep ?? '').replace(/\D/g, '');
  return digitos.length === 8
    ? digitos.replace(/(\d{5})(\d{3})/, '$1-$2')
    : digitos;
}

/** Agrupa a chave de acesso (44 dígitos) em blocos de 4, como impresso no DANFE oficial. */
export function formatarChaveExibicao(chaveAcesso: string): string {
  return chaveAcesso.replace(/(\d{4})(?=\d)/g, '$1 ');
}

/**
 * Formata "AAAA-MM-DDThh:mm:ss[+-hh:mm]" (dhRecbto do XML) para "DD/MM/AAAA hh:mm:ss".
 * Extrai os componentes literalmente do texto, sem conversão de fuso — o objetivo é exibir
 * exatamente o horário informado pela SEFAZ, não reinterpretá-lo no fuso do servidor.
 */
export function formatarDataHoraExibicao(dataIso: string | null): string {
  if (!dataIso) return '-';
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(
    dataIso,
  );
  if (!match) return dataIso;
  const [, ano, mes, dia, hora, min, seg] = match;
  return `${dia}/${mes}/${ano} ${hora}:${min}:${seg}`;
}

/**
 * Formata um `Date` (ex.: `NotaFiscal.dataEmissao`) como "DD/MM/AAAA hh:mm:ss", usando os
 * getters locais do objeto — mesma convenção de fuso já usada por `formatarDataHoraNfe` ao
 * montar o `dhEmi` do XML. Diferente de `formatarDataHoraExibicao`, aqui a entrada já é um
 * objeto `Date` (não um texto de XML a ser exibido literalmente).
 */
export function formatarDataHoraLocal(data: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    `${pad(data.getDate())}/${pad(data.getMonth() + 1)}/${data.getFullYear()} ` +
    `${pad(data.getHours())}:${pad(data.getMinutes())}:${pad(data.getSeconds())}`
  );
}

/** Formata um valor numérico (string ou number) como "R$ 1.234,56". */
export function formatarMoeda(valor: string | number): string {
  const numero = typeof valor === 'string' ? parseFloat(valor) : valor;
  return `R$ ${numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Texto legível da forma de pagamento (grupo pag/detPag), para exibição no DANFCE.
 * Convenção de apresentação deste projeto, não parte do layout oficial da NF-e.
 */
const TEXTO_FORMA_PAGAMENTO: Record<string, string> = {
  [FormaPagamento.DINHEIRO]: 'Dinheiro',
  [FormaPagamento.CHEQUE]: 'Cheque',
  [FormaPagamento.CARTAO_CREDITO]: 'Cartão de Crédito',
  [FormaPagamento.CARTAO_DEBITO]: 'Cartão de Débito',
  [FormaPagamento.CREDITO_LOJA]: 'Crédito Loja',
  [FormaPagamento.VALE_ALIMENTACAO]: 'Vale Alimentação',
  [FormaPagamento.VALE_REFEICAO]: 'Vale Refeição',
  [FormaPagamento.VALE_PRESENTE]: 'Vale Presente',
  [FormaPagamento.VALE_COMBUSTIVEL]: 'Vale Combustível',
  [FormaPagamento.DUPLICATA_MERCANTIL]: 'Duplicata Mercantil',
  [FormaPagamento.BOLETO_BANCARIO]: 'Boleto Bancário',
  [FormaPagamento.DEPOSITO_BANCARIO]: 'Depósito Bancário',
  [FormaPagamento.PIX]: 'PIX',
  [FormaPagamento.TRANSFERENCIA_BANCARIA_CARTEIRA_DIGITAL]:
    'Transferência Bancária/Carteira Digital',
  [FormaPagamento.FIDELIDADE_CASHBACK]: 'Fidelidade/Cashback',
  [FormaPagamento.SEM_PAGAMENTO]: 'Sem Pagamento',
  [FormaPagamento.OUTROS]: 'Outros',
};

export function textoFormaPagamento(codigo: string): string {
  return TEXTO_FORMA_PAGAMENTO[codigo] ?? `Outros (${codigo})`;
}
