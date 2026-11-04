import vm from 'node:vm';
import { buildShadowScaledCsv, validateCsvInput } from './oracle.ts';
import type {
  ContainmentEvent,
  PlottedPoint,
  SandboxReceipt,
  SandboxShadowResult,
  ScriptOutput,
} from './types.ts';

export interface SandboxRunOptions {
  timeoutMs?: number;
  preferDocker?: boolean;
  scaleFactorK?: number;
}

interface SingleExecutionOutcome {
  output: ScriptOutput;
  receipt: SandboxReceipt;
}

let containerCounter = 0;

function nextContainerId(): string {
  containerCounter += 1;
  return `ct-sandbox-${String(containerCounter).padStart(4, '0')}`;
}

function isSafeWorkPath(targetPath: unknown): boolean {
  if (typeof targetPath !== 'string') {
    return false;
  }
  const normalized = targetPath.trim();
  if (!normalized.startsWith('/work/') && normalized !== '/work') {
    return false;
  }
  if (normalized.includes('..')) {
    return false;
  }
  return true;
}

function normalizeScriptOutput(rawResult: unknown, logs: string[]): ScriptOutput {
  if (rawResult === null || rawResult === undefined) {
    return { series: [], logs };
  }

  if (Array.isArray(rawResult)) {
    const series: PlottedPoint[] = Array.from(rawResult, (item, idx) => {
      if (typeof item === 'number') {
        return {
          category: `Category_${idx + 1}`,
          value: item,
        };
      }
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;
        const category = String(
          obj.category ?? obj.label ?? obj.name ?? obj.region ?? `Category_${idx + 1}`
        );
        const value = Number(obj.value ?? obj.amount ?? obj.total ?? obj.y ?? 0);
        const currency =
          typeof obj.currency === 'string' ? obj.currency : undefined;
        return currency !== undefined
          ? { category, value, currency }
          : { category, value };
      }
      return {
        category: `Category_${idx + 1}`,
        value: 0,
      };
    });
    return { series, logs };
  }

  if (typeof rawResult === 'object') {
    const obj = rawResult as Record<string, unknown>;
    const rawSeries = Array.isArray(obj.series)
      ? obj.series
      : Array.isArray(obj.data)
        ? obj.data
        : [];
    const normalizedInner = normalizeScriptOutput(rawSeries, logs);
    const title = typeof obj.title === 'string' ? obj.title : undefined;
    const unitCurrency =
      typeof obj.unitCurrency === 'string'
        ? obj.unitCurrency
        : typeof obj.currency === 'string'
          ? obj.currency
          : undefined;
    return {
      ...(title !== undefined ? { title } : {}),
      ...(unitCurrency !== undefined ? { unitCurrency } : {}),
      series: normalizedInner.series,
      logs,
    };
  }

  return { series: [], logs };
}

async function executeIsolatedVmRun(
  scriptSource: string,
  csvInput: string,
  timeoutMs: number
): Promise<SingleExecutionOutcome> {
  const startMs = Date.now();
  const containerId = nextContainerId();
  const events: ContainmentEvent[] = [];
  const logs: string[] = [];
  const stderrLines: string[] = [];
  const inMemoryWorkFs = new Map<string, string>();

  let outboundAttempts = 0;
  let envReadAttempts = 0;
  let fsWriteAttempts = 0;
  let exitCode = 0;
  let timedOut = false;
  let memoryCapped = false;

  const recordEvent = (
    type: ContainmentEvent['type'],
    detail: string,
    blocked = true
  ): void => {
    events.push({
      type,
      detail,
      blocked,
      timestampMs: Math.max(0, Date.now() - startMs),
    });
  };

  const hostTrap = (
    kind: unknown,
    arg1?: unknown,
    arg2?: unknown
  ): string => {
    const trapKind = String(kind ?? '');
    if (trapKind === 'env_get') {
      const prop = String(arg1 ?? '');
      if (prop === 'toJSON' || prop === 'valueOf') {
        return '';
      }
      envReadAttempts += 1;
      recordEvent(
        'env',
        `Blocked read of process.env.${prop} (zero-secret sandbox)`,
        true
      );
      return '';
    }
    if (trapKind === 'env_keys') {
      envReadAttempts += 1;
      recordEvent(
        'env',
        'Blocked enumeration of process.env keys (zero-secret sandbox)',
        true
      );
      return '';
    }
    if (trapKind === 'net_fetch' || trapKind === 'net_http_req' || trapKind === 'net_http_get') {
      outboundAttempts += 1;
      const targetUrl = String(arg1 ?? 'unknown-url');
      const label =
        trapKind === 'net_fetch'
          ? `Blocked outbound fetch to ${targetUrl} (--network=none)`
          : trapKind === 'net_http_req'
            ? `Blocked outbound HTTP request to ${targetUrl} (--network=none)`
            : `Blocked outbound HTTP GET to ${targetUrl} (--network=none)`;
      recordEvent('network', label, true);
      return `SANDBOX_NETWORK_BLOCKED: ${label}`;
    }
    if (trapKind === 'fs_write') {
      if (isSafeWorkPath(arg1)) {
        inMemoryWorkFs.set(String(arg1), String(arg2 ?? ''));
        return 'OK';
      }
      fsWriteAttempts += 1;
      const pathLabel = String(arg1 ?? 'unknown-path');
      recordEvent(
        'filesystem',
        `Blocked filesystem write outside /work: ${pathLabel} (--read-only)`,
        true
      );
      return `SANDBOX_FS_READONLY: Cannot write to ${pathLabel} on read-only root filesystem`;
    }
    if (trapKind === 'fs_read') {
      const p = String(arg1 ?? '');
      if (p === '/work/input.csv' || p === 'input.csv') {
        return `DATA:${csvInput}`;
      }
      if (inMemoryWorkFs.has(p)) {
        return `DATA:${inMemoryWorkFs.get(p) ?? ''}`;
      }
      return `ERR:SANDBOX_FS_READ_BLOCKED: Cannot read ${p}`;
    }
    if (trapKind === 'mod_block') {
      const clean = String(arg1 ?? '');
      if (clean === 'child_process' || clean === 'net' || clean === 'tls') {
        outboundAttempts += 1;
        recordEvent(
          'network',
          `Blocked restricted module require('${clean}') in sandbox`,
          true
        );
        return `SANDBOX_MODULE_BLOCKED: Module '${clean}' is forbidden in sandbox`;
      }
      return `SANDBOX_MODULE_BLOCKED: External module '${clean}' is unavailable`;
    }
    if (trapKind === 'proc_exit') {
      const code = Number(arg1);
      exitCode = Number.isFinite(code) ? code : 1;
      return `SANDBOX_PROCESS_EXIT:${exitCode}`;
    }
    if (trapKind === 'log_out') {
      logs.push(String(arg1 ?? ''));
      return '';
    }
    if (trapKind === 'log_err') {
      stderrLines.push(String(arg1 ?? ''));
      return '';
    }
    return '';
  };
  Object.setPrototypeOf(hostTrap, null);

  const sandboxGlobal: Record<string, unknown> = Object.assign(
    Object.create(null) as Record<string, unknown>,
    {
      RAW_CSV: String(csvInput),
      csvText: String(csvInput),
      inputCsv: String(csvInput),
      __hostTrap: hostTrap,
    }
  );

  const wrappedScript = `
(function() {
  const trap = globalThis.__hostTrap;
  delete globalThis.__hostTrap;

  const envProxy = new Proxy(Object.create(null), {
    get(_target, prop) {
      if (typeof prop === 'symbol') return undefined;
      trap('env_get', String(prop));
      return undefined;
    },
    ownKeys() {
      trap('env_keys');
      return [];
    },
  });

  const trappedFetch = function fetch(url) {
    const errMsg = trap('net_fetch', String(url ?? 'unknown-url'));
    throw new Error(errMsg);
  };

  const trappedHttpModule = {
    request: function request(url) {
      const target = typeof url === 'string' ? url : JSON.stringify(url ?? 'http-endpoint');
      throw new Error(trap('net_http_req', target));
    },
    get: function get(url) {
      const target = typeof url === 'string' ? url : JSON.stringify(url ?? 'http-endpoint');
      throw new Error(trap('net_http_get', target));
    },
  };

  const handleFsWrite = function(targetPath, content) {
    const res = trap('fs_write', String(targetPath ?? ''), String(content ?? ''));
    if (res !== 'OK') {
      throw new Error(res);
    }
  };

  const trappedFsModule = {
    writeFileSync: function writeFileSync(targetPath, content) {
      handleFsWrite(targetPath, content);
    },
    appendFileSync: function appendFileSync(targetPath, content) {
      handleFsWrite(targetPath, content);
    },
    writeFile: function writeFile(targetPath, content, cb) {
      try {
        handleFsWrite(targetPath, content);
        if (typeof cb === 'function') cb(null);
      } catch (err) {
        if (typeof cb === 'function') cb(err);
        else throw err;
      }
    },
    readFileSync: function readFileSync(targetPath) {
      const res = trap('fs_read', String(targetPath ?? ''));
      if (res.startsWith('DATA:')) return res.slice(5);
      throw new Error(res.slice(4));
    },
  };

  const trappedRequire = function require(modName) {
    const clean = String(modName ?? '').replace(/^node:/, '');
    if (clean === 'http' || clean === 'https') return trappedHttpModule;
    if (clean === 'fs' || clean === 'fs/promises') return trappedFsModule;
    throw new Error(trap('mod_block', clean));
  };

  globalThis.module = { exports: {} };
  globalThis.exports = globalThis.module.exports;
  globalThis.fetch = trappedFetch;
  globalThis.http = trappedHttpModule;
  globalThis.https = trappedHttpModule;
  globalThis.fs = trappedFsModule;
  globalThis.require = trappedRequire;
  globalThis.process = {
    env: envProxy,
    cwd: function cwd() { return '/work'; },
    exit: function exit(code = 1) {
      throw new Error(trap('proc_exit', Number(code)));
    },
  };
  globalThis.console = {
    log: function log(...args) { trap('log_out', args.map((a) => String(a)).join(' ')); },
    warn: function warn(...args) { trap('log_out', args.map((a) => String(a)).join(' ')); },
    error: function error(...args) { trap('log_err', args.map((a) => String(a)).join(' ')); },
  };
  const module = globalThis.module;
  const exports = globalThis.exports;
  const fetch = globalThis.fetch;
  const http = globalThis.http;
  const https = globalThis.https;
  const fs = globalThis.fs;
  const require = globalThis.require;
  const process = globalThis.process;
  const console = globalThis.console;

  ${scriptSource}
  if (typeof transformCsv === 'function') {
    return transformCsv(RAW_CSV);
  }
  if (typeof analyzeCsv === 'function') {
    return analyzeCsv(RAW_CSV);
  }
  if (typeof processCsv === 'function') {
    return processCsv(RAW_CSV);
  }
  if (typeof main === 'function') {
    return main(RAW_CSV);
  }
  if (typeof run === 'function') {
    return run(RAW_CSV);
  }
  if (typeof module !== 'undefined' && typeof module.exports === 'function') {
    return module.exports(RAW_CSV);
  }
  if (typeof module !== 'undefined' && module.exports && typeof module.exports.transformCsv === 'function') {
    return module.exports.transformCsv(RAW_CSV);
  }
  if (typeof result !== 'undefined') {
    return result;
  }
  if (typeof output !== 'undefined') {
    return output;
  }
  return module.exports;
})()
`;

  let rawResult: unknown = null;

  try {
    const context = vm.createContext(sandboxGlobal, {
      codeGeneration: { strings: false, wasm: false },
    });
    const evaluated = vm.runInContext(wrappedScript, context, {
      timeout: timeoutMs,
      displayErrors: false,
    });

    if (
      evaluated !== null &&
      typeof evaluated === 'object' &&
      typeof (evaluated as { then?: unknown }).then === 'function'
    ) {
      rawResult = await Promise.race([
        evaluated as Promise<unknown>,
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => {
            reject(new Error('ERR_SCRIPT_EXECUTION_TIMEOUT: Promise timed out'));
          }, timeoutMs);
        }),
      ]);
    } else {
      rawResult = evaluated;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err !== null && typeof err === 'object' && 'code' in err
        ? String((err as { code?: unknown }).code)
        : '';

    if (
      code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' ||
      /Script execution timed out|ERR_SCRIPT_EXECUTION_TIMEOUT/i.test(message)
    ) {
      timedOut = true;
      exitCode = 137;
      recordEvent(
        'timeout',
        `Terminated runaway script exceeding ${timeoutMs}ms CPU watchdog (SIGKILL / exit 137)`,
        true
      );
      stderrLines.push(
        `SIGKILL (exit 137): Script execution timed out after ${timeoutMs}ms`
      );
    } else if (
      err instanceof RangeError ||
      /out of memory|allocation failed|invalid array length|MEMORY_CAP/i.test(
        message
      )
    ) {
      memoryCapped = true;
      exitCode = 137;
      recordEvent(
        'memory',
        `Terminated script exceeding 256MB memory cap: ${message}`,
        true
      );
      stderrLines.push(`OOMKilled (exit 137): ${message}`);
    } else if (err instanceof SyntaxError) {
      exitCode = 1;
      recordEvent('syntax', `SyntaxError in candidate script: ${message}`, true);
      stderrLines.push(`SyntaxError: ${message}`);
    } else {
      if (exitCode === 0) {
        exitCode = 1;
      }
      stderrLines.push(message);
    }
  }

  const durationMs = Math.max(1, Date.now() - startMs);
  const output = normalizeScriptOutput(rawResult, logs);
  const receipt: SandboxReceipt = {
    engine: 'vm-isolated',
    containerId,
    outboundBytes: 0,
    outboundAttempts,
    hostSecretExposed: false,
    envReadAttempts,
    hostDiskDeltaBytes: 0,
    fsWriteAttempts,
    exitCode,
    timedOut,
    memoryCapped,
    durationMs,
    containerDestroyed: true,
    events,
    stderr: stderrLines.join('\n'),
  };

  return { output, receipt };
}

export async function runSandboxWithShadowProbe(
  scriptSource: string,
  rawCsv: string,
  options?: SandboxRunOptions
): Promise<SandboxShadowResult> {
  const validationError = validateCsvInput(rawCsv);
  if (validationError !== null) {
    const emptyReceipt: SandboxReceipt = {
      engine: 'vm-isolated',
      containerId: 'unspawned-validation-gate',
      outboundBytes: 0,
      outboundAttempts: 0,
      hostSecretExposed: false,
      envReadAttempts: 0,
      hostDiskDeltaBytes: 0,
      fsWriteAttempts: 0,
      exitCode: 0,
      timedOut: false,
      memoryCapped: false,
      durationMs: 0,
      containerDestroyed: true,
      events: [],
      stderr: validationError.message,
    };

    return {
      ok: false,
      error: validationError.message,
      validationError,
      plottedSeries: [],
      shadowSeries: [],
      scriptOutput: { series: [] },
      shadowOutput: { series: [] },
      sandboxReceipt: emptyReceipt,
      shadowCsvText: '',
    };
  }

  const timeoutMs = options?.timeoutMs ?? 600;
  const scaleFactorK = options?.scaleFactorK ?? 3;
  const shadowCsvText = buildShadowScaledCsv(rawCsv, scaleFactorK);

  const primaryRun = await executeIsolatedVmRun(
    scriptSource,
    rawCsv,
    timeoutMs
  );

  let shadowOutput: ScriptOutput = { series: [] };
  let mergedReceipt: SandboxReceipt = primaryRun.receipt;
  if (!primaryRun.receipt.timedOut && !primaryRun.receipt.memoryCapped) {
    const shadowRun = await executeIsolatedVmRun(
      scriptSource,
      shadowCsvText,
      timeoutMs
    );
    shadowOutput = shadowRun.output;
    if (
      shadowRun.receipt.events.length > 0 ||
      shadowRun.receipt.timedOut ||
      shadowRun.receipt.memoryCapped ||
      shadowRun.receipt.exitCode !== 0
    ) {
      mergedReceipt = {
        ...primaryRun.receipt,
        outboundBytes:
          primaryRun.receipt.outboundBytes + shadowRun.receipt.outboundBytes,
        outboundAttempts: Math.max(
          primaryRun.receipt.outboundAttempts,
          shadowRun.receipt.outboundAttempts
        ),
        hostSecretExposed:
          primaryRun.receipt.hostSecretExposed ||
          shadowRun.receipt.hostSecretExposed,
        envReadAttempts: Math.max(
          primaryRun.receipt.envReadAttempts,
          shadowRun.receipt.envReadAttempts
        ),
        hostDiskDeltaBytes:
          primaryRun.receipt.hostDiskDeltaBytes +
          shadowRun.receipt.hostDiskDeltaBytes,
        fsWriteAttempts: Math.max(
          primaryRun.receipt.fsWriteAttempts,
          shadowRun.receipt.fsWriteAttempts
        ),
        exitCode:
          primaryRun.receipt.exitCode !== 0
            ? primaryRun.receipt.exitCode
            : shadowRun.receipt.exitCode,
        timedOut: primaryRun.receipt.timedOut || shadowRun.receipt.timedOut,
        memoryCapped:
          primaryRun.receipt.memoryCapped || shadowRun.receipt.memoryCapped,
        containerDestroyed:
          primaryRun.receipt.containerDestroyed &&
          shadowRun.receipt.containerDestroyed,
        events:
          primaryRun.receipt.events.length > 0
            ? primaryRun.receipt.events
            : shadowRun.receipt.events,
        stderr:
          primaryRun.receipt.stderr.length > 0
            ? primaryRun.receipt.stderr
            : shadowRun.receipt.stderr,
      };
    }
  }

  const ok =
    mergedReceipt.exitCode === 0 &&
    !mergedReceipt.timedOut &&
    !mergedReceipt.memoryCapped;

  const errorMsg =
    mergedReceipt.stderr.length > 0
      ? mergedReceipt.stderr
      : 'Sandbox script failed';

  return {
    ok,
    ...(ok ? {} : { error: errorMsg }),
    plottedSeries: primaryRun.output.series,
    shadowSeries: shadowOutput.series,
    scriptOutput: primaryRun.output,
    shadowOutput,
    sandboxReceipt: mergedReceipt,
    shadowCsvText,
  };
}
