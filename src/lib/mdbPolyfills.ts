import { Buffer as BufferPolyfill } from "buffer";
import processPolyfill from "process";

const g = globalThis as unknown as {
  Buffer?: unknown;
  process?: { version?: string; browser?: boolean; nextTick?: (cb: () => void) => void };
};

if (!g.Buffer) g.Buffer = BufferPolyfill;
if (!g.process) g.process = processPolyfill as unknown as typeof g.process;
if (g.process && !g.process.version) g.process.version = "v16.0.0";
if (g.process) g.process.browser = true;