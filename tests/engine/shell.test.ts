import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  resolveShell,
  POSIX_DEFAULT_SHELL,
  WINDOWS_SHELL_CANDIDATES,
  type ResolveShellInput,
} from "../../src/engine/shell.ts";

const base: ResolveShellInput = {
  platform: "linux",
  env: {},
  existsSync: () => false,
};

test("linux with empty config/env returns /bin/bash", () => {
  const r = resolveShell({ ...base, platform: "linux" });
  assert.deepEqual(r, { ok: true, path: POSIX_DEFAULT_SHELL });
});

test("darwin with empty config/env returns /bin/bash", () => {
  const r = resolveShell({ ...base, platform: "darwin" });
  assert.deepEqual(r, { ok: true, path: POSIX_DEFAULT_SHELL });
});

test("windows discovers the first existing git-bash candidate (ordering)", () => {
  // Only the first candidate exists — must be chosen.
  const r = resolveShell({
    ...base,
    platform: "win32",
    existsSync: p => p === WINDOWS_SHELL_CANDIDATES[0],
  });
  assert.deepEqual(r, { ok: true, path: WINDOWS_SHELL_CANDIDATES[0] });
});

test("windows skips missing candidates and picks the first that exists", () => {
  // First two missing; third (git usr/bin) exists.
  const r = resolveShell({
    ...base,
    platform: "win32",
    existsSync: p => p === WINDOWS_SHELL_CANDIDATES[2],
  });
  assert.deepEqual(r, { ok: true, path: WINDOWS_SHELL_CANDIDATES[2] });
});

test("windows falls back to WSL System32 bash.exe when only it exists", () => {
  const wsl = WINDOWS_SHELL_CANDIDATES[3];
  const r = resolveShell({
    ...base,
    platform: "win32",
    existsSync: p => p === wsl,
  });
  assert.deepEqual(r, { ok: true, path: wsl });
});

test("engine.shell config is used verbatim with no existence check", () => {
  const r = resolveShell({
    ...base,
    platform: "win32",
    config: "D:\\custom\\bash.exe",
    existsSync: () => false, // proves config bypasses discovery + existence
  });
  assert.deepEqual(r, { ok: true, path: "D:\\custom\\bash.exe" });
});

test("CYCLE_SHELL env overrides auto-discovery", () => {
  const r = resolveShell({
    ...base,
    platform: "win32",
    env: { CYCLE_SHELL: "/opt/bash" },
  });
  assert.deepEqual(r, { ok: true, path: "/opt/bash" });
});

test("config takes precedence over CYCLE_SHELL env", () => {
  const r = resolveShell({
    ...base,
    platform: "win32",
    config: "C:\\cfg\\bash.exe",
    env: { CYCLE_SHELL: "C:\\env\\bash.exe" },
  });
  assert.deepEqual(r, { ok: true, path: "C:\\cfg\\bash.exe" });
});

test("empty-string config and env fall through to discovery", () => {
  const r = resolveShell({
    ...base,
    platform: "linux",
    config: "   ",
    env: { CYCLE_SHELL: "" },
  });
  assert.deepEqual(r, { ok: true, path: POSIX_DEFAULT_SHELL });
});

test("windows-unresolved returns structured failure with searched list + remediation", () => {
  const r = resolveShell({ ...base, platform: "win32", existsSync: () => false });
  assert.equal(r.ok, false);
  if (r.ok) return; // narrow
  assert.deepEqual(r.searched, [...WINDOWS_SHELL_CANDIDATES]);
  for (const cand of WINDOWS_SHELL_CANDIDATES) {
    assert.ok(r.message.includes(cand), `message names ${cand}`);
  }
  assert.match(r.message, /git-bash/);
  assert.match(r.message, /WSL/);
  assert.match(r.message, /engine\.shell/);
  assert.match(r.message, /CYCLE_SHELL/);
});
