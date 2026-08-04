/**
 * Endpoints dos webservices da SEFAZ-SP (NF-e/NFC-e layout 4.00).
 * SP possui webservice próprio (não usa o ambiente SVRS compartilhado).
 * Confirme sempre a URL vigente no Manual de Integração do Contribuinte / portal da NF-e/NFC-e
 * antes de usar em produção — a Receita/SEFAZ pode alterar endereços entre versões.
 *
 * IMPORTANTE: em SP, NF-e (modelo 55) e NFC-e (modelo 65) usam domínios completamente
 * diferentes (nfe.fazenda.sp.gov.br x nfce.fazenda.sp.gov.br). Chamar o endpoint errado
 * para o modelo é rejeitado pela SEFAZ (cStat 450 "Modelo da NF-e diferente de 55", por
 * exemplo, quando se envia uma NFC-e ao webservice de NF-e).
 */
import { ModeloDocumento } from '../common/enums/modelo-documento.enum';

export interface SefazEndpointSet {
  NFeStatusServico4: string;
  NFeAutorizacao4: string;
  NFeRetAutorizacao4: string;
  NFeConsultaProtocolo4: string;
  NFeInutilizacao4: string;
  NFeRecepcaoEvento4: string;
}

interface EndpointsPorAmbiente {
  homologacao: SefazEndpointSet;
  producao: SefazEndpointSet;
}

interface EndpointsPorModelo {
  nfe: EndpointsPorAmbiente;
  nfce: EndpointsPorAmbiente;
}

const SP_NFE_HOMOLOGACAO: SefazEndpointSet = {
  NFeStatusServico4:
    'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx',
  NFeAutorizacao4:
    'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx',
  NFeRetAutorizacao4:
    'https://homologacao.nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx',
  NFeConsultaProtocolo4:
    'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx',
  NFeInutilizacao4:
    'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeinutilizacao4.asmx',
  NFeRecepcaoEvento4:
    'https://homologacao.nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx',
};

const SP_NFE_PRODUCAO: SefazEndpointSet = {
  NFeStatusServico4: 'https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx',
  NFeAutorizacao4: 'https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx',
  NFeRetAutorizacao4:
    'https://nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx',
  NFeConsultaProtocolo4:
    'https://nfe.fazenda.sp.gov.br/ws/nfeconsultaprotocolo4.asmx',
  NFeInutilizacao4: 'https://nfe.fazenda.sp.gov.br/ws/nfeinutilizacao4.asmx',
  NFeRecepcaoEvento4:
    'https://nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx',
};

const SP_NFCE_HOMOLOGACAO: SefazEndpointSet = {
  NFeStatusServico4:
    'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeStatusServico4.asmx',
  NFeAutorizacao4:
    'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx',
  NFeRetAutorizacao4:
    'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeRetAutorizacao4.asmx',
  NFeConsultaProtocolo4:
    'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeConsultaProtocolo4.asmx',
  NFeInutilizacao4:
    'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeInutilizacao4.asmx',
  NFeRecepcaoEvento4:
    'https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeRecepcaoEvento4.asmx',
};

const SP_NFCE_PRODUCAO: SefazEndpointSet = {
  NFeStatusServico4: 'https://nfce.fazenda.sp.gov.br/ws/NFeStatusServico4.asmx',
  NFeAutorizacao4: 'https://nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx',
  NFeRetAutorizacao4:
    'https://nfce.fazenda.sp.gov.br/ws/NFeRetAutorizacao4.asmx',
  NFeConsultaProtocolo4:
    'https://nfce.fazenda.sp.gov.br/ws/NFeConsultaProtocolo4.asmx',
  NFeInutilizacao4: 'https://nfce.fazenda.sp.gov.br/ws/NFeInutilizacao4.asmx',
  NFeRecepcaoEvento4:
    'https://nfce.fazenda.sp.gov.br/ws/NFeRecepcaoEvento4.asmx',
};

/**
 * Mapa por UF, com um conjunto de endpoints por modelo (NF-e e NFC-e). Hoje só SP está
 * preenchido (é o único informado pelo usuário). Para outras UFs, a maioria usa o
 * ambiente SVRS — adicione aqui os dois conjuntos (nfe/nfce) quando necessário.
 */
const ENDPOINTS_POR_UF: Record<string, EndpointsPorModelo> = {
  SP: {
    nfe: { homologacao: SP_NFE_HOMOLOGACAO, producao: SP_NFE_PRODUCAO },
    nfce: { homologacao: SP_NFCE_HOMOLOGACAO, producao: SP_NFCE_PRODUCAO },
  },
};

export function getSefazEndpoints(
  uf: string,
  ambiente: number,
  modelo: ModeloDocumento,
): SefazEndpointSet {
  const conjuntoUf = ENDPOINTS_POR_UF[uf.toUpperCase()];
  if (!conjuntoUf) {
    throw new Error(
      `Endpoints da SEFAZ não configurados para a UF "${uf}". Adicione em sefaz-endpoints.ts.`,
    );
  }
  const conjuntoModelo =
    modelo === ModeloDocumento.NFCE ? conjuntoUf.nfce : conjuntoUf.nfe;
  return ambiente === 1 ? conjuntoModelo.producao : conjuntoModelo.homologacao;
}

/**
 * URLs públicas (não-SOAP) usadas no QR Code da NFC-e (grupo infNFeSupl, NT 2015.002):
 * `qrCode` é a URL raiz para onde o parâmetro "p" é anexado (o que o consumidor escaneia);
 * `urlChave` é a página de consulta manual pela chave de acesso (sem parâmetros).
 * São páginas públicas do portal da NFC-e, diferentes dos webservices SOAP acima.
 */
export interface NfceConsultaUrls {
  qrCode: string;
  urlChave: string;
}

interface NfceConsultaUrlsPorAmbiente {
  homologacao: NfceConsultaUrls;
  producao: NfceConsultaUrls;
}

const SP_NFCE_CONSULTA: NfceConsultaUrlsPorAmbiente = {
  homologacao: {
    qrCode:
      'https://www.homologacao.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx',
    urlChave: 'https://www.homologacao.nfce.fazenda.sp.gov.br/consulta',
  },
  producao: {
    qrCode:
      'https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx',
    urlChave: 'https://www.nfce.fazenda.sp.gov.br/consulta',
  },
};

const CONSULTA_NFCE_POR_UF: Record<string, NfceConsultaUrlsPorAmbiente> = {
  SP: SP_NFCE_CONSULTA,
};

export function getNfceConsultaUrls(
  uf: string,
  ambiente: number,
): NfceConsultaUrls {
  const conjunto = CONSULTA_NFCE_POR_UF[uf.toUpperCase()];
  if (!conjunto) {
    throw new Error(
      `URLs de consulta de NFC-e não configuradas para a UF "${uf}". Adicione em sefaz-endpoints.ts.`,
    );
  }
  return ambiente === 1 ? conjunto.producao : conjunto.homologacao;
}
