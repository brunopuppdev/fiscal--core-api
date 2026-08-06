import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppConfig } from '../config/configuration';
import { AppLogger } from '../common/logger/app-logger';
import { ModeloDocumento } from '../common/enums/modelo-documento.enum';
import { StatusNota } from '../common/enums/status-nota.enum';
import {
  CODIGO_UF,
  gerarCodigoNumerico,
  montarChaveAcesso,
} from '../common/utils/chave-acesso.util';
import { CriarNotaFiscalDto } from './dto/criar-nota.dto';
import { ItemNota } from './entities/item-nota.entity';
import { NotaFiscal } from './entities/nota-fiscal.entity';
import { NumeracaoControle } from './entities/numeracao-controle.entity';
import { NotaFiscalPdfService } from './pdf/nota-fiscal-pdf.service';
import { SefazClientService } from './sefaz/sefaz-client.service';
import { NfeXmlBuilderService } from './xml/nfe-xml-builder.service';
import { NfeXmlSignerService } from './xml/nfe-xml-signer.service';

@Injectable()
export class NotasFiscaisService {
  private readonly logger = new AppLogger(NotasFiscaisService.name);

  constructor(
    @InjectRepository(NotaFiscal)
    private readonly notaFiscalRepo: Repository<NotaFiscal>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly xmlBuilder: NfeXmlBuilderService,
    private readonly xmlSigner: NfeXmlSignerService,
    private readonly sefazClient: SefazClientService,
    private readonly notaFiscalPdfService: NotaFiscalPdfService,
  ) {}

  async emitir(dto: CriarNotaFiscalDto): Promise<NotaFiscal> {
    const emitente = this.configService.get('emitente', { infer: true });
    const { ambiente } = this.configService.get('sefaz', { infer: true });
    const numeracao = this.configService.get('numeracao', { infer: true });
    const { csc, cscId } = this.configService.get('nfce', { infer: true });

    if (dto.modelo === ModeloDocumento.NFE && !dto.destinatario?.documento) {
      throw new BadRequestException(
        'destinatario.documento (CPF ou CNPJ) é obrigatório para NF-e (modelo 55).',
      );
    }

    const serie =
      dto.modelo === ModeloDocumento.NFE
        ? numeracao.nfeSerie
        : numeracao.nfceSerie;

    this.logger.log(`Iniciando emissão: modelo=${dto.modelo} série=${serie}`);

    const dataEmissao = new Date();
    const codigoNumerico = gerarCodigoNumerico();

    // Reserva o próximo número da série dentro de uma transação com lock,
    // garantindo numeração sequencial mesmo sob concorrência.
    const numero = await this.proximoNumero(dto.modelo, serie);

    this.logger.log(
      `Número reservado: modelo=${dto.modelo} série=${serie} número=${numero}`,
    );

    const chaveAcesso = montarChaveAcesso({
      uf: CODIGO_UF[emitente.uf.toUpperCase()] ?? '35',
      dataEmissao,
      cnpj: emitente.cnpj,
      modelo: dto.modelo,
      serie,
      numero,
      tipoEmissao: 1,
      codigoNumerico,
    });

    this.logger.log(`Chave de acesso gerada [chave=${chaveAcesso}]`);

    const xml = this.xmlBuilder.montar({
      chaveAcesso,
      codigoNumerico,
      modelo: dto.modelo,
      serie,
      numero,
      naturezaOperacao: dto.naturezaOperacao ?? 'VENDA',
      dataEmissao,
      ambiente,
      emitente,
      destinatario: dto.destinatario,
      itens: dto.itens,
      formaPagamento: dto.formaPagamento,
      troco: dto.troco,
      csc,
      cscId,
    });

    const xmlAssinado = this.xmlSigner.assinar(xml);

    this.logger.log(`XML assinado [chave=${chaveAcesso}]`);

    const valorTotal = dto.itens.reduce(
      (acc, item) => acc + item.quantidade * item.valorUnitario,
      0,
    );

    const itens = dto.itens.map((item, index) =>
      this.notaFiscalRepo.manager.create(ItemNota, {
        numeroItem: index + 1,
        codigo: item.codigo,
        descricao: item.descricao,
        ncm: item.ncm,
        cfop: item.cfop,
        unidade: item.unidade ?? 'UN',
        quantidade: item.quantidade.toFixed(4),
        valorUnitario: item.valorUnitario.toFixed(4),
        valorTotal: (item.quantidade * item.valorUnitario).toFixed(2),
        csosn: item.csosn ?? '102',
      }),
    );

    let nota = this.notaFiscalRepo.create({
      modelo: dto.modelo,
      serie,
      numero,
      chaveAcesso,
      status: StatusNota.ASSINADA,
      ambiente,
      naturezaOperacao: dto.naturezaOperacao ?? 'VENDA',
      destinatarioNome: dto.destinatario?.nome ?? null,
      destinatarioDocumento: dto.destinatario?.documento ?? null,
      destinatarioEmail: dto.destinatario?.email ?? null,
      destinatarioEndereco: dto.destinatario?.endereco
        ? { ...dto.destinatario.endereco }
        : null,
      valorTotal: valorTotal.toFixed(2),
      formaPagamento: dto.formaPagamento,
      troco: (dto.troco ?? 0).toFixed(2),
      xmlAssinado,
      dataEmissao,
      itens,
    });

    nota = await this.notaFiscalRepo.save(nota);

    this.logger.log(
      `Nota persistida com status ASSINADA antes do envio à SEFAZ [chave=${chaveAcesso}]`,
    );

    try {
      const retorno = await this.sefazClient.autorizar(
        xmlAssinado,
        nota.numero,
        dto.modelo,
      );

      nota.codigoStatus = retorno.cStat;
      nota.motivoStatus = retorno.xMotivo;

      if (retorno.autorizada) {
        nota.status = StatusNota.AUTORIZADA;
        nota.protocolo = retorno.protocolo ?? null;
        nota.dataAutorizacao = new Date();
        // Documento fiscal completo = NFe assinada + protocolo de autorização,
        // empacotados em <nfeProc> (formato padrão para guarda/consulta do XML autorizado).
        nota.xmlAutorizado = retorno.xmlProtocolo
          ? `<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">${xmlAssinado}${retorno.xmlProtocolo}</nfeProc>`
          : xmlAssinado;
        this.logger.success(
          `Nota AUTORIZADA pela SEFAZ [chave=${chaveAcesso}] protocolo=${nota.protocolo} cStat=${retorno.cStat}`,
        );
      } else {
        nota.status = StatusNota.REJEITADA;
        this.logger.warn(
          `Nota REJEITADA pela SEFAZ [chave=${chaveAcesso}] cStat=${retorno.cStat} xMotivo=${retorno.xMotivo}`,
        );
      }
    } catch (error) {
      nota.status = StatusNota.ERRO;
      nota.motivoStatus = (error as Error).message.slice(0, 255);
      this.logger.error(
        `ERRO ao enviar nota à SEFAZ [chave=${chaveAcesso}]: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }

    return this.notaFiscalRepo.save(nota);
  }

  async listar(filtros: {
    status?: StatusNota;
    modelo?: ModeloDocumento;
    pagina?: number;
    tamanhoPagina?: number;
  }): Promise<{ dados: NotaFiscal[]; total: number }> {
    const pagina = filtros.pagina && filtros.pagina > 0 ? filtros.pagina : 1;
    const tamanhoPagina =
      filtros.tamanhoPagina && filtros.tamanhoPagina > 0
        ? Math.min(filtros.tamanhoPagina, 100)
        : 20;

    const [dados, total] = await this.notaFiscalRepo.findAndCount({
      where: {
        ...(filtros.status ? { status: filtros.status } : {}),
        ...(filtros.modelo ? { modelo: filtros.modelo } : {}),
      },
      order: { dataEmissao: 'DESC' },
      skip: (pagina - 1) * tamanhoPagina,
      take: tamanhoPagina,
    });

    return { dados, total };
  }

  async buscarPorId(id: string): Promise<NotaFiscal> {
    const nota = await this.notaFiscalRepo.findOne({ where: { id } });
    if (!nota) {
      throw new NotFoundException(`Nota fiscal ${id} não encontrada.`);
    }
    return nota;
  }

  async statusServicoSefaz(modelo: ModeloDocumento) {
    return this.sefazClient.consultarStatusServico(modelo);
  }

  /**
   * Gera o documento auxiliar (DANFE para NF-e, DANFCE para NFC-e) em PDF. Só é possível para
   * notas AUTORIZADAS — é o único status em que `xmlAutorizado` e `protocolo` existem, e o PDF
   * depende de dados vindos diretamente do XML já validado pela SEFAZ (ver `parseXmlAutorizado`).
   */
  async gerarPdf(id: string): Promise<{ buffer: Buffer; nomeArquivo: string }> {
    const nota = await this.buscarPorId(id);

    if (nota.status !== StatusNota.AUTORIZADA) {
      throw new ConflictException(
        `Nota fiscal ${id} não está autorizada (status atual: ${nota.status}). ` +
          'O DANFE/DANFCE só pode ser gerado após a autorização pela SEFAZ.',
      );
    }

    const emitente = this.configService.get('emitente', { infer: true });
    const buffer = await this.notaFiscalPdfService.gerar(nota, emitente);
    const prefixo = nota.modelo === ModeloDocumento.NFE ? 'danfe' : 'danfce';

    return { buffer, nomeArquivo: `${prefixo}-${nota.chaveAcesso}.pdf` };
  }

  private async proximoNumero(
    modelo: ModeloDocumento,
    serie: number,
  ): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      let controle = await manager.findOne(NumeracaoControle, {
        where: { modelo, serie },
        lock: { mode: 'pessimistic_write' },
      });

      if (!controle) {
        controle = manager.create(NumeracaoControle, {
          modelo,
          serie,
          ultimoNumero: 0,
        });
      }

      controle.ultimoNumero += 1;
      await manager.save(controle);
      return controle.ultimoNumero;
    });
  }
}
