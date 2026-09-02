# Conexão do VINSETT Sinais

## 1. GitHub

O projeto está versionado em [Vinsett07/vinsett-sinais](https://github.com/Vinsett07/vinsett-sinais), na branch `main`. O commit inicial do repositório foi preservado no histórico e na branch `backup/antes-vinsett-app`.

O repositório fornecido pelo responsável está **público**. Seus arquivos contêm código, configuração de exemplo e documentação; credenciais, propriedades do Apps Script e histórico privado do Google Sheets não fazem parte da entrega.

Para obter o código, use **Code → Download ZIP** no GitHub ou clone o repositório. Manter o código no GitHub não instala o conector, não cria o banco e não coloca o aplicativo em produção.

O workflow `.github/workflows/validar.yml` roda somente por acionamento manual. Ele usa permissão de leitura, instala as dependências do lockfile, verifica os tipos, compila e testa. Não faz publicação e não executa sinais em M1.

## 2. Hospedagem e banco

O projeto está preparado para execução em Sites, com servidor compatível com Cloudflare Workers e binding D1 lógico `DB`. Nenhum recurso de produção foi criado ou publicado nesta entrega.

Após autorizar a hospedagem:

1. Registrar o projeto no ambiente de hospedagem.
2. Conectar o banco D1 ao binding `DB`.
3. Aplicar, em ordem, as migrações de `drizzle/`. Não editar uma migração já aplicada.
4. Configurar os valores de ambiente abaixo no servidor.
5. Publicar primeiro para validação com acesso restrito, somente com autorização.
6. Conferir API, navegação, autenticação e sincronização antes de abrir a consulta pública.

Não há configuração de implantação para GitHub Pages, porque este projeto utiliza rotas de servidor e banco.

### Variáveis de ambiente

O arquivo `.env.example` contém somente nomes e padrões seguros.

| Nome | Valor / finalidade |
| --- | --- |
| VINSETT_INGEST_SECRET | Chave aleatória exclusiva, com pelo menos 32 caracteres; somente no servidor |
| VINSETT_CANONICAL_ORIGIN | Origem HTTPS pública canônica, sem caminho, query ou credenciais |
| VINSETT_PUBLIC_TELEGRAM | URL do canal público autorizado, no formato https://t.me/nome_do_canal |
| VINSETT_SUPPORT_URL | Contato HTTPS real aprovado pelo responsável |
| VINSETT_AUTH_MODE | `off` até configurar; `sites` somente no ambiente Sites com autenticação do dispatcher |
| VINSETT_ADMIN_IDS | IDs estáveis de usuários permitidos, separados por vírgula |
| VINSETT_COMMANDS_ENABLED | `false` até validar o controle seguro do motor |
| VINSETT_WINDOW_ENABLED | `false` até validar latência de ponta a ponta |
| VINSETT_PWA_ENABLED | `false` até testar instalação no navegador/dispositivo de destino |
| VINSETT_TEST_DATA | `false` em produção; `true` somente com um banco de teste separado |
| VINSETT_LOCAL_TESTING | `false` em produção |

Não coloque segredos em arquivos versionados, parâmetros de URL ou código do navegador. A chave do conector é independente do token do Telegram. Não é necessária chave de corretora ou da API OpenAI.

## 3. Administração

O provedor implementado é o Sign in with ChatGPT do ambiente Sites. O navegador inicia uma navegação de nível superior para o provedor. O app valida, no servidor, o ID encaminhado pela infraestrutura contra `VINSETT_ADMIN_IDS`.

**Não habilite `VINSETT_AUTH_MODE=sites` em um Worker exposto diretamente à internet ou em um host que aceite os cabeçalhos de identidade enviados pelo visitante.** A confiança nos cabeçalhos exige o dispatcher de autenticação de Sites. Fora desse ambiente, mantenha a administração desativada até instalar e validar um provedor apropriado.

Recuperar e redefinir acesso encaminham ao fluxo do provedor. O app não cria senhas, não cadastra administradores publicamente e não implementa uma redefinição de senha fictícia.

Uma conta autenticada pode consultar seu próprio ID em `GET /api/auth/me`; o responsável inclui esse ID na configuração do servidor. Login bem-sucedido sem autorização administrativa não concede controle.

## 4. Preparar o motor original

Antes de mudanças no projeto Google:

1. Confira se o motor instalado é realmente o V5.0.0 correspondente ao código de referência.
2. Guarde uma cópia do código atualmente instalado e dos acionadores existentes.
3. Preserve um backup privado das propriedades e das planilhas, com cuidado para não publicar segredos.
4. Não apague filas nem reexecute a configuração completa do motor para instalar este conector.

A cópia em `integrations/reference/` é um backup do arquivo localizado, não uma leitura do estado atual do seu Apps Script. O estado atual da conta Google não foi acessado.

## 5. Adicionar o conector

1. Abra `integrations/VINSETT_App_Connector.gs` em um editor de texto.
2. No projeto Google Apps Script que já contém o motor, crie um **novo arquivo** chamado `VINSETT_App_Connector.gs`.
3. Cole nele o conteúdo do conector e salve. Preserve o arquivo original do motor.
4. Configure as seguintes **Propriedades do script**:

| Propriedade | Finalidade |
| --- | --- |
| VSA_APP_URL | Origem HTTPS autorizada seguida de /api/connector/sync |
| VSA_APP_SECRET | A mesma chave exclusiva configurada em VINSETT_INGEST_SECRET |
| VSA_APP_ENABLED | `false` enquanto estiver preparando |
| VSA_APP_ALLOW_CONTROL | `false` até autorizar e validar pausa/retomada |
| VSA_APP_IMPORT_HISTORY | `false` inicialmente; `true` habilita a leitura progressiva das planilhas originais |
| VSA_APP_PUBLIC_TELEGRAM | Mesma URL pública aprovada no servidor; opcional |
| VSA_APP_PUBLIC_CHAT_ID | ID privado de conferência do canal correspondente à URL aprovada; fica somente nas propriedades |

Os dois últimos valores permitem conferir se uma mensagem realmente pertence ao canal público autorizado antes de apresentar seu link. Sem essa configuração, o app explica que o link não está disponível. Chats privados nunca são enviados à API pública.

5. Após autorizar a conexão, altere `VSA_APP_ENABLED` para `true` e execute `vinsettAppSincronizar` uma vez.
6. Confira o retorno, o status do app e os mesmos IDs no histórico. Esse conector não envia mensagens ao Telegram.
7. Após validar, execute `vinsettAppInstalar`. A função cria apenas um acionador próprio; preserva os acionadores do motor.
8. Para importar registros históricos, habilite `VSA_APP_IMPORT_HISTORY=true`. A leitura é progressiva e usa o horário UTC das células de data, sem inventar horários de análise ausentes.

O conector tem sua própria outbox nas propriedades `VSA_APP_*`. Um evento só sai dela após resposta que confirme seu ID. Falhas preservam o evento, as filas e as planilhas originais.

O Apps Script pode adiar acionadores. O conector é adequado ao modo inicial de acompanhamento; não deve ser considerado garantia de distribuição em menos de 8 segundos. Não habilite a indicação de janela disponível somente porque uma sincronização funcionou.

### Registro rejeitado

HTTP 422 indica que o evento não corresponde ao contrato. HTTP 409 indica conflito de identidade/revisão. O evento permanece na outbox. Revise o registro original e o contrato, sem apagar a fila para contornar o erro.

Registros legados que não possuam os campos necessários, incluindo OHLC de apuração, não são completados por estimativa. Exigem revisão antes de inclusão na amostra do app.

## 6. Pausa e retomada

Só habilite `VINSETT_COMMANDS_ENABLED` no servidor e `VSA_APP_ALLOW_CONTROL` no script após validar a autenticação administrativa e o vínculo com o motor correto.

A interface envia um pedido idempotente, inicialmente **Solicitado**. O conector confirma ou rejeita; o app não declara a ação aplicada antes dessa confirmação.

- Pausa chama o controle original para interromper novos sinais; apurações continuam quando o motor está preparado e fora de manutenção.
- Retomada exige versão correta, teste original aprovado, manutenção desligada, saúde OK e execução recente.
- Comando iniciado e interrompido fica incerto, sem reexecução cega.
- `vinsettAppReconciliarComando(id)` só observa o estado e enfileira uma confirmação; não pausa ou retoma novamente.
- Um pedido que exceda o tempo de confirmação fica incerto até o motor esclarecer o estado.

Não foram executados comandos nem testes em um grupo real.

## 7. Validação antes da produção pública

Confira os itens BLOCKED e NOT RUN no relatório. Teste navegação por link direto, recarga, voltar, celular e teclado; login e usuário sem permissão; sincronização com dados reais autorizados; falhas de rede; instalação PWA, quando desejada.

A publicação pública e qualquer contratação ou cobrança exigem autorização. O workflow entregue não efetua essas ações.
