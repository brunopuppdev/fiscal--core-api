import { ModeloDocumento } from '../common/enums/modelo-documento.enum';
import { getNfceConsultaUrls, getSefazEndpoints } from './sefaz-endpoints';

describe('getSefazEndpoints', () => {
  describe('SP - NF-e (modelo 55)', () => {
    it('retorna as URLs de homologação quando ambiente=2', () => {
      const endpoints = getSefazEndpoints('SP', 2, ModeloDocumento.NFE);

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
      const endpoints = getSefazEndpoints('SP', 1, ModeloDocumento.NFE);

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
      const homologacao = getSefazEndpoints('SP', 2, ModeloDocumento.NFE);
      const producao = getSefazEndpoints('SP', 1, ModeloDocumento.NFE);

      expect(homologacao.NFeAutorizacao4).not.toBe(producao.NFeAutorizacao4);
      expect(homologacao.NFeStatusServico4).not.toBe(
        producao.NFeStatusServico4,
      );
    });

    it('aceita a UF em minúsculas (normaliza para maiúsculas internamente)', () => {
      const endpoints = getSefazEndpoints('sp', 2, ModeloDocumento.NFE);

      expect(endpoints.NFeStatusServico4).toBe(
        'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx',
      );
    });

    it('qualquer ambiente diferente de 1 (ex.: 2, 0, indefinido em runtime) resolve para homologação', () => {
      const endpoints = getSefazEndpoints('SP', 0, ModeloDocumento.NFE);

      expect(endpoints.NFeStatusServico4).toContain('homologacao.');
    });
  });

  describe('SP - NFC-e (modelo 65)', () => {
    it('usa o domínio nfce.fazenda.sp.gov.br em homologação, diferente do domínio de NF-e', () => {
      const endpoints = getSefazEndpoints('SP', 2, ModeloDocumento.NFCE);

      expect(endpoints.NFeAutorizacao4).toBe(
        'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx',
      );
      expect(endpoints.NFeStatusServico4).toBe(
        'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeStatusServico4.asmx',
      );
      for (const url of Object.values(endpoints)) {
        expect(url).toContain('homologacao.nfce.fazenda.sp.gov.br');
      }
    });

    it('usa o domínio nfce.fazenda.sp.gov.br em produção, diferente do domínio de NF-e', () => {
      const endpoints = getSefazEndpoints('SP', 1, ModeloDocumento.NFCE);

      expect(endpoints.NFeAutorizacao4).toBe(
        'https://nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx',
      );
      for (const url of Object.values(endpoints)) {
        expect(url).not.toContain('homologacao.');
        expect(url).toContain('nfce.fazenda.sp.gov.br');
      }
    });

    it('difere do conjunto de endpoints de NF-e para o mesmo ambiente', () => {
      const nfce = getSefazEndpoints('SP', 2, ModeloDocumento.NFCE);
      const nfe = getSefazEndpoints('SP', 2, ModeloDocumento.NFE);

      expect(nfce.NFeAutorizacao4).not.toBe(nfe.NFeAutorizacao4);
      expect(nfce.NFeStatusServico4).not.toBe(nfe.NFeStatusServico4);
    });
  });

  describe('UF não configurada', () => {
    it('lança um erro claro em vez de retornar undefined silenciosamente', () => {
      expect(() => getSefazEndpoints('RJ', 2, ModeloDocumento.NFCE)).toThrow(
        'Endpoints da SEFAZ não configurados para a UF "RJ". Adicione em sefaz-endpoints.ts.',
      );
    });

    it('lança erro também para uma UF inválida/vazia', () => {
      expect(() => getSefazEndpoints('', 2, ModeloDocumento.NFCE)).toThrow(
        Error,
      );
    });
  });
});

describe('getNfceConsultaUrls', () => {
  it('retorna as URLs de homologação (qrCode e urlChave) quando ambiente=2', () => {
    const urls = getNfceConsultaUrls('SP', 2);

    expect(urls.qrCode).toBe(
      'https://www.homologacao.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx',
    );
    expect(urls.urlChave).toBe(
      'https://www.homologacao.nfce.fazenda.sp.gov.br/consulta',
    );
  });

  it('retorna as URLs de produção quando ambiente=1', () => {
    const urls = getNfceConsultaUrls('SP', 1);

    expect(urls.qrCode).toBe(
      'https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx',
    );
    expect(urls.urlChave).toBe('https://www.nfce.fazenda.sp.gov.br/consulta');
    expect(urls.qrCode).not.toContain('homologacao.');
  });

  it('aceita a UF em minúsculas (normaliza para maiúsculas internamente)', () => {
    const urls = getNfceConsultaUrls('sp', 1);

    expect(urls.qrCode).toContain('nfce.fazenda.sp.gov.br');
  });

  it('lança um erro claro para UF não configurada', () => {
    expect(() => getNfceConsultaUrls('RJ', 2)).toThrow(
      'URLs de consulta de NFC-e não configuradas para a UF "RJ". Adicione em sefaz-endpoints.ts.',
    );
  });
});
