import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import configuration from '../config/configuration';
import { CertificadoService } from '../certificado/certificado.service';
import { ItemNota } from './entities/item-nota.entity';
import { NotaFiscal } from './entities/nota-fiscal.entity';
import { NumeracaoControle } from './entities/numeracao-controle.entity';
import { NotasFiscaisModule } from './notas-fiscais.module';
import { NotasFiscaisController } from './notas-fiscais.controller';
import { NotasFiscaisService } from './notas-fiscais.service';

/**
 * NotasFiscaisModule importa `TypeOrmModule.forFeature([...])`, cujos providers de
 * repositório (via `getRepositoryToken`) dependem, na implementação real, de um
 * `DataSource` conectado — e `NotasFiscaisService` também injeta o `DataSource`
 * diretamente (`@InjectDataSource()`, usado no lock pessimista de `numeracao_controle`).
 * Para compilar o módulo sem abrir uma conexão real com o Postgres, suprimos esse token
 * com um módulo global fake só para o teste (nunca usado fora daqui).
 */
@Global()
@Module({
  providers: [{ provide: getDataSourceToken(), useValue: {} }],
  exports: [getDataSourceToken()],
})
class FakeDataSourceModule {}

/**
 * `CertificadoService` normalmente chega via `CertificadoModule` (`@Global()`), mas esse
 * módulo real dispara leitura de disco/config no seu próprio grafo — para este teste,
 * que só quer validar o wiring de `NotasFiscaisModule`, um fake global mais simples
 * (mesmo padrão do `FakeDataSourceModule` acima) evita `overrideProvider` em um token
 * que não pertence a este módulo (CertificadoService não é declarado por NotasFiscaisModule).
 */
@Global()
@Module({
  providers: [
    {
      provide: CertificadoService,
      useValue: {
        obterHttpsAgent: jest.fn(),
        obter: jest.fn(),
        estaCarregado: jest.fn(),
      },
    },
  ],
  exports: [CertificadoService],
})
class FakeCertificadoModule {}

describe('NotasFiscaisModule', () => {
  it('compila e resolve NotasFiscaisService/NotasFiscaisController via DI, com repositórios TypeORM e CertificadoService mockados (sem banco real)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        FakeDataSourceModule,
        FakeCertificadoModule,
        NotasFiscaisModule,
      ],
    })
      .overrideProvider(getRepositoryToken(NotaFiscal))
      .useValue({})
      .overrideProvider(getRepositoryToken(ItemNota))
      .useValue({})
      .overrideProvider(getRepositoryToken(NumeracaoControle))
      .useValue({})
      .compile();

    const service = moduleRef.get(NotasFiscaisService);
    const controller = moduleRef.get(NotasFiscaisController);

    expect(service).toBeInstanceOf(NotasFiscaisService);
    expect(controller).toBeInstanceOf(NotasFiscaisController);
  });
});
