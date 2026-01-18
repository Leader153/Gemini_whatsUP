module.exports = {
  apps: [{
    name: "leader-tunnel",
    script: "cloudflared",
    // Используем config.local.yml для локальной разработки
    args: "tunnel --config config.local.yml run",
    interpreter: "none",
    cwd: "./",
    exec_mode: "fork"
  }, {
    name: "gemini-bot",
    script: "answer_phone.js",
    watch: true,
    cwd: "./",
    ignore_watch: ["node_modules", "orders", "data", "logs", ".git"],
    env: {
      NODE_ENV: "production",
    }
  }]
}
