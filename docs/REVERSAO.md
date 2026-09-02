# Backup e reversão

## O que já foi preservado

`integrations/reference/VINSETT_V5.original.gs` é uma cópia byte a byte do arquivo V5 localizado. O SHA-256 está ao lado do arquivo e é verificado pelos testes. Essa cópia não demonstra que o projeto Google atualmente instalado possui o mesmo conteúdo.

O código em produção, as propriedades, os acionadores, as filas e as planilhas da conta Google não foram alterados nesta execução.

O commit inicial do repositório GitHub, `c0edca9b835068ea577cd5c90c2b3869b1d3ef0c`, continua no histórico e na branch `backup/antes-vinsett-app`. Essa referência registra o estado anterior ao envio do app. Para desfazer uma mudança posterior, use um novo commit de reversão, preservando o histórico existente.

## Antes de instalar a conexão real

- Guarde cópia do código efetivamente instalado e a relação dos acionadores.
- Faça backup privado das propriedades e das planilhas.
- Registre a revisão do app e das migrações do banco.
- Não envie backups com segredos para um repositório público.

## Desativar a conexão

Execute `vinsettAppDesativar` no Apps Script. Ela desativa o conector e remove somente acionadores cuja função seja `vinsettAppSincronizar`.

A operação preserva o motor, suas filas e planilhas e a outbox do conector. Não interrompe a apuração do motor por conta própria. Não apaga resultados nem reenvia mensagens.

No servidor, mantenha `VINSETT_COMMANDS_ENABLED=false` durante a revisão.

## Reverter o app

Use o commit/versionamento da última versão validada. Uma reversão da interface não autoriza apagar dados do banco ou editar migrações já aplicadas. Preserve os registros e aplique uma nova migração quando for necessário corrigir o esquema.

Não restaure uma cópia antiga da fila sobre uma fila que avançou. Isso poderia perder resultados ou repetir ações. Para desfazer uma instalação puramente aditiva, normalmente basta desativar o conector e preservar o estado atual do motor.

## Entrega incerta

Não apague `VSA_APP_OUTBOX` por tentativa e erro. O evento é reenviado com o mesmo ID, e o servidor confirma duplicatas sem gravar novamente.

Não reenvie mensagens do Telegram para resolver um problema de sincronização do app. A apuração e a entrega do motor continuam sendo processos separados.

Se um comando administrativo tiver execução incerta, confira o estado do motor. `vinsettAppReconciliarComando(id)` só deve ser usado depois dessa conferência; a função não executa a ação novamente.
