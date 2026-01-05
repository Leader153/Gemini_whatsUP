# Настройка Google Calendar API

## Шаг 1: Создание проекта в Google Cloud Console

1. Перейдите в [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте новый проект или выберите существующий
3. Запомните **Project ID**

## Шаг 2: Включение Google Calendar API

1. В меню слева выберите **APIs & Services** → **Library**
2. Найдите **Google Calendar API**
3. Нажмите **Enable**

## Шаг 3: Создание Service Account

1. Перейдите в **APIs & Services** → **Credentials**
2. Нажмите **Create Credentials** → **Service Account**
3. Заполните данные:
   - **Service account name**: `gemini-calendar-bot` (или любое другое имя)
   - **Service account ID**: автоматически сгенерируется
   - **Description**: "Service account for Gemini voice bot calendar integration"
4. Нажмите **Create and Continue**
5. В разделе **Grant this service account access to project**:
   - Роль не требуется (оставьте пустым)
   - Нажмите **Continue**
6. Нажмите **Done**

## Шаг 4: Создание и скачивание ключа

1. В списке Service Accounts найдите созданный аккаунт
2. Нажмите на него
3. Перейдите на вкладку **Keys**
4. Нажмите **Add Key** → **Create new key**
5. Выберите формат **JSON**
6. Нажмите **Create**
7. Файл автоматически скачается

## Шаг 5: Установка ключа в проект

1. Переименуйте скачанный файл в `service-account-key.json`
2. Переместите файл в папку `calendar/` вашего проекта:
   ```
   c:\a my box\gemini-calender\calendar\service-account-key.json
   ```
3. **ВАЖНО**: Убедитесь, что этот файл добавлен в `.gitignore`!

## Шаг 6: Получение email Service Account

1. Откройте файл `service-account-key.json`
2. Найдите поле `client_email`
3. Скопируйте значение (например: `gemini-calendar-bot@your-project.iam.gserviceaccount.com`)

## Шаг 7: Предоставление доступа к календарю

1. Откройте [Google Calendar](https://calendar.google.com/)
2. Выберите календарь, который будет использоваться для бронирований
3. Нажмите на три точки рядом с календарем → **Settings and sharing**
4. Прокрутите вниз до раздела **Share with specific people**
5. Нажмите **Add people**
6. Вставьте email Service Account (из шага 6)
7. Выберите права доступа: **Make changes to events**
8. Нажмите **Send**

## Шаг 8: Получение Calendar ID

1. В настройках календаря прокрутите вниз до раздела **Integrate calendar**
2. Найдите **Calendar ID**
3. Скопируйте значение (обычно это ваш email или что-то вроде `abc123@group.calendar.google.com`)

## Шаг 9: Обновление .env файла

Добавьте следующие строки в файл `.env`:

```
GOOGLE_CALENDAR_ID=your-calendar-id@gmail.com
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./calendar/service-account-key.json
```

Замените `your-calendar-id@gmail.com` на Calendar ID из шага 8.

## Шаг 10: Проверка подключения

Запустите тестовый скрипт:

```bash
node calendar/testConnection.js
```

Если все настроено правильно, вы увидите список событий из календаря.

## Безопасность

⚠️ **ВАЖНО**:
- Никогда не коммитьте `service-account-key.json` в Git
- Не делитесь этим файлом публично
- Храните файл в безопасном месте
- Добавьте `calendar/service-account-key.json` в `.gitignore`

## Troubleshooting

### Ошибка: "Calendar API has not been used in project"
- Убедитесь, что вы включили Google Calendar API в шаге 2

### Ошибка: "Insufficient Permission"
- Проверьте, что Service Account добавлен в календарь с правами "Make changes to events"
- Убедитесь, что используете правильный Calendar ID

### Ошибка: "Invalid credentials"
- Проверьте путь к файлу `service-account-key.json`
- Убедитесь, что файл не поврежден
