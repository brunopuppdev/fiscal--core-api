import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemNota } from './entities/item-nota.entity';
import { NotaFiscal } from './entities/nota-fiscal.entity';
import { NumeracaoControle } from './entities/numeracao-controle.entity';
import { NotasFiscaisController } from './notas-fiscais.controller';
import { NotasFiscaisService } from './notas-fiscais.service';
import { DanfcePdfService } from './pdf/danfce-pdf.service';
import { DanfePdfService } from './pdf/danfe-pdf.service';
import { NotaFiscalPdfService } from './pdf/nota-fiscal-pdf.service';
import { SefazClientService } from './sefaz/sefaz-client.service';
import { NfeXmlBuilderService } from './xml/nfe-xml-builder.service';
import { NfeXmlSignerService } from './xml/nfe-xml-signer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotaFiscal, ItemNota, NumeracaoControle]),
  ],
  controllers: [NotasFiscaisController],
  providers: [
    NotasFiscaisService,
    NfeXmlBuilderService,
    NfeXmlSignerService,
    SefazClientService,
    NotaFiscalPdfService,
    DanfePdfService,
    DanfcePdfService,
  ],
})
export class NotasFiscaisModule {}
