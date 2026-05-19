# Деплой Капсула на Railway

## 1. Подготовка проекта

В проекте уже есть:

- `npm start` → запускает `server.mjs`
- `railway.json` → команда запуска и healthcheck `/api/ping`
- поддержка `PORT` от Railway
- поддержка SQLite через `DB_PATH`
- поддержка каталога через `PRODUCTS_PATH`

Перед загрузкой не добавляйте файл `.env` в репозиторий. Он уже указан в `.gitignore`.

Сборка идёт через **`Dockerfile`** (Node 20). В репозитории также есть `.nvmrc` и `nixpacks.toml` на случай Nixpacks. Не ставьте в Railway `NODE_VERSION=24` — для `better-sqlite3` сборка часто падает.

## 2. Загрузка на Railway

1. Создайте проект на Railway.
2. Подключите GitHub-репозиторий с этим сайтом или загрузите проект через Railway CLI.
3. Railway сам выполнит `npm install` и `npm start`.

## 3. Volume для базы

SQLite-файлы на Railway без Volume могут пропадать при redeploy. Поэтому:

1. В Railway добавьте `Volume`.
2. Mount path укажите:

```text
/data
```

3. В `Variables` добавьте:

```env
DB_PATH=/data/app.db
PRODUCTS_PATH=/data/products.json
```

## 4. Переменные окружения

Минимально :

```env
ADMIN_EMAIL=admin@kapsula.local
ADMIN_PASSWORD=admin123
DB_PATH=/data/app.db
PRODUCTS_PATH=/data/products.json
```

`PORT` в Railway не задавайте вручную.

## 5. Проверка после деплоя

Откройте:

```text
https://ваш-домен.up.railway.app/api/ping
```

Должен быть JSON:

```json
{"ok":true,"service":"kapsula"}
```

После этого открывайте главную страницу сайта.

## 6. Первый вход

Если база новая, админ создаётся автоматически из переменных:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

Если их не задать, будет дефолт:

- `admin@kapsula.local`
- `admin123`

Для публичной ссылки лучше задать свой пароль в Railway Variables.

## 7. Ошибка сборки `better-sqlite3` / `node-gyp`

Если в логах `npm ci` падает на `better-sqlite3`:

1. В Railway → **Settings** → **Node** (или Variables) убедитесь, что нет переменной `NODE_VERSION=24` — удалите её или поставьте `20`.
2. Закоммитьте и запушьте актуальные `Dockerfile`, `.nvmrc`, `nixpacks.toml` из репозитория.
3. **Redeploy** (Deploy → Redeploy).

После успешной сборки проверьте `/api/ping` (см. раздел 5).
