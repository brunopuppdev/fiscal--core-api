import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ModeloDocumento } from '../../common/enums/modelo-documento.enum';
import { CriarNotaFiscalDto } from './criar-nota.dto';

function itemValidoPlano(): Record<string, unknown> {
  return {
    codigo: 'PROD-1',
    descricao: 'Produto de teste',
    ncm: '20098990',
    cfop: '5102',
    quantidade: 1,
    valorUnitario: 10,
  };
}

function dtoNfcePlano(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    modelo: ModeloDocumento.NFCE,
    naturezaOperacao: 'VENDA',
    itens: [itemValidoPlano()],
    formaPagamento: '17', // PIX
    ...overrides,
  };
}

async function validarPlano(dados: Record<string, unknown>) {
  const instancia = plainToInstance(CriarNotaFiscalDto, dados);
  return validate(instancia);
}

describe('CriarNotaFiscalDto', () => {
  it('não gera erros para uma NFC-e válida sem destinatário', async () => {
    const erros = await validarPlano(dtoNfcePlano());
    expect(erros).toHaveLength(0);
  });

  it('não gera erros para uma NF-e válida com destinatário informado', async () => {
    const erros = await validarPlano(
      dtoNfcePlano({
        modelo: ModeloDocumento.NFE,
        destinatario: { documento: '11122233344' }, // CPF fictício
      }),
    );
    expect(erros).toHaveLength(0);
  });

  it('não gera erros quando naturezaOperacao é omitida (campo opcional)', async () => {
    const dados = dtoNfcePlano();
    delete dados.naturezaOperacao;
    const erros = await validarPlano(dados);
    expect(erros).toHaveLength(0);
  });

  it('rejeita modelo ausente', async () => {
    const dados = dtoNfcePlano();
    delete dados.modelo;
    const erros = await validarPlano(dados);
    expect(erros.some((e) => e.property === 'modelo')).toBe(true);
  });

  it('rejeita modelo com valor fora do enum (nem 55 nem 65)', async () => {
    const erros = await validarPlano(dtoNfcePlano({ modelo: '99' }));
    const erroModelo = erros.find((e) => e.property === 'modelo');
    expect(erroModelo).toBeDefined();
    expect(erroModelo?.constraints).toHaveProperty('isEnum');
  });

  it('rejeita naturezaOperacao com tipo errado (número em vez de string)', async () => {
    const erros = await validarPlano(dtoNfcePlano({ naturezaOperacao: 123 }));
    expect(erros.some((e) => e.property === 'naturezaOperacao')).toBe(true);
  });

  it('rejeita itens ausente', async () => {
    const dados = dtoNfcePlano();
    delete dados.itens;
    const erros = await validarPlano(dados);
    expect(erros.some((e) => e.property === 'itens')).toBe(true);
  });

  it('rejeita itens como array vazio (ArrayMinSize 1)', async () => {
    const erros = await validarPlano(dtoNfcePlano({ itens: [] }));
    const erroItens = erros.find((e) => e.property === 'itens');
    expect(erroItens).toBeDefined();
    expect(erroItens?.constraints).toHaveProperty('arrayMinSize');
  });

  it('rejeita quando um item da lista é inválido (violação propagada via ValidateNested)', async () => {
    const erros = await validarPlano(
      dtoNfcePlano({ itens: [{ ...itemValidoPlano(), ncm: '123' }] }),
    );
    const erroItens = erros.find((e) => e.property === 'itens');
    expect(erroItens).toBeDefined();
    const erroItem0 = erroItens?.children?.find((c) => c.property === '0');
    expect(erroItem0).toBeDefined();
    expect(erroItem0?.children?.some((c) => c.property === 'ncm')).toBe(true);
  });

  it('rejeita quando destinatario é inválido (violação propagada via ValidateNested)', async () => {
    const erros = await validarPlano(
      dtoNfcePlano({ destinatario: { nome: 12345 } }),
    );
    const erroDestinatario = erros.find((e) => e.property === 'destinatario');
    expect(erroDestinatario).toBeDefined();
    expect(erroDestinatario?.children?.some((c) => c.property === 'nome')).toBe(
      true,
    );
  });

  it('não gera erros quando destinatario é omitido (campo opcional, válido para NFC-e)', async () => {
    const dados = dtoNfcePlano();
    delete dados.destinatario;
    const erros = await validarPlano(dados);
    expect(erros).toHaveLength(0);
  });

  it('rejeita formaPagamento ausente', async () => {
    const dados = dtoNfcePlano();
    delete dados.formaPagamento;
    const erros = await validarPlano(dados);
    expect(erros.some((e) => e.property === 'formaPagamento')).toBe(true);
  });

  it('rejeita formaPagamento com código fora da tabela SEFAZ', async () => {
    const erros = await validarPlano(dtoNfcePlano({ formaPagamento: '77' }));
    const erroFormaPagamento = erros.find(
      (e) => e.property === 'formaPagamento',
    );
    expect(erroFormaPagamento).toBeDefined();
    expect(erroFormaPagamento?.constraints).toHaveProperty('isEnum');
  });

  // A regra de negócio "NF-e (55) exige destinatario.documento" NÃO é uma constraint de
  // class-validator neste DTO — é aplicada em runtime pelo NotasFiscaisService.emitir()
  // (BadRequestException), já coberto em notas-fiscais.service.spec.ts. Por isso, uma NF-e
  // sem destinatário passa na validação do DTO em si (é um dado sintaticamente válido).
  it('a validação do DTO por si só NÃO rejeita NF-e sem destinatário (regra é aplicada no service, não aqui)', async () => {
    const erros = await validarPlano(
      dtoNfcePlano({ modelo: ModeloDocumento.NFE, destinatario: undefined }),
    );
    expect(erros).toHaveLength(0);
  });
});
