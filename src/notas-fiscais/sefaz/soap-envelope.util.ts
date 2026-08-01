/**
 * Monta o envelope SOAP 1.2 exigido pelos webservices da NF-e (layout nacional 4.00).
 * Desde a versão 4.00 os serviços não usam mais o header nfeCabecMsg — o corpo vai
 * direto dentro de <nfeDadosMsg xmlns="...namespace do serviço...">.
 */
export function montarEnvelopeSoap(
  namespaceServico: string,
  corpoXml: string,
): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
    'xmlns:xsd="http://www.w3.org/2001/XMLSchema" ' +
    'xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">' +
    '<soap12:Body>' +
    `<nfeDadosMsg xmlns="${namespaceServico}">${corpoXml}</nfeDadosMsg>` +
    '</soap12:Body>' +
    '</soap12:Envelope>'
  );
}

export function extrairConteudoNfeDadosMsg(respostaSoap: string): string {
  const match = respostaSoap.match(
    /<(?:\w+:)?nfeResultMsg[^>]*>([\s\S]*?)<\/(?:\w+:)?nfeResultMsg>/,
  );
  return match ? match[1] : respostaSoap;
}
