import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { CertificadoService } from '../../src/certificado/certificado.service';
import { FormaPagamento } from '../../src/common/enums/forma-pagamento.enum';
import { ModeloDocumento } from '../../src/common/enums/modelo-documento.enum';
import { CriarNotaFiscalDto } from '../../src/notas-fiscais/dto/criar-nota.dto';
import { NotasFiscaisService } from '../../src/notas-fiscais/notas-fiscais.service';
import { SefazClientService } from '../../src/notas-fiscais/sefaz/sefaz-client.service';
import { NfeXmlBuilderService } from '../../src/notas-fiscais/xml/nfe-xml-builder.service';
import { NfeXmlSignerService } from '../../src/notas-fiscais/xml/nfe-xml-signer.service';
import { limparBanco } from './support/limpar-banco';

/**
 * Este é o único cenário que um teste unitário (com DataSource.transaction mockado)
 * não consegue validar de verdade: que o lock pessimista em numeracao_controle
 * realmente serializa chamadas concorrentes contra um Postgres de verdade, sem
 * número duplicado nem pulado. XML/assinatura/SEFAZ são mockados de propósito —
 * o foco aqui é só a camada de banco (ver notas-fiscais-http.integration-spec.ts
 * para o fluxo com XML/assinatura reais).
 */
describe('Numeração sequencial sob concorrência real (integração)', () => {
  let moduleRef: TestingModule;
  let service: NotasFiscaisService;
  let dataSource: DataSource;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CertificadoService)
      .useValue({
        obterHttpsAgent: jest.fn(),
        obter: jest.fn(),
        estaCarregado: () => true,
      })
      .overrideProvider(NfeXmlBuilderService)
      .useValue({ montar: jest.fn().mockReturnValue('<NFe>fixture</NFe>') })
      .overrideProvider(NfeXmlSignerService)
      .useValue({ assinar: jest.fn((xml: string) => xml) })
      .overrideProvider(SefazClientService)
      .useValue({
        autorizar: jest.fn().mockResolvedValue({
          cStat: '100',
          xMotivo: 'Autorizado o uso da NF-e',
          protocolo: '135260000000001',
          autorizada: true,
          xmlProtocolo:
            '<protNFe versao="4.00"><infProt><nProt>135260000000001</nProt></infProt></protNFe>',
        }),
      })
      .compile();

    service = moduleRef.get(NotasFiscaisService);
    dataSource = moduleRef.get(DataSource);
  }, 30000);

  afterEach(async () => {
    await limparBanco(dataSource);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  function dtoFixture(): CriarNotaFiscalDto {
    return {
      modelo: ModeloDocumento.NFCE,
      itens: [
        {
          codigo: 'PROD-1',
          descricao: 'Produto de teste',
          ncm: '20098990',
          cfop: '5102',
          quantidade: 1,
          valorUnitario: 10,
        },
      ],
      formaPagamento: FormaPagamento.PIX,
    };
  }

  it('não gera número duplicado nem pulado quando N emissões concorrentes disputam a mesma série', async () => {
    const QUANTIDADE = 15;

    const resultados = await Promise.all(
      Array.from({ length: QUANTIDADE }, () => service.emitir(dtoFixture())),
    );

    const numeros = resultados.map((n) => n.numero).sort((a, b) => a - b);

    expect(new Set(numeros).size).toBe(QUANTIDADE);
    expect(numeros).toEqual(
      Array.from({ length: QUANTIDADE }, (_, i) => i + 1),
    );
  });

  it('continua a sequência a partir do último número já usado (não reinicia em 1)', async () => {
    await service.emitir(dtoFixture());
    await service.emitir(dtoFixture());

    const terceira = await service.emitir(dtoFixture());

    expect(terceira.numero).toBe(3);
  });
});
