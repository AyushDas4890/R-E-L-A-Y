import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';

const server = spawn('node', ['server/index.ts'], {
  stdio: 'inherit',
  shell: isWindows,
});

const vite = spawn(isWindows ? 'npx.cmd' : 'npx', ['vite'], {
  stdio: 'inherit',
  shell: isWindows,
});

function cleanup() {
  try { server.kill(); } catch {}
  try { vite.kill(); } catch {}
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

server.on('error', (err) => console.error('[Server Error]:', err));
vite.on('error', (err) => console.error('[Vite Error]:', err));
