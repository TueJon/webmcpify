/*!
 * webmcpify durable mutation journal helper
 *
 * MIT License
 * Copyright (c) 2026 Jonas Tüchler
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { open, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import { hostname } from "node:os";
import { basename, dirname, join } from "node:path";
const HOLDER_SOURCE = String.raw`
process.stdin.setEncoding('utf8');
process.stdout.write('WEBMCPIFY_LOCK_READY\n');
let pending = '';
process.stdin.on('data', (chunk) => {
  pending += chunk;
  if (pending.includes('\n')) process.exit(pending.startsWith('RELEASE\n') ? 0 : 2);
});
process.stdin.on('end', () => process.exit(0));
`;
const LOCK_CANDIDATES = [
  {
    command: "flock",
    args: (lockPath) => ["--exclusive", lockPath, process.execPath, "--input-type=module", "--eval", HOLDER_SOURCE]
  },
  {
    command: "lockf",
    // macOS/FreeBSD lockf removes a pathname on exit unless -k is used. The
    // sidecar inode is permanent, so -k is a correctness requirement.
    args: (lockPath) => ["-k", lockPath, process.execPath, "--input-type=module", "--eval", HOLDER_SOURCE]
  }
];
function requireText(value, label) {
  if (!value.trim()) throw new Error(`${label} must be a non-empty string`);
  return value;
}
function canonicalJson(value) {
  const json = JSON.stringify(value);
  if (json === void 0) throw new Error("mutation arguments must be JSON-serializable");
  const parsed = JSON.parse(json);
  const sort = (item) => {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === "object") {
      return Object.fromEntries(
        Object.entries(item).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, nested]) => [key, sort(nested)])
      );
    }
    return item;
  };
  return JSON.stringify(sort(parsed));
}
function fingerprintArguments(value) {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}
async function syncDirectory(path) {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function durableReplace(manifestPath, manifest) {
  const directory = dirname(manifestPath);
  const temporary = join(directory, `.${basename(manifestPath)}.${process.pid}.${randomUUID()}.tmp`);
  const mode = (await stat(manifestPath)).mode & 511;
  let handle;
  try {
    handle = await open(temporary, "wx", mode);
    await handle.writeFile(`${JSON.stringify(manifest, null, 2)}
`, "utf8");
    await handle.sync();
    await handle.close();
    handle = void 0;
    await rename(temporary, manifestPath);
    await syncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => void 0);
    await rm(temporary, { force: true }).catch(() => void 0);
    throw error;
  }
}
async function readManifest(manifestPath) {
  const value = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!Array.isArray(value.tools)) throw new Error(`manifest has no tools array: ${manifestPath}`);
  return value;
}
function unresolvedEntries(manifest) {
  return manifest.tools.flatMap(
    (tool) => Array.isArray(tool.mutationExecutions) ? tool.mutationExecutions.filter((entry) => entry?.state === "started") : []
  );
}
async function migrateManifest(manifestPath, manifest) {
  let changed = false;
  for (const tool of manifest.tools) {
    if (!Array.isArray(tool.mutationExecutions)) {
      tool.mutationExecutions = [];
      tool.verifiedAgainst = null;
      if (tool.status === "verified") tool.status = "integrated";
      changed = true;
    }
  }
  if (changed) await durableReplace(manifestPath, manifest);
  return manifest;
}
async function writeOwnerMetadata(lockPath, metadata) {
  const handle = await open(lockPath, "r+");
  try {
    await handle.truncate(0);
    await handle.writeFile(`${JSON.stringify(metadata)}
`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function startCandidate(candidate, lockPath, timeoutMs) {
  const child = spawn(candidate.command, candidate.args(lockPath), {
    detached: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = timeoutMs === void 0 ? void 0 : setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
      child.stdin.destroy();
      finishReject(new Error(`timed out after ${timeoutMs}ms waiting for ${lockPath}`));
    }, timeoutMs);
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      child.off("error", onError);
      child.off("exit", onExit);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
    };
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onError = (error) => finishReject(error);
    const onExit = (code, signal) => {
      finishReject(new Error(
        `${candidate.command} exited before lock acquisition (${code ?? signal ?? "unknown"}): ${stderr.trim()}`
      ));
    };
    const onStdout = (chunk) => {
      stdout += chunk.toString("utf8");
      if (!stdout.includes("WEBMCPIFY_LOCK_READY\n") || settled) return;
      settled = true;
      cleanup();
      resolve(child);
    };
    const onStderr = (chunk) => {
      stderr += chunk.toString("utf8");
    };
    child.once("error", onError);
    child.once("exit", onExit);
    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
  });
}
async function acquireLock(lockPath, timeoutMs) {
  const unavailable = [];
  for (const candidate of LOCK_CANDIDATES) {
    try {
      return await startCandidate(candidate, lockPath, timeoutMs);
    } catch (error) {
      if (error.code === "ENOENT") {
        unavailable.push(candidate.command);
        continue;
      }
      throw error;
    }
  }
  throw new Error(
    `mutation verification is not available: no supported advisory-lock command (${unavailable.join(", ")})`
  );
}
class MutationJournal {
  manifestPath;
  lockPath;
  ownerToken;
  #holder;
  #closed = false;
  #lockFailure;
  #unresolved;
  constructor(manifestPath, lockPath, ownerToken, holder, unresolved) {
    this.manifestPath = manifestPath;
    this.lockPath = lockPath;
    this.ownerToken = ownerToken;
    this.#holder = holder;
    this.#unresolved = unresolved;
    holder.once("error", (error) => {
      if (!this.#closed) this.#lockFailure = new Error(`mutation journal lock holder failed: ${error.message}`);
    });
    holder.once("exit", (code, signal) => {
      if (!this.#closed) {
        this.#lockFailure = new Error(
          `mutation journal lock holder exited unexpectedly (${code ?? signal ?? "unknown"})`
        );
      }
    });
  }
  static async open(options) {
    const manifestPath = await realpath(options.manifestPath);
    const manifestDirectory = dirname(manifestPath);
    const lockPath = join(manifestDirectory, "manifest.lock");
    const lockFile = await open(lockPath, "a", 384);
    await lockFile.close();
    const holder = await acquireLock(lockPath, options.timeoutMs);
    const ownerToken = randomUUID();
    try {
      await writeOwnerMetadata(lockPath, {
        ownerToken,
        host: hostname(),
        pid: process.pid,
        processStartedAt: new Date(Date.now() - process.uptime() * 1e3).toISOString(),
        acquiredAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      const manifest = await migrateManifest(manifestPath, await readManifest(manifestPath));
      return new MutationJournal(manifestPath, lockPath, ownerToken, holder, unresolvedEntries(manifest));
    } catch (error) {
      holder.stdin.end("RELEASE\n");
      throw error;
    }
  }
  get unresolved() {
    return structuredClone(this.#unresolved);
  }
  async beforeDispatch(input) {
    this.#assertOpen();
    requireText(input.tool, "tool");
    requireText(input.origin, "origin");
    requireText(input.role, "role");
    requireText(input.fixtureRevision, "fixtureRevision");
    requireText(input.evidence, "evidence");
    if (!Number.isInteger(input.contractRevision) || input.contractRevision < 1) {
      throw new Error("contractRevision must be a positive integer");
    }
    const manifest = await readManifest(this.manifestPath);
    const unresolved = unresolvedEntries(manifest);
    const manifestTool = input.manifestTool ?? input.tool;
    const owner = manifest.tools.find((tool) => tool.id === manifestTool);
    if (!owner || !Array.isArray(owner.mutationExecutions)) {
      throw new Error(`manifest tool has no mutation journal: ${manifestTool}`);
    }
    if (input.parentExecutionId) {
      const parent = unresolved.find((entry) => entry.executionId === input.parentExecutionId);
      const parentOwner = manifest.tools.find(
        (tool) => tool.mutationExecutions?.some((entry) => entry.executionId === input.parentExecutionId)
      );
      const unrelated = unresolved.filter((entry) => entry.executionId !== input.parentExecutionId);
      if (!parent || parentOwner !== owner || unrelated.length > 0) {
        throw new Error("cleanup dispatch is allowed only for its sole unresolved parent execution");
      }
    } else if (unresolved.length > 0) {
      throw new Error(`mutation dispatch blocked by ${unresolved.length} unresolved execution(s)`);
    }
    const execution = {
      executionId: randomUUID(),
      tool: input.tool,
      contractRevision: input.contractRevision,
      origin: input.origin,
      role: input.role,
      fixtureRevision: input.fixtureRevision,
      argumentsFingerprint: fingerprintArguments(input.arguments),
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      state: "started",
      evidence: input.evidence,
      ...input.parentExecutionId ? { parentExecutionId: input.parentExecutionId } : {}
    };
    owner.mutationExecutions.push(execution);
    await durableReplace(this.manifestPath, manifest);
    const stored = await readManifest(this.manifestPath);
    const persisted = stored.tools.find((tool) => tool.id === manifestTool)?.mutationExecutions?.find((entry) => entry.executionId === execution.executionId);
    if (!persisted || persisted.state !== "started") {
      throw new Error(`pre-dispatch journal entry was not durably persisted: ${execution.executionId}`);
    }
    this.#unresolved = unresolvedEntries(stored);
    return structuredClone(execution);
  }
  async settle(executionId, input) {
    this.#assertOpen();
    requireText(executionId, "executionId");
    requireText(input.outcome, "outcome");
    requireText(input.evidence, "evidence");
    const manifest = await readManifest(this.manifestPath);
    const owner = manifest.tools.find(
      (tool) => tool.mutationExecutions?.some((entry) => entry.executionId === executionId)
    );
    const execution = owner?.mutationExecutions?.find((entry) => entry.executionId === executionId);
    if (!execution) throw new Error(`mutation execution not found: ${executionId}`);
    if (execution.state !== "started") throw new Error(`mutation execution is already ${execution.state}: ${executionId}`);
    if (!execution.parentExecutionId) {
      const unresolvedCleanup = owner?.mutationExecutions?.find(
        (entry) => entry.parentExecutionId === executionId && entry.state === "started"
      );
      if (unresolvedCleanup) {
        throw new Error(`mutation execution has unresolved cleanup: ${unresolvedCleanup.executionId}`);
      }
    }
    execution.state = "reconciled";
    execution.outcome = input.outcome;
    execution.reconciledAt = input.reconciledAt ?? (/* @__PURE__ */ new Date()).toISOString();
    execution.evidence = input.evidence;
    await durableReplace(this.manifestPath, manifest);
    this.#unresolved = unresolvedEntries(await readManifest(this.manifestPath));
    return structuredClone(execution);
  }
  async close() {
    if (this.#closed) return;
    this.#closed = true;
    const holder = this.#holder;
    this.#holder = void 0;
    if (!holder) return;
    if (this.#lockFailure || holder.exitCode !== null || holder.signalCode !== null) {
      throw this.#lockFailure ?? new Error("mutation journal lock holder exited before release");
    }
    let syncError;
    try {
      await syncDirectory(dirname(this.manifestPath));
    } catch (error) {
      syncError = error;
    }
    const exit = new Promise((resolve, reject) => {
      holder.once("error", reject);
      holder.once("exit", (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`lock holder exited while releasing (${code ?? signal ?? "unknown"})`));
      });
    });
    holder.stdin.end("RELEASE\n");
    await exit;
    if (syncError) throw syncError;
  }
  #assertOpen() {
    if (this.#closed || !this.#holder) throw new Error("mutation journal is closed");
    if (this.#lockFailure || this.#holder.exitCode !== null || this.#holder.signalCode !== null) {
      throw this.#lockFailure ?? new Error("mutation journal lock ownership was lost");
    }
  }
}
async function openMutationJournal(options) {
  return MutationJournal.open(options);
}
async function withMutationJournal(options, callback) {
  const journal = await openMutationJournal(options);
  try {
    return await callback(journal);
  } finally {
    await journal.close();
  }
}
export {
  MutationJournal,
  fingerprintArguments,
  openMutationJournal,
  withMutationJournal
};
