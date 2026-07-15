// Force resolution to the npm packages (trailing slash) so the SSR/worker
// bundle doesn't externalize them to `__vite-browser-external`.
import { Buffer as BufferPolyfill } from "buffer/";
// @ts-expect-error no types for process/browser subpath
import processPolyfill from "process/browser";

const g = globalThis as unknown as {
  Buffer?: unknown;
  process?: { version?: string; browser?: boolean; nextTick?: (cb: () => void) => void };
};

if (!g.Buffer) g.Buffer = BufferPolyfill;
if (!g.process) g.process = processPolyfill as unknown as typeof g.process;
if (g.process && !g.process.version) g.process.version = "v16.0.0";
if (g.process) g.process.browser = true;