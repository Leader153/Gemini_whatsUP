//
// Конфигурация PM2 для продакшен-сервера (VPS).
// Этот файл содержит только настройки для запуска самого бота.
// Туннель Cloudflare здесь не используется, так как сервер
// имеет публичный IP-адрес.
//
module.exports = {
  apps: [{
    name: "gemini-bot",
    script: "handlers/answer_phone.js",
    watch: false, // На сервере лучше отключать watch и перезапускать вручную при обновлении
    cwd: "./",
    env: {
      NODE_ENV: "production",
    }
  }]
}
