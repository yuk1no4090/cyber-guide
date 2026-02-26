function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

module.exports = {
  apps: [
    {
      name: process.env.PM2_APP_NAME || "cyber-guide",
      cwd: __dirname,
      script: "npm",
      args: "start",
      exec_mode: "fork",
      instances: parsePositiveInt(process.env.PM2_INSTANCES, 1),
      autorestart: true,
      max_memory_restart: process.env.PM2_MAX_MEMORY_RESTART || "600M",
      time: true,
      merge_logs: true,
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || "3000",
      },
    },
  ],
};
