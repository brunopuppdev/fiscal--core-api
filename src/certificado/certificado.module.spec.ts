import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import configuration from '../config/configuration';
import { CertificadoModule } from './certificado.module';
import { CertificadoService } from './certificado.service';

describe('CertificadoModule', () => {
  it('compila e resolve CertificadoService via injeção de dependência, sem precisar de banco', async () => {
    // CertificadoModule só declara um provider (CertificadoService), que depende do
    // ConfigService real do @nestjs/config — como `configuration()` não exige nenhuma
    // variável de ambiente obrigatória (todas têm default), dá para usar o ConfigModule
    // de verdade aqui sem precisar de .env nem de qualquer infraestrutura externa.
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        CertificadoModule,
      ],
    }).compile();

    const service = moduleRef.get(CertificadoService);

    expect(service).toBeInstanceOf(CertificadoService);
  });
});
