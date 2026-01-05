module.exports = {
  apps: [{
    name: "leader-tunnel",
    script: "cloudflared",
    args: "tunnel --config config.yml run",
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
