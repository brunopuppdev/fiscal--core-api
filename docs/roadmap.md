# Roadmap e limitações conhecidas

Este projeto cobre o caminho principal de emissão de NF-e/NFC-e para um MEI, mas ainda não é uma solução completa. Lista honesta do que falta, para quem for usar ou contribuir saber onde pisa.

## Limitações conhecidas

- **Só SP está configurado** em `src/config/sefaz-endpoints.ts`. Outras UFs exigem adicionar os endpoints correspondentes — a maioria usa o ambiente **SVRS** compartilhado entre estados. Veja [Integração com a SEFAZ](integracao-sefaz.md#só-sp-está-configurado).
- **Sem cancelamento de nota**, **carta de correção** ou **inutilização de numeração** — nenhum dos eventos da NF-e (`NFeRecepcaoEvento4`) está implementado.
- **Fluxo de autorização assíncrona não é tratado** — o cliente sempre assume `indSinc=1` (resposta síncrona da SEFAZ). Se algum estado retornar lote em processamento (`cStat` 103/105), a consulta posterior via `NFeRetAutorizacao4` precisaria ser implementada.
- **`NFeConsultaProtocolo4` já está implementado no cliente** (`SefazClientService.consultarProtocolo`), mas ainda não está exposto como endpoint HTTP.
- **Emissão real validada ponta a ponta em produção** — em 05/08/2026, uma NFC-e foi autorizada pela SEFAZ-SP real (`cStat 100`, protocolo obtido, nota persistida com `status: AUTORIZADA`). Certificado e-CNPJ, assinatura XML-DSig, QR Code (`infNFeSupl`) e schema todos confirmados corretos contra o ambiente de produção. Veja [Integração com a SEFAZ § Status real de teste](integracao-sefaz.md#status-real-de-teste-homologação-sefaz-sp).
- **Bug real corrigido: `vTroco` ausente no grupo `pag` do XML** — descoberto inspecionando a consulta pública da NFC-e real emitida em produção (item acima): sem o elemento opcional `vTroco` (irmão de `detPag`), o site de consulta pública da SEFAZ-SP exibia "Troco: NaN" em vez de "Troco: R$ 0,00". Corrigido em `NfeXmlBuilderService`: `vTroco` agora é sempre emitido (`0.00` por padrão), e um novo campo opcional `troco` em `CriarNotaFiscalDto` permite informar o valor real de troco de uma venda em dinheiro (nova coluna `troco` em `NotaFiscal`, migration `1786039023720-AdicionaTroco`), ajustando `vPag` (`vProdTotal + troco`) de acordo. Validado com emissão real em homologação — o XML passou pela validação de schema (a única rejeição foi o `cStat 1115` já documentado abaixo, sem relação com essa mudança). O DANFE/DANFCE também passou a exibir "Valor pago" e "Troco" no bloco de totais quando `troco > 0`.
- **Bloqueado só em homologação: rejeição `cStat 1115` (IBS/CBS) aplicada a emitente MEI (CRT 4)**, quando a NT 2025.002 (Reforma Tributária) diz explicitamente que essa regra só vale para CRT=4 a partir de 04/01/2027 — e os códigos corretos para MEI ainda nem foram publicados pela Receita. A emissão real em produção (acima) não foi afetada por essa rejeição, então parece ser um comportamento específico do ambiente de homologação da SEFAZ-SP, não um bloqueio geral. Não há como implementar uma correção no builder com confiança até a SEFAZ-SP ajustar o comportamento em homologação ou a NT específica de CRT 1/2/4 ser publicada.
- **Uma instância = um CNPJ.** Não há suporte a múltiplos emitentes na mesma aplicação.

## Ideias de evolução

Nenhuma promessa de prazo — é uma lista de possibilidades para quem quiser contribuir:

- Cancelamento de NF-e/NFC-e (evento `110111`).
- Carta de correção eletrônica (CC-e).
- Suporte a outras UFs (começando pelo ambiente SVRS compartilhado).
- Endpoint HTTP para `NFeConsultaProtocolo4`.
- Cadastro do emitente persistido no banco em vez de `.env` — hoje todos os dados de negócio do emitente (razão social, nome fantasia, IE, CRT, endereço completo, telefone, caminho do logotipo) vivem em `EmitenteConfig`/`.env` (`src/config/configuration.ts`), misturados com configuração de infraestrutura de verdade (conexão com banco, ambiente SEFAZ, caminho/senha do certificado) que faz sentido continuar em variável de ambiente. Envolveria uma nova entidade/tabela para o emitente (provavelmente uma linha só, já que o projeto é uma instância por CNPJ), endpoint(s) HTTP de cadastro/atualização, e migrar `NotasFiscaisService`/`NfeXmlBuilderService`/os services de PDF (que hoje recebem `EmitenteConfig` via `ConfigService.get('emitente')`) para ler o emitente do banco em vez do `.env`.
- Suporte a certificado A3 (token/smartcard), hoje só A1 (`.pfx`) é suportado.

## Como contribuir com o roadmap

Veja [Contribuindo](contribuindo.md). Se for atacar um desses itens, abra uma issue ou um PR descrevendo o que pretende resolver — especialmente para itens fiscais (cancelamento, CC-e), onde o comportamento correto depende de regras específicas da SEFAZ que vale alinhar antes de implementar.
