import { Injectable } from '@nestjs/common';
import { EmitenteConfig } from '../../config/configuration';
import { ModeloDocumento } from '../../common/enums/modelo-documento.enum';
import { NotaFiscal } from '../entities/nota-fiscal.entity';
import { DanfcePdfService } from './danfce-pdf.service';
import { DanfePdfService } from './danfe-pdf.service';

/**
 * Facade que escolhe o layout do documento auxiliar (DANFE para NF-e, DANFCE para NFC-e)
 * automaticamente pelo `modelo` da nota — quem chama não precisa saber qual service concreto
 * usar. Assume que o chamador já validou `status === AUTORIZADA` (só assim `xmlAutorizado`
 * existe de forma confiável); ainda assim, valida defensivamente para não gerar PDF de dado
 * inconsistente.
 */
@Injectable()
export class NotaFiscalPdfService {
  constructor(
    private readonly danfePdfService: DanfePdfService,
    private readonly danfcePdfService: DanfcePdfService,
  ) {}

  async gerar(nota: NotaFiscal, emitente: EmitenteConfig): Promise<Buffer> {
    if (!nota.xmlAutorizado) {
      throw new Error(
        `Nota fiscal ${nota.id} não possui xml_autorizado persistido — não é possível gerar ` +
          'o documento auxiliar. O endpoint só deveria chamar este service para notas AUTORIZADAS.',
      );
    }

    return nota.modelo === ModeloDocumento.NFE
      ? this.danfePdfService.gerar(nota, emitente)
      : this.danfcePdfService.gerar(nota, emitente);
  }
}
