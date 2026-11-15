/**
 * pm2 进程配置：Vidday 后台服务（Fastify + mysql2）。
 *
 * 用法：
 *   pm2 start deploy/ecosystem.config.cjs
 *   pm2 reload vidday-api --update-env
 *
 * 说明：
 *  - `cwd` 由本文件位置推导，不依赖调用时的当前目录。
 *  - 后端直接以 TS 源码运行，依赖 --experimental-strip-types（Node 22 需显式开启）。
 *  - node 必须是系统级安装的 22+（不要用 nvm），否则 `pm2 startup` 的开机自启找不到解释器。
 *  - 环境变量来自 server/.env，由服务自身在启动时加载，无需在此重复声明。
 */
const path = require('node:path')

const serverDir = path.resolve(__dirname, '..', 'server')

module.exports = {
  apps: [
    {
      name: 'vidday-api',
      script: 'src/index.ts',
      interpreter: 'node',
      node_args: '--experimental-strip-types',
      cwd: serverDir,
      env: { NODE_ENV: 'production' },
      max_restarts: 10,
      restart_delay: 3000,
      kill_timeout: 5000,
    },
  ],
}
