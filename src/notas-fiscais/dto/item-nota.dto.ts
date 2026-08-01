import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class ItemNotaDto {
  @ApiProperty({
    example: 'SUCO-LARANJA-500',
    description: 'Código interno do produto',
  })
  @IsString()
  codigo: string;

  @ApiProperty({ example: 'Suco de laranja natural 500ml' })
  @IsString()
  descricao: string;

  @ApiProperty({
    example: '20098990',
    description:
      'NCM do produto (8 dígitos). Confirme o código correto com o contador.',
  })
  @IsString()
  @Matches(/^\d{8}$/, { message: 'ncm deve ter 8 dígitos' })
  ncm: string;

  @ApiProperty({
    example: '5102',
    description:
      'CFOP da operação (ex.: 5102 venda dentro do estado, 6102 fora do estado)',
  })
  @IsString()
  @Length(4, 4)
  cfop: string;

  @ApiPropertyOptional({ example: 'UN', default: 'UN' })
  @IsOptional()
  @IsString()
  unidade?: string;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @IsPositive()
  quantidade: number;

  @ApiProperty({ example: 12.5, description: 'Valor unitário do item' })
  @IsNumber()
  @IsPositive()
  valorUnitario: number;

  @ApiPropertyOptional({
    example: '102',
    default: '102',
    description: 'CSOSN do Simples Nacional/MEI',
  })
  @IsOptional()
  @IsString()
  csosn?: string;
}
