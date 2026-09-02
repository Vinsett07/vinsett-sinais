# VINSETT Sinais

App web em português para acompanhar sinais de referência de BTC/USD, ETH/USD e SOL/USD, gerados pelo VINSETT TRADER PRO V5.

**Estado desta entrega:** código e conector versionados neste repositório, compilação concluída e 29 testes automatizados locais aprovados. A integração com uma conta Google e a publicação dependem das conexões descritas em [PENDENCIAS.md](docs/PENDENCIAS.md). A validação em navegador permanece bloqueada pelo ambiente. O app começa com dados vazios e indicação de **Não conectado**.

Repositório: [Vinsett07/vinsett-sinais](https://github.com/Vinsett07/vinsett-sinais).

## Comece por aqui

1. Leia [o estado da entrega](docs/PENDENCIAS.md).
2. Clone este repositório ou use **Code → Download ZIP**, preservando as pastas, inclusive `.github` e `.openai`.
3. Execute as verificações locais descritas abaixo. O workflow do GitHub também está disponível para acionamento manual.
4. Use [CONEXAO.md](docs/CONEXAO.md) para conectar a hospedagem, o banco e o motor, depois das autorizações necessárias. Não envie arquivos de ambiente com valores reais.

O projeto inclui um conector separado e uma cópia intacta do V5 localizado para referência. A instalação do conector no motor real permanece pendente.

## O que o projeto inclui

- Painel, detalhes por ID estável, histórico com filtros e paginação, estatísticas sobre todo o conjunto filtrado, status, preferências e páginas de ajuda/termos/privacidade.
- API pública somente leitura; ingestão assinada por HMAC-SHA256; validação de campos, datas, fonte e OHLC; limite de ingestão.
- Persistência D1/SQLite com migrações versionadas, deduplicação, revisões e recibos de eventos.
- Administração protegida no servidor e pedidos de pausa/retomada que aguardam confirmação.
- Conector Apps Script aditivo: projeção pública da fila e do histórico, outbox persistente, retomada após falhas e controle opcional.
- Manifesto e página de falha de rede preparados para PWA. Instalação e indicação de janela disponível ficam desativadas até validação apropriada.
- Workflow GitHub manual para verificar tipos, compilar e testar. Nenhum job publica ou executa o motor.

## Arquitetura

| Responsabilidade | Implementação |
| --- | --- |
| Interface e navegação | React 19, Vinext, componentes Shadcn |
| API | Rotas de servidor compatíveis com Cloudflare Workers |
| Banco do app | D1, com migrações Drizzle |
| Estratégia e Telegram | Motor V5 existente no Google Apps Script |
| Histórico privado original | Google Sheets, preservado |
| Autenticação administrativa | Sign in with ChatGPT no ambiente Sites, com lista de IDs autorizados no servidor |
| Código e verificação | GitHub e workflow manual |

O aplicativo utiliza API e banco de dados. Seu funcionamento requer hospedagem compatível com essas capacidades; guardar o código no GitHub é uma etapa separada da execução do serviço.

O motor segue responsável pela estratégia, pelos horários e pelas mensagens de sinais/resultados. O app não analisa mercado por visitante, não duplica o emissor e não executa ordens.

Consulte o [relatório real de testes](docs/RELATORIO_TESTES.md) antes de conectar o motor ou publicar.

## Executar as verificações

Requer Node.js 22.13 ou superior e ambiente compatível com os scripts Bash do projeto.

```bash
npm run install:ci
npm run typecheck
npm test
```

`npm test` compila o projeto e executa as verificações. Para somente as regras de negócio e o conector, use `npm run test:core`.

Os testes criam um banco SQLite isolado em memória, adaptado à interface D1, e substituem os serviços Google/Telegram por objetos de teste. Eles não entram em contas, consultam corretoras, criam acionadores reais ou enviam mensagens.

Para desenvolvimento em máquina própria, o projeto possui `npm run dev` e `wrangler.local.json`. Execute as migrações locais antes de usar a API com um banco vazio. A infraestrutura de prévia gerenciada possui seu próprio comando de inicialização.

```bash
npx wrangler d1 migrations apply DB --local --config wrangler.local.json
```

Não use a configuração local para provisionar ou publicar recursos reais.

## Estrutura

- `app/`: rotas, metadados e estilos.
- `components/vinsett/`: interface do produto.
- `lib/domain.mjs`: validação, filtros, horários e regras de apresentação.
- `lib/api.mjs`: contrato HTTP, assinaturas e autorização.
- `lib/data.mjs`: consultas, estatísticas e ingestão transacional.
- `db/schema.ts` e `drizzle/`: esquema e migrações.
- `integrations/VINSETT_App_Connector.gs`: arquivo adicional para o Apps Script.
- `integrations/reference/`: V5 original e SHA-256, somente referência.
- `docs/`: conexão, API, reversão, pendências e relatório de testes.

## Escopo dos resultados

Score técnico não é probabilidade de acerto. A taxa é WIN ÷ (WIN + LOSS), apenas para publicações confirmadas com apuração válida. Testes, empates, pendências, inconclusivos, cancelamentos e publicações incertas ficam fora do denominador.

Não são calculados lucro, saldo, ROI ou previsão de resultado futuro. Não há execução de ordens, conexão com contas de corretoras, OTC ou martingale.
