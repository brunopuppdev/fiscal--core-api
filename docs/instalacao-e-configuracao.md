# Instalação e configuração

## Requisitos

- Node.js 20+
- PostgreSQL (local, ou via Docker — ver abaixo)
- Certificado digital **A1** (arquivo `.pfx`) do CNPJ do MEI, ou um e-CPF com procuração eletrônica vinculada ao CNPJ (veja [Guia fiscal](guia-fiscal.md#certificado-digital))

## Passo a passo

```bash
git clone <url-do-repositorio>
cd emissornf
npm install
cp .env.example .env
```

1. Edite o `.env` com os dados do seu CNPJ, endereço e credenciais do banco (veja a [referência completa de variáveis](#referência-de-variáveis-de-ambiente) abaixo).
2. Coloque o certificado `.pfx` em `certs/certificado.pfx` (ou aponte `CERTIFICADO_PATH` para outro caminho).
3. Suba o banco de dados:

   ```bash
   docker compose up -d
   ```

4. Suba a aplicação:

   ```bash
   npm run start:dev
   ```

A API sobe em `http://localhost:3000` (ou na porta definida em `PORT`) e a documentação interativa Swagger em `http://localhost:3000/docs`.

## Banco de dados via Docker

O `docker-compose.yml` sobe um PostgreSQL local usando as mesmas variáveis do `.env` (`DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `DB_PORT`):

```bash
docker compose up -d      # sobe o banco
docker compose ps         # confere status
docker compose down       # para (mantém os dados no volume)
```

Se preferir, aponte `DB_HOST`/`DB_PORT`/etc. no `.env` para uma instância própria de PostgreSQL já existente — o Docker Compose é só uma conveniência.

## Conectividade com a SEFAZ (Node + TLS)

O Node.js não confia por padrão na cadeia de certificado TLS usada pelos servidores da SEFAZ (ICP-Brasil), então as chamadas SOAP falhariam com `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` a menos que o Node também use o repositório de certificados do sistema operacional. Por isso os scripts `start` / `start:dev` / `start:prod` já rodam com `NODE_OPTIONS=--use-system-ca` (via `cross-env`) — funciona em qualquer SO, desde que o próprio SO já confie na cadeia (o que normalmente já é o caso no Windows/Linux atualizados).

Você não precisa configurar nada extra para isso — é automático ao usar os scripts do `package.json`.

## Referência de variáveis de ambiente

Todas as variáveis abaixo estão documentadas em [`.env.example`](../.env.example).

### Aplicação

| Variável | Descrição | Padrão |
|---|---|---|
| `PORT` | Porta HTTP da API | `3000` |

### Banco de dados (PostgreSQL)

| Variável | Descrição | Padrão |
|---|---|---|
| `DB_HOST` | Host do PostgreSQL | `localhost` |
| `DB_PORT` | Porta do PostgreSQL | `5432` |
| `DB_USERNAME` | Usuário do banco | `postgres` |
| `DB_PASSWORD` | Senha do banco | `postgres` |
| `DB_DATABASE` | Nome do banco | `emissornf` |
| `DB_SYNCHRONIZE` | Se `true`, o TypeORM cria/atualiza as tabelas automaticamente a partir das entidades (conveniente em desenvolvimento; **desative em produção** e use migrations) | `true` |

### Ambiente SEFAZ

| Variável | Descrição | Padrão |
|---|---|---|
| `SEFAZ_AMBIENTE` | `1` = Produção, `2` = Homologação | `2` |
| `SEFAZ_UF` | UF do emitente (define quais endpoints da SEFAZ são usados — hoje só `SP` está implementado, veja [Roadmap](roadmap.md)) | `SP` |

### Certificado digital

| Variável | Descrição | Padrão |
|---|---|---|
| `CERTIFICADO_PATH` | Caminho do arquivo `.pfx` do certificado A1 | `./certs/certificado.pfx` |
| `CERTIFICADO_SENHA` | Senha do certificado | — |

### Dados do emitente (MEI)

| Variável | Descrição |
|---|---|
| `EMITENTE_CNPJ` | CNPJ do MEI (14 dígitos, sem máscara) |
| `EMITENTE_RAZAO_SOCIAL` | Razão social |
| `EMITENTE_NOME_FANTASIA` | Nome fantasia |
| `EMITENTE_IE` | Inscrição Estadual (ou `ISENTO`) |
| `EMITENTE_CRT` | Código de Regime Tributário — `1` = Simples Nacional (inclui MEI) |
| `EMITENTE_LOGRADOURO` | Logradouro do endereço |
| `EMITENTE_NUMERO` | Número do endereço |
| `EMITENTE_COMPLEMENTO` | Complemento (opcional) |
| `EMITENTE_BAIRRO` | Bairro |
| `EMITENTE_MUNICIPIO` | Nome do município |
| `EMITENTE_COD_MUNICIPIO` | Código IBGE do município (ex.: `3550308` para São Paulo) |
| `EMITENTE_UF` | UF (2 letras) |
| `EMITENTE_CEP` | CEP (sem máscara) |
| `EMITENTE_TELEFONE` | Telefone (opcional) |

### Numeração dos documentos fiscais

| Variável | Descrição | Padrão |
|---|---|---|
| `NFE_SERIE` | Série usada para NF-e (modelo 55) | `1` |
| `NFCE_SERIE` | Série usada para NFC-e (modelo 65) | `1` |

O número sequencial dentro de cada série é controlado automaticamente pela aplicação (tabela `numeracao_controle`) — veja [Arquitetura](arquitetura.md#modelo-de-dados).

## Próximos passos

- [Referência da API](api.md)
- [Guia fiscal](guia-fiscal.md) — antes de emitir notas reais, confirme os dados fiscais com seu contador.
