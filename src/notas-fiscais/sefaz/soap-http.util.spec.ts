import { EventEmitter } from 'events';
import * as https from 'https';
import { postSoap } from './soap-http.util';

// Mocka o transporte https nativo do Node — nenhuma chamada de rede real deve ocorrer
// neste teste unitário (mesmo em homologação da SEFAZ).
jest.mock('https');

const httpsRequestMock = https.request as unknown as jest.Mock;

class RespostaFake extends EventEmitter {
  statusCode?: number;
  constructor(statusCode?: number) {
    super();
    this.statusCode = statusCode;
  }
}

class RequisicaoFake extends EventEmitter {
  write = jest.fn();
  end = jest.fn();
}

describe('postSoap', () => {
  const url =
    'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx?extra=1';
  const soapActionNamespace =
    'http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4';
  const envelope = '<soap12:Envelope>...</soap12:Envelope>';
  const agentFake = {} as https.Agent;

  beforeEach(() => {
    httpsRequestMock.mockReset();
  });

  it('monta a requisição com hostname, path (incluindo query string) e porta 443 (padrão https)', async () => {
    let requisicaoFake!: RequisicaoFake;
    httpsRequestMock.mockImplementation(
      (opcoes: https.RequestOptions, callback: (res: RespostaFake) => void) => {
        requisicaoFake = new RequisicaoFake();
        const resposta = new RespostaFake(200);
        queueMicrotask(() => {
          callback(resposta);
          resposta.emit('data', Buffer.from('<ok/>'));
          resposta.emit('end');
        });
        return requisicaoFake;
      },
    );

    await postSoap(url, soapActionNamespace, envelope, agentFake);

    const [opcoes] = httpsRequestMock.mock.calls[0] as [https.RequestOptions];
    expect(opcoes.hostname).toBe('homologacao.nfe.fazenda.sp.gov.br');
    expect(opcoes.path).toBe('/ws/nfestatusservico4.asmx?extra=1');
    expect(opcoes.port).toBe(443);
    expect(opcoes.method).toBe('POST');
    expect(opcoes.agent).toBe(agentFake);
  });

  it('envia o SOAPAction e Content-Type corretos no header, e o corpo (envelope) via write', async () => {
    let requisicaoFake!: RequisicaoFake;
    httpsRequestMock.mockImplementation(
      (opcoes: https.RequestOptions, callback: (res: RespostaFake) => void) => {
        requisicaoFake = new RequisicaoFake();
        const resposta = new RespostaFake(200);
        queueMicrotask(() => {
          callback(resposta);
          resposta.emit('end');
        });
        return requisicaoFake;
      },
    );

    await postSoap(url, soapActionNamespace, envelope, agentFake);

    const [opcoes] = httpsRequestMock.mock.calls[0] as [https.RequestOptions];
    expect(opcoes.headers?.['Content-Type']).toBe(
      `application/soap+xml; charset=utf-8; action="${soapActionNamespace}"`,
    );
    expect(opcoes.headers?.['Content-Length']).toBe(
      Buffer.byteLength(envelope, 'utf-8'),
    );
    expect(requisicaoFake.write).toHaveBeenCalledWith(
      Buffer.from(envelope, 'utf-8'),
    );
    expect(requisicaoFake.end).toHaveBeenCalledTimes(1);
  });

  it('resolve com o corpo da resposta concatenado quando o status HTTP é < 400', async () => {
    httpsRequestMock.mockImplementation(
      (
        _opcoes: https.RequestOptions,
        callback: (res: RespostaFake) => void,
      ) => {
        const requisicaoFake = new RequisicaoFake();
        const resposta = new RespostaFake(200);
        queueMicrotask(() => {
          callback(resposta);
          resposta.emit('data', Buffer.from('<retConsStatServ>'));
          resposta.emit('data', Buffer.from('<cStat>107</cStat>'));
          resposta.emit('data', Buffer.from('</retConsStatServ>'));
          resposta.emit('end');
        });
        return requisicaoFake;
      },
    );

    const resultado = await postSoap(
      url,
      soapActionNamespace,
      envelope,
      agentFake,
    );

    expect(resultado).toBe(
      '<retConsStatServ><cStat>107</cStat></retConsStatServ>',
    );
  });

  it('rejeita com erro descritivo quando o status HTTP é >= 400', async () => {
    httpsRequestMock.mockImplementation(
      (
        _opcoes: https.RequestOptions,
        callback: (res: RespostaFake) => void,
      ) => {
        const requisicaoFake = new RequisicaoFake();
        const resposta = new RespostaFake(500);
        queueMicrotask(() => {
          callback(resposta);
          resposta.emit('data', Buffer.from('Internal Server Error'));
          resposta.emit('end');
        });
        return requisicaoFake;
      },
    );

    await expect(
      postSoap(url, soapActionNamespace, envelope, agentFake),
    ).rejects.toThrow('SEFAZ retornou HTTP 500: Internal Server Error');
  });

  it('trata statusCode ausente na resposta como 0 (fallback) e resolve normalmente, sem tratar como erro', async () => {
    httpsRequestMock.mockImplementation(
      (
        _opcoes: https.RequestOptions,
        callback: (res: RespostaFake) => void,
      ) => {
        const requisicaoFake = new RequisicaoFake();
        const resposta = new RespostaFake(undefined); // statusCode ausente (res.statusCode ?? 0)
        queueMicrotask(() => {
          callback(resposta);
          resposta.emit('data', Buffer.from('<ok/>'));
          resposta.emit('end');
        });
        return requisicaoFake;
      },
    );

    const resultado = await postSoap(
      url,
      soapActionNamespace,
      envelope,
      agentFake,
    );

    expect(resultado).toBe('<ok/>');
  });

  it('rejeita quando a requisição emite um evento de erro (ex.: falha de rede/socket)', async () => {
    httpsRequestMock.mockImplementation(() => {
      const requisicaoFake = new RequisicaoFake();
      queueMicrotask(() => {
        requisicaoFake.emit('error', new Error('socket hang up'));
      });
      return requisicaoFake;
    });

    await expect(
      postSoap(url, soapActionNamespace, envelope, agentFake),
    ).rejects.toThrow('socket hang up');
  });
});
