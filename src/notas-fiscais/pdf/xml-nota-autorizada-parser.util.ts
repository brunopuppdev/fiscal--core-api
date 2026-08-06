import { XMLParser } from 'fast-xml-parser';

/**
 * Dados que só existem de forma confiável dentro do `xml_autorizado` (o `<nfeProc>` completo,
 * já validado pela SEFAZ) — não devem ser recalculados a partir das colunas soltas de
 * `NotaFiscal`/`ItemNota` para gerar o DANFE/DANFCE, sob risco de divergir do que foi
 * realmente autorizado (ex.: `NotaFiscal.dataAutorizacao` é só o timestamp local do
 * registro, não o horário oficial `dhRecbto` devolvido pela SEFAZ).
 */
export interface DadosXmlAutorizado {
  /** protNFe/infProt/dhRecbto — data/hora oficial de autorização, no formato do XML. */
  dhRecbto: string | null;
  /** infNFeSupl/qrCode — URL completa do QR Code da NFC-e, pronta para virar imagem. */
  qrCode: string | null;
  /** infNFeSupl/urlChave — URL de consulta pública por chave de acesso. */
  urlChave: string | null;
  /** infAdic/infCpl — texto de informações complementares (aviso MEI/Simples Nacional). */
  infCpl: string | null;
  /**
   * det[nItem=1]/prod/xProd — descrição efetivamente enviada para o item 1. Em homologação
   * o builder sobrescreve essa descrição com o aviso obrigatório de ambiente de teste
   * (cStat 373 se omitido); ler do XML garante fidelidade ao que foi autorizado.
   */
  descricaoItem1: string | null;
}

type NoXml = Record<string, unknown>;

const parser = new XMLParser({ ignoreAttributes: false });

function objeto(valor: unknown): NoXml | undefined {
  return valor && typeof valor === 'object' ? (valor as NoXml) : undefined;
}

function texto(valor: unknown): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor === 'string' || typeof valor === 'number')
    return String(valor);
  return null;
}

/** Busca recursiva por uma chave, ignorando prefixo de namespace — mesmo padrão de
 * `SefazClientService.buscarProfundo`, reaplicado aqui para não depender de outro módulo. */
function buscarProfundo(valor: unknown, chave: string): unknown {
  const obj = objeto(valor);
  if (!obj) return undefined;
  for (const [chaveAtual, valorAtual] of Object.entries(obj)) {
    if (chaveAtual === chave || chaveAtual.endsWith(`:${chave}`))
      return valorAtual;
    const achado = buscarProfundo(valorAtual, chave);
    if (achado !== undefined) return achado;
  }
  return undefined;
}

/** Extrai os campos do `xml_autorizado` (`<nfeProc>`) necessários para montar o DANFE/DANFCE. */
export function parseXmlAutorizado(xmlAutorizado: string): DadosXmlAutorizado {
  const doc: unknown = parser.parse(xmlAutorizado);

  const infProt = objeto(buscarProfundo(doc, 'infProt'));
  const infNFeSupl = objeto(buscarProfundo(doc, 'infNFeSupl'));
  const infAdic = objeto(buscarProfundo(doc, 'infAdic'));

  // <det> pode vir como objeto único (1 item) ou array (vários itens) — fast-xml-parser
  // não normaliza isso sozinho; a ordem do array segue a ordem de emissão (nItem).
  const detBruto = buscarProfundo(doc, 'det');
  const detArray = Array.isArray(detBruto)
    ? detBruto
    : detBruto
      ? [detBruto]
      : [];
  const prodItem1 = objeto(objeto(detArray[0])?.prod);

  return {
    dhRecbto: texto(infProt?.dhRecbto),
    qrCode: texto(infNFeSupl?.qrCode),
    urlChave: texto(infNFeSupl?.urlChave),
    infCpl: texto(infAdic?.infCpl),
    descricaoItem1: texto(prodItem1?.xProd),
  };
}
