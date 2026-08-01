import { ConfigService } from '@nestjs/config';
import { AppConfig } from './config/configuration';
import { criarConfigTypeOrm } from './app.module';

/**
 * `criarConfigTypeOrm` foi extraída do `useFactory` inline de `TypeOrmModule.forRootAsync`
 * exatamente para poder ser testada sem precisar compilar o `AppModule` inteiro (o que
 * puxaria uma conexão real com o Postgres via `TypeOrmModule.forRootAsync`).
 */
function configServiceMock(
  database: AppConfig['database'],
): ConfigService<AppConfig, true> {
  return {
    get: jest.fn().mockReturnValue(database),
  } as unknown as ConfigService<AppConfig, true>;
}

describe('criarConfigTypeOrm', () => {
  it('monta as opções do TypeORM (postgres, autoLoadEntities) a partir da configuração de banco', () => {
    const database: AppConfig['database'] = {
      host: 'db-host',
      port: 5432,
      username: 'usuario',
      password: 'senha',
      database: 'emissornf_teste',
      synchronize: true,
    };

    const opcoes = criarConfigTypeOrm(configServiceMock(database));

    expect(opcoes).toEqual({
      type: 'postgres',
      host: 'db-host',
      port: 5432,
      username: 'usuario',
      password: 'senha',
      database: 'emissornf_teste',
      synchronize: true,
      autoLoadEntities: true,
    });
  });

  it('repassa synchronize=false quando configurado assim (produção)', () => {
    const database: AppConfig['database'] = {
      host: 'db-host',
      port: 5432,
      username: 'usuario',
      password: 'senha',
      database: 'emissornf_prod',
      synchronize: false,
    };

    const opcoes = criarConfigTypeOrm(configServiceMock(database));

    expect(opcoes.synchronize).toBe(false);
  });
});
