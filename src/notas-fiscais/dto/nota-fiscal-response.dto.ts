import { ApiProperty } from '@nestjs/swagger';
import { ModeloDocumento } from '../../common/enums/modelo-documento.enum';
import { StatusNota } from '../../common/enums/status-nota.enum';

export class NotaFiscalResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: ModeloDocumento }) modelo: ModeloDocumento;
  @ApiProperty() serie: number;
  @ApiProperty() numero: number;
  @ApiProperty() chaveAcesso: string;
  @ApiProperty({ enum: StatusNota }) status: StatusNota;
  @ApiProperty() valorTotal: string;
  @ApiProperty({ required: false, nullable: true }) protocolo: string | null;
  @ApiProperty({ required: false, nullable: true }) motivoStatus: string | null;
  @ApiProperty() dataEmissao: Date;
  @ApiProperty({ required: false, nullable: true })
  dataAutorizacao: Date | null;
}
