import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { EmitenteConfig } from '../../config/configuration';
import { AppLogger } from '../../common/logger/app-logger';
import { NotaFiscal } from '../entities/nota-fiscal.entity';
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
  { titulo: 'Código', largura: 60 },
  { titulo: 'Descrição', largura: 240 },
  { titulo: 'Qtd', largura: 60 },
  { titulo: 'Vl. Unit.', largura: 80 },
  { titulo: 'Vl. Total', largura: 80 },
];

/**
 * Gera o DANFCE (Documento Auxiliar da NFC-e, modelo 65) em PDF — folha A4, não bobina
 * térmica (o projeto não trata impressão em impressora fiscal/térmica de PDV).
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
    this.desenharItens(doc, nota, dadosXml);
    this.desenharTotais(doc, nota);
    this.desenharChaveEProtocolo(doc, nota, dadosXml.dhRecbto);
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
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text(emitente.razaoSocial, { width: LARGURA_UTIL, align: 'center' });
    doc.font('Helvetica').fontSize(8);
    if (emitente.nomeFantasia) {
      doc.text(emitente.nomeFantasia, { width: LARGURA_UTIL, align: 'center' });
    }
    const complemento = emitente.complemento
      ? ` - ${emitente.complemento}`
      : '';
    doc.text(
      `${emitente.logradouro}, ${emitente.numero}${complemento} - ${emitente.bairro} - ` +
        `${emitente.municipio}/${emitente.uf} - CEP ${formatarCep(emitente.cep)}`,
      { width: LARGURA_UTIL, align: 'center' },
    );
    doc.text(`CNPJ: ${formatarDocumento(emitente.cnpj)}   IE: ${emitente.ie}`, {
      width: LARGURA_UTIL,
      align: 'center',
    });

    doc.moveDown(0.4);
    doc
      .fontSize(13)
      .font('Helvetica-Bold')
      .text('DANFE NFC-e', { width: LARGURA_UTIL, align: 'center' });
    doc
      .fontSize(7)
      .font('Helvetica')
      .text('Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica', {
        width: LARGURA_UTIL,
        align: 'center',
      });
    doc.fontSize(9).text(`Nº ${nota.numero}   Série ${nota.serie}`, {
      width: LARGURA_UTIL,
      align: 'center',
    });
    doc.text(`Emissão: ${formatarDataHoraLocal(nota.dataEmissao)}`, {
      width: LARGURA_UTIL,
      align: 'center',
    });

    if (nota.ambiente === 2) {
      doc
        .fillColor('red')
        .fontSize(8)
        .text('AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL', {
          width: LARGURA_UTIL,
          align: 'center',
        });
      doc.fillColor('black');
    }

    this.linhaSeparadora(doc);
  }

  private desenharItens(
    doc: PDFKit.PDFDocument,
    nota: NotaFiscal,
    dadosXml: DadosXmlAutorizado,
  ): void {
    doc.fontSize(9).font('Helvetica-Bold').text('ITENS', MARGEM, doc.y);
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
        item.quantidade,
        formatarMoeda(item.valorUnitario),
        formatarMoeda(item.valorTotal),
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

  private desenharTotais(doc: PDFKit.PDFDocument, nota: NotaFiscal): void {
    doc.fontSize(9).font('Helvetica-Bold').text('TOTAIS', MARGEM, doc.y);
    doc.font('Helvetica').fontSize(9);

    const vProd = nota.itens.reduce(
      (acc, item) => acc + parseFloat(item.valorTotal),
      0,
    );
    doc.text(`Valor total dos produtos: ${formatarMoeda(vProd)}`, {
      width: LARGURA_UTIL,
    });
    doc
      .font('Helvetica-Bold')
      .text(`Valor total da nota: ${formatarMoeda(nota.valorTotal)}`, {
        width: LARGURA_UTIL,
      });
    doc
      .font('Helvetica')
      .text(`Forma de pagamento: ${textoFormaPagamento(nota.formaPagamento)}`, {
        width: LARGURA_UTIL,
      });
    if (parseFloat(nota.troco) > 0) {
      const valorPago = parseFloat(nota.valorTotal) + parseFloat(nota.troco);
      doc.text(
        `Valor pago: ${formatarMoeda(valorPago)}    Troco: ${formatarMoeda(nota.troco)}`,
        { width: LARGURA_UTIL },
      );
    }

    this.linhaSeparadora(doc);
  }

  private desenharChaveEProtocolo(
    doc: PDFKit.PDFDocument,
    nota: NotaFiscal,
    dhRecbto: string | null,
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

    doc.moveDown(0.3);
    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('Protocolo de autorização', MARGEM, doc.y);
    doc.font('Helvetica').text(nota.protocolo ?? '-');
    doc.font('Helvetica-Bold').text('Data/hora de autorização (SEFAZ)');
    doc.font('Helvetica').text(formatarDataHoraExibicao(dhRecbto));

    this.linhaSeparadora(doc);
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
}
