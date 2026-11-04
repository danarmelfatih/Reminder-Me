const children = [
  Bun.spawn(['bun', '--watch', 'src/server.js'], {
    stdout: 'inherit',
    stderr: 'inherit',
    env: process.env,
  }),
  Bun.spawn(['bun', '--watch', 'src/worker.js'], {
    stdout: 'inherit',
    stderr: 'inherit',
    env: process.env,
  }),
];

let stopping = false;

function stop(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`\nMenghentikan dev server (${signal})...`);
  for (const child of children) {
    child.kill();
  }
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

const codes = await Promise.all(children.map((child) => child.exited));
if (!stopping && codes.some((code) => code !== 0)) {
  process.exitCode = 1;
}
