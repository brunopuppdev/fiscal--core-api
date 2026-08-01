import { Global, Module } from '@nestjs/common';
import { CertificadoService } from './certificado.service';

@Global()
@Module({
  providers: [CertificadoService],
  exports: [CertificadoService],
})
export class CertificadoModule {}
