import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import configuration, { AppConfig } from './config/configuration';
import { CertificadoModule } from './certificado/certificado.module';
import { NotasFiscaisModule } from './notas-fiscais/notas-fiscais.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService<AppConfig, true>,
      ): TypeOrmModuleOptions => {
        const db = configService.get('database', { infer: true });
        return {
          type: 'postgres',
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password,
          database: db.database,
          synchronize: db.synchronize,
          autoLoadEntities: true,
        };
      },
    }),
    CertificadoModule,
    NotasFiscaisModule,
  ],
})
export class AppModule {}
