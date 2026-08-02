import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { CertificadoService } from '../../src/certificado/certificado.service';
import { ModeloDocumento } from '../../src/common/enums/modelo-documento.enum';
import { StatusNota } from '../../src/common/enums/status-nota.enum';
import {
  RetornoAutorizacao,
  SefazClientService,
} from '../../src/notas-fiscais/sefaz/sefaz-client.service';
import { certificadoServiceMock } from './support/certificado-mock';
import { limparBanco } from './support/limpar-banco';

interface RespostaNotaFiscal {
  id: string;
  status: string;
  chaveAcesso: string;
  numero: number;
  xmlAutorizado: string | null;
}

interface RespostaListagem {
  dados: RespostaNotaFiscal[];
  total: number;
}

interface RespostaStatusSefaz {
  cStat: string;
  xMotivo: string;
  emOperacao: boolean;
}

function retornoAutorizado(protocolo: string): RetornoAutorizacao {
  return {
    cStat: '100',
    xMotivo: 'Autorizado o uso da NF-e',
    protocolo,
    autorizada: true,
    xmlProtocolo: `<protNFe versao="4.00"><infProt><nProt>${protocolo}</nProt></infProt></protNFe>`,
  };
}

const dtoNfce = {
  modelo: ModeloDocumento.NFCE,
  itens: [
    {
      codigo: 'PROD-1',
      descricao: 'Produto de teste',
      ncm: '20098990',
      cfop: '5102',
      quantidade: 2,
      valorUnitario: 12.5,
    },
  ],
};

/**
 * Fluxo HTTP completo contra uma aplicação Nest real (supertest) e um Postgres real:
 * request -> ValidationPipe -> controller -> service -> montagem/assinatura REAIS do XML
 * -> persistência real -> resposta. Só o certificado (chave/cert de teste em memória) e o
 * cliente SOAP da SEFAZ são mockados, na borda do processo — nunca rede real.
 */
describe('Notas Fiscais - fluxo HTTP completo (integração)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let sefazClientMock: {
    autorizar: jest.Mock;
    consultarStatusServico: jest.Mock;
  };

  beforeAll(async () => {
    sefazClientMock = {
      autorizar: jest.fn(),
      consultarStatusServico: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CertificadoService)
      .useValue(certificadoServiceMock())
      .overrideProvider(SefazClientService)
      .useValue(sefazClientMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    dataSource = app.get(DataSource);
  }, 30000);

  afterEach(async () => {
    await limparBanco(dataSource);
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /notas-fiscais', () => {
    it('emite uma NFC-e completa: monta e assina o XML de verdade, persiste com status AUTORIZADA', async () => {
      sefazClientMock.autorizar.mockResolvedValue(
        retornoAutorizado('135260000000001'),
      );

      const resposta = await request(app.getHttpServer())
        .post('/notas-fiscais')
        .send(dtoNfce)
        .expect(201);

      const corpo = resposta.body as RespostaNotaFiscal;
      expect(corpo.status).toBe(StatusNota.AUTORIZADA);
      expect(corpo.chaveAcesso).toHaveLength(44);
      expect(corpo.id).toBeDefined();
      expect(corpo.xmlAutorizado).toContain('<nfeProc');
      expect(corpo.xmlAutorizado).toContain('Signature');

      const linha = await dataSource.query<Array<{ chave_acesso: string }>>(
        'SELECT chave_acesso FROM notas_fiscais WHERE id = $1',
        [corpo.id],
      );
      expect(linha[0].chave_acesso).toBe(corpo.chaveAcesso);
    });

    it('finaliza com status REJEITADA quando a SEFAZ (mockada) rejeita a nota', async () => {
      sefazClientMock.autorizar.mockResolvedValue({
        cStat: '225',
        xMotivo: 'Rejeição: Falha no Schema XML',
        autorizada: false,
      });

      const resposta = await request(app.getHttpServer())
        .post('/notas-fiscais')
        .send(dtoNfce)
        .expect(201);

      expect((resposta.body as RespostaNotaFiscal).status).toBe(
        StatusNota.REJEITADA,
      );
    });

    it('retorna 400 quando NF-e (modelo 55) não informa destinatario.documento', async () => {
      await request(app.getHttpServer())
        .post('/notas-fiscais')
        .send({ ...dtoNfce, modelo: ModeloDocumento.NFE })
        .expect(400);
    });

    it('retorna 400 quando o payload tem campo não whitelistado (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/notas-fiscais')
        .send({ ...dtoNfce, campoInexistente: 'valor' })
        .expect(400);
    });
  });

  describe('GET /notas-fiscais', () => {
    it('lista as notas emitidas e respeita o filtro de status', async () => {
      sefazClientMock.autorizar.mockResolvedValue(
        retornoAutorizado('135260000000002'),
      );
      await request(app.getHttpServer()).post('/notas-fiscais').send(dtoNfce);

      const resposta = await request(app.getHttpServer())
        .get('/notas-fiscais')
        .query({ status: StatusNota.AUTORIZADA })
        .expect(200);

      const corpo = resposta.body as RespostaListagem;
      expect(corpo.total).toBe(1);
      expect(corpo.dados).toHaveLength(1);
    });
  });

  describe('GET /notas-fiscais/:id e /:id/xml', () => {
    it('busca a nota por id e baixa o XML autorizado (Content-Type application/xml)', async () => {
      sefazClientMock.autorizar.mockResolvedValue(
        retornoAutorizado('135260000000003'),
      );
      const criada = await request(app.getHttpServer())
        .post('/notas-fiscais')
        .send(dtoNfce);
      const { id } = criada.body as RespostaNotaFiscal;

      const busca = await request(app.getHttpServer())
        .get(`/notas-fiscais/${id}`)
        .expect(200);
      expect((busca.body as RespostaNotaFiscal).id).toBe(id);

      const xml = await request(app.getHttpServer())
        .get(`/notas-fiscais/${id}/xml`)
        .expect(200);
      expect(xml.headers['content-type']).toContain('application/xml');
      expect(xml.text).toContain('<nfeProc');
    });

    it('retorna 404 para id inexistente', async () => {
      await request(app.getHttpServer())
        .get('/notas-fiscais/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  describe('GET /notas-fiscais/status-sefaz', () => {
    it('delega ao SefazClientService (mockado) e retorna o status recebido', async () => {
      sefazClientMock.consultarStatusServico.mockResolvedValue({
        cStat: '107',
        xMotivo: 'Serviço em Operação',
        emOperacao: true,
      });

      const resposta = await request(app.getHttpServer())
        .get('/notas-fiscais/status-sefaz')
        .expect(200);

      expect((resposta.body as RespostaStatusSefaz).emOperacao).toBe(true);
    });
  });
});
