# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é este projeto

API NestJS para emissão de notas fiscais de venda como MEI — NF-e (modelo 55) e NFC-e (modelo 65) — com integração **direta** aos webservices SOAP da SEFAZ-SP (sem provedor terceirizado). Uma instância = um único CNPJ emitente, configurado via variáveis de ambiente. Não é um ERP: só cobre a emissão fiscal da venda.

Documentação completa em `docs/`: `visao-geral.md` (motivação/escopo), `arquitetura.md` (stack, fluxo de emissão, modelo de dados), `guia-fiscal.md` (NF-e vs NFC-e, CSOSN/CFOP/NCM, certificado digital), `integracao-sefaz.md` (webservices, SOAP, mTLS, códigos de retorno), `roadmap.md` (limitações conhecidas), `api.md` (referência de endpoints).

## Agentes especialistas do projeto

Este repositório define subagentes em `.claude/agents/` para as áreas de maior risco/especificidade do projeto. Prefira delegar a eles em vez de tentar cobrir tudo sozinho quando a tarefa cair claramente em um desses domínios:

| Agente | Quando usar |
|---|---|
| `nestjs-backend-specialist` | Endpoints, services, DTOs, entidades TypeORM, mudanças no fluxo de emissão — implementação geral de backend NestJS. |
| `sql-specialist` | Modelagem de schema, queries, índices, migrations, transações e locking no PostgreSQL/TypeORM. |
| `contabilidade-fiscal-specialist` | Dúvidas ou validação sobre CSOSN, CST, CFOP, NCM, CRT, regras de MEI/Simples Nacional, diagnóstico de rejeição da SEFAZ (`cStat`/`xMotivo`). |
| `security-crypto-specialist` | Certificado digital (`.pfx`), mTLS, assinatura XML-DSig, tratamento de segredos (senha do certificado, chave privada, CNPJ/CPF). |
| `testing-specialist` | Escrever/revisar testes unitários e e2e (Jest), incluindo como mockar certificado, banco e respostas SOAP da SEFAZ. |
| `logging-specialist` | Desenhar e implementar logging — o que logar em cada camada, nível, correlação entre logs de uma mesma emissão, o que nunca logar. |

Cada agente tem seu próprio arquivo com o detalhamento das convenções específicas daquele domínio — leia o arquivo correspondente antes de delegar uma tarefa complexa.

## Como abordar uma tarefa

Antes de alterar qualquer código:

1. Entenda o problema e o comportamento esperado.
2. Localize os arquivos e implementações semelhantes envolvidos na funcionalidade, antes de criar algo novo.
3. Identifique services, repositories, controllers, DTOs, entidades TypeORM e testes relacionados, e os padrões/versões das tecnologias já usadas no módulo afetado.
4. Verifique as chamadas e dependências do código afetado, e possíveis efeitos colaterais.
5. Confirme se já existe helper, utilitário ou service reutilizável (`common/utils/`, services injetáveis do Nest) antes de criar um novo.
6. Verifique como transações e acesso ao banco são tratados no fluxo atual (`Repository` injetado para leitura/escrita simples, `dataSource.transaction` só onde já existe, como em `numeracao_controle`).
7. Verifique impactos em regras de negócio fiscais e nos endpoints da API — este projeto não tem front-end.
8. Para alterações de maior impacto (mudança de schema, do fluxo de emissão ou da integração SEFAZ), apresente um plano breve antes de implementar.

Ao decidir entre abordagens, priorize nesta ordem: **correção e aderência ao projeto** → manutenibilidade/legibilidade → testabilidade → performance → simplicidade.

## Controle de escopo

- Altere somente os arquivos necessários para atender à solicitação.
- Não formate arquivos inteiros quando a alteração for localizada.
- Não refatore código não relacionado à tarefa.
- Não renomeie classes, métodos, campos, endpoints ou entidades sem necessidade.
- Não altere contratos públicos (endpoints, DTOs, assinaturas de service) sem explicitar o impacto.
- Não altere versões de dependências nem introduza novas bibliotecas sem autorização explícita.
- Não mude a arquitetura de um módulo apenas por preferência técnica.
- Prefira alterações pequenas, incrementais e revisáveis.
- Preserve compatibilidade com o comportamento existente, salvo quando a mudança for parte explícita da tarefa.

## Regras gerais

- Não crie abstrações sem pelo menos um caso concreto de reutilização.
- Mantenha linhas com no máximo 120 caracteres.
- Escreva código, comentários, testes e commits em português do Brasil — já é o padrão do projeto para o domínio fiscal.
- Não execute comandos destrutivos sem autorização explícita.
- Não faça commit ou push sem solicitação explícita.

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
npm run test:cov:open    # test:cov + abre o relatório HTML (Istanbul) no navegador
npm run test:report:open # roda os testes unitários + abre o dashboard (jest-html-reporters)
npm run test:e2e         # testes e2e (config em test/jest-e2e.json)
npm run test:integration # testes de integração: sobe Postgres descartável (Docker), roda, derruba
npm run test:integration:report:open  # abre o dashboard dos testes de integração (rodar test:integration antes)
```

Banco local via `docker compose up -d` (PostgreSQL, variáveis lidas do `.env`). Rode `npm run lint` e `npm test` antes de abrir um PR.

### Testes de integração

`npm run test:integration` (via `scripts/rodar-testes-integracao.js`) sobe um Postgres descartável isolado (`docker-compose.test.yml`, porta 5433, `tmpfs`, sem volume — nunca toca no banco de desenvolvimento), roda `test/integration/**/*.integration-spec.ts` contra ele com `DB_SYNCHRONIZE=true`, e sempre derruba o container no final (mesmo se os testes falharem). Exige Docker rodando. Diferente dos testes unitários (tudo mockado), aqui só `CertificadoService`/`SefazClientService` são mockados (na borda do processo — nunca rede real) — banco, TypeORM, montagem e assinatura do XML são reais. É o único jeito de validar de verdade o lock pessimista de `numeracao_controle` sob concorrência real.

Cada suíte de testes (unitária, integração) gera seu próprio dashboard HTML via `jest-html-reporters` (lista de casos + link para a cobertura), em `test-report/unit/` e `test-report/integration/` — ambos artefatos locais, fora do controle de versão.

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

### Padrões de back-end

- Respeite a separação **controller (HTTP) → service (regra de negócio) → repository/entity (TypeORM)** — controllers ficam finos e delegam ao service; regra de negócio nunca vai para o controller ou para a entidade.
- Use o `Repository` injetado (`@InjectRepository`) para leitura e escrita simples. Use `dataSource.transaction(manager => ...)` (via `@InjectDataSource`) só quando a operação precisar da mesma garantia transacional já usada em `numeracao_controle` — não abra transação nova sem necessidade comprovada.
- Preserve as fronteiras transacionais existentes, em especial a ordem do fluxo de emissão descrita acima (numeração → XML → assinatura → persistência antes do envio SEFAZ → envio → atualização de status).
- Mantenha métodos curtos, coesos e com responsabilidade única.
- Prefira `?.`/`??` do TypeScript para checagens de nulidade quando isso melhorar a legibilidade.
- Não registre credenciais, senha do certificado, chave privada ou dados sensíveis (CNPJ/CPF) em logs.

## Convenções do projeto

- **Nomes em português para conceitos de domínio fiscal** (`NotaFiscal`, `chaveAcesso`, `naturezaOperacao`) — o domínio (legislação fiscal brasileira) é em português, mantenha a consistência mesmo em código novo.
- **Comentários só quando o "porquê" fiscal/técnico não é óbvio** (ex.: por que RSA-SHA1 ainda é exigido na assinatura). Não comente o óbvio.
- **Regras fiscais assumidas como padrão, não verdade universal** — mudanças em CSOSN/CST/CFOP padrão devem deixar claro (código ou doc) que é uma convenção assumida para o cenário MEI/Simples Nacional comum, já que cada CNPJ pode ter particularidades. Não valide dados fiscais no builder além do que já existe — quem chama a API é responsável por informar valores corretos.
- **Sempre `SEFAZ_AMBIENTE=2` (homologação) para testes** — nunca validar mudanças de integração direto em produção. Notas emitidas em homologação não têm valor fiscal.
- Ao adicionar suporte a uma nova UF, confirme a URL vigente no Manual de Integração do Contribuinte antes de codificar — a Receita/SEFAZ pode alterar endereços entre versões do layout.
