# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é este projeto

API NestJS para emissão de notas fiscais de venda como MEI — NF-e (modelo 55) e NFC-e (modelo 65) — com integração **direta** aos webservices SOAP da SEFAZ-SP (sem provedor terceirizado). Uma instância = um único CNPJ emitente, configurado via variáveis de ambiente. Não é um ERP: só cobre a emissão fiscal da venda.

Documentação completa em `docs/`: `visao-geral.md` (motivação/escopo), `arquitetura.md` (stack, fluxo de emissão, modelo de dados), `guia-fiscal.md` (NF-e vs NFC-e, CSOSN/CFOP/NCM, certificado digital), `integracao-sefaz.md` (webservices, SOAP, mTLS, códigos de retorno), `roadmap.md` (limitações conhecidas), `api.md` (referência de endpoints).

## Comandos

```bash
npm run start:dev      # sobe a aplicação com watch (usa NODE_OPTIONS=--use-system-ca, necessário para o TLS da SEFAZ/ICP-Brasil)
npm run build           # nest build
npm run lint             # eslint --fix sobre src/apps/libs/test
npm run format           # prettier sobre src/ e test/
npm test                 # testes unitários (Jest)
npm run test:watch       # Jest em modo watch
npx jest caminho/para/arquivo.spec.ts   # rodar um único teste
npm run test:cov         # Jest com cobertura
npm run test:e2e         # testes e2e (config em test/jest-e2e.json)
```

Banco local via `docker compose up -d` (PostgreSQL, variáveis lidas do `.env`). Rode `npm run lint` e `npm test` antes de abrir um PR.

## Arquitetura

Aplicação Nest single-process, sem fila/worker — `POST /notas-fiscais` só retorna depois que a SEFAZ responde (ou falha), latência de alguns segundos é esperada nesse endpoint.

### Fluxo de emissão (`NotasFiscaisService.emitir`, chamado por `POST /notas-fiscais`)

1. **Validação** — `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`); o service rejeita NF-e (modelo 55) sem `destinatario.documento` (NFC-e pode ser sem destinatário identificado).
2. **Reserva de número** — transação com `pessimistic_write` na tabela `numeracao_controle` (chave: modelo + série) para numeração sequencial sob concorrência.
3. **Chave de acesso** — `common/utils/chave-acesso.util.ts` monta os 43 dígitos + dígito verificador (módulo 11).
4. **Montagem do XML** — `notas-fiscais/xml/nfe-xml-builder.service.ts` gera o NFe 4.00 completo, assumindo o cenário padrão MEI/Simples Nacional (CRT 1, CSOSN 102 por item, PIS/COFINS CST 49, sem ICMS destacado).
5. **Assinatura** — `notas-fiscais/xml/nfe-xml-signer.service.ts` assina `<infNFe>` (enveloped signature, C14N, RSA-SHA1 — exigência do layout da NF-e, não escolha do projeto) com a chave extraída do `.pfx`.
6. **Persistência antes do envio** — a nota é salva com `status: ASSINADA` **antes** de chamar a SEFAZ, para não perder o registro em caso de falha de rede.
7. **Envio à SEFAZ** — `notas-fiscais/sefaz/sefaz-client.service.ts` (`autorizar`) envia via SOAP `NFeAutorizacao4`, sempre lote síncrono (`indSinc=1`). `cStat 100` → `AUTORIZADA` (XML final vira `<nfeProc>`); outra rejeição → `REJEITADA`; erro de comunicação → `ERRO` com mensagem truncada em `motivoStatus`.

Mudanças em `sefaz-client.service.ts`, `nfe-xml-builder.service.ts` ou `nfe-xml-signer.service.ts` idealmente devem ser validadas com uma emissão real em homologação (`SEFAZ_AMBIENTE=2`), não só com testes unitários — rejeições da SEFAZ por XML malformado costumam vir com `cStat` genérico, difícil de prever sem testar contra o serviço real.

### Certificado digital e mTLS

`CertificadoService` (`src/certificado/`) lê o `.pfx` uma única vez no `OnModuleInit` e expõe dois usos do mesmo certificado:
- PEM (via `node-forge`) para a assinatura XML (`NfeXmlSignerService`).
- Um `https.Agent` (pfx bruto + senha) para mTLS em toda chamada SOAP à SEFAZ (`soap-http.util.ts`).

Se o `.pfx` não existir no caminho configurado, a aplicação sobe normalmente, mas qualquer operação que dependa dele falha com mensagem explícita. Só certificado **A1** (arquivo `.pfx`) é suportado, e precisa ser um **e-CNPJ** — um e-CPF (mesmo com procuração e-CAC) não serve, pois a SEFAZ valida o CNPJ embutido no próprio certificado (rejeição típica: `cStat 282`).

### SOAP com a SEFAZ

Sem biblioteca SOAP externa: `notas-fiscais/sefaz/soap-envelope.util.ts` monta o envelope SOAP 1.2 manualmente (layout 4.00, sem `nfeCabecMsg`) e `soap-http.util.ts` faz o POST com `https` nativo do Node usando o agent mTLS. Endpoints por UF/ambiente em `src/config/sefaz-endpoints.ts` — **hoje só SP está configurado**; outras UFs normalmente usam o ambiente SVRS compartilhado e exigiriam adicionar URLs novas ali.

Webservices usados: `NFeStatusServico4` (consulta status) e `NFeAutorizacao4` (autorização) — expostos via HTTP. `NFeConsultaProtocolo4` está implementado no client mas não exposto como endpoint. `NFeRetAutorizacao4` (retorno de lote assíncrono), `NFeInutilizacao4` e `NFeRecepcaoEvento4` (cancelamento, CC-e) não estão implementados.

### Modelo de dados (TypeORM + PostgreSQL)

- `notas_fiscais` — uma linha por tentativa de emissão (mesmo rejeitadas ficam registradas); destinatário desnormalizado em JSONB; guarda `xml_assinado`/`xml_autorizado`, `protocolo`, `status`, `codigo_status`/`motivo_status`.
- `itens_nota` — um-para-muitos com `notas_fiscais` (`ON DELETE CASCADE`, eager), guarda os dados fiscais do item **no momento da emissão** (mesmo que o cadastro de produto mude depois).
- `numeracao_controle` — uma linha por `modelo` + `serie`; única tabela usada com lock pessimista.

Em desenvolvimento o schema é criado via `DB_SYNCHRONIZE=true` — não há migrations versionadas.

## Convenções do projeto

- **Nomes em português para conceitos de domínio fiscal** (`NotaFiscal`, `chaveAcesso`, `naturezaOperacao`) — o domínio (legislação fiscal brasileira) é em português, mantenha a consistência mesmo em código novo.
- **Comentários só quando o "porquê" fiscal/técnico não é óbvio** (ex.: por que RSA-SHA1 ainda é exigido na assinatura). Não comente o óbvio.
- **Regras fiscais assumidas como padrão, não verdade universal** — mudanças em CSOSN/CST/CFOP padrão devem deixar claro (código ou doc) que é uma convenção assumida para o cenário MEI/Simples Nacional comum, já que cada CNPJ pode ter particularidades. Não valide dados fiscais no builder além do que já existe — quem chama a API é responsável por informar valores corretos.
- **Sempre `SEFAZ_AMBIENTE=2` (homologação) para testes** — nunca validar mudanças de integração direto em produção. Notas emitidas em homologação não têm valor fiscal.
- Ao adicionar suporte a uma nova UF, confirme a URL vigente no Manual de Integração do Contribuinte antes de codificar — a Receita/SEFAZ pode alterar endereços entre versões do layout.
