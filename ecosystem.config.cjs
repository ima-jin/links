// pm2 ecosystem for the standalone ima-jin/links app (refs imajin-ai#2490).
//
// One file, two entries: `prod-links` (7102) and `dev-links` (3102). Each
// server checks the repo out once per environment (~/prod/links, ~/dev/links)
// and starts only its own entry:
//
//   pm2 startOrReload ecosystem.config.cjs --only prod-links --update-env
//
// scripts/deploy.sh does exactly that; see docs/DEPLOY.md.
//
// Follows the imajin-ai deploy/ecosystem.*.config.js conventions:
//   - pm2 execs the Next listener directly (imajin-ai#2447). Never
//     `script: "npm"` / `args: "start"`: pm2 would track the npm wrapper, and
//     on restart the `next-server` grandchild survives, keeps the port bound,
//     and the fresh copy crash-loops on EADDRINUSE.
//   - The env file is loaded with Node's --env-file (like prod-jin) so the
//     process env is a property of this config, not of whoever ran the last
//     restart. Node EXITS if the file is missing — deliberate: a links that
//     cannot load its env must crash loudly, not boot without its identity.
//     Secrets stay in the untracked .env.local; only its path is versioned.
//   - `cwd` is this file's own directory, so the config is correct wherever
//     the checkout lives and never hard-codes a user's home directory.
const path = require('node:path');
const os = require('node:os');

const root = __dirname;
const logDir = path.join(os.homedir(), '.pm2', 'logs');

function linksApp(name, port) {
  return {
    name,
    cwd: root,
    script: 'node_modules/next/dist/bin/next',
    args: `start -p ${port}`,
    interpreter: 'node',
    node_args: `--env-file=${path.join(root, '.env.local')}`,
    exec_mode: 'fork',
    env: {
      PORT: port,
      NODE_ENV: 'production',
    },
    out_file: path.join(logDir, `${name}-out.log`),
    error_file: path.join(logDir, `${name}-error.log`),
    time: true,
    max_restarts: 10,
    min_uptime: '20s',
    // Explicit kill_timeout (imajin-ai#2547/#2573): same 15s the kernel-repo
    // apps use (imajin-ai deploy/ecosystem.*.config.js), so pm2 waits for a
    // clean Next shutdown before SIGKILL.
    kill_timeout: 15000,
  };
}

module.exports = {
  apps: [linksApp('prod-links', 7102), linksApp('dev-links', 3102)],
};
