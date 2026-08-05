import { Injectable } from '@nestjs/common';
import { create } from 'xmlbuilder2';
import { EmitenteConfig } from '../../config/configuration';
import { getNfceConsultaUrls } from '../../config/sefaz-endpoints';
import { ModeloDocumento } from '../../common/enums/modelo-documento.enum';
import { AppLogger } from '../../common/logger/app-logger';
import { CODIGO_UF } from '../../common/utils/chave-acesso.util';
import { formatarDataHoraNfe } from '../../common/utils/data-hora-nfe.util';
import { calcularIdDest } from '../../common/utils/id-dest.util';
import { DestinatarioDto } from '../dto/destinatario.dto';
import { ItemNotaDto } from '../dto/item-nota.dto';
import { montarUrlQrCodeNfce } from './qrcode-nfce.util';

export interface DadosMontagemNfe {
  chaveAcesso: string;
  codigoNumerico: string;
  modelo: ModeloDocumento;
  serie: number;
  numero: number;
  naturezaOperacao: string;
  dataEmissao: Date;
  ambiente: number; // 1 produção, 2 homologação
  emitente: EmitenteConfig;
  destinatario?: DestinatarioDto;
  itens: ItemNotaDto[];
  /** CSC e CSC ID (credenciamento NFC-e na SEFAZ) — obrigatórios só quando modelo=NFCE. */
  csc?: string;
  cscId?: string;
}

const fmt = (valor: number, casas: number): string => valor.toFixed(casas);

/**
 * Monta o XML da NFe/NFCe (layout 4.00) a partir dos dados da venda.
 *
 * IMPORTANTE: este builder cobre o cenário comum de venda de mercadoria por MEI
 * optante do Simples Nacional (CSOSN 102, PIS/COFINS CST 49, sem ICMS destacado).
 * Confirme com o contador os códigos de CSOSN/NCM/CFOP corretos para cada produto
 * antes de emitir notas reais — parâmetros incorretos geram rejeição pela SEFAZ.
 */
@Injectable()
export class NfeXmlBuilderService {
  private readonly logger = new AppLogger(NfeXmlBuilderService.name);

  montar(dados: DadosMontagemNfe): string {
    const { emitente, itens } = dados;
    const isNfce = dados.modelo === ModeloDocumento.NFCE;

    const vProdTotal = itens.reduce(
      (acc, item) => acc + item.quantidade * item.valorUnitario,
      0,
    );

    const dhEmi = formatarDataHoraNfe(dados.dataEmissao);
    const cUF = CODIGO_UF[emitente.uf.toUpperCase()] ?? '35';

    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('NFe', { xmlns: 'http://www.portalfiscal.inf.br/nfe' })
      .ele('infNFe', {
        versao: '4.00',
        Id: `NFe${dados.chaveAcesso}`,
      });

    // ---- ide ----
    const ide = doc.ele('ide');
    ide.ele('cUF').txt(cUF);
    ide.ele('cNF').txt(dados.codigoNumerico.padStart(8, '0'));
    ide.ele('natOp').txt(dados.naturezaOperacao || 'VENDA');
    ide.ele('mod').txt(dados.modelo);
    ide.ele('serie').txt(String(dados.serie));
    ide.ele('nNF').txt(String(dados.numero));
    ide.ele('dhEmi').txt(dhEmi);
    ide.ele('tpNF').txt('1'); // 1 = saída
    ide
      .ele('idDest')
      .txt(calcularIdDest(emitente.uf, dados.destinatario?.endereco?.uf));
    ide.ele('cMunFG').txt(emitente.codMunicipio);
    ide.ele('tpImp').txt(isNfce ? '4' : '1'); // 4 = DANFE NFC-e, 1 = DANFE retrato
    ide.ele('tpEmis').txt('1'); // 1 = emissão normal
    ide.ele('cDV').txt(dados.chaveAcesso.slice(-1));
    ide.ele('tpAmb').txt(String(dados.ambiente));
    ide.ele('finNFe').txt('1'); // 1 = NF-e normal
    ide.ele('indFinal').txt('1'); // 1 = operação com consumidor final
    ide.ele('indPres').txt(isNfce ? '1' : '9'); // NFC-e: presencial. NF-e: ajuste conforme canal de venda.
    ide.ele('procEmi').txt('0');
    ide.ele('verProc').txt('emissornf-1.0');

    // ---- emit ----
    const emit = doc.ele('emit');
    emit.ele('CNPJ').txt(emitente.cnpj);
    emit.ele('xNome').txt(emitente.razaoSocial);
    if (emitente.nomeFantasia) emit.ele('xFant').txt(emitente.nomeFantasia);
    const enderEmit = emit.ele('enderEmit');
    enderEmit.ele('xLgr').txt(emitente.logradouro);
    enderEmit.ele('nro').txt(emitente.numero);
    if (emitente.complemento) enderEmit.ele('xCpl').txt(emitente.complemento);
    enderEmit.ele('xBairro').txt(emitente.bairro);
    enderEmit.ele('cMun').txt(emitente.codMunicipio);
    enderEmit.ele('xMun').txt(emitente.municipio);
    enderEmit.ele('UF').txt(emitente.uf);
    enderEmit.ele('CEP').txt(emitente.cep.replace(/\D/g, ''));
    enderEmit.ele('cPais').txt('1058');
    enderEmit.ele('xPais').txt('Brasil');
    if (emitente.telefone) enderEmit.ele('fone').txt(emitente.telefone);
    emit.ele('IE').txt(emitente.ie);
    emit.ele('CRT').txt(String(emitente.crt)); // 4 = Simples Nacional - MEI (Ajuste SINIEF 43/2023, desde 01/04/2025)

    // ---- dest ----
    if (dados.destinatario?.documento || dados.destinatario?.nome) {
      const dest = doc.ele('dest');
      const documento = dados.destinatario.documento?.replace(/\D/g, '');
      if (documento && documento.length === 14) {
        dest.ele('CNPJ').txt(documento);
      } else if (documento && documento.length === 11) {
        dest.ele('CPF').txt(documento);
      } else if (!isNfce) {
        // NF-e (55) exige identificação do destinatário. Em condições normais
        // NotasFiscaisService.emitir já barra isso antes de chamar o builder — chegar
        // aqui indica uma inconsistência entre as duas validações, por isso o warn.
        const mensagem =
          'destinatario.documento é obrigatório para NF-e (modelo 55).';
        this.logger.warn(
          `Falha ao montar XML [chave=${dados.chaveAcesso}]: ${mensagem}`,
        );
        throw new Error(mensagem);
      }
      if (dados.destinatario.nome)
        dest.ele('xNome').txt(dados.destinatario.nome);

      const end = dados.destinatario.endereco;
      if (end?.logradouro) {
        const enderDest = dest.ele('enderDest');
        enderDest.ele('xLgr').txt(end.logradouro);
        enderDest.ele('nro').txt(end.numero ?? 'S/N');
        enderDest.ele('xBairro').txt(end.bairro ?? '');
        enderDest.ele('cMun').txt(end.codMunicipio ?? emitente.codMunicipio);
        enderDest.ele('xMun').txt(end.municipio ?? '');
        enderDest.ele('UF').txt(end.uf ?? emitente.uf);
        enderDest.ele('CEP').txt((end.cep ?? '').replace(/\D/g, ''));
        enderDest.ele('cPais').txt('1058');
        enderDest.ele('xPais').txt('Brasil');
      }
      // 9 = não contribuinte de ICMS (padrão para venda a pessoa física/consumidor final)
      dest.ele('indIEDest').txt('9');
      if (dados.destinatario.email)
        dest.ele('email').txt(dados.destinatario.email);
    }

    // ---- det (itens) ----
    itens.forEach((item, index) => {
      const nItem = index + 1;
      const vProd = item.quantidade * item.valorUnitario;
      const det = doc.ele('det', { nItem: String(nItem) });

      const prod = det.ele('prod');
      prod.ele('cProd').txt(item.codigo);
      prod.ele('cEAN').txt('SEM GTIN');
      // Exigência do layout NF-e: em homologação (tpAmb=2) o item 1 precisa ter essa
      // descrição fixa, para não confundir nota de teste com nota real (rejeição cStat 373).
      const xProd =
        dados.ambiente === 2 && nItem === 1
          ? 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
          : item.descricao;
      prod.ele('xProd').txt(xProd);
      prod.ele('NCM').txt(item.ncm);
      // CEST obrigatório quando o NCM está sujeito a regime de Substituição Tributária
      // (Convênio ICMS 142/2018), independente de quem recolhe o ICMS-ST na operação
      // (MEI não assume substituto tributário, mas o campo ainda é exigido no XML).
      if (item.cest) prod.ele('CEST').txt(item.cest);
      prod.ele('CFOP').txt(item.cfop);
      prod.ele('uCom').txt(item.unidade ?? 'UN');
      prod.ele('qCom').txt(fmt(item.quantidade, 4));
      prod.ele('vUnCom').txt(fmt(item.valorUnitario, 4));
      prod.ele('vProd').txt(fmt(vProd, 2));
      prod.ele('cEANTrib').txt('SEM GTIN');
      prod.ele('uTrib').txt(item.unidade ?? 'UN');
      prod.ele('qTrib').txt(fmt(item.quantidade, 4));
      prod.ele('vUnTrib').txt(fmt(item.valorUnitario, 4));
      prod.ele('indTot').txt('1');

      const imposto = det.ele('imposto');
      const icms = imposto.ele('ICMS');
      const csosn = item.csosn ?? '102';
      // CSOSN 102/103/300/400: sem detalhamento adicional de base/alíquota.
      const icmsSN = icms.ele(`ICMSSN${csosn}`);
      icmsSN.ele('orig').txt('0');
      icmsSN.ele('CSOSN').txt(csosn);

      // PIS/COFINS: CST 49 (outras operações de saída), sem valores destacados —
      // padrão usual para MEI/Simples Nacional. Confirme com o contador.
      const pis = imposto.ele('PIS').ele('PISOutr');
      pis.ele('CST').txt('49');
      pis.ele('vBC').txt(fmt(0, 2));
      pis.ele('pPIS').txt(fmt(0, 4));
      pis.ele('vPIS').txt(fmt(0, 2));

      const cofins = imposto.ele('COFINS').ele('COFINSOutr');
      cofins.ele('CST').txt('49');
      cofins.ele('vBC').txt(fmt(0, 2));
      cofins.ele('pCOFINS').txt(fmt(0, 4));
      cofins.ele('vCOFINS').txt(fmt(0, 2));
    });

    // ---- total ----
    const total = doc.ele('total').ele('ICMSTot');
    total.ele('vBC').txt(fmt(0, 2));
    total.ele('vICMS').txt(fmt(0, 2));
    total.ele('vICMSDeson').txt(fmt(0, 2));
    total.ele('vFCP').txt(fmt(0, 2));
    total.ele('vBCST').txt(fmt(0, 2));
    total.ele('vST').txt(fmt(0, 2));
    total.ele('vFCPST').txt(fmt(0, 2));
    total.ele('vFCPSTRet').txt(fmt(0, 2));
    total.ele('vProd').txt(fmt(vProdTotal, 2));
    total.ele('vFrete').txt(fmt(0, 2));
    total.ele('vSeg').txt(fmt(0, 2));
    total.ele('vDesc').txt(fmt(0, 2));
    total.ele('vII').txt(fmt(0, 2));
    total.ele('vIPI').txt(fmt(0, 2));
    total.ele('vIPIDevol').txt(fmt(0, 2));
    total.ele('vPIS').txt(fmt(0, 2));
    total.ele('vCOFINS').txt(fmt(0, 2));
    total.ele('vOutro').txt(fmt(0, 2));
    total.ele('vNF').txt(fmt(vProdTotal, 2));

    // ---- transp ----
    doc.ele('transp').ele('modFrete').txt('9'); // 9 = sem transporte

    // ---- pag ----
    const pag = doc.ele('pag').ele('detPag');
    pag.ele('tPag').txt('01'); // 01 = dinheiro (ajuste conforme forma de pagamento real)
    pag.ele('vPag').txt(fmt(vProdTotal, 2));

    // ---- infAdic ----
    doc
      .ele('infAdic')
      .ele('infCpl')
      .txt(
        'Documento emitido por Microempreendedor Individual (MEI) optante pelo Simples Nacional. Não gera direito a crédito fiscal de ICMS/IPI/PIS/COFINS.',
      );

    // ---- infNFeSupl (QR Code, só NFC-e) ----
    // Elemento irmão de infNFe (não filho) — schema exige a ordem infNFe, Signature,
    // infNFeSupl. `doc` referencia infNFe, e `.up()` sobe para o nó NFe; como este
    // builder roda antes da assinatura (NfeXmlSignerService insere <Signature> logo
    // após </infNFe>), adicionar infNFeSupl aqui já deixa a ordem final correta.
    if (isNfce) {
      if (!dados.csc || !dados.cscId) {
        const mensagem =
          'CSC e CSC ID são obrigatórios para NFC-e (configure NFCE_CSC e NFCE_CSC_ID no .env).';
        this.logger.warn(
          `Falha ao montar XML [chave=${dados.chaveAcesso}]: ${mensagem}`,
        );
        throw new Error(mensagem);
      }

      const { qrCode: urlQrCode, urlChave } = getNfceConsultaUrls(
        emitente.uf,
        dados.ambiente,
      );
      const qrCode = montarUrlQrCodeNfce({
        chaveAcesso: dados.chaveAcesso,
        ambiente: dados.ambiente,
        csc: dados.csc,
        cscId: dados.cscId,
        urlQrCode,
      });

      // Texto puro (sem CDATA): a URL não tem caractere reservado de XML (&, <, >) que
      // exija escaping, e o CDATA aqui já causou rejeição cStat 225 (Falha no Schema
      // XML) em teste real contra a SEFAZ-SP homologação — o validador deles não pareceu
      // lidar bem com a seção CDATA, mesmo sendo lexicamente equivalente a texto puro.
      const infNFeSupl = doc.up().ele('infNFeSupl');
      infNFeSupl.ele('qrCode').txt(qrCode);
      infNFeSupl.ele('urlChave').txt(urlChave);
    }

    // headless: true suprime a declaração <?xml ...?> — o XML da NFe nunca é usado como
    // documento de topo isolado, e sim embutido em outro elemento (<enviNFe> no envio à
    // SEFAZ, <nfeProc> na persistência), onde uma declaração no meio do caminho é inválida.
    return doc.end({ headless: true, prettyPrint: false });
  }
}
