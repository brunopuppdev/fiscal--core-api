import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { FormaPagamento } from '../../common/enums/forma-pagamento.enum';
import { ModeloDocumento } from '../../common/enums/modelo-documento.enum';
import { DestinatarioDto } from './destinatario.dto';
import { ItemNotaDto } from './item-nota.dto';

export class CriarNotaFiscalDto {
  @ApiProperty({
    enum: ModeloDocumento,
    example: ModeloDocumento.NFCE,
    description: '55 = NF-e (venda para CNPJ), 65 = NFC-e (consumidor final)',
  })
  @IsEnum(ModeloDocumento)
  modelo: ModeloDocumento;

  @ApiPropertyOptional({
    example: 'VENDA',
    default: 'VENDA',
    description: 'Natureza da operação',
  })
  @IsOptional()
  @IsString()
  naturezaOperacao?: string;

  @ApiPropertyOptional({
    type: () => DestinatarioDto,
    description:
      'Obrigatório para NF-e (55). Opcional para NFC-e (65) — pode ser omitido para consumidor não identificado.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DestinatarioDto)
  destinatario?: DestinatarioDto;

  @ApiProperty({ type: () => [ItemNotaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemNotaDto)
  itens: ItemNotaDto[];

  @ApiProperty({
    enum: FormaPagamento,
    example: FormaPagamento.PIX,
    description:
      'Código SEFAZ da forma de pagamento (grupo pag/detPag do XML) — vai para tPag.',
  })
  @IsEnum(FormaPagamento)
  formaPagamento: FormaPagamento;
}
