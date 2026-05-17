# Guia de implementação

Este documento é para a pessoa que vai pegar o sistema do zero e colocar para funcionar em outro ambiente.

Vou explicar do jeito mais direto possível: o projeto nasceu usando **Vercel** para hospedar o painel/API e **Supabase** para login, banco, storage e realtime. Esse é o caminho mais rápido. Dá para usar outro banco e outro servidor, mas aí você precisa substituir algumas peças.

## Visão geral

O sistema tem três partes importantes:

- Painel Web: onde o administrador mexe nos acessos, vistorias, requisitos e PDF.
- API: fica junto do painel Web, dentro da pasta `/api`.
- App Mobile: instala no celular e chama a API da Web.

O banco guarda:

- usuários/perfis;
- vistorias enviadas;
- fotos das vistorias;
- agendamentos;
- tipos de vistoria;
- token de push dos celulares;
- configuração dos requisitos, que hoje fica em um arquivo JSON dentro do Storage.

## Ordem certa para implementar

Faça nesta ordem. Evita muita dor de cabeça.

1. Criar o banco.
2. Rodar o SQL base.
3. Criar os buckets de arquivos.
4. Configurar as variáveis de ambiente da Web.
5. Publicar a Web.
6. Criar o primeiro usuário administrador.
7. Configurar o app mobile apontando para a Web.
8. Configurar Firebase/Expo para push.
9. Gerar o build Android.
10. Testar login, envio de vistoria, PDF e notificação.

## Banco de dados usado no projeto original

O projeto original usa Supabase, que por baixo usa PostgreSQL.

O script base está em:

```text
database/supabase-schema.sql
```

No Supabase, você pode rodar assim:

1. Abra o projeto no Supabase.
2. Vá em `SQL Editor`.
3. Crie uma nova query.
4. Cole o conteúdo de `database/supabase-schema.sql`.
5. Execute.

Esse SQL cria as tabelas principais, índices e algumas políticas básicas de RLS.

## Tabelas principais

### `profiles`

É o perfil do usuário dentro do sistema.

O Supabase Auth cria o usuário em `auth.users`, mas o sistema precisa de mais informações. Por isso existe `profiles`.

Campos mais importantes:

- `id`: mesmo ID do usuário no Auth.
- `email`: e-mail do usuário.
- `full_name`: nome que aparece no painel/app.
- `access_role`: perfil de acesso.
- `active`: se o usuário pode usar o sistema.
- `avatar_url`: foto do usuário.
- `expo_push_token`: token para notificação no celular.
- `push_platform`: Android/iOS.
- `push_updated_at`: quando o token foi salvo.

Perfis usados:

- `admin`: administra o painel.
- `driver`: motorista/condutor.
- `inspector`: vistoriador.
- `app`: perfil antigo de vistoriador, ainda aceito pelo código.

### `inspections`

Guarda cada vistoria enviada.

Campos principais:

- `user_id`: quem enviou.
- `type`: tipo da vistoria.
- `driver_name`: nome do motorista.
- `truck_plate`: placa do cavalo.
- `trailer_plate`: placa da carreta.
- `status`: `completed`, `approved` ou `rejected`.
- `observations`: observações ou motivo da reprovação.
- `signature_data`: assinatura em JSON.
- `applicable`: respostas, requisitos e snapshot do modelo usado.
- `created_at` e `completed_at`.

### `inspection_photos`

Guarda as fotos ligadas a uma vistoria.

O arquivo em si fica no Storage. A tabela guarda o caminho.

Campos principais:

- `inspection_id`: vistoria dona da foto.
- `label`: nome da foto, por exemplo “Lateral Direita”.
- `storage_path`: caminho no bucket.
- `local_uri`: referência local/temporária, quando existir.

### `inspection_schedules`

Guarda agendamentos.

Campos principais:

- `driver_user_id`: motorista.
- `assigned_inspector_id`: vistoriador direcionado.
- `inspection_id`: vistoria gerada quando o serviço é concluído.
- `inspection_type`: tipo da vistoria.
- `driver_name`, `truck_plate`, `trailer_plate`.
- `scheduled_date`, `scheduled_time`.
- `status`: `scheduled`, `assigned`, `completed` ou `cancelled`.
- `notes`.

### `inspection_types`

Lista simples de tipos de vistoria.

Hoje a configuração mais completa dos tipos e requisitos fica no Storage, mas essa tabela ajuda a manter compatibilidade e consultas simples.

## Buckets necessários no Supabase Storage

O código cria alguns buckets automaticamente se eles não existirem, mas em implantação séria é melhor criar manualmente.

Crie:

```text
inspection-photos
profile-photos
system-config
```

Sugestão:

- `inspection-photos`: privado.
- `profile-photos`: público, porque é foto/avatar de usuário.
- `system-config`: privado.

O bucket `system-config` guarda o arquivo:

```text
checklist-models.json
```

Esse arquivo é onde ficam os modelos de requisitos configurados no painel.

## Variáveis de ambiente da Web

Na Vercel, Render, Railway, VPS ou qualquer outro servidor, configure:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUA_CHAVE_PUBLICA
SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY
```

Se o projeto usar anon key:

```env
VITE_SUPABASE_ANON_KEY=SUA_ANON_KEY
```

Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` no mobile ou no front-end puro. Ela é chave de servidor.

## Criando o primeiro administrador

O jeito mais simples:

1. Crie um usuário no Supabase Auth.
2. Pegue o `id` desse usuário.
3. Insira um perfil na tabela `profiles`.

Exemplo:

```sql
insert into public.profiles (id, email, full_name, access_role, active)
values (
  'ID-DO-USUARIO-AQUI',
  'admin@suaempresa.com.br',
  'Administrador',
  'admin',
  true
)
on conflict (id) do update set
  access_role = 'admin',
  active = true,
  full_name = excluded.full_name,
  email = excluded.email;
```

Depois disso, esse usuário já deve conseguir entrar no painel.

## Como implementar em outro banco

Dá para trocar o Supabase, mas pense no Supabase como quatro coisas juntas:

- Auth.
- Banco PostgreSQL.
- Storage.
- Realtime.

Se trocar, você precisa substituir cada uma dessas partes.

### Exemplo usando PostgreSQL próprio

Você pode usar PostgreSQL em Neon, RDS, Railway, VPS ou outro provedor.

Nesse caso:

- mantenha tabelas parecidas com o SQL deste projeto;
- use Prisma, Drizzle, Knex ou SQL direto nas APIs;
- troque todas as chamadas `admin.from('tabela')`;
- troque chamadas de Storage;
- troque `auth.getUser(token)` por validação JWT própria ou por outro provedor.

O melhor desenho fica assim:

```text
App Mobile -> API Web -> Banco
Painel Web -> API Web -> Banco
```

Ou seja: o app e o painel não falam direto com o banco. Eles falam com a API.

### Exemplo usando MySQL ou SQL Server

Também funciona, mas os tipos mudam.

Mapeamentos comuns:

- `uuid` vira `char(36)` ou tipo UUID equivalente.
- `jsonb` vira `json`.
- `timestamptz` vira `datetime` ou `timestamp`.
- RLS do Supabase precisa virar regra dentro da API.
- Storage precisa ser S3, R2, Azure Blob ou outro.

O mais importante é preservar o formato que a API devolve para o app e para o painel.

### Exemplo usando MongoDB

É possível, mas exige mais adaptação.

Você provavelmente criaria coleções como:

- `profiles`
- `inspections`
- `inspection_photos`
- `inspection_schedules`
- `inspection_types`

Fotos continuariam fora do MongoDB, em storage próprio. No MongoDB você guarda só o caminho/URL.

## Como implementar em outra hospedagem

Na Vercel, a pasta `/api` vira serverless function automaticamente.

Em outro lugar, você precisa dar um lar para essas APIs.

### Render ou Railway

O caminho mais comum é transformar `/api` em um servidor Node com Express/Fastify.

Você teria rotas como:

```text
POST /api/web-login
GET  /api/admin-profiles
POST /api/admin-inspections
POST /api/submit-inspection
POST /api/register-push-token
```

### VPS

Em VPS, normalmente fica assim:

```text
Nginx
  /          -> arquivos estáticos do dist
  /api/*     -> processo Node rodando a API
```

Você precisa cuidar de:

- HTTPS;
- variáveis de ambiente;
- processo Node sempre ativo;
- logs;
- limite de upload de foto;
- backup do banco;
- backup dos arquivos/fotos.

## Onde mexer no código se sair do Supabase

Arquivos principais:

```text
api/*.js
shared/checklist-model-store.js
src/main.jsx
mobile/App.js
```

No cenário ideal, você reduz o uso direto de Supabase no front/mobile e coloca tudo na API.

## Notificações

Notificação com app fechado depende de:

- token salvo no usuário;
- API enviando push para Expo;
- FCM V1 configurado no EAS;
- build Android feito depois do Firebase configurado.

O token fica em:

```text
profiles.expo_push_token
```

E também pode ser salvo no metadata do usuário do Auth.

## Checklist final

Antes de entregar, teste nesta ordem:

1. Login no painel.
2. Criar/editar usuário.
3. Criar tipo de vistoria.
4. Configurar requisitos.
5. Configurar mínimo/máximo de fotos.
6. Entrar no app.
7. Enviar uma vistoria com foto.
8. Ver a vistoria no painel.
9. Aprovar.
10. Reprovar com motivo.
11. Conferir PDF.
12. Fechar o app e testar notificação.

Se esses 12 pontos passam, o sistema está em um bom estado para homologação.
