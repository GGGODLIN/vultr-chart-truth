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

  const envProxy = new Proxy<Record<string, string | undefined>>(
    {},
    {
      get(_target, prop) {
        if (typeof prop === 'symbol' || prop === 'toJSON' || prop === 'valueOf') {
          return undefined;
        }
        envReadAttempts += 1;
        recordEvent(
          'env',
          `Blocked read of process.env.${String(prop)} (zero-secret sandbox)`,
          true
        );
        return undefined;
      },
      ownKeys() {
        envReadAttempts += 1;
        recordEvent(
          'env',
          'Blocked enumeration of process.env keys (zero-secret sandbox)',
          true
        );
        return [];
      },
    }
  );

  const trappedFetch = (url: unknown): never => {
    outboundAttempts += 1;
    const targetUrl = String(url ?? 'unknown-url');
    recordEvent(
      'network',
      `Blocked outbound fetch to ${targetUrl} (--network=none)`,
      true
    );
    throw new Error(
      `SANDBOX_NETWORK_BLOCKED: Outbound network access to ${targetUrl} is disabled (--network=none)`
    );
  };

  const trappedHttpModule = {
    request: (url: unknown): never => {
      outboundAttempts += 1;
      const targetUrl =
        typeof url === 'string' ? url : JSON.stringify(url ?? 'http-endpoint');
      recordEvent(
        'network',
        `Blocked outbound HTTP request to ${targetUrl} (--network=none)`,
        true
      );
      throw new Error(
        'SANDBOX_NETWORK_BLOCKED: Outbound HTTP request is disabled (--network=none)'
      );
    },
    get: (url: unknown): never => {
      outboundAttempts += 1;
      const targetUrl =
        typeof url === 'string' ? url : JSON.stringify(url ?? 'http-endpoint');
      recordEvent(
        'network',
        `Blocked outbound HTTP GET to ${targetUrl} (--network=none)`,
        true
      );
      throw new Error(
        'SANDBOX_NETWORK_BLOCKED: Outbound HTTP GET is disabled (--network=none)'
      );
    },
  };

  const handleFsWrite = (targetPath: unknown, content: unknown): void => {
    if (isSafeWorkPath(targetPath)) {
      inMemoryWorkFs.set(String(targetPath), String(content ?? ''));
      return;
    }
    fsWriteAttempts += 1;
    const pathLabel = String(targetPath ?? 'unknown-path');
    recordEvent(
      'filesystem',
      `Blocked filesystem write outside /work: ${pathLabel} (--read-only)`,
      true
    );
    throw new Error(
      `SANDBOX_FS_READONLY: Cannot write to ${pathLabel} on read-only root filesystem`
    );
  };

  const trappedFsModule = {
    writeFileSync: (targetPath: unknown, content: unknown): void => {
      handleFsWrite(targetPath, content);
    },
    appendFileSync: (targetPath: unknown, content: unknown): void => {
      handleFsWrite(targetPath, content);
    },
    writeFile: (
      targetPath: unknown,
      content: unknown,
      cb?: (err: Error | null) => void
    ): void => {
      try {
        handleFsWrite(targetPath, content);
        if (typeof cb === 'function') {
          cb(null);
        }
      } catch (err: unknown) {
        if (typeof cb === 'function' && err instanceof Error) {
          cb(err);
        } else {
          throw err;
        }
      }
    },
    readFileSync: (targetPath: unknown): string => {
      const p = String(targetPath ?? '');
      if (p === '/work/input.csv' || p === 'input.csv') {
        return csvInput;
      }
      if (inMemoryWorkFs.has(p)) {
        return inMemoryWorkFs.get(p) ?? '';
      }
      throw new Error(`SANDBOX_FS_READ_BLOCKED: Cannot read ${p}`);
    },
  };

  const trappedRequire = (modName: unknown): unknown => {
    const clean = String(modName ?? '').replace(/^node:/, '');
    if (clean === 'http' || clean === 'https') {
      return trappedHttpModule;
    }
    if (clean === 'fs' || clean === 'fs/promises') {
      return trappedFsModule;
    }
    if (clean === 'child_process' || clean === 'net' || clean === 'tls') {
      outboundAttempts += 1;
      recordEvent(
        'network',
        `Blocked restricted module require('${clean}') in sandbox`,
        true
      );
      throw new Error(
        `SANDBOX_MODULE_BLOCKED: Module '${clean}' is forbidden in sandbox`
      );
    }
    throw new Error(
      `SANDBOX_MODULE_BLOCKED: External module '${String(modName)}' is unavailable`
    );
  };

  const sandboxGlobal: Record<string, unknown> = {
    RAW_CSV: csvInput,
    csvText: csvInput,
    inputCsv: csvInput,
    module: { exports: {} },
    exports: {},
    fetch: trappedFetch,
    http: trappedHttpModule,
    https: trappedHttpModule,
    fs: trappedFsModule,
    require: trappedRequire,
    process: {
      env: envProxy,
      cwd: () => '/work',
      exit: (code = 1) => {
        exitCode = typeof code === 'number' ? code : 1;
        throw new Error(`SANDBOX_PROCESS_EXIT:${exitCode}`);
      },
    },
    console: {
      log: (...args: unknown[]) => {
        logs.push(args.map((a) => String(a)).join(' '));
      },
      warn: (...args: unknown[]) => {
        logs.push(args.map((a) => String(a)).join(' '));
      },
      error: (...args: unknown[]) => {
        stderrLines.push(args.map((a) => String(a)).join(' '));
      },
    },
  };

  const wrappedScript = `
(function() {
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
  if (!primaryRun.receipt.timedOut && !primaryRun.receipt.memoryCapped) {
    const shadowRun = await executeIsolatedVmRun(
      scriptSource,
      shadowCsvText,
      timeoutMs
    );
    shadowOutput = shadowRun.output;
  }

  const ok =
    primaryRun.receipt.exitCode === 0 &&
    !primaryRun.receipt.timedOut &&
    !primaryRun.receipt.memoryCapped;

  const errorMsg =
    primaryRun.receipt.stderr.length > 0
      ? primaryRun.receipt.stderr
      : 'Sandbox script failed';

  return {
    ok,
    ...(ok ? {} : { error: errorMsg }),
    plottedSeries: primaryRun.output.series,
    shadowSeries: shadowOutput.series,
    scriptOutput: primaryRun.output,
    shadowOutput,
    sandboxReceipt: primaryRun.receipt,
    shadowCsvText,
  };
}
