import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DestinatarioDto } from './destinatario.dto';

function destinatarioValidoPlano(): Record<string, unknown> {
  return {
    nome: 'João da Silva',
    documento: '12345678900', // CPF fictício
    email: 'cliente@example.com',
    endereco: {
      logradouro: 'Rua das Flores',
      numero: '123',
      bairro: 'Centro',
      municipio: 'São Paulo',
      codMunicipio: '3550308',
      uf: 'SP',
      cep: '01001000',
    },
  };
}

async function validarPlano(dados: Record<string, unknown>) {
  const instancia = plainToInstance(DestinatarioDto, dados);
  return validate(instancia);
}

describe('DestinatarioDto', () => {
  it('não gera erros de validação para um destinatário completo e válido', async () => {
    const erros = await validarPlano(destinatarioValidoPlano());
    expect(erros).toHaveLength(0);
  });

  it('não gera erros de validação para um objeto vazio (todos os campos são opcionais, ex.: NFC-e sem destinatário identificado)', async () => {
    const erros = await validarPlano({});
    expect(erros).toHaveLength(0);
  });

  it('rejeita quando nome tem tipo errado (número em vez de string)', async () => {
    const erros = await validarPlano({
      ...destinatarioValidoPlano(),
      nome: 12345,
    });
    const erroNome = erros.find((e) => e.property === 'nome');
    expect(erroNome).toBeDefined();
    expect(erroNome?.constraints).toHaveProperty('isString');
  });

  it('rejeita quando documento tem tipo errado (número em vez de string)', async () => {
    const erros = await validarPlano({
      ...destinatarioValidoPlano(),
      documento: 12345678900,
    });
    expect(erros.some((e) => e.property === 'documento')).toBe(true);
  });

  it('rejeita quando email tem tipo errado (número em vez de string)', async () => {
    const erros = await validarPlano({
      ...destinatarioValidoPlano(),
      email: 42,
    });
    expect(erros.some((e) => e.property === 'email')).toBe(true);
  });

  describe('endereco (EnderecoDestinatarioDto aninhado)', () => {
    it('não gera erros quando o endereço é omitido (campo opcional)', async () => {
      const dados = destinatarioValidoPlano();
      delete dados.endereco;
      const erros = await validarPlano(dados);
      expect(erros).toHaveLength(0);
    });

    it('não gera erros quando o endereço é válido', async () => {
      const erros = await validarPlano(destinatarioValidoPlano());
      expect(erros).toHaveLength(0);
    });

    it('rejeita quando uf do endereço não tem exatamente 2 caracteres', async () => {
      const erros = await validarPlano({
        ...destinatarioValidoPlano(),
        endereco: { ...destinatarioValidoPlano().endereco, uf: 'SPX' },
      });

      const erroEndereco = erros.find((e) => e.property === 'endereco');
      expect(erroEndereco).toBeDefined();
      const erroUf = erroEndereco?.children?.find((e) => e.property === 'uf');
      expect(erroUf?.constraints).toHaveProperty('isLength');
    });

    it('rejeita quando logradouro do endereço tem tipo errado (número em vez de string)', async () => {
      const erros = await validarPlano({
        ...destinatarioValidoPlano(),
        endereco: { ...destinatarioValidoPlano().endereco, logradouro: 999 },
      });

      const erroEndereco = erros.find((e) => e.property === 'endereco');
      const erroLogradouro = erroEndereco?.children?.find(
        (e) => e.property === 'logradouro',
      );
      expect(erroLogradouro?.constraints).toHaveProperty('isString');
    });
  });
});
