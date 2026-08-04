# Guia fiscal

> **Este guia não substitui um contador.** Ele explica os conceitos usados pelo código para que você saiba o que preencher e o que perguntar ao seu contador — não é orientação fiscal definitiva. Regras variam por atividade, estado e podem mudar.

## NF-e (modelo 55) vs NFC-e (modelo 65)

| | NF-e (55) | NFC-e (65) |
|---|---|---|
| Uso típico | Venda para outra empresa (CNPJ) ou pessoa física identificada | Venda de balcão para consumidor final |
| Destinatário | **Obrigatório** identificar (CPF ou CNPJ) | Opcional — pode ser consumidor não identificado |
| DANFE | Retrato (`tpImp=1`) | Formato NFC-e/cupom (`tpImp=4`) |

No código, isso é refletido em `CriarNotaFiscalDto.destinatario` (opcional, mas validado como obrigatório para `55` em `NotasFiscaisService.emitir`) e em `NfeXmlBuilderService` (que ajusta `tpImp`, `indPres` etc. conforme o modelo).

## MEI e Simples Nacional

O builder de XML (`nfe-xml-builder.service.ts`) assume o cenário padrão de um MEI optante do Simples Nacional:

- **CRT = 4** (Código de Regime Tributário — "Simples Nacional – Microempreendedor Individual – MEI"). Desde
  01/04/2025 (Ajuste SINIEF 43/2023, regulamentado pela NT 2024.001), o MEI tem um código de CRT próprio,
  distinto do CRT 1 ("Simples Nacional", usado por ME/EPP fora do MEI). Como este projeto é especificamente para
  emissão como MEI (não é um ERP genérico para qualquer regime), o padrão assumido é sempre CRT = 4 — se o seu
  caso não for MEI, confirme com o contador o CRT correto e ajuste `EMITENTE_CRT`.
- **CSOSN por item** (Código de Situação da Operação no Simples Nacional) — o valor padrão usado é `102` ("tributada pelo Simples Nacional sem permissão de crédito"), mas é configurável por item (`ItemNotaDto.csosn`).
- **PIS/COFINS CST 49** ("outras operações de saída"), sem valores destacados — padrão usual para quem está no Simples.
- **Sem ICMS destacado** — coerente com o enquadramento MEI/Simples, que não destaca ICMS por fora do DAS.

Se a sua atividade tiver uma situação diferente (por exemplo, produtos sujeitos a substituição tributária, ou CSOSN diferente de 102/103/300/400), você **precisa** confirmar com o contador se o XML gerado é adequado — o builder não valida isso, apenas monta o que foi informado.

## NCM, CFOP e CSOSN — o que preencher

Esses três códigos são obrigatórios por item (`ItemNotaDto`) e são os que mais geram rejeição da SEFAZ quando errados:

- **NCM** (Nomenclatura Comum do Mercosul, 8 dígitos) — classifica o produto. Depende do que você vende (uma bijuteria, um suco, uma peça de roupa têm NCMs diferentes). Consulte a [tabela oficial de NCM](https://www.gov.br/produtividade-e-comercio-exterior) ou peça ao contador.
- **CFOP** (Código Fiscal de Operações e Prestações, 4 dígitos) — descreve a natureza da operação. Os mais comuns para venda de mercadoria por MEI:
  - `5102` — venda de mercadoria dentro do mesmo estado.
  - `6102` — venda de mercadoria para outro estado.
- **CSOSN** (Código de Situação da Operação no Simples Nacional, 3 dígitos) — obrigatório para quem está no Simples/MEI (substitui o CST usado por empresas do regime normal). O padrão do projeto é `102`.

Como o projeto foi pensado para qualquer tipo de venda (não só sucos), **não há uma tabela fixa de NCM/CFOP no código** — cada MEI cadastra os valores corretos para seus próprios produtos ao chamar `POST /notas-fiscais`.

## Certificado digital

A SEFAZ exige que a NF-e/NFC-e seja assinada e transmitida com um certificado ICP-Brasil cujo **CNPJ embutido no próprio certificado** corresponda ao emitente do documento (ou à raiz do CNPJ, para empresas com filiais). Isso é validado pela SEFAZ na hora de processar o XML — não é uma questão de permissão de acesso, é o conteúdo do certificado em si.

### Só e-CNPJ funciona para um MEI emitir NF-e/NFC-e

**Só um certificado e-CNPJ (ou um certificado de pessoa jurídica equivalente, com a raiz do CNPJ do MEI) permite emitir NF-e/NFC-e em nome do CNPJ.** Um e-CPF — mesmo o do titular do MEI — **não serve para isso**, e não há como contornar essa exigência por fora do certificado:

- **A procuração eletrônica do e-CAC não resolve.** Ela concede acesso a *serviços da Receita Federal* (declarações, parcelamentos, DCTFWeb etc.) para o CPF de um procurador — mas não altera nem substitui o CNPJ/CPF que está gravado dentro do certificado digital ICP-Brasil. A validação da SEFAZ (que gera o `cStat 282`) lê o campo do próprio certificado, não nenhum cadastro de procuração da Receita Federal.
- A única exceção documentada pela Receita para emissão de NF-e por CPF é a **Nota Técnica 2018.001** (voltada a **produtor rural pessoa física**, sem CNPJ): nesse caso o CPF *substitui* o CNPJ na própria identificação do emitente (inclusive na chave de acesso) e exige credenciamento específico junto à SEFAZ estadual (e-Fisco) com Inscrição Estadual vinculada ao CPF. Isso **não se aplica a um MEI**, que já possui CNPJ — para o MEI, a regra permanece: certificado de pessoa jurídica obrigatório.

Se você chegou até aqui achando que dava para usar seu e-CPF com uma procuração: não dá. O caminho é obter um e-CNPJ para o CNPJ do MEI.

### Passo a passo: obtendo e configurando o e-CNPJ do MEI

1. **Verifique se você já tem CCMEI e CNPJ ativo.** É pré-requisito — o CNPJ do MEI é gerado automaticamente ao formalizar no [Portal do Empreendedor](https://www.gov.br/empresas-e-negocios/pt-br/empreendedor).
2. **Escolha uma Autoridade Certificadora (AC) credenciada pela ICP-Brasil** (ex.: Serasa, Certisign, Valid, Soluti, entre outras — consulte a [lista oficial de ACs credenciadas](https://www.gov.br/iti/pt-br)).
3. **Contrate um e-CNPJ tipo A1**, informando o CNPJ do MEI. Como o MEI não tem contrato social, a maioria das ACs consulta o CCMEI automaticamente na base da Receita Federal — o processo costuma ser mais simples do que para outros tipos de empresa.
4. **Faça a validação presencial ou por videoconferência** exigida pela AC (confirmação de identidade do titular do MEI). O certificado A1 é entregue como um arquivo (`.pfx`/`.p12`) protegido por senha — diferente do A3, que fica em um token físico (não suportado por este projeto).
5. **Baixe o arquivo `.pfx`** e guarde a senha definida na emissão.
6. **Configure o projeto**: copie o `.pfx` para `certs/certificado.pfx` (ou outro caminho de sua escolha) e preencha no `.env`:
   ```
   CERTIFICADO_PATH=./certs/certificado.pfx
   CERTIFICADO_SENHA=sua-senha-aqui
   ```
7. **Confira o CNPJ do certificado**: `CertificadoService` (`src/certificado/certificado.service.ts`) extrai o CNPJ do campo `commonName` do certificado ao carregar — se o CNPJ não bater com `EMITENTE_CNPJ` do `.env`, revise se o certificado foi emitido para o CNPJ correto.
8. **Teste em homologação primeiro** (`SEFAZ_AMBIENTE=2`) antes de emitir qualquer nota real.

Só use certificados **A1** (arquivo `.pfx`) — a aplicação não suporta certificado A3 (token/smartcard).

## QR Code da NFC-e (CSC)

Toda NFC-e (modelo 65) autorizada precisa trazer um **QR Code** no XML (grupo `infNFeSupl`), usado pelo DANFCE (cupom) para o consumidor consultar a nota publicamente — é uma exigência de schema/regra de negócio da SEFAZ, não um recurso opcional deste projeto. `NfeXmlBuilderService` monta esse grupo automaticamente para NFC-e (não se aplica a NF-e, modelo 55).

Isso depende de duas credenciais **diferentes do certificado digital**:

- **CSC** (Código de Segurança do Contribuinte) — um segredo compartilhado só entre o emitente e a SEFAZ, usado para calcular um hash que comprova que o QR Code foi gerado por quem tem o CSC (não é assinatura digital, é um mecanismo mais simples, específico do QR Code).
- **CSC ID** — o identificador desse CSC no cadastro da SEFAZ (cada contribuinte pode ter mais de um CSC cadastrado).

**Como obter**: no [portal da NFC-e da SEFAZ-SP](https://www.nfce.fazenda.sp.gov.br/), em "Credenciamento" — é um cadastro específico para emissão de NFC-e, separado do credenciamento de certificado digital. **Homologação e produção têm CSC próprios e diferentes** — não use o CSC de homologação em produção nem vice-versa (o hash calculado com o CSC errado é rejeitado, mesmo que o resto do XML esteja correto).

Configure no `.env`:
```
NFCE_CSC=seu-csc-aqui
NFCE_CSC_ID=1
```

Sem essas variáveis preenchidas, a emissão de NFC-e falha com um erro explícito ao montar o XML (antes de qualquer tentativa de envio à SEFAZ) — a aplicação não tenta adivinhar ou omitir o QR Code silenciosamente.

## Antes de emitir notas reais

1. **Confirme com um contador**: o NCM de cada produto, o CFOP correto para sua operação, e se CSOSN 102 é mesmo o adequado ao seu caso (pode variar conforme a atividade).
2. **Teste extensivamente em homologação** (`SEFAZ_AMBIENTE=2`) antes de apontar para produção. Notas emitidas em homologação **não têm valor fiscal**.
3. Confirme que está usando um **e-CNPJ** (não um e-CPF) e que o CNPJ embutido no certificado é o mesmo do emitente — é a causa mais comum de rejeição na primeira tentativa.

## Próximos passos

- [Integração com a SEFAZ](integracao-sefaz.md) — como a autorização é enviada e os principais códigos de retorno.
- [Referência da API](api.md) — onde exatamente NCM/CFOP/CSOSN são informados.
