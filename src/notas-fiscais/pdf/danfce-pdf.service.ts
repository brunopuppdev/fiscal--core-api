import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { EmitenteConfig } from '../../config/configuration';
import { AppLogger } from '../../common/logger/app-logger';
import { NotaFiscal } from '../entities/nota-fiscal.entity';
import {
  formatarChaveExibicao,
  formatarDataHoraExibicao,
  formatarDataHoraLocal,
  formatarDocumento,
  formatarMoeda,
  textoFormaPagamento,
} from './formatadores-danfe.util';
import {
  desenharLogoEmitente,
  TAMANHO_MAXIMO_LOGO,
} from './logo-emitente.util';
import { capturarPdfEmBuffer } from './pdf-buffer.util';
import { gerarImagemQrCode } from './qrcode-imagem.util';
import {
  DadosXmlAutorizado,
  parseXmlAutorizado,
} from './xml-nota-autorizada-parser.util';

const MARGEM = 36;
const LARGURA_PAGINA = 595.28;
const ALTURA_PAGINA = 841.89;
const LARGURA_UTIL = LARGURA_PAGINA - MARGEM * 2;

interface ColunaTabela {
  titulo: string;
  largura: number;
}

const COLUNAS_ITENS: ColunaTabela[] = [
  { titulo: '#', largura: 25 },
  { titulo: 'Código', largura: 55 },
  { titulo: 'Descrição', largura: 195 },
  { titulo: 'Und.', largura: 35 },
  { titulo: 'Qtd.', largura: 40 },
  { titulo: 'Valor Un. R$', largura: 80 },
  { titulo: 'Valor Item R$', largura: 93.28 },
];

/** Formata um valor monetário sem o prefixo "R$" — usado nas colunas da tabela de itens, cujo
 * cabeçalho já indica a moeda ("Valor Un. R$" / "Valor Item R$"), diferente do bloco de totais. */
function formatarValorTabela(valor: string | number): string {
  return formatarMoeda(valor).replace('R$ ', '');
}

/** Soma as quantidades dos itens (não a contagem de linhas) para "Qtde. Total de Itens". */
function formatarQuantidadeTotal(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

/**
 * Gera o DANFCE (Documento Auxiliar da NFC-e, modelo 65) em PDF — folha A4, não bobina
 * térmica (o projeto não trata impressão em impressora fiscal/térmica de PDV).
 *
 * Layout segue o modelo visual fornecido pelo emitente (cabeçalho alinhado à esquerda, com
 * logotipo, e bloco de totais em linhas rótulo/valor), não o leiaute solto e centralizado
 * do DANFCE de referência da SEFAZ — a SEFAZ valida o XML, não a diagramação do PDF.
 *
 * Sem "valor aproximado dos tributos" (a lei da transparência exige o dado, mas este projeto
 * não calcula tributos — mostrar um valor inventado seria pior do que omiti-lo).
 */
@Injectable()
export class DanfcePdfService {
  private readonly logger = new AppLogger(DanfcePdfService.name);

  async gerar(nota: NotaFiscal, emitente: EmitenteConfig): Promise<Buffer> {
    const dadosXml = parseXmlAutorizado(nota.xmlAutorizado as string);
    const imagemQrCode = dadosXml.qrCode
      ? await gerarImagemQrCode(dadosXml.qrCode)
      : null;

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGEM, bottom: MARGEM, left: MARGEM, right: MARGEM },
    });
    const pdfPronto = capturarPdfEmBuffer(doc);

    this.desenharCabecalho(doc, nota, emitente);
    this.desenharTitulo(doc);
    this.desenharIdentificacao(doc, nota);
    this.desenharChaveEProtocolo(doc, nota, dadosXml.dhRecbto);
    this.desenharItens(doc, nota, dadosXml);
    this.desenharTotais(doc, nota);
    this.desenharQrCode(doc, imagemQrCode, dadosXml.urlChave);

    doc.end();
    this.logger.log(`DANFCE gerado em PDF [chave=${nota.chaveAcesso}]`);
    return pdfPronto;
  }

  private desenharCabecalho(
    doc: PDFKit.PDFDocument,
    nota: NotaFiscal,
    emitente: EmitenteConfig,
  ): void {
    const yInicio = doc.y;
    const larguraTexto = LARGURA_UTIL - TAMANHO_MAXIMO_LOGO - 12;

    desenharLogoEmitente(
      doc,
      emitente.logoPath,
      MARGEM + LARGURA_UTIL - TAMANHO_MAXIMO_LOGO,
      yInicio,
    );

    const nomeExibido = (
      emitente.nomeFantasia || emitente.razaoSocial
    ).toUpperCase();
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text(nomeExibido, MARGEM, yInicio, { width: larguraTexto });

    doc.fontSize(9).font('Helvetica');
    doc.text(`CNPJ: ${formatarDocumento(emitente.cnpj)}`, MARGEM, doc.y, {
      width: larguraTexto,
    });
    doc.text(`IE: ${emitente.ie}`, MARGEM, doc.y, { width: larguraTexto });
    doc.text(`Razão Social: ${emitente.razaoSocial}`, MARGEM, doc.y, {
      width: larguraTexto,
    });

    const complemento = emitente.complemento
      ? ` - ${emitente.complemento}`
      : '';
    doc.text(
      `${emitente.logradouro}, ${emitente.numero}${complemento}`,
      MARGEM,
      doc.y,
      { width: larguraTexto },
    );
    doc.text(
      `${emitente.bairro} - ${emitente.municipio}/${emitente.uf}`,
      MARGEM,
      doc.y,
      { width: larguraTexto },
    );

    if (nota.ambiente === 2) {
      doc
        .fillColor('red')
        .fontSize(8)
        .font('Helvetica-Bold')
        .text('AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL', MARGEM, doc.y, {
          width: larguraTexto,
        });
      doc.fillColor('black');
    }

    doc.y = Math.max(doc.y, yInicio + TAMANHO_MAXIMO_LOGO);
    this.linhaSeparadora(doc);
  }

  private desenharTitulo(doc: PDFKit.PDFDocument): void {
    doc
      .fontSize(13)
      .font('Helvetica-Bold')
      .text('DANFE NFC-e', MARGEM, doc.y, { width: LARGURA_UTIL });
    doc
      .fontSize(7)
      .font('Helvetica')
      .text(
        'Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica',
        MARGEM,
        doc.y,
        { width: LARGURA_UTIL },
      );
    doc.moveDown(0.4);
  }

  private desenharIdentificacao(
    doc: PDFKit.PDFDocument,
    nota: NotaFiscal,
  ): void {
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(
        `Nº: ${nota.numero}    Série: ${nota.serie}    ` +
          `Emissão: ${formatarDataHoraLocal(nota.dataEmissao)}`,
        MARGEM,
        doc.y,
        { width: LARGURA_UTIL },
      );
    doc.moveDown(0.4);
  }

  private desenharChaveEProtocolo(
    doc: PDFKit.PDFDocument,
    nota: NotaFiscal,
    dhRecbto: string | null,
  ): void {
    doc.fontSize(9);
    doc
      .font('Helvetica-Bold')
      .text('CHAVE DE ACESSO: ', MARGEM, doc.y, { continued: true });
    doc.font('Helvetica').text(formatarChaveExibicao(nota.chaveAcesso));

    doc
      .font('Helvetica-Bold')
      .text('Protocolo de autorização: ', MARGEM, doc.y, { continued: true });
    doc.font('Helvetica').text(nota.protocolo ?? '-');

    doc
      .font('Helvetica-Bold')
      .text('Data/hora de autorização (SEFAZ): ', MARGEM, doc.y, {
        continued: true,
      });
    doc.font('Helvetica').text(formatarDataHoraExibicao(dhRecbto));

    this.linhaSeparadora(doc);
  }

  private desenharItens(
    doc: PDFKit.PDFDocument,
    nota: NotaFiscal,
    dadosXml: DadosXmlAutorizado,
  ): void {
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
        item.numeroItem.toString().padStart(3, '0'),
        item.codigo,
        descricao,
        item.unidade.toLowerCase(),
        item.quantidade,
        formatarValorTabela(item.valorUnitario),
        formatarValorTabela(item.valorTotal),
      ].map(String);

      const alturaLinha = Math.max(
        ...valores.map((texto, indice) =>
          doc.heightOfString(texto, { width: COLUNAS_ITENS[indice].largura }),
        ),
      );

      if (doc.y + alturaLinha > ALTURA_PAGINA - MARGEM - 200) {
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
      doc.y = yLinha + alturaLinha + 3;
      this.linhaTracejada(doc);
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

  private desenharTotais(doc: PDFKit.PDFDocument, nota: NotaFiscal): void {
    const qtdTotalItens = nota.itens.reduce(
      (acc, item) => acc + parseFloat(item.quantidade),
      0,
    );
    const valorTotal = parseFloat(nota.valorTotal);
    const valorPago = valorTotal + parseFloat(nota.troco);

    this.linhaTotal(
      doc,
      'Qtde. Total de Itens',
      formatarQuantidadeTotal(qtdTotalItens),
    );
    this.linhaTotal(doc, 'Valor Total', formatarMoeda(valorTotal));
    this.linhaTotal(doc, 'Valor a Pagar', formatarMoeda(valorTotal));
    this.linhaTotal(doc, 'Valor Pago', formatarMoeda(valorPago));
    this.linhaTotal(doc, 'Valor Troco', formatarMoeda(nota.troco));
    this.linhaTotal(
      doc,
      'Forma de Pagamento',
      textoFormaPagamento(nota.formaPagamento).toUpperCase(),
    );

    this.linhaSeparadora(doc);
  }

  private linhaTotal(
    doc: PDFKit.PDFDocument,
    rotulo: string,
    valor: string,
  ): void {
    const y = doc.y;
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(rotulo, MARGEM, y, { width: LARGURA_UTIL * 0.6 });
    doc.text(valor, MARGEM, y, { width: LARGURA_UTIL, align: 'right' });
  }

  private desenharQrCode(
    doc: PDFKit.PDFDocument,
    imagemQrCode: Buffer | null,
    urlChave: string | null,
  ): void {
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('Consulte pela chave de acesso em:', MARGEM, doc.y, {
        width: LARGURA_UTIL,
        align: 'center',
      });
    doc
      .font('Helvetica')
      .text(urlChave ?? '-', { width: LARGURA_UTIL, align: 'center' });
    doc.moveDown(0.5);

    if (imagemQrCode) {
      const tamanho = 130;
      doc.image(imagemQrCode, MARGEM + LARGURA_UTIL / 2 - tamanho / 2, doc.y, {
        width: tamanho,
        height: tamanho,
      });
      doc.y += tamanho + 8;
    }

    doc
      .fontSize(7)
      .font('Helvetica')
      .text(
        'Consulte a autenticidade desta NFC-e escaneando o QR Code acima, ou pela chave de ' +
          'acesso no portal da NFC-e da SEFAZ do estado emitente.',
        { width: LARGURA_UTIL, align: 'center' },
      );
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

  /** Separador tracejado entre linhas da tabela de itens (diferente do separador sólido usado
   * entre seções do documento). */
  private linhaTracejada(doc: PDFKit.PDFDocument): void {
    const y = doc.y;
    doc.dash(2, { space: 2 });
    doc
      .moveTo(MARGEM, y)
      .lineTo(MARGEM + LARGURA_UTIL, y)
      .lineWidth(0.5)
      .stroke();
    doc.undash();
    doc.y = y + 4;
  }
}
