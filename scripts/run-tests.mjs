// For each variant (flawed/, then fixed/): boots a fresh WordPress (Playground, SQLite)
// with that copy of the plugin and the demo data, runs the HTTP tests against it, stops it.
// One worker only: separate Playground workers do not see each other's writes at once.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

async function portFree(port) {
  try { await fetch(`http://127.0.0.1:${port}/`); return false; } catch { return true; }
}

// A port per variant, so the fixed tests can never reach a flawed server that is still stopping.
async function run(variant, port) {
if (!(await portFree(port))) throw new Error(`port ${port} is already in use`);
const server = spawn('npx', [
  'wp-playground-cli', 'server', `--port=${port}`, '--verbosity=quiet', '--workers=1', '--php=8.3', '--wp=7.1.3',
  `--mount=${root}/${variant}/client-invoices-lite:/wordpress/wp-content/plugins/client-invoices-lite`,
  `--mount=${root}/tests/mu-plugins:/wordpress/wp-content/mu-plugins`,
  `--mount=${root}/tests:/demo-tests`,
  `--blueprint=${root}/blueprint.json`,
], { stdio: 'inherit', detached: true });

let exited = false;
const gone = new Promise(r => server.on('exit', () => { exited = true; r(); }));
const stop = () => { try { process.kill(-server.pid, 'SIGTERM'); } catch {} };
process.on('exit', stop);
console.log(`\n=== ${variant}/ ===`);

const base = `http://127.0.0.1:${port}`;
let ready = false;
for (let i = 0; i < 120 && !ready && !exited; i++) {
  // The server answers before the blueprint has finished seeding: wait for the seed's marker.
  try { ready = (await fetch(`${base}/demo-seeded.txt`)).ok; } catch {}
  if (!ready) await new Promise(r => setTimeout(r, 2000));
}
if (!ready) { stop(); throw new Error('WordPress did not start'); }

const test = spawn(process.execPath, ['--test', '--test-concurrency=1', 'tests/*.test.mjs'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, WP_BASE: base, VARIANT: variant },
});
const code = await new Promise(r => test.on('exit', c => r(c ?? 1)));
stop();
await gone;
return code;
}

const variants = process.argv.slice(2).length ? process.argv.slice(2) : ['flawed', 'fixed'];
let failed = 0;
for (const [i, v] of variants.entries()) failed += (await run(v, 9411 + i)) === 0 ? 0 : 1;
process.exit(failed ? 1 : 0);
