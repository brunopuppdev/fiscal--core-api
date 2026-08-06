/**
 * Códigos SEFAZ de forma de pagamento (grupo pag/detPag do layout NFe 4.00).
 * Convenção assumida: lista completa da tabela oficial, sem restringir às formas mais
 * comuns para MEI — quem chama a API decide qual se aplica à venda.
 */
export enum FormaPagamento {
  DINHEIRO = '01',
  CHEQUE = '02',
  CARTAO_CREDITO = '03',
  CARTAO_DEBITO = '04',
  CREDITO_LOJA = '05',
  VALE_ALIMENTACAO = '10',
  VALE_REFEICAO = '11',
  VALE_PRESENTE = '12',
  VALE_COMBUSTIVEL = '13',
  DUPLICATA_MERCANTIL = '14',
  BOLETO_BANCARIO = '15',
  DEPOSITO_BANCARIO = '16',
  PIX = '17',
  TRANSFERENCIA_BANCARIA_CARTEIRA_DIGITAL = '18',
  FIDELIDADE_CASHBACK = '19',
  SEM_PAGAMENTO = '90',
  OUTROS = '99',
}
