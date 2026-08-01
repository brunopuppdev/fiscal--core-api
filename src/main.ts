import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('EmissorNF - Emissão de Nota Fiscal MEI')
    .setDescription(
      'API pessoal para emissão de NF-e/NFC-e de venda de sucos (MEI), com integração direta à SEFAZ-SP.',
    )
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const configService = app.get<ConfigService<AppConfig, true>>(ConfigService);
  const port = configService.get('port', { infer: true });
  await app.listen(port);
}
void bootstrap();
