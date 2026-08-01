# Roadmap e limitações conhecidas

Este projeto cobre o caminho principal de emissão de NF-e/NFC-e para um MEI, mas ainda não é uma solução completa. Lista honesta do que falta, para quem for usar ou contribuir saber onde pisa.

## Limitações conhecidas

- **Só SP está configurado** em `src/config/sefaz-endpoints.ts`. Outras UFs exigem adicionar os endpoints correspondentes — a maioria usa o ambiente **SVRS** compartilhado entre estados. Veja [Integração com a SEFAZ](integracao-sefaz.md#só-sp-está-configurado).
- **Sem cancelamento de nota**, **carta de correção** ou **inutilização de numeração** — nenhum dos eventos da NF-e (`NFeRecepcaoEvento4`) está implementado.
- **Não gera DANFE/DANFCE em PDF** — a API entrega apenas o XML (autorizado ou assinado). Impressão do documento auxiliar fica por conta de quem consome a API.
- **Fluxo de autorização assíncrona não é tratado** — o cliente sempre assume `indSinc=1` (resposta síncrona da SEFAZ). Se algum estado retornar lote em processamento (`cStat` 103/105), a consulta posterior via `NFeRetAutorizacao4` precisaria ser implementada.
- **`NFeConsultaProtocolo4` já está implementado no cliente** (`SefazClientService.consultarProtocolo`), mas ainda não está exposto como endpoint HTTP.
- **Emissão real ainda não validada ponta a ponta** — o teste contra a SEFAZ-SP real cobriu status de serviço e a tentativa de autorização (rejeitada por vínculo de certificado, não por bug de código). Veja [Integração com a SEFAZ § Status real de teste](integracao-sefaz.md#status-real-de-teste-homologação-sefaz-sp).
- **Uma instância = um CNPJ.** Não há suporte a múltiplos emitentes na mesma aplicação.
- **`DB_SYNCHRONIZE=true` por padrão** — conveniente em desenvolvimento, mas não há migrations versionadas do TypeORM; para produção, isso precisaria mudar.

## Ideias de evolução

Nenhuma promessa de prazo — é uma lista de possibilidades para quem quiser contribuir:

- Cancelamento de NF-e/NFC-e (evento `110111`).
- Carta de correção eletrônica (CC-e).
- Geração de DANFE (NF-e) e DANFCE (NFC-e) em PDF.
- Suporte a outras UFs (começando pelo ambiente SVRS compartilhado).
- Endpoint HTTP para `NFeConsultaProtocolo4`.
- Migrations versionadas do TypeORM em vez de `synchronize`.
- Suporte a certificado A3 (token/smartcard), hoje só A1 (`.pfx`) é suportado.

## Como contribuir com o roadmap

Veja [Contribuindo](contribuindo.md). Se for atacar um desses itens, abra uma issue ou um PR descrevendo o que pretende resolver — especialmente para itens fiscais (cancelamento, CC-e), onde o comportamento correto depende de regras específicas da SEFAZ que vale alinhar antes de implementar.
