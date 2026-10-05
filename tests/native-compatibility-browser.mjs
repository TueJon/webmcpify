import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';

import { chromium } from '@playwright/test';
const executable = process.env.CHROME_BIN || '/usr/bin/google-chrome';
const reportPath = process.env.NATIVE_REPORT || '/tmp/webmcpify-modern-report.md';
const evidencePath = process.env.NATIVE_EVIDENCE || '/tmp/webmcpify-modern-evidence.json';
const timeoutMs = 8000;
const requiredChecks = ['input_shape_probe', 'options_signal', 'caller_abort_cooperative_side_effect', 'registration_abort_started_invocation', 'omitted_input'];
const evidence = {
  runAt: new Date().toISOString(),
  fixture: 'temporary synthetic loopback only; no application tools invoked',
  browser: { executable }, checks: {},
};
let server;
let browser;
let page;

function settle(status, details = {}) { return { ...details, status }; }
async function bounded(promise, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
async function evaluate(name, body, argument) {
  try { evidence.checks[name] = settle('observed', await bounded(page.evaluate(body, argument), name)); }
  catch (error) { evidence.checks[name] = settle('fail', { error: String(error?.stack || error) }); }
}

try {
  const { stdout } = await promisify(execFile)(executable, ['--version'], { timeout: timeoutMs });
  evidence.browser.shellObservedVersion = stdout.trim();
  evidence.browser.shellVersionCommand = { executable, args: ['--version'] };
  evidence.browser.flags = ['WebMCP', 'WebMCPTesting'];
  server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><meta charset="utf-8"><title>Native WebMCP proof fixture</title>synthetic');
  });
  await bounded(new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  }), 'loopback server start');
  browser = await bounded(chromium.launch({
    headless: true, executablePath: executable,
    args: ['--enable-features=WebMCP,WebMCPTesting', '--disable-background-networking', '--no-first-run', '--no-default-browser-check'],
  }), 'browser launch');
  evidence.browser.version = await browser.version();
  evidence.browser.headless = true;
  page = await browser.newPage();
  await bounded(page.goto(`http://127.0.0.1:${server.address().port}/`), 'fixture navigation');
  evidence.nativeSurface = await page.evaluate(() => ({
    context: typeof document.modelContext,
    registerTool: typeof document.modelContext?.registerTool,
    getTools: typeof document.modelContext?.getTools,
    executeTool: typeof document.modelContext?.executeTool,
    unregisterTool: typeof document.modelContext?.unregisterTool,
  }));
  if (evidence.nativeSurface.context !== 'object' || evidence.nativeSurface.registerTool !== 'function' || evidence.nativeSurface.getTools !== 'function' || evidence.nativeSurface.executeTool !== 'function') {
    for (const check of [...requiredChecks, 'unregisterTool_api']) {
      evidence.checks[check] = settle('unsupported', { reason: 'required native WebMCP surface unavailable' });
    }
  } else {
    await evaluate('input_shape_probe', async () => {
      let calls = 0;
      let received;
      const name = `native_probe_${crypto.randomUUID().replaceAll('-', '')}`;
      const controller = new AbortController();
      await document.modelContext.registerTool({
        name, description: 'synthetic input shape capability probe', inputSchema: { type: 'object', properties: {} },
        async execute(input) { calls++; received = { type: typeof input, value: input }; return { accepted: true, call: calls }; },
      }, { signal: controller.signal });
      const tool = (await document.modelContext.getTools()).find(item => item.name === name);
      let outcome;
      let inputMode = 'object';
      const attempts = [];
      const input = { probe: 'synthetic' };
      try { outcome = { fulfilled: true, value: await document.modelContext.executeTool(tool, input) }; }
      catch (error) { outcome = { fulfilled: false, error: String(error), errorName: error.name }; }
      attempts.push({ inputMode, calls, outcome });
      // Retry only this side-effect-free synthetic probe, and only if the object
      // input was rejected before its callback. Never retry a started callback.
      if (!outcome.fulfilled && calls === 0) {
        inputMode = 'legacy-json';
        try { outcome = { fulfilled: true, value: await document.modelContext.executeTool(tool, JSON.stringify(input)) }; }
        catch (error) { outcome = { fulfilled: false, error: String(error), errorName: error.name }; }
        attempts.push({ inputMode, calls, outcome });
      }
      controller.abort();
      return { calls, received, outcome, inputMode, attempts, serializedResult: JSON.stringify(outcome.value) };
    });
    const probe = evidence.checks.input_shape_probe;
    if (probe.calls !== 1 || !probe.outcome?.fulfilled || !['object', 'legacy-json'].includes(probe.inputMode)) {
      throw new Error('synthetic probe could not select a usable input mode');
    }
    const inputMode = probe.inputMode;

    await evaluate('options_signal', async inputMode => {
      let calls = 0;
      let observed;
      const name = `native_signal_${crypto.randomUUID().replaceAll('-', '')}`;
      const controller = new AbortController();
      await document.modelContext.registerTool({
        name, description: 'synthetic second callback argument probe', inputSchema: { type: 'object', properties: {} },
        async execute(input, options) {
          calls++;
          observed = { input, optionsPresent: options !== undefined, optionsType: typeof options,
            signalPresent: options?.signal !== undefined,
            signalIsAbortSignal: options?.signal instanceof AbortSignal };
          return { accepted: true };
        },
      }, { signal: controller.signal });
      const tool = (await document.modelContext.getTools()).find(item => item.name === name);
      let outcome;
      try { outcome = { fulfilled: true, value: await document.modelContext.executeTool(tool, inputMode === 'legacy-json' ? JSON.stringify({ probe: 'signal' }) : { probe: 'signal' }) }; }
      catch (error) { outcome = { fulfilled: false, error: String(error), errorName: error.name }; }
      controller.abort();
      return { calls, observed, outcome, serializedResult: JSON.stringify(outcome.value) };
    }, inputMode);

    await evaluate('caller_abort_cooperative_side_effect', async inputMode => {
      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
      const bounded = (promise, label) => {
        let timer;
        return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' timed out')), 6000); })]).finally(() => clearTimeout(timer));
      };
      let calls = 0;
      let started = false;
      let signalSeen = false;
      let sideEffect = 0;
      const name = `native_caller_abort_${crypto.randomUUID().replaceAll('-', '')}`;
      const registration = new AbortController();
      await document.modelContext.registerTool({
        name, description: 'synthetic cooperative cancellation proof', inputSchema: { type: 'object', properties: {} },
        async execute(_input, options) {
          calls++; started = true; signalSeen = options?.signal instanceof AbortSignal;
          await delay(160);
          if (!options?.signal?.aborted) sideEffect++;
          return { sideEffect, aborted: !!options?.signal?.aborted };
        },
      }, { signal: registration.signal });
      const tool = (await document.modelContext.getTools()).find(item => item.name === name);
      const caller = new AbortController();
      const pending = document.modelContext.executeTool(tool, inputMode === 'legacy-json' ? '{}' : {}, { signal: caller.signal })
        .then(value => ({ fulfilled: true, value }), error => ({ fulfilled: false, error: String(error), errorName: error.name }));
      await bounded((async () => { while (!started && calls === 0) await delay(5); })(), 'synthetic callback start');
      const callbackStartedBeforeAbort = started;
      caller.abort();
      const outcome = await bounded(pending, 'caller-aborted invocation');
      await delay(200);
      registration.abort();
      return { calls, callbackStartedBeforeAbort, signalSeen, callerSignalAborted: caller.signal.aborted,
        sideEffect, outcome, serializedResult: JSON.stringify(outcome.value) };
    }, inputMode);

    await evaluate('registration_abort_started_invocation', async inputMode => {
      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
      const bounded = (promise, label) => {
        let timer;
        return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' timed out')), 6000); })]).finally(() => clearTimeout(timer));
      };
      let calls = 0;
      let started = false;
      let sideEffect = 0;
      const name = `native_registration_abort_${crypto.randomUUID().replaceAll('-', '')}`;
      const registration = new AbortController();
      await document.modelContext.registerTool({
        name, description: 'synthetic registration abort proof', inputSchema: { type: 'object', properties: {} },
        async execute() { calls++; started = true; await delay(160); sideEffect++; return { completed: true }; },
      }, { signal: registration.signal });
      const tool = (await document.modelContext.getTools()).find(item => item.name === name);
      const pending = document.modelContext.executeTool(tool, inputMode === 'legacy-json' ? '{}' : {})
        .then(value => ({ fulfilled: true, value }), error => ({ fulfilled: false, error: String(error), errorName: error.name }));
      await bounded((async () => { while (!started && calls === 0) await delay(5); })(), 'registration callback start');
      const callbackStartedBeforeAbort = started;
      registration.abort();
      const unavailableAfterAbort = !(await document.modelContext.getTools()).some(item => item.name === name);
      const outcome = await bounded(pending, 'registration-aborted invocation');
      return { calls, callbackStartedBeforeAbort, registrationSignalAborted: registration.signal.aborted,
        unavailableAfterAbort, sideEffect, outcome, serializedResult: JSON.stringify(outcome.value) };
    }, inputMode);

    await evaluate('omitted_input', async () => {
      let calls = 0;
      let received = { state: 'not-called' };
      const name = `native_omitted_${crypto.randomUUID().replaceAll('-', '')}`;
      const registration = new AbortController();
      await document.modelContext.registerTool({
        name, description: 'synthetic omitted-input probe', inputSchema: { type: 'object', properties: {} },
        async execute(input) { calls++; received = input === undefined ? { type: 'undefined' } : { type: typeof input, value: input }; return { invoked: true }; },
      }, { signal: registration.signal });
      const tool = (await document.modelContext.getTools()).find(item => item.name === name);
      let outcome;
      try { outcome = { fulfilled: true, value: await document.modelContext.executeTool(tool) }; }
      catch (error) { outcome = { fulfilled: false, error: String(error), errorName: error.name }; }
      registration.abort();
      return { calls, received, outcome, serializedResult: JSON.stringify(outcome.value) };
    });

    evidence.checks.unregisterTool_api = evidence.nativeSurface.unregisterTool === 'function'
      ? settle('supported', { note: 'unregisterTool is exposed; no substituted operation was used' })
      : settle('unsupported', { reason: 'unregisterTool is not exposed; registration AbortSignal was tested separately' });
  }
} catch (error) {
  evidence.runnerError = String(error?.stack || error);
  for (const name of [...requiredChecks, 'unregisterTool_api']) {
    evidence.checks[name] ??= settle('unsupported', { reason: 'runner could not reach native check', detail: String(error) });
  }
} finally {
  await browser?.close().catch(() => {});
  if (server?.listening) await new Promise(resolve => server.close(resolve));
}

function classify() {
  const probe = evidence.checks.input_shape_probe;
  if (probe?.status === 'observed') {
    if (probe.calls !== 1 || !probe.outcome?.fulfilled || !probe.received || !['object', 'string'].includes(probe.received.type)) {
      evidence.checks.input_shape_probe = settle('fail', { ...probe, reason: 'synthetic probe did not invoke exactly once with a recognized input shape' });
    } else evidence.checks.input_shape_probe = settle('pass', { ...probe, note: 'synthetic capability probe only; no application tool retry' });
  }
  const signal = evidence.checks.options_signal;
  if (signal?.status === 'observed') {
    evidence.checks.options_signal = signal.calls === 1 && signal.observed?.optionsPresent === true && signal.observed.signalIsAbortSignal === true && signal.outcome?.fulfilled
      ? settle('pass', signal) : settle('fail', { ...signal, reason: 'callback did not prove a present AbortSignal in its second argument and successful invocation' });
  }
  const caller = evidence.checks.caller_abort_cooperative_side_effect;
  if (caller?.status === 'observed') {
    evidence.checks.caller_abort_cooperative_side_effect = caller.calls === 1 && caller.callbackStartedBeforeAbort === true && caller.signalSeen === true && caller.callerSignalAborted === true && caller.sideEffect === 0 && caller.outcome?.fulfilled === false && caller.outcome.errorName === 'AbortError'
      ? settle('pass', caller) : settle('fail', { ...caller, reason: 'started callback, forwarded signal, AbortError rejection, or side-effect suppression was not fully proved' });
  }
  const registration = evidence.checks.registration_abort_started_invocation;
  if (registration?.status === 'observed') {
    evidence.checks.registration_abort_started_invocation = registration.calls === 1 && registration.callbackStartedBeforeAbort === true && registration.registrationSignalAborted === true && registration.unavailableAfterAbort === true && registration.sideEffect === 1 && registration.outcome?.fulfilled
      ? settle('pass', registration) : settle('fail', { ...registration, reason: 'registration abort did not prove removal plus successful completion of an already-started callback' });
  }
  const omitted = evidence.checks.omitted_input;
  if (omitted?.status === 'observed') {
    evidence.checks.omitted_input = omitted.calls !== 1 || omitted.received?.type === 'not-called'
      ? settle('fail', { ...omitted, reason: 'omitted-input callback was not invoked exactly once' })
      : omitted.received?.type === 'object' && omitted.received.value && Object.keys(omitted.received.value).length === 0 && omitted.outcome?.fulfilled
        ? settle('pass', { ...omitted, note: 'native omitted input arrived as empty object {}' })
        : settle('unsupported', { ...omitted, reason: 'native omitted input did not arrive as {}; callback observation preserved' });
  }
}

classify();
evidence.requiredProofsPassed = !evidence.runnerError && requiredChecks.every(name => evidence.checks[name]?.status === 'pass');
evidence.finishedAt = new Date().toISOString();
await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
const lines = [
  '# Native WebMCP compatibility proof', '',
  `Run: ${evidence.runAt}`, `Finished: ${evidence.finishedAt}`,
  `Browser: ${evidence.browser.version ?? 'unavailable'} (${evidence.browser.executable ?? executable})`,
  `Fixture: ${evidence.fixture}`, '',
  'All invocations used newly registered synthetic tools. No application tool was invoked or retried.', '',
  '| Check | Status | Summary |', '|---|---|---|',
];
for (const [name, result] of Object.entries(evidence.checks)) {
  const summary = result.reason ?? result.note ?? result.error ?? JSON.stringify(result);
  lines.push(`| ${name} | ${result.status} | ${String(summary).replaceAll('|', '\\|')} |`);
}
if (evidence.runnerError) lines.push('', `Runner error: ${evidence.runnerError.split('\n')[0]}`);
await writeFile(reportPath, lines.join('\n') + '\n');
console.log(JSON.stringify({ reportPath, evidencePath, browser: evidence.browser, checks: Object.fromEntries(Object.entries(evidence.checks).map(([key, value]) => [key, value.status])), runnerError: evidence.runnerError }, null, 2));

// API presence is informational; every required behavioral proof must pass.
process.exitCode = evidence.requiredProofsPassed ? 0 : 1;
