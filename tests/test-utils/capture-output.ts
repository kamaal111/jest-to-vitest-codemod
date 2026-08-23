import { vi } from 'vitest';

function joinLogCalls(calls: Array<Array<unknown>>): string {
  return calls.map(call => call.join(' ')).join('\n');
}

export async function captureLog(fn: () => Promise<void>): Promise<{ stdout: string; error: Error | undefined }> {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    await fn();
    return { stdout: joinLogCalls(logSpy.mock.calls), error: undefined };
  } catch (error) {
    return {
      stdout: joinLogCalls(logSpy.mock.calls),
      error: error instanceof Error ? error : new Error(String(error)),
    };
  } finally {
    logSpy.mockRestore();
  }
}

export async function captureCli(
  fn: () => Promise<void>,
): Promise<{ stdout: string; stderr: string; exitCode: number | undefined }> {
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const originalExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    await fn();
    return {
      stdout: joinLogCalls(logSpy.mock.calls),
      stderr: stderrSpy.mock.calls.map(call => String(call[0])).join(''),
      exitCode: process.exitCode,
    };
  } finally {
    logSpy.mockRestore();
    stderrSpy.mockRestore();
    process.exitCode = originalExitCode;
  }
}
