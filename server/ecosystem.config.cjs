module.exports = {
  apps: [
    {
      name: 'vidday-server',
      script: 'node',
      args: '--experimental-strip-types src/index.ts',
      cwd: '/www/wwwroot/vidday/server',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1024M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
