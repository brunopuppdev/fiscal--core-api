# Integração com a SEFAZ

## Por que integração direta (e não um provedor terceirizado)

Ver a motivação completa em [Visão geral](visao-geral.md#por-que-integração-direta-com-a-sefaz-e-não-um-provedor). Em resumo: evitar custo por nota/mensalidade de provedores como Focus NFe, NFe.io etc., assumindo em troca a complexidade de falar SOAP + mTLS diretamente com a Receita.

## Webservices utilizados

O projeto integra com os webservices da NF-e, layout nacional **4.00**, expostos em `src/config/sefaz-endpoints.ts`:

| Webservice | Uso no projeto |
|---|---|
| `NFeStatusServico4` | Consulta se o serviço da SEFAZ está operante (`GET /notas-fiscais/status-sefaz`) |
| `NFeAutorizacao4` | Envia a NF-e/NFC-e assinada para autorização (`POST /notas-fiscais`) |
| `NFeConsultaProtocolo4` | Consulta o protocolo/situação de uma nota pela chave de acesso (implementado no cliente, `SefazClientService.consultarProtocolo`, mas ainda **não exposto** como endpoint HTTP) |
| `NFeRetAutorizacao4` | Consulta de retorno de lote assíncrono — **não implementado** (o projeto sempre usa envio síncrono, veja abaixo) |
| `NFeInutilizacao4` | Inutilização de numeração — **não implementado** |
| `NFeRecepcaoEvento4` | Eventos (cancelamento, carta de correção) — **não implementado** |

### Só SP está configurado

`sefaz-endpoints.ts` só tem o conjunto de URLs para `SP` (que tem webservice próprio, não usa o ambiente compartilhado SVRS). Para outras UFs, é necessário adicionar as URLs correspondentes — a maioria dos estados usa o ambiente **SVRS** compartilhado. Veja [Roadmap](roadmap.md).

### Homologação vs Produção

Controlado por `SEFAZ_AMBIENTE` no `.env` (`1` = produção, `2` = homologação) — cada UF tem um conjunto de endpoints diferente para cada ambiente (`getSefazEndpoints(uf, ambiente)`). **Notas emitidas em homologação não têm valor fiscal.**

## Envelope SOAP

Desde a versão 4.00 do layout nacional, os webservices da NF-e não usam mais o header `nfeCabecMsg` — o corpo da requisição vai direto dentro de `<nfeDadosMsg>`, dentro de um envelope **SOAP 1.2**. Isso está implementado em `soap-envelope.util.ts` (`montarEnvelopeSoap`).

A chamada HTTP em si é feita com o módulo `https` nativo do Node (`soap-http.util.ts`), sem biblioteca de SOAP — o corpo é montado como string e enviado via `POST`, com o `Content-Type` incluindo a *SOAPAction* como parâmetro `action`.

## mTLS

Toda chamada à SEFAZ usa **TLS mútuo**: o cliente apresenta o certificado do MEI (`.pfx`) como parte do handshake, e não apenas confia no certificado do servidor. Isso é feito através do `https.Agent` construído em `CertificadoService.obterHttpsAgent()`, passado a cada chamada SOAP.

## Envio de NF-e: lote síncrono

`SefazClientService.autorizar` sempre envia com `indSinc=1` (lote síncrono) — adequado para o baixo volume de emissão de um MEI, já que a resposta (`cStat`, `xMotivo`, protocolo) vem na mesma chamada HTTP. Se a SEFAZ retornar um lote ainda não processado (`cStat` 103/105 — cenário de lote assíncrono), o cliente não tenta consultar depois via `NFeRetAutorizacao4`; isso fica registrado como limitação conhecida.

## Principais códigos de retorno (`cStat`)

| `cStat` | Significado | O que fazer |
|---|---|---|
| `100` | Autorizado o uso da NF-e | Nota válida — `xmlAutorizado` é montado com o protocolo embutido (`<nfeProc>`) |
| `107` | Serviço em operação (retorno de `NFeStatusServico4`) | A SEFAZ está disponível |
| `282` | Rejeição: Certificado Transmissor sem CNPJ | O certificado usado (provavelmente um e-CPF) não tem CNPJ embutido — só um e-CNPJ resolve, não há solução por procuração. Veja [Guia fiscal § Certificado digital](guia-fiscal.md#certificado-digital) |
| outros `1xx`/`2xx` de rejeição | Erro de preenchimento (NCM, CFOP, CSOSN, dados do destinatário, etc.) | Consulte o `xMotivo` retornado — geralmente autoexplicativo — e revise os dados enviados |

A lista completa de códigos está no Manual de Orientação do Contribuinte (MOC) da NF-e, disponível no [portal nacional da NF-e](https://www.nfe.fazenda.gov.br).

## Status real de teste (homologação SEFAZ-SP)

O fluxo de consulta de status já foi validado de ponta a ponta contra o webservice `NFeStatusServico4` **real** da SEFAZ-SP: TLS, mTLS com certificado A1, montagem/envio do envelope SOAP e parse da resposta funcionaram como esperado.

Na tentativa de autorização (`NFeAutorizacao4`), a SEFAZ retornou:

```
cStat 282 — Rejeição: Certificado Transmissor sem CNPJ
```

Ou seja, o certificado usado no teste era um e-CPF (do titular do MEI), que não carrega CNPJ algum — e a SEFAZ valida exatamente esse campo do certificado, não um cadastro de procuração da Receita Federal. **Uma procuração eletrônica no e-CAC não resolve esse cenário**: ela concede acesso a serviços da Receita Federal, mas não insere um CNPJ no certificado nem afeta a validação feita pela SEFAZ na transmissão da NF-e. A única solução é usar um certificado **e-CNPJ** emitido para o CNPJ do MEI — veja o passo a passo em [Guia fiscal § Certificado digital](guia-fiscal.md#certificado-digital). Assim que o e-CNPJ estiver configurado, a expectativa é que a autorização funcione sem mudanças na aplicação — mas isso **ainda precisa ser confirmado** em um teste ponta a ponta com o certificado correto.

## Próximos passos

- [Roadmap](roadmap.md) — o que falta para cobrir outras UFs, cancelamento, DANFE, etc.
- [Guia fiscal](guia-fiscal.md) — o que fazer se sua emissão for rejeitada por dados fiscais incorretos.
