import { formatarDataHoraNfe } from './data-hora-nfe.util';

describe('formatarDataHoraNfe', () => {
  it('formata data e hora no padrão AAAA-MM-DDThh:mm:ss exigido pelo layout da NF-e', () => {
    const data = new Date(2026, 0, 5, 8, 3, 9); // 05/01/2026 08:03:09 (horário local)
    const resultado = formatarDataHoraNfe(data);

    expect(resultado).toMatch(/^2026-01-05T08:03:09[+-]\d{2}:\d{2}$/);
  });

  it('preenche com zero à esquerda mês, dia, hora, minuto e segundo com um único dígito', () => {
    const data = new Date(2026, 8, 1, 1, 2, 3); // 01/09/2026 01:02:03
    const resultado = formatarDataHoraNfe(data);

    expect(resultado.startsWith('2026-09-01T01:02:03')).toBe(true);
  });

  it('inclui o offset de fuso horário (TZD) no formato ±hh:mm coerente com o offset local da data', () => {
    const data = new Date(2026, 5, 15, 12, 0, 0);
    const resultado = formatarDataHoraNfe(data);

    const offsetMin = -data.getTimezoneOffset();
    const sinalEsperado = offsetMin >= 0 ? '+' : '-';
    const horasEsperadas = Math.floor(Math.abs(offsetMin) / 60)
      .toString()
      .padStart(2, '0');
    const minutosEsperados = (Math.abs(offsetMin) % 60)
      .toString()
      .padStart(2, '0');

    expect(resultado).toBe(
      `2026-06-15T12:00:00${sinalEsperado}${horasEsperadas}:${minutosEsperados}`,
    );
  });

  it('usa ano com 4 dígitos e mantém a ordem AAAA-MM-DD antes do T', () => {
    const data = new Date(2030, 11, 31, 23, 59, 59);
    const resultado = formatarDataHoraNfe(data);

    expect(resultado.slice(0, 11)).toBe('2030-12-31T');
  });

  describe('sinal do offset de fuso (determinístico, independe do timezone da máquina)', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('usa sinal "+" quando o offset (offsetMin = -getTimezoneOffset()) é maior ou igual a zero', () => {
      // getTimezoneOffset() negativo (ex.: -180, como em UTC+03:00) faz offsetMin = 180 >= 0.
      jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-180);

      const data = new Date(2026, 5, 15, 12, 0, 0);
      const resultado = formatarDataHoraNfe(data);

      expect(resultado).toBe('2026-06-15T12:00:00+03:00');
    });

    it('usa sinal "-" quando o offset (offsetMin = -getTimezoneOffset()) é negativo', () => {
      // getTimezoneOffset() positivo (ex.: 180, como em UTC-03:00, Brasília) faz offsetMin = -180 < 0.
      jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(180);

      const data = new Date(2026, 5, 15, 12, 0, 0);
      const resultado = formatarDataHoraNfe(data);

      expect(resultado).toBe('2026-06-15T12:00:00-03:00');
    });
  });
});
