# EmissorNF

API (NestJS) para **emissão de notas fiscais de venda como MEI** — NF-e (modelo 55) e NFC-e (modelo 65) — com integração **direta** aos webservices da SEFAZ (hoje, SEFAZ-SP) e documentação Swagger.

## Por que este projeto existe

Quem é MEI (Microempreendedor Individual) e vende mercadoria — sucos, doces, roupas, artesanato, revenda, qualquer produto — normalmente precisa escolher entre um emissor manual do estado ou pagar mensalidade a um provedor terceirizado só para emitir nota fiscal. O EmissorNF é uma alternativa: uma API própria, sem custo por nota, que fala diretamente com a SEFAZ.

O projeto nasceu documentando um caso real (venda de sucos), mas **não é específico de nenhum ramo**: código do produto, NCM, CFOP, quantidade e valor são parametrizáveis por venda, então o mesmo serviço emite notas para qualquer MEI que venda mercadorias. Veja a motivação completa em [docs/visao-geral.md](docs/visao-geral.md).

## ⚠️ Antes de emitir notas reais

Este projeto foi montado para rodar contra o ambiente de **homologação** da SEFAZ. Ele cobre o cenário comum de MEI/Simples Nacional (CSOSN 102, PIS/COFINS CST 49, sem ICMS destacado), mas:

- **Confirme com um contador** o NCM de cada produto, o CFOP correto e se CSOSN 102 é mesmo o adequado ao seu caso.
- **Teste extensivamente em homologação** antes de apontar para produção. A consulta de status (`NFeStatusServico4`) já foi validada contra a SEFAZ-SP real; o fluxo de autorização (`NFeAutorizacao4`) ainda precisa ser testado ponta a ponta com um certificado **e-CNPJ** (só ele funciona — veja por quê em [docs/guia-fiscal.md](docs/guia-fiscal.md#certificado-digital)). Detalhes em [docs/integracao-sefaz.md](docs/integracao-sefaz.md).
- Notas emitidas em homologação **não têm valor fiscal**.

Leia o [Guia fiscal](docs/guia-fiscal.md) antes de emitir a primeira nota real.

## Quick start

```bash
git clone <url-do-repositorio>
cd emissornf
npm install
cp .env.example .env      # preencha CNPJ, endereço, banco de dados etc.
# coloque o certificado .pfx em certs/certificado.pfx
docker compose up -d      # sobe o PostgreSQL
npm run start:dev
```

A API sobe em `http://localhost:3000` e a documentação Swagger em `http://localhost:3000/docs`.

Passo a passo detalhado (incluindo todas as variáveis de ambiente): [docs/instalacao-e-configuracao.md](docs/instalacao-e-configuracao.md).

## Principais endpoints

- `POST /notas-fiscais` — monta o XML, assina com o certificado e envia para autorização na SEFAZ.
- `GET /notas-fiscais` — histórico de notas emitidas (filtros por `status`, `modelo`, paginação).
- `GET /notas-fiscais/:id` — detalhe de uma nota.
- `GET /notas-fiscais/:id/xml` — baixa o XML (autorizado, se disponível).
- `GET /notas-fiscais/status-sefaz` — consulta o status do serviço da SEFAZ configurada.

Referência completa, com exemplos de payload: [docs/api.md](docs/api.md).

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/visao-geral.md](docs/visao-geral.md) | A ideia do projeto, para quem é e por que integração direta com a SEFAZ |
| [docs/instalacao-e-configuracao.md](docs/instalacao-e-configuracao.md) | Requisitos, setup local, Docker, certificado, todas as variáveis de ambiente |
| [docs/api.md](docs/api.md) | Referência dos endpoints com exemplos de request/response |
| [docs/arquitetura.md](docs/arquitetura.md) | Stack, estrutura de pastas, fluxo de emissão e modelo de dados |
| [docs/guia-fiscal.md](docs/guia-fiscal.md) | NF-e vs NFC-e, MEI/Simples Nacional, NCM/CFOP/CSOSN, certificado digital |
| [docs/integracao-sefaz.md](docs/integracao-sefaz.md) | Webservices usados, protocolo SOAP/mTLS, códigos de retorno, status real de teste |
| [docs/roadmap.md](docs/roadmap.md) | Limitações conhecidas e próximos passos |
| [docs/contribuindo.md](docs/contribuindo.md) | Como rodar, testar e contribuir |

## Licença

Sem licença definida (`UNLICENSED`) — consulte o autor do repositório antes de reutilizar em produção.
