import { spawn } from 'node:child_process';

// Some Windows setups use a locally trusted HTTPS inspection certificate. Newer
// Node versions can load that trust store; using it keeps certificate checks on.
const [major, minor] = process.versions.node.split('.').map(Number);
const args = ['--env-file=.env', 'server.mjs'];
if (major > 22 || (major === 22 && minor >= 15)) args.unshift('--use-system-ca');

const server = spawn(process.execPath, args, { stdio: 'inherit' });
server.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
