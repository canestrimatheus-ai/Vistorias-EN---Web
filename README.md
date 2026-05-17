# Vistorias EN - Web

Painel web e APIs serverless do sistema de vistorias EN.

Este projeto foi feito para rodar de forma simples com **Vercel** e **Supabase**.

Também é possível adaptar para outro servidor e outro banco de dados, mas nesse caso será necessário trocar as APIs da pasta `/api` e os pontos do front-end que usam Supabase diretamente.

## Explicando sem complicar

O sistema tem duas partes:

- **Web**: este repositório. É o painel administrativo e as APIs.
- **Mobile**: outro repositório. É o aplicativo instalado no celular.

O painel Web conversa com:

- Supabase Auth, para login e usuários.
- Supabase Database, para vistorias, perfis, requisitos, agendamentos e fotos.
- Supabase Realtime, para algumas atualizações automáticas no painel.
- Supabase Storage ou URLs salvas no banco, quando houver fotos/anexos.

As APIs da pasta `/api` rodam no servidor. Elas usam uma chave segura do Supabase chamada `service_role`. Essa chave nunca pode ir para o navegador ou para o app mobile.

## O que este repositório contém

- Painel web administrativo em React/Vite.
- APIs em `/api` para login, usuários, perfis, vistorias, fotos, requisitos, push token e notificações.
- Assets públicos em `/public`.
- Helpers compartilhados em `/shared`.
- Configuração de deploy Vercel em `vercel.json`.

## O que não está neste repositório

- Aplicativo mobile Expo/Android.
- Arquivos `.env` reais.
- Chaves Firebase.
- Chave Firebase Admin SDK.
- `google-services.json`.
- APK, AAB ou arquivos OTA.
- Builds gerados, logs e arquivos temporários.

## Requisitos para rodar do jeito original

Use isso se for implementar igual ao projeto atual.

Você precisa de:

- Node.js 20 ou superior.
- npm 10 ou superior.
- Conta na Vercel.
- Projeto no Supabase.
- Tabelas do banco criadas no Supabase.
- Variáveis de ambiente configuradas no servidor.

## Variáveis de ambiente obrigatórias

Crie um `.env.local` para desenvolvimento local ou configure estas variáveis na Vercel:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE_PUBLICA
SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY
```

Se o seu Supabase usa anon key no lugar de publishable key:

```env
VITE_SUPABASE_ANON_KEY=SUA_ANON_KEY
```

Use `VITE_SUPABASE_PUBLISHABLE_KEY` ou `VITE_SUPABASE_ANON_KEY`. Não precisa das duas.

## O que cada variável significa

`VITE_SUPABASE_URL`

Endereço do seu projeto Supabase.

`VITE_SUPABASE_PUBLISHABLE_KEY`

Chave pública usada pelo navegador. Pode ir para o front-end.

`VITE_SUPABASE_ANON_KEY`

Alternativa antiga à publishable key. Também é pública.

`SUPABASE_SERVICE_ROLE_KEY`

Chave administrativa usada somente nas APIs do servidor. Não coloque essa chave no mobile, no navegador, em prints, no GitHub ou em arquivos enviados para terceiros.

## Como rodar localmente

1. Instale as dependências:

```bash
npm install
```

2. Crie o arquivo `.env.local`:

```bash
cp .env.example .env.local
```

No Windows, se o comando acima não funcionar, crie o arquivo manualmente copiando o conteúdo de `.env.example`.

3. Preencha as variáveis reais no `.env.local`.

4. Rode o projeto:

```bash
npm run dev
```

5. Abra o endereço mostrado no terminal.

Normalmente será:

```text
http://localhost:5173
```

## Como gerar build

```bash
npm run build
```

O build será gerado em `dist`.

## Como publicar na Vercel

1. Suba este repositório no GitHub.
2. Entre na Vercel.
3. Clique em `Add New Project`.
4. Escolha este repositório.
5. Configure:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

6. Adicione as variáveis de ambiente:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
```

7. Faça o deploy.

8. Depois do deploy, copie a URL final. O app mobile usará essa URL em `EXPO_PUBLIC_WEB_API_URL`.

## O que precisa existir no Supabase

O banco precisa ter as tabelas que o sistema usa. Em termos práticos, a empresa precisa criar ou migrar:

- Usuários/autenticação.
- Perfis de acesso.
- Vistorias.
- Fotos/anexos de vistoria.
- Agendamentos.
- Modelos/requisitos de vistoria.
- Configurações de PDF.
- Tokens de push, se forem usar notificações.

Também precisa configurar:

- Auth por e-mail e senha.
- Storage, se as fotos forem salvas no Supabase Storage.
- Realtime, se quiser atualização ao vivo no painel.
- Políticas de acesso, se forem acessar dados direto pelo cliente.

## Se a empresa quiser usar outro banco de dados

Pode, mas não é só trocar uma variável.

Hoje o código usa Supabase diretamente em dois lugares:

1. No front-end, em `src/main.jsx`.
2. Nas APIs, em `/api`.

Para trocar por PostgreSQL direto, MySQL, SQL Server, MongoDB ou outro banco, será necessário:

- Criar uma camada de acesso a dados no servidor.
- Trocar chamadas `supabase.from(...)`.
- Trocar login/autenticação, se não for usar Supabase Auth.
- Trocar Realtime, se o banco escolhido não tiver isso pronto.
- Trocar Storage de fotos, se não for usar Supabase Storage.
- Ajustar o app mobile para usar a nova API.

O caminho recomendado para outro banco é:

- Manter o front-end chamando somente `/api`.
- Fazer toda leitura/escrita no servidor.
- Criar endpoints equivalentes aos atuais.
- Usar JWT/sessão própria ou outro provedor de autenticação.

Exemplos de substituição:

- Supabase Database -> PostgreSQL com Prisma.
- Supabase Auth -> Auth0, Clerk, Firebase Auth ou autenticação própria.
- Supabase Storage -> S3, Cloudflare R2, Azure Blob ou storage local.
- Supabase Realtime -> WebSocket próprio, Pusher, Ably ou polling controlado.

## Se a empresa quiser usar outra hospedagem

Também pode. O projeto só precisa de duas coisas:

- Servir o front-end estático de `dist`.
- Rodar as APIs Node da pasta `/api`.

Opções possíveis:

- Vercel, mais simples para este projeto.
- Netlify Functions.
- Render.
- Railway.
- Fly.io.
- VPS com Node.js e Nginx.
- Docker em servidor próprio.

Se usar VPS, a empresa precisará:

- Rodar `npm run build`.
- Servir `dist` com Nginx ou outro servidor HTTP.
- Transformar as APIs de `/api` em um servidor Node/Express ou Fastify.
- Configurar HTTPS.
- Configurar variáveis de ambiente no servidor.
- Configurar redirecionamento de rotas do painel para `index.html`.

## Regras de segurança

Nunca envie para o Git:

- `.env`
- `.env.local`
- `SUPABASE_SERVICE_ROLE_KEY`
- Firebase service account
- `google-services.json`
- Senhas de usuários
- Tokens de produção

Se alguma chave vazar, gere outra imediatamente no painel do provedor.

## Checklist de implantação

1. Criar projeto Supabase.
2. Criar tabelas e políticas.
3. Configurar Auth.
4. Configurar Storage, se usar fotos.
5. Criar projeto na Vercel.
6. Adicionar variáveis de ambiente.
7. Fazer deploy.
8. Criar usuário administrador.
9. Testar login no painel.
10. Testar criação de acesso.
11. Testar criação/edição de tipo de vistoria.
12. Testar requisitos.
13. Testar PDF.
14. Configurar o app mobile apontando para a URL publicada.

## Problemas comuns

### Tela branca

Confira se `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` estão configuradas.

### Login não funciona

Confira se o Supabase Auth está habilitado e se o usuário existe.

### APIs retornam erro 500

Confira se `SUPABASE_SERVICE_ROLE_KEY` está configurada no servidor.

### O mobile não conversa com a Web

Confira se o app mobile está usando a URL correta do painel em `EXPO_PUBLIC_WEB_API_URL`.
