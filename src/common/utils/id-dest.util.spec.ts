import { calcularIdDest } from './id-dest.util';

describe('calcularIdDest', () => {
  it('retorna "1" (operação interna) quando a UF do destinatário é a mesma do emitente', () => {
    expect(calcularIdDest('SP', 'SP')).toBe('1');
  });

  it('retorna "2" (operação interestadual) quando a UF do destinatário é diferente da do emitente', () => {
    expect(calcularIdDest('SP', 'RJ')).toBe('2');
  });

  it('assume operação interna ("1") quando a UF do destinatário não é informada (NFC-e sem endereço)', () => {
    expect(calcularIdDest('SP', undefined)).toBe('1');
  });

  it('compara as UFs sem diferenciar maiúsculas/minúsculas', () => {
    expect(calcularIdDest('sp', 'Sp')).toBe('1');
    expect(calcularIdDest('SP', 'rj')).toBe('2');
  });
});
