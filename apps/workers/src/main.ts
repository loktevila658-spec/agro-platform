export const workerShell = Object.freeze({ status: 'bootstrap' as const });

if (require.main === module) {
  setInterval(() => undefined, 60_000);
}
