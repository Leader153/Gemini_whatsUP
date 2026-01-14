# План развертывания проекта на VPS

Этот документ содержит пошаговый план действий для развертывания вашего проекта.

---

### **Шаг 1: Публикация проекта в GitHub**

**Среда выполнения:** Ваш локальный компьютер.

**Задача:** Убедиться, что все сделанные мной изменения (новые файлы, исправления в коде) отправлены в ваш репозиторий на GitHub.

1.  **Проверьте статус файлов:**
    ```bash
    git status
    ```
2.  **Добавьте все измененные и новые файлы для коммита:**
    ```bash
    git add .
    ```
3.  **Сделайте коммит (сохраните изменения):**
    ```bash
    git commit -m "Подготовка проекта к развертыванию на VPS"
    ```
4.  **Отправьте изменения в ваш GitHub репозиторий:**
    ```bash
    git push origin SMS-во-время-разговора-CLI
    ```

---

### **Шаг 2: Настройка DNS**

**Среда выполнения:** Панель управления вашего доменного регистратора.

**Задача:** "Привязать" ваш домен к IP-адресу сервера.

1.  Войдите в личный кабинет, где вы покупали домен `assistantbot.online`.
2.  Найдите настройки DNS для этого домена.
3.  Создайте или измените **A-запись** так, чтобы она указывала на IP-адрес вашего VPS: `194.5.159.34`.

---

### **Шаг 3: Подготовка и запуск на VPS**

**Среда выполнения:** Ваш сервер VPS.

**Задача:** Установить всё необходимое ПО, скачать проект из GitHub и запустить его.

1.  **Подключитесь к вашему VPS по SSH:**
    ```bash
    ssh root@assistantbot.online
    ```

2.  **Установите необходимое ПО (Node.js, npm, PM2, Git):**
    ```bash
    # Обновляем список пакетов
    sudo apt update
    # Устанавливаем Git
    sudo apt install -y git
    # Устанавливаем Node.js 20.x
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    # Устанавливаем PM2
    sudo npm install -g pm2

удалить всю папку:
rm -rf /docker/Gemini_whatsUP

сделать новую пaпку 
mkdir /docker/Gemini_whatsUP

вернуться в root - cd
    ```

3.  **Клонируйте ваш проект из GitHub:**
    ```bash
    git clone -b SMS-во-время-разговора-CLI https://github.com/Leader153/Gemini_whatsUP.git /docker/Gemini_whatsUP
    ```
    Клонируем весь репозиторий в нужную папку
git clone https://github.com/Leader153/Gemini_whatsUP /docker/Gemini_whatsUP
Переходим в папку проекта
cd /docker/Gemini_whatsUP
Переключаемся на нужную ветку (ты хотел SMS-во-время-разговора-CLI):
git fetch --all
git branch -a
git checkout -- SMS-во-время-разговора-CLI
Проверь, что файлы на месте
ls

4.  **Сгенерируйте SSL-сертификат с помощью Certbot:**
    *   **Важно:** Убедитесь, что порт `80` свободен на время выполнения этой команды.
    ```bash
    # Устанавливаем Certbot
    sudo snap install --classic certbot
    sudo ln -s /snap/bin/certbot /usr/bin/certbot
    # Генерируем сертификат
    sudo certbot certonly --standalone -d assistantbot.online
    ```

5.  **Настройте брандмауэр:**
    ```bash
    sudo ufw allow 1337/tcp
    ```

6.  **Перейдите в директорию проекта:**
    ```bash
    cd /docker/Gemini_whatsUP
    ```

7.  **Создайте файл переменных окружения (.env):**
    *   Этот файл не хранится в репозитории по соображениям безопасности. Вам нужно создать его и внести ваши секретные данные.
    ```bash
    # Откройте редактор nano для создания или редактирования файла .env
    nano .env
    ```
    *   **В открывшемся редакторе `nano` вставьте ваши переменные окружения, например:**
    ```
    TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    TWILIO_AUTH_TOKEN=your_auth_token
    TWILIO_PHONE_NUMBER=+1234567890
    GEMINI_API_KEY=your_gemini_api_key
    # Добавьте любые другие переменные, которые нужны вашему приложению
    ```
# если .env уже есть и корректный
cp /docker/Gemini_whatsUP/.env /root/gemini.env.backup

rm -rf /docker/Gemini_whatsUP
git clone https://github.com/Leader153/Gemini_whatsUP.git /docker/Gemini_whatsUP

cp /root/gemini.env.backup /docker/Gemini_whatsUP/.env  -
-------------

    *   **После того как вы вставили все переменные:**
        *   **Сохранить:** Нажмите `Ctrl+O` (Ctrl и латинская O одновременно).
        *   **Подтвердить имя файла:** Нажмите `Enter`.
        *   **Выйти из nano:** Нажмите `Ctrl+X` (Ctrl и латинская X одновременно).

8.  **Установите зависимости:**
    ```bash
    # Файл index.js уже находится в репозитории и будет склонирован вместе с остальным кодом.
    npm install --legacy-peer-deps
    ```

9.  **Запустите приложение с помощью PM2:**
    ```bash
    pm2 start npm --name gemini-bot -- run start
    pm2 save
    ```
    *   **Проверить статус:** `pm2 list`
    *   **Посмотреть логи:** `pm2 logs gemini-bot --lines 50`

10. **Настройте автозапуск приложения после перезагрузки сервера:**
    ```bash
    pm2 startup
    # Скопируйте и выполните команду, которую вам выдаст pm2 startup
    pm2 save
    ```

---

### **Шаг 4: Обновление проекта с полным переразвертыванием (в случае проблем)**

**Среда выполнения:** Ваш сервер VPS.

**Задача:** Полностью обновить проект, если возникли проблемы, или для серьезных изменений.

1.  **Остановить и удалить процесс бота:**
    ```bash
    pm2 delete gemini-bot
    ```

2.  **Очистить папку проекта:**
    *   **Важно:** Перед удалением папки убедитесь, что у вас нет внутри локальных файлов, которые нужно сохранить (например, `.env`); если есть — сначала скопируйте их в другое место, а потом верните обратно.
    ```bash
    rm -rf /docker/Gemini_whatsUP
    ```

3.  **Заново клонировать репозиторий:**
    ```bash
    git clone -b SMS-во-время-разговора-CLI https://github.com/Leader153/Gemini_whatsUP.git /docker/Gemini_whatsUP
    ```

4.  **Зайти в проект, создать .env, поставить зависимости и запустить:**
    ```bash
    cd /docker/Gemini_whatsUP
    # Создайте файл .env и внесите ваши переменные окружения
    # Откройте редактор nano для создания или редактирования файла .env
    nano .env
    ```
    *   **В открывшемся редакторе `nano` вставьте ваши переменные окружения, например:**
    ```
    TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    TWILIO_AUTH_TOKEN=your_auth_token
    TWILIO_PHONE_NUMBER=+1234567890
    GEMINI_API_KEY=your_gemini_api_key
    # Добавьте любые другие переменные, которые нужны вашему приложению
    ```
    *   **После того как вы вставили все переменные:**
        *   **Сохранить:** Нажмите `Ctrl+O` (Ctrl и латинская O одновременно).
        *   **Подтвердить имя файла:** Нажмите `Enter`.
        *   **Выйти из nano:** Нажмите `Ctrl+X` (Ctrl и латинская X одновременно).

    ```bash
    # Файл index.js уже находится в репозитории и будет склонирован вместе с остальным кодом.
    npm install --legacy-peer-deps
    pm2 start npm --name gemini-bot -- run start
    pm2 save
    ```
    *   **Посмотреть логи:** `pm2 logs gemini-bot --lines 50`

---

### **Шаг 5: Дополнительные команды на VPS (Опционально)**

**Среда выполнения:** Ваш сервер VPS.

**Задача:** Войти в Docker Hub, если вы используете его для других сервисов.

```bash
docker login ghcr.io -u Leader153
```
