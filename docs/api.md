# Referência da API

Documentação interativa (Swagger) disponível em `http://localhost:3000/docs` com a aplicação rodando. Esta página é um resumo estático dos mesmos endpoints, com exemplos de payload.

Todas as rotas estão sob o prefixo `/notas-fiscais`.

## `POST /notas-fiscais`

Monta o XML da nota, assina com o certificado digital configurado e envia para autorização na SEFAZ — tudo em uma única chamada síncrona.

### Corpo da requisição

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `modelo` | `"55"` \| `"65"` | sim | `55` = NF-e (venda para CNPJ/CPF identificado), `65` = NFC-e (consumidor final, venda de balcão) |
| `naturezaOperacao` | string | não (padrão `"VENDA"`) | Natureza da operação |
| `destinatario` | objeto | **obrigatório para `55`**, opcional para `65` | Dados de quem está comprando |
| `destinatario.nome` | string | não | Nome do destinatário |
| `destinatario.documento` | string | condicional | CPF (11 dígitos) ou CNPJ (14 dígitos). Obrigatório em NF-e; pode ser omitido em NFC-e para consumidor não identificado |
| `destinatario.email` | string | não | E-mail do destinatário |
| `destinatario.endereco` | objeto | não | `logradouro`, `numero`, `bairro`, `municipio`, `codMunicipio` (código IBGE), `uf`, `cep` |
| `itens` | array (mín. 1) | sim | Itens vendidos |
| `itens[].codigo` | string | sim | Código interno do produto |
| `itens[].descricao` | string | sim | Descrição do produto |
| `itens[].ncm` | string (8 dígitos) | sim | NCM do produto — confirme com o contador |
| `itens[].cfop` | string (4 dígitos) | sim | CFOP da operação (ex.: `5102` venda dentro do estado, `6102` fora do estado) |
| `itens[].unidade` | string | não (padrão `"UN"`) | Unidade comercial |
| `itens[].quantidade` | number (> 0) | sim | Quantidade vendida |
| `itens[].valorUnitario` | number (> 0) | sim | Valor unitário do item |
| `itens[].csosn` | string | não (padrão `"102"`) | CSOSN do Simples Nacional/MEI |
| `formaPagamento` | string (2 dígitos) | sim | Código SEFAZ da forma de pagamento (grupo `pag/detPag` do XML): `01` Dinheiro, `02` Cheque, `03` Cartão de Crédito, `04` Cartão de Débito, `05` Crédito Loja, `10` Vale Alimentação, `11` Vale Refeição, `12` Vale Presente, `13` Vale Combustível, `14` Duplicata Mercantil, `15` Boleto Bancário, `16` Depósito Bancário, `17` PIX, `18` Transferência bancária/Carteira Digital, `19` Fidelidade/Cashback, `90` Sem pagamento, `99` Outros |
| `troco` | number (>= 0) | não (padrão `0`) | Troco dado ao cliente (grupo `pag/vTroco` do XML). Só relevante em vendas em dinheiro com valor recebido maior que o total — `vPag` passa a refletir o valor total + troco |

### Exemplo — NFC-e (venda de balcão, consumidor não identificado)

```json
{
  "modelo": "65",
  "itens": [
    {
      "codigo": "SUCO-LARANJA-500",
      "descricao": "Suco de laranja natural 500ml",
      "ncm": "20098990",
      "cfop": "5102",
      "unidade": "UN",
      "quantidade": 2,
      "valorUnitario": 12.5
    }
  ],
  "formaPagamento": "17"
}
```

### Exemplo — NF-e (venda com destinatário identificado)

```json
{
  "modelo": "55",
  "naturezaOperacao": "VENDA",
  "destinatario": {
    "nome": "João da Silva",
    "documento": "12345678900",
    "email": "cliente@example.com",
    "endereco": {
      "logradouro": "Rua das Flores",
      "numero": "123",
      "bairro": "Centro",
      "municipio": "São Paulo",
      "codMunicipio": "3550308",
      "uf": "SP",
      "cep": "01001000"
    }
  },
  "itens": [
    {
      "codigo": "SUCO-LARANJA-500",
      "descricao": "Suco de laranja natural 500ml",
      "ncm": "20098990",
      "cfop": "5102",
      "quantidade": 10,
      "valorUnitario": 12.5,
      "csosn": "102"
    }
  ],
  "formaPagamento": "03"
}
```

### Resposta

Retorna a nota fiscal persistida, incluindo o resultado do envio à SEFAZ (`status`, `protocolo`, `motivoStatus`). Veja a estrutura completa em [Objeto de resposta](#objeto-nota-fiscal).

> A chamada só retorna depois que a SEFAZ responde (fluxo síncrono, `indSinc=1`). Se a SEFAZ rejeitar a nota, o registro é salvo mesmo assim, com `status: "REJEITADA"` e o motivo em `motivoStatus` — não é necessário reenviar do zero, mas uma nova emissão (com um novo número) será necessária após corrigir o problema.

## `GET /notas-fiscais`

Lista o histórico de notas emitidas, com filtros e paginação.

### Query params

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `status` | enum | Filtra por `RASCUNHO`, `ASSINADA`, `ENVIADA`, `AUTORIZADA`, `REJEITADA`, `CANCELADA`, `ERRO` |
| `modelo` | `"55"` \| `"65"` | Filtra por modelo |
| `pagina` | number | Página (padrão `1`) |
| `tamanhoPagina` | number | Itens por página (padrão `20`, máximo `100`) |

### Resposta

```json
{
  "dados": [ /* array de objetos Nota Fiscal */ ],
  "total": 42
}
```

## `GET /notas-fiscais/status-sefaz`

Consulta o status do webservice `NFeStatusServico4` da SEFAZ configurada (UF + ambiente do `.env`). Útil para verificar se o serviço da Receita está operante antes de tentar emitir.

Em SP, NF-e (modelo 55) e NFC-e (modelo 65) usam domínios de webservice diferentes — por isso este endpoint aceita um `modelo` para escolher qual conjunto de endpoints consultar.

### Query params

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `modelo` | `"55"` \| `"65"` | Modelo consultado (padrão `"65"`, o mais comum em PDV/MEI) |

### Resposta

```json
{
  "cStat": "107",
  "xMotivo": "Servico em Operacao",
  "emOperacao": true
}
```

## `GET /notas-fiscais/:id`

Detalha uma nota fiscal pelo ID interno (UUID gerado pela aplicação, não a chave de acesso). Retorna `404` se não encontrada.

## `GET /notas-fiscais/:id/xml`

Baixa o XML da nota — o autorizado (`<nfeProc>`, com o protocolo da SEFAZ embutido) se disponível, ou apenas o assinado caso a nota ainda não tenha sido autorizada. Retorna `Content-Type: application/xml`. Retorna `404` se a nota não tiver XML disponível ainda.

## `GET /notas-fiscais/:id/pdf`

Gera o documento auxiliar em PDF — DANFE (retrato) para NF-e (modelo 55) ou DANFCE (cupom, folha A4) para NFC-e (modelo 65). O layout é escolhido automaticamente pelo `modelo` da nota, sem necessidade de query param.

Só funciona para notas com `status: "AUTORIZADA"` — é o único status em que existem `xmlAutorizado` e `protocolo`, dos quais o PDF depende (data/hora de autorização, QR Code da NFC-e e o texto exato de informações complementares vêm do XML autorizado, não das colunas soltas do banco, para garantir fidelidade ao que foi realmente aceito pela SEFAZ). Para qualquer outro status, retorna `409 Conflict`. Retorna `404` se a nota não existir.

Retorna `Content-Type: application/pdf`.

## Objeto "Nota Fiscal"

Formato retornado por `POST /notas-fiscais`, `GET /notas-fiscais` (dentro de `dados`) e `GET /notas-fiscais/:id`:

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string (UUID) | ID interno |
| `modelo` | `"55"` \| `"65"` | Modelo do documento |
| `serie` | number | Série usada |
| `numero` | number | Número sequencial dentro da série |
| `chaveAcesso` | string (44 dígitos) | Chave de acesso da NF-e/NFC-e |
| `status` | enum | `RASCUNHO`, `ASSINADA`, `ENVIADA`, `AUTORIZADA`, `REJEITADA`, `CANCELADA`, `ERRO` |
| `valorTotal` | string | Soma dos itens |
| `formaPagamento` | string (2 dígitos) | Código SEFAZ da forma de pagamento informada na emissão (grupo `pag/detPag` do XML) |
| `troco` | string | Troco dado ao cliente (grupo `pag/vTroco` do XML), `"0.00"` quando não informado |
| `protocolo` | string \| null | Número de protocolo de autorização da SEFAZ (quando autorizada) |
| `motivoStatus` | string \| null | Motivo retornado pela SEFAZ (autorização, rejeição, ou erro de comunicação) |
| `dataEmissao` | datetime | Data/hora de emissão |
| `dataAutorizacao` | datetime \| null | Data/hora em que a SEFAZ autorizou a nota |

## Próximos passos

- [Arquitetura](arquitetura.md) — como esses endpoints se conectam ao fluxo de montagem, assinatura e envio do XML.
- [Guia fiscal](guia-fiscal.md) — significado de NCM, CFOP e CSOSN antes de preencher os itens.
