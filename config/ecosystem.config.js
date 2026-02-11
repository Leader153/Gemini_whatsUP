module.exports = {
  apps: [{
    // Туннель Cloudflare (для локальной разработки)
    name: "leader-tunnel",
    script: "cloudflared",
    args: "tunnel --config config.local.yml run",
    interpreter: "none",
    cwd: "./",
    exec_mode: "fork"
  }, {
    // Основной бот
    name: "gemini-bot",
    script: "index.js",
    cwd: "./",

    // Настройки слежения (перезапуск при изменении файлов)
    watch: false, // ОТКЛЮЧЕНО: перезапуск обрывает активные звонки
    ignore_watch: ["node_modules", "data", "logs", "orders", ".git", ".env*"],

    // Переменные окружения по умолчанию (Локально)
    env: {
      NODE_ENV: "development",
    },

    // Переменные для VPS (Запуск: pm2 start ... --env production)
    env_production: {
      NODE_ENV: "production",
      watch: false // На сервере авто-перезапуск при изменении файлов обычно отключают
    }
  }]
}