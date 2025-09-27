module.exports = {
  apps: [
    {
      name: 'claude-viewer-3401',
      script: 'node_modules/.bin/next',
      args: 'dev -p 3401',
      cwd: process.cwd(),
      env: {
        PORT: 3401,
        NODE_ENV: 'development'
      },
      watch: false,
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G'
    },
    {
      name: 'claude-viewer-3402',
      script: 'node_modules/.bin/next',
      args: 'dev -p 3402',
      cwd: process.cwd(),
      env: {
        PORT: 3402,
        NODE_ENV: 'development'
      },
      watch: false,
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G'
    },
    {
      name: 'claude-viewer-3403',
      script: 'node_modules/.bin/next',
      args: 'dev -p 3403',
      cwd: process.cwd(),
      env: {
        PORT: 3403,
        NODE_ENV: 'development'
      },
      watch: false,
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G'
    },
    {
      name: 'claude-viewer-3404',
      script: 'node_modules/.bin/next',
      args: 'dev -p 3404',
      cwd: process.cwd(),
      env: {
        PORT: 3404,
        NODE_ENV: 'development'
      },
      watch: false,
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G'
    },
    {
      name: 'claude-viewer-3405',
      script: 'node_modules/.bin/next',
      args: 'dev -p 3405',
      cwd: process.cwd(),
      env: {
        PORT: 3405,
        NODE_ENV: 'development'
      },
      watch: false,
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G'
    }
  ]
};