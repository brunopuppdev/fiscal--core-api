# EmissorNF

API pessoal (NestJS) para emissão de NF-e (modelo 55) e NFC-e (modelo 65) na venda de sucos como MEI, com integração **direta** aos webservices da SEFAZ-SP e documentação Swagger.

## ⚠️ Antes de emitir notas reais

Este projeto foi montado para rodar contra o ambiente de **homologação** da SEFAZ. Ele cobre o cenário comum de MEI/Simples Nacional (CSOSN 102, PIS/COFINS CST 49, sem ICMS destacado), mas:

- **Confirme com um contador** o NCM de cada produto, o CFOP correto e se CSOSN 102 é mesmo o adequado ao seu caso.
- **Teste extensivamente em homologação** antes de apontar para produção. A consulta de status (`NFeStatusServico4`) já foi validada contra a SEFAZ-SP real (ver seção abaixo); o fluxo de autorização (`NFeAutorizacao4`) ainda precisa ser testado ponta a ponta assim que o certificado estiver corretamente vinculado ao CNPJ.
- Notas emitidas em homologação **não têm valor fiscal**.

## Conectividade com a SEFAZ (Node + TLS)

O Node.js não confia por padrão na cadeia de certificado TLS usada pelos servidores da SEFAZ (ICP-Brasil), então as chamadas SOAP falham com `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` a menos que o Node use também o repositório de certificados do sistema operacional. Por isso os scripts `start`/`start:dev`/`start:prod` já rodam com `NODE_OPTIONS=--use-system-ca` (via `cross-env`, funciona em qualquer OS desde que o Windows/OS já confie na cadeia — o que normalmente já é o caso).

## Status real de teste (homologação SEFAZ-SP)

Testado de ponta a ponta contra o webservice `NFeStatusServico4` real: TLS, mTLS com certificado A1, montagem/envio do SOAP e parse da resposta funcionaram. A SEFAZ retornou:

```
cStat 282 — Rejeição: Certificado Transmissor sem CNPJ
```

Isso significa que o certificado usado (e-CPF do titular do MEI) **não está vinculado ao CNPJ** do MEI perante a Receita/SEFAZ. Para transmitir NF-e, ou você usa um certificado **e-CNPJ** emitido para o CNPJ do MEI, ou vincula o e-CPF ao CNPJ através de uma **procuração eletrônica no e-CAC** (Receita Federal) autorizando aquele CPF a agir em nome do CNPJ para fins de NF-e. Isso é um passo administrativo fora do código — depois de resolvido, a emissão real deve funcionar sem mudanças na aplicação.

## Requisitos

- Node.js 20+
- PostgreSQL
- Certificado digital A1 (.pfx) do CNPJ do MEI

## Configuração

1. Copie `.env.example` para `.env` e preencha os dados (CNPJ, endereço, banco de dados etc).
2. Coloque o certificado `.pfx` em `certs/certificado.pfx` (ou ajuste `CERTIFICADO_PATH`).
3. Suba o PostgreSQL (via Docker, ver abaixo, ou uma instância própria já configurada no `.env`).

```bash
npm install
docker compose up -d
npm run start:dev
```

### Banco de dados via Docker

O `docker-compose.yml` sobe um PostgreSQL local usando as mesmas variáveis do `.env` (`DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `DB_PORT`):

```bash
docker compose up -d      # sobe o banco
docker compose ps         # confere status
docker compose down       # para (mantém os dados no volume)
```

A API sobe em `http://localhost:3000` e a documentação Swagger em `http://localhost:3000/docs`.

## Principais endpoints

- `POST /notas-fiscais` — monta o XML, assina com o certificado e envia para autorização na SEFAZ.
- `GET /notas-fiscais` — histórico de notas emitidas (filtros por `status`, `modelo`, paginação).
- `GET /notas-fiscais/:id` — detalhe de uma nota.
- `GET /notas-fiscais/:id/xml` — baixa o XML (autorizado, se disponível).
- `GET /notas-fiscais/status-sefaz` — consulta o status do serviço da SEFAZ configurada.

## Estrutura

- `src/config` — variáveis de ambiente e endpoints da SEFAZ por UF (hoje só SP está preenchido).
- `src/certificado` — carga do `.pfx` (node-forge) e disponibilização de chave/certificado para assinatura e mTLS.
- `src/notas-fiscais/xml` — montagem do XML NFe 4.00 e assinatura digital (xml-crypto).
- `src/notas-fiscais/sefaz` — cliente SOAP para os webservices da SEFAZ-SP.
- `src/notas-fiscais` — entidades, DTOs, service e controller de emissão/histórico.

## Limitações conhecidas

- Só SP está configurado em `sefaz-endpoints.ts`; outras UFs exigem adicionar os endpoints (a maioria usa o ambiente SVRS compartilhado).
- Não há cancelamento, carta de correção ou inutilização de numeração implementados.
- Não gera DANFE/DANFCE em PDF — apenas o XML.
- Fluxo de autorização assíncrona (lote não processado na hora) não é tratado; assume-se `indSinc=1` (resposta síncrona).
