import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin });

export async function* readMessages() {
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed) {
      try {
        yield JSON.parse(trimmed);
      } catch (e) {
        console.error('Failed to parse IPC message:', e.message);
      }
    }
  }
}

export function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

let pendingResolvers = new Map();

export function waitForMessage(kind) {
  return new Promise((resolve) => {
    if (!pendingResolvers.has(kind)) {
      pendingResolvers.set(kind, []);
    }
    pendingResolvers.get(kind).push(resolve);
  });
}

export function dispatchMessage(msg) {
  const kind = msg.kind;
  if (pendingResolvers.has(kind)) {
    const resolvers = pendingResolvers.get(kind);
    if (resolvers.length > 0) {
      const resolve = resolvers.shift();
      resolve(msg);
      return true;
    }
  }
  return false;
}
