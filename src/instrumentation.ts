/** Runs once when the server starts: start background jobs (Node.js server only, not during builds). */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
