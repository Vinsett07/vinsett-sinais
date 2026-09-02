# Contrato HTTP

Versão do projeto: 0.1.0. JSON em UTF-8. Datas transmitidas em ISO 8601 UTC, terminadas em Z; a interface usa America/Manaus.

## Consulta pública

| Método e rota | Resposta |
| --- | --- |
| GET /api/public/config | Ativos, links aprovados e capacidades habilitadas |
| GET /api/public/signals | Registros, total filtrado, snapshot e próximo cursor |
| GET /api/public/signals/:id | O mesmo registro identificado pelo ID, ou 404 |
| GET /api/public/stats | Contagens completas, amostra válida e taxa |
| GET /api/public/status | Estado informado pelo motor para cada ativo |

Respostas incluem `serverNow` e `mode`. Registros incluem `syncedAt`, separado de análise, publicação, entrada e apuração. A atualização da tela não altera esses horários.

Respostas públicas anunciam cache máximo de 3 segundos e revalidação. A interface pede dados atualizados e considera o cabeçalho Age, quando presente, na incerteza do relógio. Falhas e dados administrativos usam `private, no-store`.

### Filtros

`asset`: BTC, ETH ou SOL. `direction`: BUY ou SELL. `result`: WIN, LOSS, EMPATE, INCONCLUSIVO ou PENDENTE.

`from` e `to`: datas YYYY-MM-DD, inclusivas no calendário de Manaus. `version`: versão da estratégia. `limit`: de 1 a 50, padrão 12. `cursor`: somente o valor retornado pela página anterior.

Filtros desconhecidos, repetidos ou inválidos são rejeitados. A paginação usa entrada + ID e mantém um limite temporal de inclusão, evitando repetir registros. Mudanças de resultado durante a consulta podem alterar a composição de um filtro de resultado; os IDs e a ordem permanecem estáveis.

Estatísticas ignoram o filtro de resultado para impedir seleção artificial de somente WIN. A taxa é calculada sobre todo o conjunto, independentemente da página carregada. Com denominador zero, `rate` é null.

## Ingestão

`POST /api/connector/sync`, exclusivamente via HTTPS em produção.

Cabeçalhos:

- `X-Vinsett-Timestamp`: Unix em milissegundos, com tolerância máxima de 5 minutos.
- `X-Vinsett-Signature`: HMAC-SHA256 hexadecimal minúsculo de `timestamp + "." + corpo_exato`, usando a chave exclusiva do conector.
- `Content-Type: application/json`.

Formato do envelope:

```json
{
  "eventId": "UUID persistido antes do envio",
  "signals": [],
  "statuses": [],
  "acks": []
}
```

É obrigatório ao menos um item. Máximos: 20 sinais, 3 status, 20 confirmações e 96 KiB por corpo. O conector usa lotes menores para respeitar o tamanho de uma propriedade do Apps Script. O limite de ingestão é de 90 requisições autenticadas por minuto.

`eventId` é um UUID real, gerado pelo conector. O texto do exemplo descreve o campo; não deve ser usado como valor.

O mesmo evento com o mesmo corpo pode ser repetido. O mesmo ID de evento com outro corpo é rejeitado. Revisões antigas não revertem registros e são devolvidas em `ignoredStaleIds`. Os campos originais de identidade, fonte, direção e horário não podem mudar.

O contrato exato, com todos os campos e validações, está em `lib/domain.mjs` e na projeção `vsaProjectRecord_` do conector. A validação rejeita propriedades extras: não envie tokens, chats privados, conteúdo integral de filas ou erros não sanitizados.

Para apuração válida é necessária a vela M1 do intervalo anunciado. Publicação confirmada após a entrada resulta em INCONCLUSIVO. A API não consulta exchanges nem tenta substituir a estratégia original.

A resposta de sucesso confirma o `eventId`, informa `duplicate`, a quantidade aceita e os comandos administrativos pendentes. O cliente só pode remover a outbox depois de confirmar esse ID.

## Administração

`GET /api/auth/me` retorna apenas a identidade do próprio visitante autenticado.

`GET /api/admin/state` requer um administrador autorizado e retorna pedidos recentes.

`POST /api/admin/commands` requer administrador, origem canônica exata, controle habilitado e:

```json
{
  "kind": "PAUSE",
  "idempotencyKey": "UUID exclusivo para o pedido"
}
```

`kind` aceita PAUSE ou RESUME. O UUID deve ser gerado de verdade e reutilizado nas tentativas do mesmo pedido. HTTP 202 significa **Solicitado**, não confirmação do motor.

A lista administrativa é aplicada no servidor. CORS não é usado como autenticação. Visitantes não criam, removem ou marcam resultados.

## Códigos de resposta

| Código | Significado |
| --- | --- |
| 200 | Consulta concluída ou evento confirmado |
| 202 | Pedido administrativo registrado |
| 400 | Filtros, data, cursor ou JSON inválido |
| 401 | Assinatura ausente, incorreta ou expirada |
| 403 | Administração ou origem não autorizada |
| 404 | Sinal ou recurso não encontrado |
| 405 | Método não permitido |
| 409 | Conflito de identidade, revisão ou pedido pendente |
| 413 | Corpo acima do limite |
| 422 | Dados incompatíveis com o contrato |
| 429 | Limite de ingestão |
| 503 | Banco, conector ou serviço indisponível |

Mensagens públicas são sanitizadas. Detalhes internos, valores de ambiente e erros brutos não são devolvidos.
