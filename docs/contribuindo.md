# Contribuindo

Contribuições são bem-vindas — de correções pontuais a novos itens do [roadmap](roadmap.md). Este projeto começou para resolver um caso pessoal (venda de sucos como MEI), mas foi pensado para servir qualquer MEI que venda mercadorias.

## Rodando localmente

Veja o passo a passo completo em [Instalação e configuração](instalacao-e-configuracao.md). Resumo:

```bash
npm install
cp .env.example .env   # preencha com seus dados (ou dados de teste, para homologação)
docker compose up -d
npm run start:dev
```

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run start:dev` | Sobe a aplicação em modo watch |
| `npm run build` | Compila o projeto (`nest build`) |
| `npm run lint` | ESLint com `--fix` |
| `npm run format` | Prettier sobre `src/` e `test/` |
| `npm test` | Testes unitários (Jest) |
| `npm run test:watch` | Testes unitários em modo watch |
| `npm run test:cov` | Testes unitários com cobertura |
| `npm run test:cov:open` | Testes unitários com cobertura + abre o relatório HTML |
| `npm run test:report:open` | Testes unitários + abre o dashboard de casos (jest-html-reporters) |
| `npm run test:e2e` | Testes end-to-end |
| `npm run test:integration` | Testes de integração (Postgres descartável via Docker — veja abaixo) |
| `npm run test:integration:report:open` | Abre o dashboard dos testes de integração |

Rode `npm run lint` e `npm test` antes de abrir um PR.

### Testes de integração

Além dos testes unitários (tudo mockado), há testes de integração em `test/integration/`, que rodam contra um Postgres descartável real (não o de desenvolvimento): `npm run test:integration` sobe o container (`docker-compose.test.yml`, porta 5433), roda os testes com o schema sincronizado automaticamente, e derruba o container ao final — exige o Docker rodando. Use para validar mudanças que dependem de comportamento real do banco (ex.: o lock pessimista de `numeracao_controle`) ou o fluxo HTTP completo (request → validação → persistência → resposta), não só a lógica isolada.

## Convenções do projeto

- **TypeScript estrito**, seguindo os padrões já usados no código (DTOs com `class-validator`, entidades TypeORM, services injetáveis do Nest).
- **Nomes em português** para conceitos de domínio fiscal (`NotaFiscal`, `chaveAcesso`, `naturezaOperacao`) — mantenha a consistência, já que o domínio (legislação fiscal brasileira) é em português.
- **Comentários só quando o "porquê" não é óbvio** — várias partes do XML/SOAP têm comentários explicando exigências específicas do layout da NF-e (ex.: por que SHA-1 ainda é usado na assinatura). Siga esse padrão: não comente o óbvio, comente a particularidade fiscal/técnica que não seria óbvia de outra forma.
- **Mudanças em regras fiscais** (CSOSN, CST, CFOP padrão) devem deixar claro, no código ou na doc, que são um *padrão* assumido — não uma verdade universal — já que cada MEI pode ter uma situação diferente. Veja [Guia fiscal](guia-fiscal.md).

## Testando contra a SEFAZ

- Use sempre `SEFAZ_AMBIENTE=2` (homologação) para testes — nunca valide mudanças de integração direto em produção.
- Mudanças em `sefaz-client.service.ts`, `nfe-xml-builder.service.ts` ou `nfe-xml-signer.service.ts` idealmente devem ser validadas com uma emissão real de teste em homologação, não só com testes unitários — o retorno da SEFAZ para XML malformado costuma ser um `cStat` genérico de rejeição, difícil de prever sem testar contra o serviço real.
- Se for adicionar suporte a uma nova UF, veja [Roadmap § Suporte a outras UFs](roadmap.md#ideias-de-evolução) e confirme a URL vigente no Manual de Integração do Contribuinte antes de codificar — a Receita/SEFAZ pode alterar endereços entre versões do layout.

## Reportando problemas

Ao abrir uma issue sobre uma rejeição da SEFAZ, inclua (removendo dados sensíveis como CNPJ/CPF reais):

- O `cStat` e `xMotivo` retornados.
- O modelo (`55`/`65`) e se o teste foi em homologação ou produção.
- Se possível, o XML gerado (sem a assinatura/certificado, que não é sensível, mas evite publicar CNPJ real se o teste não for com dados fictícios).

## Próximos passos

- [Roadmap](roadmap.md) — itens em aberto para contribuir.
- [Arquitetura](arquitetura.md) — como o código está organizado antes de mexer.
