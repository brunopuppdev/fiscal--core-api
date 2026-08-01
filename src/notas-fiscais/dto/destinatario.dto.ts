import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, Length, ValidateNested } from 'class-validator';

export class EnderecoDestinatarioDto {
  @ApiPropertyOptional({ example: 'Rua das Flores' })
  @IsOptional()
  @IsString()
  logradouro?: string;

  @ApiPropertyOptional({ example: '123' })
  @IsOptional()
  @IsString()
  numero?: string;

  @ApiPropertyOptional({ example: 'Centro' })
  @IsOptional()
  @IsString()
  bairro?: string;

  @ApiPropertyOptional({ example: 'São Paulo' })
  @IsOptional()
  @IsString()
  municipio?: string;

  @ApiPropertyOptional({
    example: '3550308',
    description: 'Código IBGE do município',
  })
  @IsOptional()
  @IsString()
  codMunicipio?: string;

  @ApiPropertyOptional({ example: 'SP' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  uf?: string;

  @ApiPropertyOptional({ example: '01001000' })
  @IsOptional()
  @IsString()
  cep?: string;
}

export class DestinatarioDto {
  @ApiPropertyOptional({ example: 'João da Silva' })
  @IsOptional()
  @IsString()
  nome?: string;

  @ApiPropertyOptional({
    example: '12345678900',
    description:
      'CPF (11) ou CNPJ (14) do destinatário. Opcional em NFC-e para consumidor não identificado.',
  })
  @IsOptional()
  @IsString()
  documento?: string;

  @ApiPropertyOptional({ example: 'cliente@example.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ type: () => EnderecoDestinatarioDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EnderecoDestinatarioDto)
  endereco?: EnderecoDestinatarioDto;
}
