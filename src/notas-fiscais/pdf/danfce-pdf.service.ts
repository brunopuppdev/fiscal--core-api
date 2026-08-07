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
import { desenharLogoEmitente } from './logo-emitente.util';
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

/** Paleta do modelo visual fornecido pelo emitente — só 3 cores além do preto padrão do pdfkit. */
const COR_VERMELHO = '#E11D48';
const COR_CINZA = '#52525B';
const COR_CINZA_CLARO = '#E4E4E7';
const COR_PRETO = '#000000';

/** Lado do logotipo no cabeçalho do DANFCE — menor que o padrão do DANFE (`TAMANHO_MAXIMO_LOGO`,
 * 70pt), conforme o modelo visual específico deste documento. */
const TAMANHO_LOGO_DANFCE = 55;

/** Largura reservada à direita do cabeçalho para o logo + rótulo "DANFE NFC-e". */
const LARGURA_COLUNA_LOGO = 160;

/** Lado do QR Code no rodapé (colunas lado a lado, não mais empilhado). */
const TAMANHO_QR_CODE = 120;

interface ColunaTabela {
  titulo: string;
  largura: number;
  alinhamento?: 'left' | 'right';
}

const COLUNAS_ITENS: ColunaTabela[] = [
  { titulo: '#', largura: 25 },
  { titulo: 'CÓDIGO', largura: 55 },
  { titulo: 'DESCRIÇÃO', largura: 195 },
  { titulo: 'UND.', largura: 35 },
  { titulo: 'QTD.', largura: 40, alinhamento: 'right' },
  { titulo: 'VALOR UN.', largura: 80, alinhamento: 'right' },
  { titulo: 'TOTAL R$', largura: 93.28, alinhamento: 'right' },
];

/** Formata um valor monetário sem o prefixo "R$" — usado nas colunas da tabela de itens, cujo
 * cabeçalho já indica a moeda ("VALOR UN." / "TOTAL R$"), diferente do bloco de totais. */
function formatarValorTabela(valor: string | number): string {
  return formatarMoeda(valor).replace('R$ ', '');
}

/** Soma as quantidades dos itens (não a contagem de linhas) para "QTDE. TOTAL DE ITENS". */
function formatarQuantidadeTotal(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

/**
 * Gera o DANFCE (Documento Auxiliar da NFC-e, modelo 65) em PDF — folha A4, não bobina
 * térmica (o projeto não trata impressão em impressora fiscal/térmica de PDV).
 *
 * Layout segue estritamente o modelo visual mais elaborado fornecido pelo emitente (paleta de
 * 3 cores — vermelho de destaque, cinza secundário, preto principal —, cabeçalho com nome em
 * caixa alta e espaçamento entre letras, identificação e totais em duas colunas, rodapé com
 * texto e QR Code lado a lado), não o leiaute de referência solto/centralizado da SEFAZ — a
 * SEFAZ valida o XML, não a diagramação do PDF.
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
    this.desenharIdentificacao(doc, nota, dadosXml);
    this.desenharItens(doc, nota, dadosXml);
    this.desenharTotais(doc, nota);
    this.desenharRodape(doc, imagemQrCode, dadosXml.urlChave);

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
    const larguraTexto = LARGURA_UTIL - LARGURA_COLUNA_LOGO - 12;
    const xColunaLogo = MARGEM + LARGURA_UTIL - LARGURA_COLUNA_LOGO;

    desenharLogoEmitente(
      doc,
      emitente.logoPath,
      MARGEM + LARGURA_UTIL - TAMANHO_LOGO_DANFCE,
      yInicio,
      TAMANHO_LOGO_DANFCE,
    );

    const nomeExibido = (
      emitente.nomeFantasia || emitente.razaoSocial
    ).toUpperCase();
    doc
      .fillColor(COR_PRETO)
      .fontSize(27)
      .font('Helvetica-Bold')
      .text(nomeExibido, MARGEM, yInicio, {
        width: larguraTexto,
        characterSpacing: 1.2,
      });

    doc
      .fillColor(COR_VERMELHO)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('DANFE NFC-e', xColunaLogo, yInicio + TAMANHO_LOGO_DANFCE + 4, {
        width: LARGURA_COLUNA_LOGO,
        align: 'right',
      });

    doc.fillColor(COR_PRETO).fontSize(8.5).font('Helvetica');
    doc.text(
      `CNPJ: ${formatarDocumento(emitente.cnpj)}   IE: ${emitente.ie}`,
      MARGEM,
      doc.y,
      { width: larguraTexto },
    );
    doc.text(`Razão Social: ${emitente.razaoSocial}`, MARGEM, doc.y, {
      width: larguraTexto,
    });

    const complemento = emitente.complemento
      ? ` - ${emitente.complemento}`
      : '';
    doc.text(
      `${emitente.logradouro}, ${emitente.numero}${complemento}   ` +
        `${emitente.bairro} - ${emitente.municipio}/${emitente.uf}`,
      MARGEM,
      doc.y,
      { width: larguraTexto },
    );

    // Aviso operacional (não faz parte do modelo visual fornecido, que é de uma emissão em
    // produção) — mantido para não confundir DANFCE de teste com um documento fiscal válido.
    if (nota.ambiente === 2) {
      doc
        .fillColor(COR_VERMELHO)
        .fontSize(8)
        .font('Helvetica-Bold')
        .text('AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL', MARGEM, doc.y, {
          width: LARGURA_UTIL,
        });
    }

    doc.fillColor(COR_PRETO);
    doc.y = Math.max(doc.y, yInicio + TAMANHO_LOGO_DANFCE + 4 + 14);
    this.linhaSeparadoraGrossa(doc);
  }

  private desenharIdentificacao(
    doc: PDFKit.PDFDocument,
    nota: NotaFiscal,
    dadosXml: DadosXmlAutorizado,
  ): void {
    const larguraColuna = LARGURA_UTIL / 2 - 6;
    const xEsquerda = MARGEM;
    const xDireita = MARGEM + LARGURA_UTIL / 2 + 6;
    const yInicio = doc.y;

    let yEsquerda = yInicio;
    doc.fillColor(COR_VERMELHO).fontSize(8).font('Helvetica-Bold');
    doc.text('DOCUMENTO AUXILIAR', xEsquerda, yEsquerda, {
      width: larguraColuna,
    });
    yEsquerda = doc.y;

    doc.fillColor(COR_CINZA).fontSize(7).font('Helvetica');
    doc.text(
      'Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica',
      xEsquerda,
      yEsquerda,
      { width: larguraColuna },
    );
    yEsquerda = doc.y + 6;

    doc.fillColor(COR_PRETO).fontSize(9).font('Helvetica');
    doc.text(
      `Nº: ${nota.numero}   Série: ${nota.serie}`,
      xEsquerda,
      yEsquerda,
      {
        width: larguraColuna,
      },
    );
    yEsquerda = doc.y;
    doc.text(
      `Emissão: ${formatarDataHoraLocal(nota.dataEmissao)}`,
      xEsquerda,
      yEsquerda,
      { width: larguraColuna },
    );
    yEsquerda = doc.y;

    let yDireita = yInicio;
    doc.fillColor(COR_VERMELHO).fontSize(8).font('Helvetica-Bold');
    doc.text('CHAVE DE ACESSO', xDireita, yDireita, { width: larguraColuna });
    yDireita = doc.y;

    doc.fillColor(COR_PRETO).fontSize(8.5).font('Helvetica');
    doc.text(formatarChaveExibicao(nota.chaveAcesso), xDireita, yDireita, {
      width: larguraColuna,
    });
    yDireita = doc.y + 6;

    doc.fillColor(COR_CINZA).fontSize(7.5).font('Helvetica');
    doc.text(
      `Data/hora de autorização (SEFAZ): ${formatarDataHoraExibicao(dadosXml.dhRecbto)}`,
      xDireita,
      yDireita,
      { width: larguraColuna },
    );
    yDireita = doc.y;
    doc.text(
      `Protocolo de autorização: ${nota.protocolo ?? '-'}`,
      xDireita,
      yDireita,
      { width: larguraColuna },
    );
    yDireita = doc.y;

    doc.fillColor(COR_PRETO);
    doc.y = Math.max(yEsquerda, yDireita);
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

      if (doc.y + alturaLinha > ALTURA_PAGINA - MARGEM - 260) {
        doc.addPage();
        doc.y = MARGEM;
        this.desenharCabecalhoTabelaItens(doc);
      }

      const yLinha = doc.y;
      let x = MARGEM;
      valores.forEach((texto, indice) => {
        const coluna = COLUNAS_ITENS[indice];
        // Descrição e total do item recebem peso maior (bold), destacando-os das demais
        // colunas — mesma hierarquia visual do modelo fornecido.
        const ehDestaque = indice === 2 || indice === 6;
        doc
          .fillColor(COR_PRETO)
          .font(ehDestaque ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(8);
        doc.text(texto, x, yLinha, {
          width: coluna.largura,
          align: coluna.alinhamento ?? 'left',
        });
        x += coluna.largura;
      });
      doc.y = yLinha + alturaLinha + 3;
      this.linhaFinaSolida(doc);
    }
  }

  private desenharCabecalhoTabelaItens(doc: PDFKit.PDFDocument): void {
    let x = MARGEM;
    doc.fillColor(COR_VERMELHO).font('Helvetica-Bold').fontSize(7);
    const y = doc.y;
    for (const coluna of COLUNAS_ITENS) {
      doc.text(coluna.titulo, x, y, {
        width: coluna.largura,
        align: coluna.alinhamento ?? 'left',
      });
      x += coluna.largura;
    }
    doc.fillColor(COR_PRETO);
    doc.y = y + 10;
    this.linhaFinaSolida(doc);
  }

  private desenharTotais(doc: PDFKit.PDFDocument, nota: NotaFiscal): void {
    const qtdTotalItens = nota.itens.reduce(
      (acc, item) => acc + parseFloat(item.quantidade),
      0,
    );
    const valorTotal = parseFloat(nota.valorTotal);
    const valorPago = valorTotal + parseFloat(nota.troco);

    const larguraColuna = LARGURA_UTIL / 2 - 6;
    const xEsquerda = MARGEM;
    const xDireita = MARGEM + LARGURA_UTIL / 2 + 6;
    const yInicio = doc.y;

    let yEsquerda = this.linhaTotalColuna(
      doc,
      xEsquerda,
      yInicio,
      larguraColuna,
      'QTDE. TOTAL DE ITENS',
      formatarQuantidadeTotal(qtdTotalItens),
      COR_VERMELHO,
      COR_PRETO,
      false,
    );
    yEsquerda = this.linhaTotalColuna(
      doc,
      xEsquerda,
      yEsquerda,
      larguraColuna,
      'FORMA DE PAGAMENTO',
      textoFormaPagamento(nota.formaPagamento).toUpperCase(),
      COR_VERMELHO,
      COR_VERMELHO,
      true,
    );

    let yDireita = this.linhaTotalColuna(
      doc,
      xDireita,
      yInicio,
      larguraColuna,
      'VALOR TOTAL',
      formatarMoeda(valorTotal),
      COR_CINZA,
      COR_PRETO,
      true,
    );
    yDireita = this.linhaTotalColuna(
      doc,
      xDireita,
      yDireita,
      larguraColuna,
      'VALOR PAGO',
      formatarMoeda(valorPago),
      COR_CINZA,
      COR_PRETO,
      true,
    );
    yDireita = this.linhaTotalColuna(
      doc,
      xDireita,
      yDireita,
      larguraColuna,
      'VALOR TROCO',
      formatarMoeda(nota.troco),
      COR_CINZA,
      COR_PRETO,
      true,
    );

    doc.fillColor(COR_PRETO);
    doc.y = Math.max(yEsquerda, yDireita) + 4;

    // Linha de ênfase final — o "grande total" do documento, mesmo valor de "Valor Total"
    // neste projeto (não há descontos/acréscimos calculados à parte).
    const yValorAPagar = doc.y;
    doc
      .fillColor(COR_VERMELHO)
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('VALOR A PAGAR', MARGEM, yValorAPagar, { width: LARGURA_UTIL });
    doc.text(formatarMoeda(valorTotal), MARGEM, yValorAPagar, {
      width: LARGURA_UTIL,
      align: 'right',
    });

    doc.fillColor(COR_PRETO);
    this.linhaSeparadora(doc);
  }

  /** Desenha um par rótulo/valor dentro de uma coluna (metade da largura útil) do bloco de
   * totais, e devolve o `y` seguinte para encadear a próxima linha da mesma coluna. */
  private linhaTotalColuna(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    largura: number,
    rotulo: string,
    valor: string,
    corRotulo: string,
    corValor: string,
    valorEmNegrito: boolean,
  ): number {
    doc.fillColor(corRotulo).fontSize(8).font('Helvetica-Bold');
    doc.text(rotulo, x, y, { width: largura * 0.62 });
    doc
      .fillColor(corValor)
      .font(valorEmNegrito ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(valor, x, y, { width: largura, align: 'right' });
    return doc.y;
  }

  private desenharRodape(
    doc: PDFKit.PDFDocument,
    imagemQrCode: Buffer | null,
    urlChave: string | null,
  ): void {
    const larguraTexto = LARGURA_UTIL - TAMANHO_QR_CODE - 12;
    const xQrCode = MARGEM + LARGURA_UTIL - TAMANHO_QR_CODE;
    const yInicio = doc.y;

    doc.fillColor(COR_VERMELHO).fontSize(8).font('Helvetica-Bold');
    doc.text('CONSULTE PELA CHAVE DE ACESSO EM:', MARGEM, yInicio, {
      width: larguraTexto,
    });
    doc.fillColor(COR_PRETO).font('Helvetica');
    doc.text(urlChave ?? '-', MARGEM, doc.y, { width: larguraTexto });

    doc.fillColor(COR_CINZA).fontSize(7);
    doc.text(
      'Consulte a autenticidade desta NFC-e escaneando o QR Code ao lado, ou pela chave de ' +
        'acesso no portal da NFC-e da SEFAZ do estado emitente.',
      MARGEM,
      doc.y + 6,
      { width: larguraTexto },
    );
    const yFimTexto = doc.y;

    let yFimQrCode = yInicio;
    if (imagemQrCode) {
      doc.image(imagemQrCode, xQrCode, yInicio, {
        width: TAMANHO_QR_CODE,
        height: TAMANHO_QR_CODE,
      });
      yFimQrCode = yInicio + TAMANHO_QR_CODE;
    }

    doc.fillColor(COR_PRETO);
    doc.y = Math.max(yFimTexto, yFimQrCode);
  }

  /** Linha divisória grossa (fecha o cabeçalho) — mais destacada que os separadores finos
   * usados entre as demais seções do documento. */
  private linhaSeparadoraGrossa(doc: PDFKit.PDFDocument): void {
    doc.moveDown(0.3);
    const y = doc.y;
    doc
      .moveTo(MARGEM, y)
      .lineTo(MARGEM + LARGURA_UTIL, y)
      .lineWidth(1.5)
      .strokeColor(COR_CINZA_CLARO)
      .stroke();
    doc.strokeColor('black');
    doc.moveDown(0.4);
  }

  /** Separador fino entre seções do documento (identificação, totais). */
  private linhaSeparadora(doc: PDFKit.PDFDocument): void {
    doc.moveDown(0.2);
    const y = doc.y;
    doc
      .moveTo(MARGEM, y)
      .lineTo(MARGEM + LARGURA_UTIL, y)
      .lineWidth(0.5)
      .strokeColor(COR_CINZA_CLARO)
      .stroke();
    doc.strokeColor('black');
    doc.moveDown(0.3);
  }

  /** Filete sólido (não mais tracejado) sob cada linha da tabela de itens e seu cabeçalho. */
  private linhaFinaSolida(doc: PDFKit.PDFDocument): void {
    const y = doc.y;
    doc
      .moveTo(MARGEM, y)
      .lineTo(MARGEM + LARGURA_UTIL, y)
      .lineWidth(0.5)
      .strokeColor(COR_CINZA_CLARO)
      .stroke();
    doc.strokeColor('black');
    doc.y = y + 4;
  }
}
