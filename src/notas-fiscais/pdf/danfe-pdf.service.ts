import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { EmitenteConfig } from '../../config/configuration';
import { AppLogger } from '../../common/logger/app-logger';
import { NotaFiscal } from '../entities/nota-fiscal.entity';
import { gerarCodigoBarrasChave } from './codigo-barras-chave.util';
import {
  formatarCep,
  formatarChaveExibicao,
  formatarDataHoraExibicao,
  formatarDataHoraLocal,
  formatarDocumento,
  formatarMoeda,
  textoFormaPagamento,
} from './formatadores-danfe.util';
import { capturarPdfEmBuffer } from './pdf-buffer.util';
import {
  DadosXmlAutorizado,
  parseXmlAutorizado,
} from './xml-nota-autorizada-parser.util';

const MARGEM = 36;
const LARGURA_PAGINA = 595.28;
const ALTURA_PAGINA = 841.89;
const LARGURA_UTIL = LARGURA_PAGINA - MARGEM * 2;

/** Formato solto do JSONB `destinatario_endereco` — reflete os campos de `EnderecoDestinatarioDto`
 * no momento da emissão, mas sem validação de schema no banco (JSONB), daí o cast explícito. */
interface EnderecoDestinatarioJson {
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
}

interface ColunaTabela {
  titulo: string;
  largura: number;
}

const COLUNAS_ITENS: ColunaTabela[] = [
  { titulo: 'Código', largura: 65 },
  { titulo: 'Descrição', largura: 155 },
  { titulo: 'NCM', largura: 50 },
  { titulo: 'CFOP', largura: 35 },
  { titulo: 'Un', largura: 25 },
  { titulo: 'Qtd', largura: 45 },
  { titulo: 'Vl. Unit.', largura: 68 },
  { titulo: 'Vl. Total', largura: 68 },
];

/**
 * Gera o DANFE (Documento Auxiliar da NF-e, modelo 55) em PDF — A4 retrato.
 *
 * O layout aqui prioriza legibilidade e a presença de todos os campos exigidos pelo Manual de
 * Orientação do Contribuinte, sem reproduzir pixel a pixel a grade de caixas do layout oficial
 * (quadro emitente/destinatário/canhoto do Anexo do MOC) — a SEFAZ valida o XML, não a
 * diagramação do DANFE, então fidelidade visual exata não é uma exigência fiscal.
 */
@Injectable()
export class DanfePdfService {
  private readonly logger = new AppLogger(DanfePdfService.name);

  async gerar(nota: NotaFiscal, emitente: EmitenteConfig): Promise<Buffer> {
    const dadosXml = parseXmlAutorizado(nota.xmlAutorizado as string);
    const codigoBarras = await gerarCodigoBarrasChave(nota.chaveAcesso);

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGEM, bottom: MARGEM, left: MARGEM, right: MARGEM },
    });
    const pdfPronto = capturarPdfEmBuffer(doc);

    this.desenharCabecalho(doc, nota, emitente);
    this.desenharChaveEProtocolo(doc, nota, dadosXml, codigoBarras);
    this.desenharDestinatario(doc, nota);
    this.desenharTotais(doc, nota);
    this.desenharItens(doc, nota, dadosXml);
    this.desenharDadosAdicionais(doc, dadosXml);
    this.desenharCanhoto(doc, nota, emitente);

    doc.end();
    this.logger.log(`DANFE gerado em PDF [chave=${nota.chaveAcesso}]`);
    return pdfPronto;
  }

  private desenharCabecalho(
    doc: PDFKit.PDFDocument,
    nota: NotaFiscal,
    emitente: EmitenteConfig,
  ): void {
    const colEsquerdaLargura = 320;
    const colDireitaX = MARGEM + colEsquerdaLargura + 12;
    const colDireitaLargura = LARGURA_UTIL - colEsquerdaLargura - 12;
    const yInicio = doc.y;

    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text(emitente.razaoSocial, MARGEM, yInicio, {
        width: colEsquerdaLargura,
      });
    doc.font('Helvetica').fontSize(8);
    if (emitente.nomeFantasia)
      doc.text(emitente.nomeFantasia, { width: colEsquerdaLargura });
    const complemento = emitente.complemento
      ? ` - ${emitente.complemento}`
      : '';
    doc.text(
      `${emitente.logradouro}, ${emitente.numero}${complemento} - ${emitente.bairro}`,
      {
        width: colEsquerdaLargura,
      },
    );
    doc.text(
      `${emitente.municipio} - ${emitente.uf} - CEP ${formatarCep(emitente.cep)}`,
      {
        width: colEsquerdaLargura,
      },
    );
    doc.text(`CNPJ: ${formatarDocumento(emitente.cnpj)}   IE: ${emitente.ie}`, {
      width: colEsquerdaLargura,
    });
    if (emitente.telefone) {
      doc.text(`Telefone: ${emitente.telefone}`, { width: colEsquerdaLargura });
    }

    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('DANFE', colDireitaX, yInicio, {
        width: colDireitaLargura,
        align: 'center',
      });
    doc
      .fontSize(7)
      .font('Helvetica')
      .text(
        'Documento Auxiliar da Nota Fiscal Eletrônica',
        colDireitaX,
        doc.y,
        {
          width: colDireitaLargura,
          align: 'center',
        },
      );
    doc.text(nota.naturezaOperacao, colDireitaX, doc.y, {
      width: colDireitaLargura,
      align: 'center',
    });
    doc
      .font('Helvetica-Bold')
      .text('0 - Entrada   1 - Saída: 1', colDireitaX, doc.y, {
        width: colDireitaLargura,
        align: 'center',
      });
    doc.font('Helvetica').fontSize(9);
    doc.text(`Nº ${nota.numero}   Série ${nota.serie}`, colDireitaX, doc.y, {
      width: colDireitaLargura,
      align: 'center',
    });
    doc.text(
      `Emissão: ${formatarDataHoraLocal(nota.dataEmissao)}`,
      colDireitaX,
      doc.y,
      {
        width: colDireitaLargura,
        align: 'center',
      },
    );
    if (nota.ambiente === 2) {
      doc
        .fillColor('red')
        .fontSize(8)
        .text(
          'AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL',
          colDireitaX,
          doc.y,
          {
            width: colDireitaLargura,
            align: 'center',
          },
        );
      doc.fillColor('black');
    }

    doc.y = Math.max(doc.y, yInicio + 85);
    this.linhaSeparadora(doc);
  }

  private desenharChaveEProtocolo(
    doc: PDFKit.PDFDocument,
    nota: NotaFiscal,
    dadosXml: DadosXmlAutorizado,
    codigoBarras: Buffer,
  ): void {
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('CHAVE DE ACESSO', MARGEM, doc.y);
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(formatarChaveExibicao(nota.chaveAcesso), {
        width: LARGURA_UTIL,
        align: 'center',
      });
    doc.image(codigoBarras, MARGEM + LARGURA_UTIL / 2 - 130, doc.y + 2, {
      width: 260,
      height: 32,
    });
    doc.y += 38;

    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('Protocolo de autorização', MARGEM, doc.y);
    doc.font('Helvetica').text(nota.protocolo ?? '-');
    doc.font('Helvetica-Bold').text('Data/hora de autorização (SEFAZ)');
    doc.font('Helvetica').text(formatarDataHoraExibicao(dadosXml.dhRecbto));

    this.linhaSeparadora(doc);
  }

  private desenharDestinatario(
    doc: PDFKit.PDFDocument,
    nota: NotaFiscal,
  ): void {
    doc.fontSize(9).font('Helvetica-Bold').text('DESTINATÁRIO', MARGEM, doc.y);
    doc.font('Helvetica').fontSize(8);

    const nome = nota.destinatarioNome ?? 'CONSUMIDOR NÃO IDENTIFICADO';
    const documento = nota.destinatarioDocumento
      ? formatarDocumento(nota.destinatarioDocumento)
      : '-';
    doc.text(`${nome}   CPF/CNPJ: ${documento}`, { width: LARGURA_UTIL });

    const endereco =
      nota.destinatarioEndereco as EnderecoDestinatarioJson | null;
    if (endereco?.logradouro) {
      const linha = [endereco.logradouro, endereco.numero]
        .filter(Boolean)
        .join(', ');
      const cidadeUf = [endereco.municipio, endereco.uf]
        .filter(Boolean)
        .join(' - ');
      const partes = [
        linha,
        endereco.bairro,
        cidadeUf,
        endereco.cep ? `CEP ${formatarCep(endereco.cep)}` : null,
      ].filter((parte): parte is string => Boolean(parte));
      if (partes.length) doc.text(partes.join(' - '), { width: LARGURA_UTIL });
    }

    this.linhaSeparadora(doc);
  }

  private desenharTotais(doc: PDFKit.PDFDocument, nota: NotaFiscal): void {
    doc.fontSize(9).font('Helvetica-Bold').text('TOTAIS', MARGEM, doc.y);
    doc.font('Helvetica').fontSize(8);

    const vProd = nota.itens.reduce(
      (acc, item) => acc + parseFloat(item.valorTotal),
      0,
    );
    doc.text(
      `Valor dos produtos: ${formatarMoeda(vProd)}    ICMS: ${formatarMoeda(0)}    ` +
        `Valor total da nota: ${formatarMoeda(nota.valorTotal)}`,
      { width: LARGURA_UTIL },
    );
    doc.text(
      `Frete: sem transporte (modFrete 9)    ` +
        `Forma de pagamento: ${textoFormaPagamento(nota.formaPagamento)}`,
      { width: LARGURA_UTIL },
    );

    this.linhaSeparadora(doc);
  }

  private desenharItens(
    doc: PDFKit.PDFDocument,
    nota: NotaFiscal,
    dadosXml: DadosXmlAutorizado,
  ): void {
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('PRODUTOS/SERVIÇOS', MARGEM, doc.y);
    doc.moveDown(0.2);

    this.desenharCabecalhoTabelaItens(doc);

    const itensOrdenados = [...nota.itens].sort(
      (a, b) => a.numeroItem - b.numeroItem,
    );
    for (const item of itensOrdenados) {
      const descricao =
        item.numeroItem === 1 && dadosXml.descricaoItem1
          ? dadosXml.descricaoItem1
          : item.descricao;
      const valores = [
        item.codigo,
        descricao,
        item.ncm,
        item.cfop,
        item.unidade,
        item.quantidade,
        formatarMoeda(item.valorUnitario),
        formatarMoeda(item.valorTotal),
      ].map(String);

      const alturaLinha = Math.max(
        ...valores.map((texto, indice) =>
          doc.heightOfString(texto, { width: COLUNAS_ITENS[indice].largura }),
        ),
      );

      if (doc.y + alturaLinha > ALTURA_PAGINA - MARGEM - 90) {
        doc.addPage();
        doc.y = MARGEM;
        this.desenharCabecalhoTabelaItens(doc);
      }

      const yLinha = doc.y;
      let x = MARGEM;
      valores.forEach((texto, indice) => {
        doc.text(texto, x, yLinha, { width: COLUNAS_ITENS[indice].largura });
        x += COLUNAS_ITENS[indice].largura;
      });
      doc.y = yLinha + alturaLinha + 4;
    }

    this.linhaSeparadora(doc);
  }

  private desenharCabecalhoTabelaItens(doc: PDFKit.PDFDocument): void {
    let x = MARGEM;
    doc.font('Helvetica-Bold').fontSize(7);
    const y = doc.y;
    for (const coluna of COLUNAS_ITENS) {
      doc.text(coluna.titulo, x, y, { width: coluna.largura });
      x += coluna.largura;
    }
    doc.y = y + 10;
    this.linhaSeparadora(doc);
    doc.font('Helvetica').fontSize(7);
  }

  private desenharDadosAdicionais(
    doc: PDFKit.PDFDocument,
    dadosXml: DadosXmlAutorizado,
  ): void {
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('DADOS ADICIONAIS', MARGEM, doc.y);
    doc
      .font('Helvetica')
      .fontSize(8)
      .text(dadosXml.infCpl ?? '-', { width: LARGURA_UTIL });
    this.linhaSeparadora(doc);
  }

  private desenharCanhoto(
    doc: PDFKit.PDFDocument,
    nota: NotaFiscal,
    emitente: EmitenteConfig,
  ): void {
    if (doc.y > ALTURA_PAGINA - MARGEM - 90) {
      doc.addPage();
      doc.y = MARGEM;
    }

    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('CANHOTO DO DESTINATÁRIO', MARGEM, doc.y);
    doc
      .font('Helvetica')
      .fontSize(8)
      .text(
        `Recebemos de ${emitente.razaoSocial} os produtos e/ou serviços constantes da nota ` +
          `fiscal indicada acima. Emissão: ${formatarDataHoraLocal(nota.dataEmissao)}   ` +
          `Nº ${nota.numero}   Série ${nota.serie}`,
        { width: LARGURA_UTIL },
      );

    doc.moveDown(1.5);
    const y = doc.y;
    doc
      .moveTo(MARGEM, y)
      .lineTo(MARGEM + 260, y)
      .lineWidth(0.5)
      .stroke();
    doc.fontSize(7).text('Data de recebimento', MARGEM, y + 2);

    doc
      .moveTo(MARGEM + 290, y)
      .lineTo(MARGEM + LARGURA_UTIL, y)
      .stroke();
    doc.text('Identificação e assinatura do recebedor', MARGEM + 290, y + 2);
  }

  private linhaSeparadora(doc: PDFKit.PDFDocument): void {
    doc.moveDown(0.2);
    const y = doc.y;
    doc
      .moveTo(MARGEM, y)
      .lineTo(MARGEM + LARGURA_UTIL, y)
      .lineWidth(0.5)
      .stroke();
    doc.moveDown(0.3);
  }
}
