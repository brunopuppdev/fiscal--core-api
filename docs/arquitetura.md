# Arquitetura

## Stack

- **NestJS 11** (Node.js) — framework da API.
- **PostgreSQL + TypeORM** — persistência das notas emitidas e controle de numeração.
- **node-forge** — leitura do certificado digital `.pfx` (PKCS#12) e extração da chave privada/certificado.
- **xmlbuilder2** — montagem do XML da NF-e/NFC-e (layout 4.00).
- **xml-crypto** — assinatura digital do XML (XML-DSig, enveloped, C14N, RSA-SHA1 — exigência do próprio padrão da NF-e).
- **fast-xml-parser** — parse das respostas SOAP da SEFAZ.
- **`https` nativo do Node** — chamadas SOAP diretas à SEFAZ com mTLS (sem biblioteca SOAP externa).
- **Swagger (`@nestjs/swagger`)** — documentação interativa em `/docs`.

Não há fila, worker ou dependência de infraestrutura além do PostgreSQL — a aplicação é um único processo Nest.

## Estrutura de pastas

```
src/
├── config/
│   ├── configuration.ts       # Carrega e tipa todas as variáveis de ambiente (AppConfig)
│   └── sefaz-endpoints.ts     # Endpoints dos webservices da SEFAZ, por UF e ambiente
├── common/
│   ├── enums/                 # ModeloDocumento (55/65), StatusNota
│   └── utils/
│       └── chave-acesso.util.ts  # Geração da chave de acesso (44 dígitos) e dígito verificador
├── certificado/
│   ├── certificado.service.ts # Carrega o .pfx, expõe chave/cert em PEM e um https.Agent com mTLS
│   └── certificado.module.ts
└── notas-fiscais/
    ├── entities/               # NotaFiscal, ItemNota, NumeracaoControle (TypeORM)
    ├── dto/                    # CriarNotaFiscalDto, DestinatarioDto, ItemNotaDto, NotaFiscalResponseDto
    ├── xml/
    │   ├── nfe-xml-builder.service.ts  # Monta o XML da NFe/NFCe a partir dos dados da venda
    │   └── nfe-xml-signer.service.ts   # Assina o <infNFe> com o certificado do emitente
    ├── sefaz/
    │   ├── sefaz-client.service.ts     # Cliente dos webservices SOAP da SEFAZ-SP
    │   ├── soap-envelope.util.ts       # Monta o envelope SOAP 1.2 (layout 4.00)
    │   └── soap-http.util.ts           # POST HTTPS bruto com o agent mTLS
    ├── notas-fiscais.service.ts        # Orquestra: numeração → XML → assinatura → SEFAZ → persistência
    ├── notas-fiscais.controller.ts     # Endpoints HTTP
    └── notas-fiscais.module.ts
```

## Fluxo de emissão (`POST /notas-fiscais`)

1. **Validação de entrada** — `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`) valida o DTO; o service rejeita NF-e (modelo 55) sem `destinatario.documento`.
2. **Reserva do número** — dentro de uma transação com `pessimistic_write` lock na tabela `numeracao_controle` (chave: modelo + série), garantindo numeração sequencial mesmo sob chamadas concorrentes.
3. **Geração da chave de acesso** — `montarChaveAcesso` monta os 43 dígitos (UF, AAMM, CNPJ, modelo, série, número, tipo de emissão, código numérico aleatório) e calcula o dígito verificador via módulo 11.
4. **Montagem do XML** — `NfeXmlBuilderService` gera o XML NFe 4.00 completo (`ide`, `emit`, `dest`, `det` por item, `total`, `transp`, `pag`, `infAdic`), assumindo o cenário padrão MEI/Simples Nacional (CSOSN informado por item, PIS/COFINS CST 49, CRT 1).
5. **Assinatura digital** — `NfeXmlSignerService` assina o elemento `<infNFe>` (enveloped signature, C14N, RSA-SHA1) usando a chave privada extraída do certificado `.pfx`.
6. **Persistência inicial** — a nota é salva no banco com `status: ASSINADA` **antes** de tentar o envio à SEFAZ, para não perder o registro em caso de falha de rede.
7. **Envio à SEFAZ** — `SefazClientService.autorizar` envia o XML assinado via SOAP (`NFeAutorizacao4`, lote síncrono `indSinc=1`). O retorno atualiza a nota:
   - `cStat 100` → `status: AUTORIZADA`, protocolo salvo, XML final vira um `<nfeProc>` (NFe + protocolo).
   - Qualquer outra rejeição da SEFAZ → `status: REJEITADA`.
   - Erro de comunicação (rede, TLS, HTTP) → `status: ERRO`, mensagem truncada em `motivoStatus`.
8. A nota (já com o resultado final) é retornada ao cliente da API.

Não há fila ou retry assíncrono: a chamada HTTP só retorna depois que a SEFAZ responde (ou falha). Isso é adequado ao baixo volume de um MEI, mas significa que o cliente da API precisa tolerar uma latência de alguns segundos nesse endpoint.

## Modelo de dados

### `notas_fiscais`

Uma linha por nota emitida (tentativa de emissão, mais precisamente — mesmo notas rejeitadas ficam registradas). Campos principais: `modelo`, `serie`, `numero`, `chave_acesso` (único), `status`, `ambiente`, dados do destinatário (desnormalizados: nome, documento, email, endereço em JSONB), `valor_total`, `xml_assinado`, `xml_autorizado`, `protocolo`, `motivo_status`, `codigo_status`, `data_emissao`, `data_autorizacao`.

### `itens_nota`

Um-para-muitos com `notas_fiscais` (`ON DELETE CASCADE`, carregamento `eager`). Guarda os dados fiscais de cada item no momento da emissão (código, descrição, NCM, CFOP, unidade, quantidade, valor unitário/total, CSOSN) — mesmo que o cadastro de produto mude depois, a nota preserva o que foi efetivamente declarado à SEFAZ.

### `numeracao_controle`

Uma linha por combinação `modelo` + `serie`, com o último número emitido (`ultimo_numero`). É a única tabela usada com lock pessimista, para evitar números duplicados ou pulados sob concorrência.

Em desenvolvimento, o schema é criado automaticamente pelo TypeORM (`DB_SYNCHRONIZE=true`). Não há migrations versionadas — para produção, considere desabilitar `synchronize` e gerar migrations antes de qualquer mudança de schema (veja [Roadmap](roadmap.md)).

## Certificado digital e mTLS

`CertificadoService` lê o `.pfx` uma única vez na inicialização (`OnModuleInit`) e expõe dois usos distintos do mesmo certificado:

- **Assinatura XML** — chave privada e certificado convertidos para PEM (via `node-forge`), consumidos pelo `NfeXmlSignerService`.
- **mTLS com a SEFAZ** — um `https.Agent` construído com o `.pfx` bruto + senha (`pfx`/`passphrase`), usado em toda chamada SOAP (`SefazClientService` → `soap-http.util.ts`).

Se o certificado não existir no caminho configurado, a aplicação sobe normalmente (por exemplo, para consultar o Swagger), mas qualquer operação que dependa dele falha com uma mensagem explícita.

## Próximos passos

- [Integração com a SEFAZ](integracao-sefaz.md) — detalhes do protocolo SOAP e status de testes reais.
- [Guia fiscal](guia-fiscal.md) — o que os campos fiscais (CSOSN, CFOP, NCM) significam na prática.
