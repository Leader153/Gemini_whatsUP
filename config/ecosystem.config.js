module.exports = {
  apps: [{
    name: "gemini-bot",
    script: "index.js",
    watch: true,
    cwd: "./",
    ignore_watch: ["node_modules", "orders", "data", "logs", ".git"],
    env: {
      NODE_ENV: "production",
    }
  }]
}
