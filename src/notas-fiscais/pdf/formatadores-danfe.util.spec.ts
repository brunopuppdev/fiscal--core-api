import { FormaPagamento } from '../../common/enums/forma-pagamento.enum';
import {
  formatarCep,
  formatarChaveExibicao,
  formatarDataHoraExibicao,
  formatarDataHoraLocal,
  formatarDocumento,
  formatarMoeda,
  textoFormaPagamento,
} from './formatadores-danfe.util';

describe('formatarDocumento', () => {
  it('formata CPF (11 dígitos) com máscara ###.###.###-##', () => {
    expect(formatarDocumento('11122233344')).toBe('111.222.333-44');
  });

  it('formata CNPJ (14 dígitos) com máscara ##.###.###/####-##', () => {
    expect(formatarDocumento('98765432000188')).toBe('98.765.432/0001-88');
  });

  it('remove máscara já existente antes de reaplicar (aceita entrada já mascarada)', () => {
    expect(formatarDocumento('987.654.320/00188')).toBe('98.765.432/0001-88');
  });

  it('retorna os dígitos sem máscara quando não tem 11 nem 14 dígitos', () => {
    expect(formatarDocumento('123')).toBe('123');
  });

  it('retorna "-" quando o documento é null/undefined/vazio', () => {
    expect(formatarDocumento(null)).toBe('-');
    expect(formatarDocumento(undefined)).toBe('-');
    expect(formatarDocumento('')).toBe('-');
  });
});

describe('formatarCep', () => {
  it('formata CEP (8 dígitos) com máscara #####-###', () => {
    expect(formatarCep('01310100')).toBe('01310-100');
  });

  it('remove máscara já existente antes de reaplicar', () => {
    expect(formatarCep('01310-100')).toBe('01310-100');
  });

  it('retorna os dígitos sem máscara quando não tem 8 dígitos', () => {
    expect(formatarCep('123')).toBe('123');
  });

  it('retorna string vazia quando o CEP é null/undefined', () => {
    expect(formatarCep(null)).toBe('');
    expect(formatarCep(undefined)).toBe('');
  });
});

describe('formatarChaveExibicao', () => {
  it('agrupa a chave de acesso (44 dígitos) em blocos de 4, separados por espaço', () => {
    const chave = '35260812345678000199650010000000011000000015';

    const resultado = formatarChaveExibicao(chave);

    expect(resultado).toBe(
      '3526 0812 3456 7800 0199 6500 1000 0000 0110 0000 0015',
    );
    // Garante que nenhum dígito foi perdido/duplicado no agrupamento.
    expect(resultado.replace(/\s/g, '')).toBe(chave);
  });
});

describe('formatarDataHoraExibicao', () => {
  it('formata "AAAA-MM-DDThh:mm:ss[-03:00]" (dhRecbto) para "DD/MM/AAAA hh:mm:ss"', () => {
    expect(formatarDataHoraExibicao('2026-01-15T10:31:05-03:00')).toBe(
      '15/01/2026 10:31:05',
    );
  });

  it('formata mesmo sem offset de fuso na string', () => {
    expect(formatarDataHoraExibicao('2026-01-15T10:31:05')).toBe(
      '15/01/2026 10:31:05',
    );
  });

  it('retorna "-" quando a data é null', () => {
    expect(formatarDataHoraExibicao(null)).toBe('-');
  });

  it('retorna o texto original quando não bate com o formato esperado', () => {
    expect(formatarDataHoraExibicao('não é uma data')).toBe('não é uma data');
  });
});

describe('formatarDataHoraLocal', () => {
  it('formata um Date local como "DD/MM/AAAA hh:mm:ss", com zero à esquerda', () => {
    const data = new Date(2026, 0, 5, 8, 3, 9); // 05/01/2026 08:03:09, mês 0-based

    expect(formatarDataHoraLocal(data)).toBe('05/01/2026 08:03:09');
  });
});

describe('formatarMoeda', () => {
  it('formata number como "R$ 1.234,56"', () => {
    expect(formatarMoeda(1234.56)).toBe('R$ 1.234,56');
  });

  it('formata string numérica como "R$ 1.234,56"', () => {
    expect(formatarMoeda('1234.56')).toBe('R$ 1.234,56');
  });

  it('sempre mostra duas casas decimais, mesmo para valores inteiros', () => {
    expect(formatarMoeda(20)).toBe('R$ 20,00');
  });

  it('formata zero como "R$ 0,00"', () => {
    expect(formatarMoeda(0)).toBe('R$ 0,00');
  });
});

describe('textoFormaPagamento', () => {
  // Os 16 códigos SEFAZ mapeados (grupo pag/detPag) documentados na entidade NotaFiscal.
  it.each([
    [FormaPagamento.DINHEIRO, 'Dinheiro'],
    [FormaPagamento.CHEQUE, 'Cheque'],
    [FormaPagamento.CARTAO_CREDITO, 'Cartão de Crédito'],
    [FormaPagamento.CARTAO_DEBITO, 'Cartão de Débito'],
    [FormaPagamento.CREDITO_LOJA, 'Crédito Loja'],
    [FormaPagamento.VALE_ALIMENTACAO, 'Vale Alimentação'],
    [FormaPagamento.VALE_REFEICAO, 'Vale Refeição'],
    [FormaPagamento.VALE_PRESENTE, 'Vale Presente'],
    [FormaPagamento.VALE_COMBUSTIVEL, 'Vale Combustível'],
    [FormaPagamento.DUPLICATA_MERCANTIL, 'Duplicata Mercantil'],
    [FormaPagamento.BOLETO_BANCARIO, 'Boleto Bancário'],
    [FormaPagamento.DEPOSITO_BANCARIO, 'Depósito Bancário'],
    [FormaPagamento.PIX, 'PIX'],
    [
      FormaPagamento.TRANSFERENCIA_BANCARIA_CARTEIRA_DIGITAL,
      'Transferência Bancária/Carteira Digital',
    ],
    [FormaPagamento.FIDELIDADE_CASHBACK, 'Fidelidade/Cashback'],
    [FormaPagamento.SEM_PAGAMENTO, 'Sem Pagamento'],
    [FormaPagamento.OUTROS, 'Outros'],
  ])('mapeia o código %s para o texto "%s"', (codigo, textoEsperado) => {
    expect(textoFormaPagamento(codigo)).toBe(textoEsperado);
  });

  it('retorna "Outros (código)" para um código não mapeado', () => {
    expect(textoFormaPagamento('77')).toBe('Outros (77)');
  });
});
