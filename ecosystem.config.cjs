module.exports = {
  apps: [
    {
      name: 'claude-viewer-3401',
      script: './start-3401.sh',
      cwd: process.cwd(),
      env: {
        NODE_ENV: 'development',
        PATH: `${process.cwd()}/node_modules/.bin:${process.env.PATH}`
      },
      watch: false,
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G'
    },
    {
      name: 'claude-viewer-3402',
      script: './start-3402.sh',
      cwd: process.cwd(),
      env: {
        NODE_ENV: 'development',
        PATH: `${process.cwd()}/node_modules/.bin:${process.env.PATH}`
      },
      watch: false,
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G'
    },
    {
      name: 'claude-viewer-3403',
      script: './start-3403.sh',
      cwd: process.cwd(),
      env: {
        NODE_ENV: 'development',
        PATH: `${process.cwd()}/node_modules/.bin:${process.env.PATH}`
      },
      watch: false,
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G'
    },
    {
      name: 'claude-viewer-3404',
      script: './start-3404.sh',
      cwd: process.cwd(),
      env: {
        NODE_ENV: 'development',
        PATH: `${process.cwd()}/node_modules/.bin:${process.env.PATH}`
      },
      watch: false,
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G'
    },
    {
      name: 'claude-viewer-3405',
      script: './start-3405.sh',
      cwd: process.cwd(),
      env: {
        NODE_ENV: 'development',
        PATH: `${process.cwd()}/node_modules/.bin:${process.env.PATH}`
      },
      watch: false,
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G'
    }
  ]
};