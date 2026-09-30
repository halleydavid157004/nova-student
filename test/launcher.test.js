import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {cpSync, existsSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import path from 'node:path';

test('Windows launcher creates .env, respects PORT and detects an existing healthy server', {
  skip: process.platform !== 'win32', timeout: 20000,
}, async () => {
  const listener = createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const dir = mkdtempSync(path.join(tmpdir(), 'nova-launcher-'));
  for (const file of ['server.js', 'src', 'package.json', '.env.example', 'ABRIR_NOVA_STUDENT.cmd']) {
    cpSync(file, path.join(dir, file), {recursive: true});
  }
  const env = {...process.env, PORT: String(port), DATABASE_PATH: path.join(dir, 'db.json'),
    WORKER_ENABLED: 'false', SUPABASE_URL: '', SUPABASE_SECRET_KEY: '', SEED_DATABASE_PATH: ''};
  const server = spawn(process.execPath, ['server.js'], {cwd: dir, env, stdio: 'ignore'});
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (server.exitCode !== null) throw new Error('Server exited during launcher test');
      try { ready = (await fetch(`http://127.0.0.1:${port}/api/health`)).ok; } catch {}
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(ready);
    assert.equal(existsSync(path.join(dir, '.env')), false);
    const launcher = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'ABRIR_NOVA_STUDENT.cmd --no-browser'], {
      cwd: dir, env, stdio: 'ignore', windowsHide: true,
    });
    const timer = setTimeout(() => launcher.kill(), 10000);
    try {
      const code = await new Promise((resolve, reject) => {
        launcher.once('error', reject); launcher.once('exit', resolve);
      });
      assert.equal(code, 0, 'launcher succeeds without starting a duplicate server');
      assert.ok(existsSync(path.join(dir, '.env')));
      assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 200);
    } finally { clearTimeout(timer); }
  } finally {
    server.kill();
    if (server.exitCode === null) await new Promise(resolve => server.once('exit', resolve));
    rmSync(dir, {recursive: true, force: true});
  }
});
