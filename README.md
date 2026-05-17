# Vistorias EN - Web

Painel administrativo e API do sistema de vistorias EN.

O projeto foi montado em cima de **Vite + React**, com rotas serverless em `/api`. A stack original usa **Vercel** para deploy e **Supabase** para autenticação, banco, storage e realtime.

Para implantação completa, incluindo SQL, buckets, primeiro admin e notas de migração para outro banco/host, veja [docs/IMPLEMENTACAO.md](docs/IMPLEMENTACAO.md).

## Stack

- React 19
- Vite
- Supabase JS
- Vercel Functions
- jsPDF/html2canvas para geração do PDF no painel
- Lucide React para ícones

## Estrutura

```text
api/        rotas serverless usadas pelo painel e pelo app mobile
src/        aplicação React
shared/     regras compartilhadas, principalmente modelos de requisitos
public/     logo e imagens públicas
database/   SQL base para Supabase/Postgres
docs/       documentação de implementação
```

O app mobile fica em outro repositório. Este projeto entrega apenas a Web e a API.

## Ambiente

Requisitos:

- Node.js 20+
- npm 10+
- Projeto Supabase com o schema aplicado

Crie um `.env.local` com:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE_PUBLICA
SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY
```

Também é aceito `VITE_SUPABASE_ANON_KEY` no lugar de `VITE_SUPABASE_PUBLISHABLE_KEY`.

`SUPABASE_SERVICE_ROLE_KEY` é chave de servidor. Não deve aparecer no mobile, no front-end renderizado, em prints ou em commits.

## Desenvolvimento

```bash
npm install
npm run dev
```

O Vite sobe o painel localmente e registra alguns middlewares para simular as APIs mais usadas durante o desenvolvimento.

Build:

```bash
npm run build
```

Preview do build:

```bash
npm run preview
```

## Deploy na Vercel

Configuração esperada:

```text
Framework: Vite
Install command: npm install
Build command: npm run build
Output directory: dist
```

Variáveis necessárias na Vercel:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Se usar `VITE_SUPABASE_ANON_KEY`, configure ela também ou no lugar da publishable key.

O `vercel.json` já contém o básico para servir o SPA e manter `/api/*` apontando para as functions.

Depois do deploy, use a URL publicada como `EXPO_PUBLIC_WEB_API_URL` no app mobile.

## Supabase

O SQL base está em:

```text
database/supabase-schema.sql
```

Ele cria as tabelas principais:

- `profiles`
- `inspections`
- `inspection_photos`
- `inspection_schedules`
- `inspection_types`

Também cria índices e policies básicas para uso autenticado.

Buckets usados:

- `inspection-photos`, privado
- `profile-photos`, público
- `system-config`, privado

O arquivo de configuração dos modelos de vistoria fica em:

```text
system-config/checklist-models.json
```

Parte do código cria buckets/configurações automaticamente quando necessário, mas em produção é melhor provisionar tudo antes.

## APIs

As rotas em `/api` fazem as operações que não devem ir direto pelo cliente, como criação de usuário, envio de vistoria, manipulação de fotos, aprovação/reprovação e registro de push token.

Rotas mais importantes:

```text
/api/web-login
/api/session-profile
/api/admin-profiles
/api/manage-user
/api/admin-inspections
/api/mobile-inspections
/api/submit-inspection
/api/register-push-token
/api/update-profile-photo
```

As APIs assumem Supabase Auth e validam o usuário a partir do token enviado pelo cliente.

## Segurança

Não versionar:

- `.env`
- `.env.local`
- chaves `service_role`
- service account Firebase
- `google-services.json`
- tokens de produção
- builds gerados

Se uma chave de servidor vazar, revogue e gere outra. Não tente “só apagar do commit”; histórico de Git também conta como vazamento.

## Rodando fora da Vercel

O front é estático depois do build, então qualquer servidor pode entregar `dist`.

O cuidado está nas APIs. Fora da Vercel, será necessário adaptar `/api` para um servidor Node convencional, por exemplo Express ou Fastify, mantendo os mesmos endpoints.

Em uma VPS típica:

```text
Nginx -> dist/
Nginx -> /api/* -> Node
```

Também será necessário configurar HTTPS, variáveis de ambiente, limite de upload e persistência de logs.

## Usando outro banco

Hoje o projeto usa Supabase diretamente em dois pontos:

- `src/main.jsx`, para sessão/realtime em algumas telas
- `/api` e `shared/checklist-model-store.js`, para banco, auth e storage

Para trocar de banco, a mudança saudável é puxar o acesso a dados para o servidor e manter o front/mobile falando com a API.

Exemplos comuns:

- PostgreSQL próprio + Prisma/Drizzle
- MySQL ou SQL Server com uma camada de repository
- S3/R2/Azure Blob no lugar do Supabase Storage
- Auth0/Clerk/Firebase Auth no lugar do Supabase Auth
- WebSocket/Pusher/Ably ou polling no lugar do Supabase Realtime

Não é uma troca de variável de ambiente. A API precisa ser reimplementada mantendo contratos compatíveis com o painel e com o mobile.

## Documentação de implantação

O guia mais detalhado está em:

```text
docs/IMPLEMENTACAO.md
```

Ele cobre:

- ordem de implantação;
- SQL base;
- tabelas;
- buckets;
- primeiro usuário administrador;
- deploy em Vercel;
- caminhos para outro banco;
- caminhos para outro servidor;
- checklist de homologação.

## Observações

- O PDF é gerado no painel com base no HTML renderizado. Mudanças visuais podem afetar o relatório.
- Fotos de vistoria ficam privadas e são abertas via signed URL.
- Notificações push dependem também do repositório mobile, Expo/EAS e Firebase.
- O modelo de requisitos é salvo como JSON no Storage, não como tabela relacional.
