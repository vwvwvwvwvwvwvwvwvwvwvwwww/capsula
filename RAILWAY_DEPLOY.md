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

Для уведомлений о предзаказах на **Яндекс.Почту** (рекомендуется):

```env
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_SECURE=1
SMTP_USER=you@yandex.ru
SMTP_PASS=пароль_приложения_16_символов
MAIL_FROM=Капсула <you@yandex.ru>
MAIL_TO=you@yandex.ru
MAIL_OUTBOX_DIR=/data/mail-outbox
```

**Как получить SMTP_PASS для Яндекса:**
1. [id.yandex.ru](https://id.yandex.ru) → **Безопасность** → **Пароли приложений** → создайте пароль для **«Почта»**.
2. В **Яндекс.Почте** → **Настройки** → **Почтовые программы** → включите доступ по SMTP.
3. В Railway → **Variables** вставьте переменные выше. `SMTP_PASS` — **только** пароль приложения, не обычный пароль от аккаунта.
4. **Redeploy** сервиса. В админке (`/admin.html`) появится блок **«Почта»** — нажмите **«Отправить тестовое письмо»**.

Для Gmail или другого SMTP:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=1
SMTP_USER=your@gmail.com
SMTP_PASS=app_password
MAIL_FROM=Капсула <your@gmail.com>
MAIL_TO=manager@example.com
```

Для Gmail нужен **App Password**: включите двухфакторную защиту в аккаунте Google и создайте пароль приложения. Для другого почтового сервиса замените `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` на данные провайдера.

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
