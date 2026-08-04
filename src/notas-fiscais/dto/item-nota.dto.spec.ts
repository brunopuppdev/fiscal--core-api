import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ItemNotaDto } from './item-nota.dto';

function itemValidoPlano(): Record<string, unknown> {
  return {
    codigo: 'SUCO-LARANJA-500',
    descricao: 'Suco de laranja natural 500ml',
    ncm: '20098990',
    cfop: '5102',
    unidade: 'UN',
    quantidade: 2,
    valorUnitario: 12.5,
    csosn: '102',
  };
}

function sem(
  dados: Record<string, unknown>,
  ...campos: string[]
): Record<string, unknown> {
  const copia = { ...dados };
  for (const campo of campos) {
    delete copia[campo];
  }
  return copia;
}

async function validarPlano(dados: Record<string, unknown>) {
  const instancia = plainToInstance(ItemNotaDto, dados);
  return validate(instancia);
}

describe('ItemNotaDto', () => {
  it('não gera erros de validação para um item completo e válido', async () => {
    const erros = await validarPlano(itemValidoPlano());
    expect(erros).toHaveLength(0);
  });

  it('não gera erros quando os campos opcionais (unidade, csosn, cest) são omitidos', async () => {
    const erros = await validarPlano(
      sem(itemValidoPlano(), 'unidade', 'csosn', 'cest'),
    );
    expect(erros).toHaveLength(0);
  });

  it('não gera erros quando cest é informado com 7 dígitos', async () => {
    const erros = await validarPlano({
      ...itemValidoPlano(),
      cest: '1701000',
    });
    expect(erros).toHaveLength(0);
  });

  it('rejeita cest com menos de 7 dígitos', async () => {
    const erros = await validarPlano({ ...itemValidoPlano(), cest: '123' });
    const erroCest = erros.find((e) => e.property === 'cest');
    expect(erroCest).toBeDefined();
    expect(erroCest?.constraints).toHaveProperty('matches');
  });

  it('rejeita cest com caracteres não numéricos', async () => {
    const erros = await validarPlano({
      ...itemValidoPlano(),
      cest: 'ABCDEFG',
    });
    expect(erros.some((e) => e.property === 'cest')).toBe(true);
  });

  it('rejeita quando codigo está ausente', async () => {
    const erros = await validarPlano(sem(itemValidoPlano(), 'codigo'));
    expect(erros.some((e) => e.property === 'codigo')).toBe(true);
  });

  it('rejeita quando descricao está ausente', async () => {
    const erros = await validarPlano(sem(itemValidoPlano(), 'descricao'));
    expect(erros.some((e) => e.property === 'descricao')).toBe(true);
  });

  it('rejeita ncm com menos de 8 dígitos', async () => {
    const erros = await validarPlano({ ...itemValidoPlano(), ncm: '123' });
    const erroNcm = erros.find((e) => e.property === 'ncm');
    expect(erroNcm).toBeDefined();
    expect(erroNcm?.constraints).toHaveProperty('matches');
  });

  it('rejeita ncm com caracteres não numéricos', async () => {
    const erros = await validarPlano({
      ...itemValidoPlano(),
      ncm: 'ABCDEFGH',
    });
    expect(erros.some((e) => e.property === 'ncm')).toBe(true);
  });

  it('rejeita cfop com tamanho diferente de 4', async () => {
    const erros = await validarPlano({ ...itemValidoPlano(), cfop: '510' });
    const erroCfop = erros.find((e) => e.property === 'cfop');
    expect(erroCfop).toBeDefined();
    expect(erroCfop?.constraints).toHaveProperty('isLength');
  });

  it('rejeita quantidade não numérica (tipo errado)', async () => {
    const erros = await validarPlano({
      ...itemValidoPlano(),
      quantidade: 'duas',
    });
    const erroQuantidade = erros.find((e) => e.property === 'quantidade');
    expect(erroQuantidade).toBeDefined();
    expect(erroQuantidade?.constraints).toHaveProperty('isNumber');
  });

  it('rejeita quantidade zero ou negativa', async () => {
    const errosZero = await validarPlano({
      ...itemValidoPlano(),
      quantidade: 0,
    });
    expect(errosZero.some((e) => e.property === 'quantidade')).toBe(true);

    const errosNegativo = await validarPlano({
      ...itemValidoPlano(),
      quantidade: -1,
    });
    expect(errosNegativo.some((e) => e.property === 'quantidade')).toBe(true);
  });

  it('rejeita valorUnitario zero ou negativo', async () => {
    const erros = await validarPlano({
      ...itemValidoPlano(),
      valorUnitario: -5,
    });
    const erroValor = erros.find((e) => e.property === 'valorUnitario');
    expect(erroValor).toBeDefined();
    expect(erroValor?.constraints).toHaveProperty('isPositive');
  });

  it('rejeita valorUnitario com tipo errado (string não numérica)', async () => {
    const erros = await validarPlano({
      ...itemValidoPlano(),
      valorUnitario: 'dez reais',
    });
    expect(erros.some((e) => e.property === 'valorUnitario')).toBe(true);
  });
});
