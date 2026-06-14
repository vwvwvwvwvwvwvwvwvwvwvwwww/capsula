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

### Почта (любой сервис)

**Минимум** — хост подставится сам по домену `SMTP_USER`:

```env
SMTP_USER=you@mail.ru
SMTP_PASS=пароль_приложения
MAIL_TO=you@mail.ru
MAIL_FROM=Капсула <you@mail.ru>
MAIL_OUTBOX_DIR=/data/mail-outbox
```

Поддерживаются автоматически: **Яндекс**, **Mail.ru** (mail.ru, bk.ru, inbox.ru, list.ru), **Gmail**, **Outlook/Hotmail**, **Yahoo**, **Rambler**, **iCloud**.

Если автоопределение не сработало — задайте вручную:

```env
SMTP_PROVIDER=mailru
# или SMTP_HOST=smtp.mail.ru
# SMTP_PORT=465
# SMTP_SECURE=1
```

| Сервис | SMTP_USER | Где взять SMTP_PASS |
|--------|-----------|---------------------|
| Яндекс | `you@yandex.ru` | id.yandex.ru → Пароли приложений → «Почта» |
| Mail.ru | `you@mail.ru` | mail.ru → Настройки → Пароль для внешнего приложения |
| Gmail | `you@gmail.com` | Google → 2FA → App Password |
| Outlook | `you@outlook.com` | Пароль Microsoft или пароль приложения |

После **Redeploy** → админка `/admin.html` → блок **«Почта»** → **«Отправить тестовое письмо»**.

### Порт и домен (Networking)

На **вашем компьютере** порты 3333 / 8080 «заняты» или свободны — на Railway это **не важно**: там отдельный контейнер.

- Railway сам подставляет переменную **`PORT`** при запуске. Сервер читает `process.env.PORT` (если нет — локально будет **3333**).
- В окне **Generate Service Domain** в поле порта введите **тот же номер**, на котором реально слушает приложение: он виден в **Deploy logs** после строки `[КАПСУЛА] Слушаем порт …`.
- Если вы **сами** добавили `PORT` в Variables — число в Networking должно **совпадать** с ним. Иначе прокси пойдёт не туда.
- Чтобы не путаться: **удалите ручной `PORT` из Variables** и сгенерируйте домен с портом из лога (часто **8080**, но смотрите лог).

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

Задайте в Railway Variables:

```env
ADMIN_EMAIL=ceoof@inbox.ru
ADMIN_PASSWORD=ваш_надёжный_пароль
```

После **Redeploy** админ создаётся или обновляется автоматически.

Вход: `/account.html` → затем `/admin.html`.

Если `ADMIN_EMAIL` / `ADMIN_PASSWORD` не заданы, будет дефолт `admin@kapsula.local` / `admin123` (только при пустой базе).

## 7. Ошибка сборки `better-sqlite3` / `node-gyp`

Если в логах `npm ci` падает на `better-sqlite3`:

1. В Railway → **Settings** → **Node** (или Variables) убедитесь, что нет переменной `NODE_VERSION=24` — удалите её или поставьте `20`.
2. Закоммитьте и запушьте актуальные `Dockerfile`, `.nvmrc`, `nixpacks.toml` из репозитория.
3. **Redeploy** (Deploy → Redeploy).

После успешной сборки проверьте `/api/ping` (см. раздел 5).
