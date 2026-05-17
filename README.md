# Vistorias EN - Web

Painel web e APIs serverless do sistema de vistorias EN.

## O que este repositório contém

- Painel web administrativo em React/Vite.
- APIs em `/api` para login, usuários, perfis, vistorias, fotos, requisitos e notificações.
- Assets públicos do painel em `/public`.
- Helpers compartilhados em `/shared`.

## O que não está neste repositório

- Aplicativo mobile Expo/Android.
- Arquivos `.env` reais.
- Chaves Firebase, service account, `google-services.json` ou credenciais de push.
- Builds gerados (`dist`), logs, APKs, arquivos temporários e downloads da Vercel.

## Requisitos para rodar

- Node.js 20 ou superior.
- npm 10 ou superior.
- Projeto Supabase configurado com as tabelas usadas pelo sistema.
- Variáveis de ambiente abaixo configuradas no servidor.

## Variáveis de ambiente obrigatórias

Crie um `.env.local` para desenvolvimento local ou configure estas variáveis no servidor:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE_PUBLICA
SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY
```

Também é aceito `VITE_SUPABASE_ANON_KEY` no lugar de `VITE_SUPABASE_PUBLISHABLE_KEY`.

Importante: `SUPABASE_SERVICE_ROLE_KEY` deve existir somente no servidor. Nunca coloque essa chave no app mobile, no navegador ou em arquivos versionados.

## Como rodar localmente

```bash
npm install
npm run dev
```

O Vite sobe o painel e usa middlewares locais para algumas APIs de administração durante o desenvolvimento.

## Como gerar build

```bash
npm run build
```

O resultado será gerado em `dist`.

## Implantação em servidor

Este projeto está preparado para Vercel:

- Build command: `npm run build`
- Output directory: `dist`
- Framework: Vite
- APIs: pasta `/api`

Em outro servidor, é necessário suportar:

- Servir o build estático de `dist`.
- Executar as rotas serverless/Node da pasta `/api`.
- Reescrever rotas do painel para `index.html`, mantendo `/api/*` apontando para as APIs.

## O que precisa configurar no Supabase

- Autenticação por e-mail/senha.
- Tabelas do sistema, como perfis, vistorias, fotos, agendamentos e modelos de requisitos.
- Storage/buckets usados para fotos e anexos, quando aplicável.
- Políticas de acesso compatíveis com o uso das APIs server-side.
- Realtime habilitado para as tabelas que o painel acompanha ao vivo, se desejarem atualização automática.

## O que não é necessário para este painel web

- EAS/Expo para build do aplicativo.
- Firebase Admin SDK local.
- `google-services.json`.
- APK ou arquivos OTA.
- Chave privada Firebase no repositório.

As credenciais de push do app são necessárias apenas no ambiente mobile/Expo quando forem publicar o aplicativo.
