/**
 * Endpoints dos webservices da SEFAZ-SP (NF-e 4.00).
 * SP possui webservice próprio (não usa o ambiente SVRS compartilhado).
 * Confirme sempre a URL vigente no Manual de Integração do Contribuinte / portal da NF-e
 * antes de usar em produção — a Receita/SEFAZ pode alterar endereços entre versões.
 */
export interface SefazEndpointSet {
  NFeStatusServico4: string;
  NFeAutorizacao4: string;
  NFeRetAutorizacao4: string;
  NFeConsultaProtocolo4: string;
  NFeInutilizacao4: string;
  NFeRecepcaoEvento4: string;
}

const SP_HOMOLOGACAO: SefazEndpointSet = {
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

const SP_PRODUCAO: SefazEndpointSet = {
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

/**
 * Mapa por UF. Hoje só SP está preenchido (é o único informado pelo usuário).
 * Para outras UFs, a maioria usa o ambiente SVRS — adicione aqui quando necessário.
 */
const ENDPOINTS_POR_UF: Record<
  string,
  { homologacao: SefazEndpointSet; producao: SefazEndpointSet }
> = {
  SP: { homologacao: SP_HOMOLOGACAO, producao: SP_PRODUCAO },
};

export function getSefazEndpoints(
  uf: string,
  ambiente: number,
): SefazEndpointSet {
  const conjunto = ENDPOINTS_POR_UF[uf.toUpperCase()];
  if (!conjunto) {
    throw new Error(
      `Endpoints da SEFAZ não configurados para a UF "${uf}". Adicione em sefaz-endpoints.ts.`,
    );
  }
  return ambiente === 1 ? conjunto.producao : conjunto.homologacao;
}
