import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

test('Mac build includes the real sidecar, stops on failure, and rejects Rosetta', { skip: process.platform === 'win32' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'lu-mac-build-'))
  const log = join(dir, 'calls')
  const mock = (name, body) => writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  mock('uname', 'echo "${TEST_HOST:-Darwin arm64}"')
  mock('rustc', 'echo "host: ${TEST_RUST_HOST:-aarch64-apple-darwin}"')
  mock('cargo', 'exit 0')
  mock('cmake', 'exit 0')
  mock('bash', 'echo "$*" >> "$TEST_LOG"; [ "$*" != "$TEST_FAIL" ]')
  mock('npm', 'echo "$*" >> "$TEST_LOG"; [ "$*" != "$TEST_FAIL" ]')
  const run = (overrides = {}) => {
    writeFileSync(log, '')
    const result = spawnSync('/bin/bash', ['scripts/build-mac.sh'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TEST_LOG: log, ...overrides },
    })
    return { status: result.status, stderr: result.stderr, calls: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean) }
  }
  try {
    const calls = [
      'scripts/build-llama.sh aarch64-apple-darwin',
      'scripts/build-llama.sh --check',
      'run tauri -- build --ci --bundles app,dmg',
      'scripts/verify-mac-bundle.sh src-tauri/target/release/bundle/macos/LU.app',
    ]
    assert.equal(run().status, 0)
    assert.deepEqual(run().calls, calls)
    for (let i = 0; i < calls.length; i++) {
      const failed = run({ TEST_FAIL: calls[i] })
      assert.notEqual(failed.status, 0)
      assert.deepEqual(failed.calls, calls.slice(0, i + 1))
    }
    for (const host of ['Darwin x86_64', 'Linux aarch64']) {
      const rejected = run({ TEST_HOST: host })
      assert.notEqual(rejected.status, 0)
      assert.deepEqual(rejected.calls, [])
    }
    const wrongRust = run({ TEST_RUST_HOST: 'x86_64-apple-darwin' })
    assert.notEqual(wrongRust.status, 0)
    assert.match(wrongRust.stderr, /native aarch64/)
    assert.deepEqual(wrongRust.calls, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
