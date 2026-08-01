# Visão geral

## O problema

Emitir nota fiscal como **MEI** (Microempreendedor Individual) costuma passar por um destes caminhos:

- Um emissor gratuito do estado (ex.: Emissor NFC-e/NFe da SEFAZ), que funciona mas é manual, lento para quem vende em volume e não se integra a nada.
- Um sistema pago de terceiros, com mensalidade, para um negócio que muitas vezes fatura pouco.
- Nenhum sistema — o que é arriscado do ponto de vista fiscal.

O EmissorNF nasceu para resolver isso: uma API própria, que qualquer MEI (ou desenvolvedor ajudando um MEI) possa rodar, entender e adaptar, sem depender de um provedor pago e sem ficar preso a uma interface manual.

## A proposta

EmissorNF é uma **API de emissão de notas fiscais de venda (NF-e modelo 55 e NFC-e modelo 65)**, com integração **direta** aos webservices da SEFAZ — sem passar por um provedor terceirizado (nada de "gateway de nota fiscal" pago por nota emitida).

O projeto **não é específico de nenhum ramo de venda**. Ele nasceu documentando um caso de uso concreto (venda de sucos), mas o modelo de dados e o XML gerado cobrem qualquer venda de mercadoria por um MEI/Simples Nacional: código do produto, NCM, CFOP, quantidade e valor unitário são todos parametrizáveis por item. Troque os produtos cadastrados e o mesmo serviço emite notas para brechó, doces, artesanato, revenda de peças, ou qualquer outra atividade de comércio enquadrada como MEI.

## Para quem é este projeto

- MEIs que querem emitir suas próprias notas de venda sem pagar mensalidade a um emissor terceirizado.
- Desenvolvedores que auxiliam pequenos negócios e querem uma base já validada para não recomeçar a integração com a SEFAZ do zero.
- Quem quer entender, na prática, como funciona a assinatura digital de XML, o SOAP da NF-e e a comunicação mTLS com a Receita — o código é enxuto o suficiente para ser lido de ponta a ponta.

## O que o projeto não é

- **Não é um ERP.** Não há controle de estoque, financeiro ou emissão de boletos — apenas a emissão fiscal da venda.
- **Não é multiempresa.** Cada instância roda para um único CNPJ (o emitente é configurado via variáveis de ambiente).
- **Não é plug-and-play para todos os estados.** Hoje só os endpoints da SEFAZ-SP estão configurados (veja [Roadmap](roadmap.md)).
- **Não substitui um contador.** O projeto assume um cenário fiscal padrão de MEI (Simples Nacional, CSOSN 102, PIS/COFINS CST 49), mas cada CNPJ pode ter particularidades. Veja o [Guia fiscal](guia-fiscal.md).

## Por que integração direta com a SEFAZ (e não um provedor)

Provedores de nota fiscal (Focus NFe, NFe.io, PlugNotas, etc.) resolvem bem o problema, mas cobram por nota ou por mensalidade — um custo desproporcional para quem fatura pouco como MEI. Este projeto assume esse custo de complexidade (montar e assinar o XML, falar SOAP com mTLS diretamente com a SEFAZ) para não repassar custo financeiro recorrente ao usuário final.

A contrapartida dessa escolha está documentada com transparência em [Integração com a SEFAZ](integracao-sefaz.md) e no aviso de status de testes no [README](../README.md): comunicação direta com a Receita é sensível a detalhes que só se confirmam testando contra o ambiente real.

## Próximos passos

- [Instalação e configuração](instalacao-e-configuracao.md) — como rodar o projeto.
- [Referência da API](api.md) — endpoints disponíveis.
- [Arquitetura](arquitetura.md) — como o código está organizado.
- [Guia fiscal](guia-fiscal.md) — o que confirmar com seu contador antes de emitir notas reais.
