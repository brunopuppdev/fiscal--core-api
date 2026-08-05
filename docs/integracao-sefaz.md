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
| `225` | Rejeição: Falha no Schema XML do lote de NFe | Genérico, sem detalhe do elemento — veja [§ QR Code da NFC-e: bug real de ordem de elementos](#qr-code-da-nfc-e-bug-real-de-ordem-de-elementos-corrigido) abaixo; causa real encontrada validando contra o XSD oficial, não só por tentativa e erro |
| `1115` | Rejeição: IBS/CBS não informado | Ver [§ Rejeição 1115 em homologação SP para MEI (CRT 4)](#rejeição-1115-ibscbs-em-homologação-sp-para-mei-crt-4) abaixo — aparentemente fora do cronograma oficial para MEI |
| outros `1xx`/`2xx` de rejeição | Erro de preenchimento (NCM, CFOP, CSOSN, dados do destinatário, etc.) | Consulte o `xMotivo` retornado — geralmente autoexplicativo — e revise os dados enviados |

A lista completa de códigos está no Manual de Orientação do Contribuinte (MOC) da NF-e, disponível no [portal nacional da NF-e](https://www.nfe.fazenda.gov.br).

## Status real de teste (homologação SEFAZ-SP)

O fluxo de consulta de status já foi validado de ponta a ponta contra o webservice `NFeStatusServico4` **real** da SEFAZ-SP: TLS, mTLS com certificado A1, montagem/envio do envelope SOAP e parse da resposta funcionaram como esperado.

Na tentativa de autorização (`NFeAutorizacao4`), a SEFAZ retornou:

```
cStat 282 — Rejeição: Certificado Transmissor sem CNPJ
```

Ou seja, o certificado usado no teste era um e-CPF (do titular do MEI), que não carrega CNPJ algum — e a SEFAZ valida exatamente esse campo do certificado, não um cadastro de procuração da Receita Federal. **Uma procuração eletrônica no e-CAC não resolve esse cenário**: ela concede acesso a serviços da Receita Federal, mas não insere um CNPJ no certificado nem afeta a validação feita pela SEFAZ na transmissão da NF-e. A única solução é usar um certificado **e-CNPJ** emitido para o CNPJ do MEI — veja o passo a passo em [Guia fiscal § Certificado digital](guia-fiscal.md#certificado-digital).

**Atualização (04/08/2026):** com o e-CNPJ correto configurado, uma nova tentativa de autorização (NFC-e, homologação) passou pela validação do certificado sem problema — TLS, mTLS e assinatura XML-DSig aceitos pela SEFAZ. A rejeição mudou para `cStat 1115` (veja seção abaixo), não relacionada a certificado.

### Rejeição 1115 (IBS/CBS) em homologação SP para MEI (CRT 4)

Em 04/08/2026, uma tentativa de autorização de NFC-e (`EMITENTE_CRT=4`, confirmado no XML enviado) foi rejeitada pela SEFAZ-SP em homologação com:

```
cStat 1115 — Rejeição: IBS/CBS não informado [nItem: 1]
```

Isso é parte da Reforma Tributária (LC 214/2025), regulamentada pela **NT 2025.002** (versão vigente em 04/08/2026: v1.50). Segundo o texto oficial da própria NT:

> "As orientações para CRT=1-Simples Nacional, CRT=2-Simples Nacional-Excesso de Sublimite, CRT=4-MEI e Tributação Monofásica serão publicadas em NT futura, tendo em vista que a tributação do IBS/CBS/IS para estes contribuintes ocorre somente a partir de 2027."

E a regra de validação específica (grupo `UB13-30`, mensagem 1022/1115) traz, entre suas observações:

> "Observação 1: implementação em homologação para NFe... e emitente com CRT 3=Regime Normal." (não cita CRT 4)
> "Observação 3: implementação em produção para emitente com CRT... 4=Simples Nacional - MEI a partir 04/01/2027."

Ou seja: **pela própria NT, um emitente CRT=4 (MEI) não deveria estar sujeito a essa rejeição nem em homologação nem em produção antes de 04/01/2027** — e a Receita ainda nem publicou os códigos (CST/`cClassTrib`) que o MEI deveria usar quando chegar a hora, porque a regra para esse regime ainda não existe. A rejeição recebida no ambiente de homologação da SEFAZ-SP parece estar fora desse cronograma nacional (possivelmente um efeito colateral do corte de produção do CRT 3, que aconteceu um dia antes, em 03/08/2026 — a própria NT observa que "implantação em homologação pode variar por UF").

**Não há como corrigir isso no builder com confiança agora**: implementar o grupo `IBSCBS` com valores arbitrários trocaria essa rejeição por outra (CST inexistente, classificação incompatível, etc.), já que não existe ainda um valor oficialmente correto para o cenário MEI. Ação recomendada: reter este teste como bloqueado, e reavaliar quando a SEFAZ-SP corrigir o comportamento em homologação ou publicar a NT específica para CRT 1/2/4. Veja também [Roadmap](roadmap.md).

**Confirmado que é específico de homologação**: o teste em produção (abaixo) não sofreu essa rejeição, então o `cStat 1115` em homologação parece ser mesmo um comportamento fora do cronograma nacional, isolado ao ambiente de homologação da SEFAZ-SP.

### QR Code da NFC-e: bug real de ordem de elementos (corrigido)

Em 05/08/2026, com `NFCE_CSC`/`NFCE_CSC_ID` de homologação configurados, o primeiro teste de autorização de NFC-e com o grupo `infNFeSupl` (QR Code) foi rejeitado com:

```
cStat 225 — Rejeição: Falha no Schema XML do lote de NFe
```

Sem detalhe adicional na resposta da SEFAZ. A causa foi encontrada baixando o XSD oficial (`leiauteNFe_v4.00.xsd`) e inspecionando a sequência do `complexType TNFe`: a ordem exigida é **`infNFe` → `infNFeSupl` → `Signature`** — não `infNFe` → `Signature` → `infNFeSupl`, que era o que `NfeXmlSignerService` produzia (a assinatura era inserida imediatamente após `infNFe`, empurrando `infNFeSupl` para depois da assinatura).

Corrigido trocando a inserção da assinatura de "logo após `infNFe`" para "como último filho de `NFe`" (`location: { reference: NFe, action: 'append' }` no `xml-crypto`) — isso mantém o comportamento correto para NF-e (sem `infNFeSupl`, `Signature` continua vindo logo após `infNFe`) e corrige a ordem para NFC-e. Testado contra a SEFAZ-SP real após a correção: a nota voltou a passar pelo schema e chegar à validação de regra de negócio (rejeição 1115 acima, não relacionada). Regressão coberta em `nfe-xml-signer.service.spec.ts`.

### Emissão real autorizada em produção (05/08/2026)

Com a correção do QR Code aplicada, uma NFC-e foi emitida em **produção** (`SEFAZ_AMBIENTE=1`, CSC de produção) e **autorizada pela SEFAZ-SP**:

```
cStat 100 — Autorizado o uso da NF-e
chave de acesso: 35260866963234000142650010000000191495501334
protocolo: 135265292865225
```

Isso valida o fluxo completo ponta a ponta contra o ambiente real: certificado e-CNPJ, mTLS, assinatura XML-DSig, QR Code (`infNFeSupl`), schema e regra de negócio — tudo aceito pela SEFAZ. Note que essa mesma emissão **não** sofreu a rejeição `cStat 1115` (IBS/CBS) descrita acima, reforçando que aquele bloqueio é específico do ambiente de homologação.

## Próximos passos

- [Roadmap](roadmap.md) — o que falta para cobrir outras UFs, cancelamento, DANFE, etc.
- [Guia fiscal](guia-fiscal.md) — o que fazer se sua emissão for rejeitada por dados fiscais incorretos.
