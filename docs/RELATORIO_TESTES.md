# Relatório de validação — VINSETT Sinais

Data da entrega: 02/09/2026. Versão do app: 0.1.0.

**Resultado automatizado final: 29 testes passaram, 0 falharam.** Compilação de produção e verificação TypeScript concluídas. A validação em navegador foi bloqueada pela infraestrutura; a integração real e a publicação não foram realizadas.

## Evidência e limites

- `npm run typecheck`: código de saída 0.
- `npm test`: compilação concluída e suíte aprovada antes do ajuste final do controle do conector.
- Após o ajuste do conector, `node --test tests/*.test.mjs`: 29 PASS, 0 FAIL. A aplicação web não sofreu alteração nesse ajuste.
- O log final está em [TESTES_EXECUTADOS.txt](TESTES_EXECUTADOS.txt).
- Os testes de dados usam SQLite em memória com adaptador da interface D1 e as migrações reais do projeto.
- Serviços de Apps Script, planilha, rede e Telegram foram substituídos por objetos de teste. Isso não constitui uma integração instalada nem um teste real de entrega.
- O navegador retornou `ERR_BLOCKED_BY_CLIENT` ao tentar abrir a prévia. Não foi usado um resultado fictício em seu lugar.

## Matriz

| Área / cenário | Estado | Evidência ou pendência |
| --- | --- | --- |
| Compilação da interface e das rotas | PASS | Bundle de servidor, cliente e SSR emitidos |
| Verificação de tipos | PASS | TypeScript sem erros |
| 3 ativos, 2 direções, 5 resultados | PASS | Ingestão e consulta de 30 registros de teste |
| Filtros combinados, datas e versões | PASS | Validação e consultas parametrizadas |
| Paginação sem repetir IDs | PASS | Páginas sucessivas por entrada + ID |
| IDs inválidos/inexistentes | PASS | API devolve 404, sem substituir pelo primeiro registro |
| Estatísticas sobre todo o escopo | PASS | Amostra inclui registros além da página carregada |
| Denominador, exclusões e ausência de amostra | PASS | WIN + LOSS válidos; taxa null quando vazio |
| Entrega incerta do resultado | PASS | Não exclui uma apuração válida confirmada |
| UTC e calendário de Manaus | PASS | Limites do dia local aplicados na consulta |
| Janela fixa, 8 segundos e relógio incerto | PASS | Regras puras; indicação disponível desativada por padrão |
| Publicação após entrada | PASS | INCONCLUSIVO, fora da amostra válida |
| Vela inconsistente e fonte/símbolo inválido | PASS | Evento rejeitado |
| Assinatura, adulteração e expiração | PASS | HMAC-SHA256 e tolerância de horário |
| Tamanho máximo e limite de ingestão | PASS | 413 e 429 nos cenários testados |
| Reenvio e versões antigas | PASS | Recibo idempotente; revisão antiga não reverte o registro |
| Escrita atômica | PASS | Falha de lote desfaz recibo e registros no adaptador SQLite |
| Administração e origem indevidas | PASS | API nega visitante e origem inválida |
| Confirmação de pausa/retomada | PASS | Solicitado até confirmação autenticada; ID reutilizado nas tentativas |
| Retomada com manutenção / falta de prontidão | PASS | Rejeição e revalidação dentro do lock do motor |
| Conservação do V5 | PASS | SHA-256 do arquivo de referência preservado |
| Fórmulas originais | PASS | SMA inicial da EMA, RSI/ATR simples, volume e teto do score |
| Séries inválidas, futuras, duplicadas e curtas | PASS | Funções originais rejeitam os casos |
| Fallback Coinbase/Kraken | PASS | Pacote completo da mesma fonte; falha se ambas forem inválidas |
| Apuração original e fim + 5 segundos | PASS | Vela exata; BUY/SELL/EMPATE |
| Pausa com apuração pendente | PASS | Motor original continua a apuração e não inicia análises novas |
| Projeção sanitizada do conector | PASS | Contrato aceito sem token ou chat privado |
| Falha de rede e reinício do conector | PASS | Corpo persistido e reutilizado; fila original intacta |
| Acionador do conector | PASS | Instalação idempotente em simulação; outros acionadores preservados |
| Utilitários e primitivas da interface | PASS | Quatro testes do catálogo utilizado |
| Padrões de credenciais no pacote e cliente | PASS | Nenhum padrão de credencial real encontrado; marcadores privados ausentes dos bundles do cliente |
| Navegação, cliques e links diretos no navegador | BLOCKED | Acesso à prévia bloqueado pelo navegador do ambiente |
| Recarga, voltar, teclado, foco e layout celular | BLOCKED | Dependem do teste em navegador |
| API + frontend em um navegador real | BLOCKED | Mesmo impedimento de acesso à prévia |
| Conta GitHub conectada | PASS | Conta Vinsett07 identificada |
| Envio ao GitHub | PASS | Arquivos versionados em Vinsett07/vinsett-sinais; commit inicial preservado |
| Banco D1 remoto e migrações em produção | NOT RUN | Hospedagem e binding ainda não configurados |
| Provedor real de autenticação e logout | NOT RUN | Configuração de Sites e administradores pendente |
| Recuperação e redefinição no provedor | NOT RUN | Fluxo delegado ao provedor, sem senha local |
| Conexão ao Apps Script instalado | NOT RUN | Código preparado, sem acesso ao ambiente Google em execução |
| Telegram / grupo real | NOT RUN | Nenhum envio autorizado ou realizado nesta entrega |
| Latência completa e antecedência operacional | NOT RUN | Janela disponível permanece desativada |
| Instalação PWA em dispositivo real | NOT RUN | Capacidade permanece desativada |
| Publicação do app em produção | NOT RUN | Depende de autorização e conexões reais |
| Workflow GitHub executado remotamente | NOT RUN | Disponível para acionamento manual; somente testes locais executados |

PASS significa somente que o cenário descrito passou nas condições indicadas. BLOCKED e NOT RUN permanecem pendências de entrega operacional. Não há alegação de auditoria independente ou de funcionamento integral em produção.

## Integridade do motor de referência

SHA-256:

`28c3c536b2f04676286b8614553f0eb431ba726b1664c387f4dd3feb9d60ea52`

O conector é um arquivo adicional. O arquivo do motor V5 não foi modificado. Estado, filas, propriedades e acionadores da conta Google real não foram acessados.
