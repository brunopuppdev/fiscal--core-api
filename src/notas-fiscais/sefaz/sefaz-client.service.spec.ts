import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { AppConfig } from '../../config/configuration';
import { CertificadoService } from '../../certificado/certificado.service';
import { AppLogger } from '../../common/logger/app-logger';
import { ModeloDocumento } from '../../common/enums/modelo-documento.enum';
import { SefazClientService } from './sefaz-client.service';
import { postSoap } from './soap-http.util';

// Camada de transporte SOAP sempre mockada: teste unitário nunca pode disparar uma
// chamada de rede real para a SEFAZ (nem em homologação).
jest.mock('./soap-http.util', () => ({
  postSoap: jest.fn(),
}));

const postSoapMock = postSoap as jest.MockedFunction<typeof postSoap>;

function envelopeSoap(corpo: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">' +
    `<soap:Body>${corpo}</soap:Body>` +
    '</soap:Envelope>'
  );
}

function respostaStatusServico(cStat: string, xMotivo: string): string {
  return envelopeSoap(
    `<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4">` +
      `<retConsStatServ versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
      `<tpAmb>2</tpAmb><cStat>${cStat}</cStat><xMotivo>${xMotivo}</xMotivo>` +
      `</retConsStatServ></nfeResultMsg>`,
  );
}

function respostaAutorizacaoComProtocolo(
  cStat: string,
  xMotivo: string,
  nProt: string,
): string {
  return envelopeSoap(
    `<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">` +
      `<retEnviNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
      `<tpAmb>2</tpAmb><cStat>104</cStat><xMotivo>Lote processado</xMotivo>` +
      `<protNFe versao="4.00">` +
      `<infProt><tpAmb>2</tpAmb><cStat>${cStat}</cStat><xMotivo>${xMotivo}</xMotivo><nProt>${nProt}</nProt></infProt>` +
      `</protNFe>` +
      `</retEnviNFe></nfeResultMsg>`,
  );
}

function respostaConsultaProtocoloComInfProt(
  cStat: string,
  xMotivo: string,
  nProt: string,
): string {
  return envelopeSoap(
    `<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4">` +
      `<retConsSitNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
      `<tpAmb>2</tpAmb><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo>` +
      `<protNFe versao="4.00">` +
      `<infProt><tpAmb>2</tpAmb><cStat>${cStat}</cStat><xMotivo>${xMotivo}</xMotivo><nProt>${nProt}</nProt></infProt>` +
      `</protNFe>` +
      `</retConsSitNFe></nfeResultMsg>`,
  );
}

function respostaConsultaProtocoloSemInfProt(
  cStat: string,
  xMotivo: string,
): string {
  return envelopeSoap(
    `<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4">` +
      `<retConsSitNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
      `<tpAmb>2</tpAmb><cStat>${cStat}</cStat><xMotivo>${xMotivo}</xMotivo>` +
      `</retConsSitNFe></nfeResultMsg>`,
  );
}

function respostaAutorizacaoSemInfProt(cStat: string, xMotivo: string): string {
  return envelopeSoap(
    `<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">` +
      `<retEnviNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
      `<tpAmb>2</tpAmb><cStat>${cStat}</cStat><xMotivo>${xMotivo}</xMotivo>` +
      `</retEnviNFe></nfeResultMsg>`,
  );
}

function respostaStatusServicoComCStatNaoEscalar(): string {
  // <cStat> com filho aninhado em vez de texto simples: o fast-xml-parser retorna um
  // objeto para esse campo, não uma string/número/booleano — exercita o fallback de
  // texto() para valores não-escalares (retorna a string vazia padrão).
  return envelopeSoap(
    `<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4">` +
      `<retConsStatServ versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
      `<tpAmb>2</tpAmb><cStat><valor>107</valor></cStat><xMotivo>Serviço em Operação</xMotivo>` +
      `</retConsStatServ></nfeResultMsg>`,
  );
}

function respostaStatusServicoSemXMotivo(cStat: string): string {
  // xMotivo inteiramente ausente (não só vazio) — exercita o branch valor===undefined
  // de texto(), diferente do branco de "valor não-escalar" acima.
  return envelopeSoap(
    `<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4">` +
      `<retConsStatServ versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
      `<tpAmb>2</tpAmb><cStat>${cStat}</cStat>` +
      `</retConsStatServ></nfeResultMsg>`,
  );
}

function respostaStatusServicoComElementoVazio(): string {
  // <retConsStatServ/> vazio: a chave é encontrada (bate no k === chave de buscarProfundo),
  // mas o valor parseado é string vazia, não um objeto — exercita o fallback "?? null" de
  // buscarProfundo (objeto(v) retorna undefined para uma string), diferente do caso "chave
  // nem existe na resposta" (coberto por outro teste com <algoInesperado />).
  return envelopeSoap(
    `<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4">` +
      `<retConsStatServ></retConsStatServ>` +
      `</nfeResultMsg>`,
  );
}

function respostaStatusServicoComPrefixoNamespace(
  cStat: string,
  xMotivo: string,
): string {
  // retConsStatServ com prefixo de namespace (nfe:) em vez do nome puro — exercita o
  // branch de buscarProfundo que casa via k.endsWith(':chave'), não k === chave.
  return envelopeSoap(
    `<nfeResultMsg xmlns:nfe="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4">` +
      `<nfe:retConsStatServ versao="4.00" xmlns:nfe="http://www.portalfiscal.inf.br/nfe">` +
      `<tpAmb>2</tpAmb><cStat>${cStat}</cStat><xMotivo>${xMotivo}</xMotivo>` +
      `</nfe:retConsStatServ></nfeResultMsg>`,
  );
}

function respostaAutorizacaoComInfProtSemNProt(
  cStat: string,
  xMotivo: string,
): string {
  // infProt presente, mas sem o elemento <nProt> — protocolo deve ficar undefined
  // (não uma string vazia), diferente do caso "nProt vazio" já coberto em outro teste.
  return envelopeSoap(
    `<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">` +
      `<retEnviNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
      `<tpAmb>2</tpAmb><cStat>104</cStat><xMotivo>Lote processado</xMotivo>` +
      `<protNFe versao="4.00">` +
      `<infProt><tpAmb>2</tpAmb><cStat>${cStat}</cStat><xMotivo>${xMotivo}</xMotivo></infProt>` +
      `</protNFe>` +
      `</retEnviNFe></nfeResultMsg>`,
  );
}

function respostaConsultaProtocoloComInfProtSemNProt(
  cStat: string,
  xMotivo: string,
): string {
  return envelopeSoap(
    `<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4">` +
      `<retConsSitNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
      `<tpAmb>2</tpAmb><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo>` +
      `<protNFe versao="4.00">` +
      `<infProt><tpAmb>2</tpAmb><cStat>${cStat}</cStat><xMotivo>${xMotivo}</xMotivo></infProt>` +
      `</protNFe>` +
      `</retConsSitNFe></nfeResultMsg>`,
  );
}

function configServiceMock(
  overrides: { uf?: string } = {},
): ConfigService<AppConfig, true> {
  return {
    get: jest.fn().mockReturnValue({ uf: overrides.uf ?? 'SP', ambiente: 2 }),
  } as unknown as ConfigService<AppConfig, true>;
}

function certificadoServiceMock(): CertificadoService {
  return {
    obterHttpsAgent: jest.fn().mockReturnValue({}),
  } as unknown as CertificadoService;
}

describe('SefazClientService', () => {
  let service: SefazClientService;
  let errorSpy: jest.SpiedFunction<typeof AppLogger.prototype.error>;
  let warnSpy: jest.SpiedFunction<typeof AppLogger.prototype.warn>;

  beforeEach(() => {
    jest.spyOn(AppLogger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(AppLogger.prototype, 'warn')
      .mockImplementation(() => undefined);
    errorSpy = jest
      .spyOn(AppLogger.prototype, 'error')
      .mockImplementation(() => undefined);
    jest
      .spyOn(AppLogger.prototype, 'success')
      .mockImplementation(() => undefined);
    postSoapMock.mockReset();
    service = new SefazClientService(
      configServiceMock(),
      certificadoServiceMock(),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('consultarStatusServico', () => {
    it('retorna emOperacao=true quando a SEFAZ responde cStat 107 (serviço em operação)', async () => {
      postSoapMock.mockResolvedValue(
        respostaStatusServico('107', 'Serviço em Operação'),
      );

      const resultado = await service.consultarStatusServico(
        ModeloDocumento.NFCE,
      );

      expect(resultado.cStat).toBe('107');
      expect(resultado.emOperacao).toBe(true);
      expect(postSoapMock).toHaveBeenCalledTimes(1);
    });

    it('retorna emOperacao=false quando a SEFAZ responde com um cStat diferente de 107', async () => {
      postSoapMock.mockResolvedValue(
        respostaStatusServico('108', 'Serviço Paralisado Momentaneamente'),
      );

      const resultado = await service.consultarStatusServico(
        ModeloDocumento.NFCE,
      );

      expect(resultado.cStat).toBe('108');
      expect(resultado.emOperacao).toBe(false);
    });

    it('não faz nenhuma chamada de rede real: usa exclusivamente o postSoap mockado', async () => {
      postSoapMock.mockResolvedValue(respostaStatusServico('107', 'OK'));

      await service.consultarStatusServico(ModeloDocumento.NFCE);

      const [url] = postSoapMock.mock.calls[0];
      expect(typeof url).toBe('string');
      expect(postSoapMock).toHaveBeenCalledTimes(1);
    });

    it('chama o domínio de NFC-e (nfce.fazenda.sp.gov.br) quando modelo=65', async () => {
      postSoapMock.mockResolvedValue(respostaStatusServico('107', 'OK'));

      await service.consultarStatusServico(ModeloDocumento.NFCE);

      const [url] = postSoapMock.mock.calls[0];
      expect(url).toContain('nfce.fazenda.sp.gov.br');
    });

    it('chama o domínio de NF-e (nfe.fazenda.sp.gov.br) quando modelo=55', async () => {
      postSoapMock.mockResolvedValue(respostaStatusServico('107', 'OK'));

      await service.consultarStatusServico(ModeloDocumento.NFE);

      const [url] = postSoapMock.mock.calls[0];
      expect(url).toContain('nfe.fazenda.sp.gov.br');
      expect(url).not.toContain('nfce.fazenda.sp.gov.br');
    });

    it('loga e relança o erro quando há falha de comunicação com a SEFAZ (promise rejeitada)', async () => {
      const erroComunicacao = new Error('socket hang up');
      postSoapMock.mockRejectedValue(erroComunicacao);

      await expect(
        service.consultarStatusServico(ModeloDocumento.NFCE),
      ).rejects.toThrow('socket hang up');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Falha de comunicação com a SEFAZ'),
      );
    });

    it('lança ServiceUnavailableException quando a resposta da SEFAZ não tem retConsStatServ (resposta malformada/inesperada)', async () => {
      postSoapMock.mockResolvedValue(envelopeSoap('<algoInesperado />'));

      await expect(
        service.consultarStatusServico(ModeloDocumento.NFCE),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('usa a string vazia padrão quando cStat vem como elemento não-escalar (com filhos) na resposta', async () => {
      postSoapMock.mockResolvedValue(respostaStatusServicoComCStatNaoEscalar());

      const resultado = await service.consultarStatusServico(
        ModeloDocumento.NFCE,
      );

      expect(resultado.cStat).toBe('');
      expect(resultado.emOperacao).toBe(false);
    });

    it('usa a string vazia padrão para xMotivo quando o elemento vem inteiramente ausente na resposta', async () => {
      postSoapMock.mockResolvedValue(respostaStatusServicoSemXMotivo('107'));

      const resultado = await service.consultarStatusServico(
        ModeloDocumento.NFCE,
      );

      expect(resultado.cStat).toBe('107');
      expect(resultado.xMotivo).toBe('');
    });

    it('lança ServiceUnavailableException quando retConsStatServ existe mas vem vazio (valor string, não objeto)', async () => {
      postSoapMock.mockResolvedValue(respostaStatusServicoComElementoVazio());

      await expect(
        service.consultarStatusServico(ModeloDocumento.NFCE),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('encontra retConsStatServ mesmo quando o elemento vem com prefixo de namespace (ex.: nfe:retConsStatServ)', async () => {
      postSoapMock.mockResolvedValue(
        respostaStatusServicoComPrefixoNamespace('107', 'Serviço em Operação'),
      );

      const resultado = await service.consultarStatusServico(
        ModeloDocumento.NFCE,
      );

      expect(resultado.cStat).toBe('107');
      expect(resultado.emOperacao).toBe(true);
    });
  });

  describe('autorizar', () => {
    it('retorna autorizada=true com o protocolo quando a SEFAZ responde cStat 100', async () => {
      postSoapMock.mockResolvedValue(
        respostaAutorizacaoComProtocolo(
          '100',
          'Autorizado o uso da NF-e',
          '135260000012345',
        ),
      );

      const resultado = await service.autorizar(
        '<NFe>...</NFe>',
        1,
        ModeloDocumento.NFCE,
      );

      expect(resultado.autorizada).toBe(true);
      expect(resultado.cStat).toBe('100');
      expect(resultado.protocolo).toBe('135260000012345');
      expect(resultado.xmlProtocolo).toContain(
        '<nProt>135260000012345</nProt>',
      );
    });

    it('retorna autorizada=false quando a SEFAZ rejeita a NF-e (cStat != 100)', async () => {
      postSoapMock.mockResolvedValue(
        respostaAutorizacaoComProtocolo(
          '225',
          'Rejeição: Falha no Schema XML',
          '',
        ),
      );

      const resultado = await service.autorizar(
        '<NFe>...</NFe>',
        2,
        ModeloDocumento.NFCE,
      );

      expect(resultado.autorizada).toBe(false);
      expect(resultado.cStat).toBe('225');
      expect(resultado.xMotivo).toBe('Rejeição: Falha no Schema XML');
    });

    it('loga e relança o erro quando há falha de comunicação com a SEFAZ (promise rejeitada)', async () => {
      const erroComunicacao = new Error('socket hang up');
      postSoapMock.mockRejectedValue(erroComunicacao);

      await expect(
        service.autorizar('<NFe>...</NFe>', 3, ModeloDocumento.NFCE),
      ).rejects.toThrow('socket hang up');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Falha de comunicação com a SEFAZ'),
      );
    });

    it('lança ServiceUnavailableException quando a resposta da SEFAZ não tem o formato esperado', async () => {
      postSoapMock.mockResolvedValue(envelopeSoap('<algoInesperado />'));

      await expect(
        service.autorizar('<NFe>...</NFe>', 4, ModeloDocumento.NFCE),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('retorna autorizada=false com cStat/xMotivo do nível superior quando o lote ainda não foi processado (sem infProt, ex. cStat 103)', async () => {
      postSoapMock.mockResolvedValue(
        respostaAutorizacaoSemInfProt('103', 'Lote recebido com sucesso'),
      );

      const resultado = await service.autorizar(
        '<NFe>...</NFe>',
        5,
        ModeloDocumento.NFCE,
      );

      expect(resultado.autorizada).toBe(false);
      expect(resultado.cStat).toBe('103');
      expect(resultado.xMotivo).toBe('Lote recebido com sucesso');
      expect(resultado.protocolo).toBeUndefined();
      expect(resultado.xmlProtocolo).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('sem infProt'),
      );
    });

    it('deixa protocolo undefined (não string vazia) quando infProt está presente mas sem o elemento nProt', async () => {
      postSoapMock.mockResolvedValue(
        respostaAutorizacaoComInfProtSemNProt(
          '100',
          'Autorizado o uso da NF-e',
        ),
      );

      const resultado = await service.autorizar(
        '<NFe>...</NFe>',
        6,
        ModeloDocumento.NFCE,
      );

      expect(resultado.autorizada).toBe(true);
      expect(resultado.protocolo).toBeUndefined();
    });
  });

  describe('consultarProtocolo', () => {
    const chaveFicticia = '35260812345678000199650010000000011000000015';

    it('retorna autorizada=true com o protocolo quando a SEFAZ responde infProt com cStat 100', async () => {
      postSoapMock.mockResolvedValue(
        respostaConsultaProtocoloComInfProt(
          '100',
          'Autorizado o uso da NF-e',
          '135260000012345',
        ),
      );

      const resultado = await service.consultarProtocolo(
        chaveFicticia,
        ModeloDocumento.NFCE,
      );

      expect(resultado.autorizada).toBe(true);
      expect(resultado.cStat).toBe('100');
      expect(resultado.protocolo).toBe('135260000012345');
      expect(resultado.xmlProtocolo).toContain(
        '<nProt>135260000012345</nProt>',
      );
      expect(postSoapMock).toHaveBeenCalledTimes(1);
    });

    it('retorna autorizada=false quando a nota consultada foi rejeitada (infProt com cStat != 100)', async () => {
      postSoapMock.mockResolvedValue(
        respostaConsultaProtocoloComInfProt('110', 'Uso Denegado', ''),
      );

      const resultado = await service.consultarProtocolo(
        chaveFicticia,
        ModeloDocumento.NFCE,
      );

      expect(resultado.autorizada).toBe(false);
      expect(resultado.cStat).toBe('110');
      expect(resultado.xMotivo).toBe('Uso Denegado');
    });

    it('retorna autorizada=false sem lançar quando a resposta não tem infProt (nota ainda não processada/consultada)', async () => {
      postSoapMock.mockResolvedValue(
        respostaConsultaProtocoloSemInfProt('217', 'NF-e não consta na base'),
      );

      const resultado = await service.consultarProtocolo(
        chaveFicticia,
        ModeloDocumento.NFCE,
      );

      expect(resultado.autorizada).toBe(false);
      expect(resultado.cStat).toBe('217');
      expect(resultado.xMotivo).toBe('NF-e não consta na base');
      expect(resultado.protocolo).toBeUndefined();
    });

    it('loga e relança o erro quando há falha de comunicação com a SEFAZ', async () => {
      const erroComunicacao = new Error('socket hang up');
      postSoapMock.mockRejectedValue(erroComunicacao);

      await expect(
        service.consultarProtocolo(chaveFicticia, ModeloDocumento.NFCE),
      ).rejects.toThrow('socket hang up');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Falha de comunicação com a SEFAZ'),
      );
    });

    it('deixa protocolo undefined (não string vazia) quando infProt está presente mas sem o elemento nProt', async () => {
      postSoapMock.mockResolvedValue(
        respostaConsultaProtocoloComInfProtSemNProt(
          '100',
          'Autorizado o uso da NF-e',
        ),
      );

      const resultado = await service.consultarProtocolo(
        chaveFicticia,
        ModeloDocumento.NFCE,
      );

      expect(resultado.autorizada).toBe(true);
      expect(resultado.protocolo).toBeUndefined();
    });
  });
});
