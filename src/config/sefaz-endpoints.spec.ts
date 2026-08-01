import { getSefazEndpoints } from './sefaz-endpoints';

describe('getSefazEndpoints', () => {
  describe('SP', () => {
    it('retorna as URLs de homologação quando ambiente=2', () => {
      const endpoints = getSefazEndpoints('SP', 2);

      expect(endpoints.NFeStatusServico4).toBe(
        'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx',
      );
      expect(endpoints.NFeAutorizacao4).toBe(
        'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx',
      );
      expect(endpoints.NFeConsultaProtocolo4).toBe(
        'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx',
      );
      for (const url of Object.values(endpoints)) {
        expect(url).toContain('homologacao.nfe.fazenda.sp.gov.br');
      }
    });

    it('retorna as URLs de produção quando ambiente=1', () => {
      const endpoints = getSefazEndpoints('SP', 1);

      expect(endpoints.NFeStatusServico4).toBe(
        'https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx',
      );
      expect(endpoints.NFeAutorizacao4).toBe(
        'https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx',
      );
      for (const url of Object.values(endpoints)) {
        expect(url).not.toContain('homologacao.');
        expect(url).toContain('nfe.fazenda.sp.gov.br');
      }
    });

    it('produz URLs diferentes entre produção e homologação para o mesmo webservice', () => {
      const homologacao = getSefazEndpoints('SP', 2);
      const producao = getSefazEndpoints('SP', 1);

      expect(homologacao.NFeAutorizacao4).not.toBe(producao.NFeAutorizacao4);
      expect(homologacao.NFeStatusServico4).not.toBe(
        producao.NFeStatusServico4,
      );
    });

    it('aceita a UF em minúsculas (normaliza para maiúsculas internamente)', () => {
      const endpoints = getSefazEndpoints('sp', 2);

      expect(endpoints.NFeStatusServico4).toBe(
        'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx',
      );
    });

    it('qualquer ambiente diferente de 1 (ex.: 2, 0, indefinido em runtime) resolve para homologação', () => {
      const endpoints = getSefazEndpoints('SP', 0);

      expect(endpoints.NFeStatusServico4).toContain('homologacao.');
    });
  });

  describe('UF não configurada', () => {
    it('lança um erro claro em vez de retornar undefined silenciosamente', () => {
      expect(() => getSefazEndpoints('RJ', 2)).toThrow(
        'Endpoints da SEFAZ não configurados para a UF "RJ". Adicione em sefaz-endpoints.ts.',
      );
    });

    it('lança erro também para uma UF inválida/vazia', () => {
      expect(() => getSefazEndpoints('', 2)).toThrow(Error);
    });
  });
});
