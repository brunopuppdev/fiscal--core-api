import {
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ModeloDocumento } from '../common/enums/modelo-documento.enum';
import { StatusNota } from '../common/enums/status-nota.enum';
import { CriarNotaFiscalDto } from './dto/criar-nota.dto';
import { NotaFiscalResponseDto } from './dto/nota-fiscal-response.dto';
import { NotasFiscaisService } from './notas-fiscais.service';

@ApiTags('notas-fiscais')
@Controller('notas-fiscais')
export class NotasFiscaisController {
  constructor(private readonly notasFiscaisService: NotasFiscaisService) {}

  @Post()
  @ApiOperation({
    summary: 'Emite uma NF-e (55) ou NFC-e (65) de venda',
    description:
      'Monta o XML, assina com o certificado digital configurado e envia para autorização na SEFAZ.',
  })
  @ApiOkResponse({ type: NotaFiscalResponseDto })
  emitir(@Body() dto: CriarNotaFiscalDto) {
    return this.notasFiscaisService.emitir(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista o histórico de notas fiscais emitidas' })
  @ApiQuery({ name: 'status', enum: StatusNota, required: false })
  @ApiQuery({ name: 'modelo', enum: ModeloDocumento, required: false })
  @ApiQuery({ name: 'pagina', required: false, type: Number })
  @ApiQuery({ name: 'tamanhoPagina', required: false, type: Number })
  @ApiOkResponse({ type: [NotaFiscalResponseDto] })
  listar(
    @Query('status') status?: StatusNota,
    @Query('modelo') modelo?: ModeloDocumento,
    @Query('pagina') pagina?: string,
    @Query('tamanhoPagina') tamanhoPagina?: string,
  ) {
    return this.notasFiscaisService.listar({
      status,
      modelo,
      pagina: pagina ? parseInt(pagina, 10) : undefined,
      tamanhoPagina: tamanhoPagina ? parseInt(tamanhoPagina, 10) : undefined,
    });
  }

  @Get('status-sefaz')
  @ApiOperation({
    summary: 'Consulta o status do serviço da SEFAZ configurada',
  })
  statusSefaz() {
    return this.notasFiscaisService.statusServicoSefaz();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalha uma nota fiscal emitida' })
  @ApiParam({ name: 'id', description: 'ID interno da nota fiscal' })
  @ApiOkResponse({ type: NotaFiscalResponseDto })
  buscarPorId(@Param('id') id: string) {
    return this.notasFiscaisService.buscarPorId(id);
  }

  @Get(':id/xml')
  @ApiOperation({
    summary:
      'Baixa o XML da nota (autorizado, se disponível; assinado, caso contrário)',
  })
  @ApiParam({ name: 'id', description: 'ID interno da nota fiscal' })
  @Header('Content-Type', 'application/xml')
  async baixarXml(@Param('id') id: string): Promise<string> {
    const nota = await this.notasFiscaisService.buscarPorId(id);
    const xml = nota.xmlAutorizado ?? nota.xmlAssinado;
    if (!xml) {
      throw new NotFoundException('XML ainda não disponível para esta nota.');
    }
    return xml;
  }
}
