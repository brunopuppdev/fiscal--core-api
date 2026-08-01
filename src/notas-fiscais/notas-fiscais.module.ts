import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemNota } from './entities/item-nota.entity';
import { NotaFiscal } from './entities/nota-fiscal.entity';
import { NumeracaoControle } from './entities/numeracao-controle.entity';
import { NotasFiscaisController } from './notas-fiscais.controller';
import { NotasFiscaisService } from './notas-fiscais.service';
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
  ],
})
export class NotasFiscaisModule {}
