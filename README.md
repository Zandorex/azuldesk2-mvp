# Azuldesk MVP 1.0

Central multiempresa de atendimento por WhatsApp, integrada à Evolution API 2.3.7. A AzulmedSP vem configurada como primeira empresa de teste.

## O que já funciona

- Login seguro por cookie HTTP-only;
- isolamento de dados por empresa;
- caixa de entrada e atualização em tempo real;
- recebimento via webhook `MESSAGES_UPSERT`;
- envio de texto pela Evolution API;
- contatos, etiquetas, responsáveis e respostas rápidas;
- status de atendimento e painel de indicadores;
- layout responsivo para computador e celular.

## Instalação local

1. Instale Node.js 20 ou superior.
2. Execute `npm install`.
3. Copie `.env.example` para `.env` e altere todos os segredos.
4. Execute `npm start`.
5. Abra `http://localhost:3000`.

Se `ADMIN_PASSWORD` não for configurada no primeiro início, a senha inicial será `Azuldesk@2026`. Troque-a antes de publicar.

## Variáveis na Hostinger

Configure `NODE_ENV=production`, `APP_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `WEBHOOK_SECRET` e `DATA_FILE`.

Use como comando de instalação `npm install` e como comando inicial `npm start`. O diretório público não precisa ser configurado separadamente.

## Webhook da Evolution API

Depois de publicar o painel, configure na instância `azulmedsp`:

```text
URL: https://app.azuldesk.com.br/webhooks/evolution/azulmedsp?secret=SEU_WEBHOOK_SECRET
Evento: MESSAGES_UPSERT
Webhook por evento: desativado
Base64: desativado
```

O valor de `secret` deve ser exatamente o mesmo definido em `WEBHOOK_SECRET`.

## Limites conscientes do MVP

O banco local em JSON é suficiente para o teste inicial da AzulmedSP, com gravação atômica. Antes de escalar para vários assinantes ou múltiplas réplicas, migre a camada `src/store.js` para PostgreSQL. Áudios, anexos, QR Code dentro do Azuldesk, auditoria, cobrança e EvoAI pertencem à próxima etapa.

## Segurança

- Não publique `.env` e nunca grave a API Key no código.
- Use apenas HTTPS em produção.
- Revogue a chave da Evolution se ela apareceu em alguma captura pública.
- Faça backup do arquivo indicado por `DATA_FILE`.
