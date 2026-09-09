const port = process.env.PORT ?? "3000";
const endpoint = `http://127.0.0.1:${port}/api/health`;

try {
  const response = await fetch(endpoint, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) {
    process.stderr.write(
      `Pinvites health check returned HTTP ${response.status}.\n`,
    );
    process.exit(1);
  }
  const result = await response.json();
  if (!result || typeof result !== "object" || result.status !== "ok") {
    process.stderr.write(
      "Pinvites health check returned an unexpected response.\n",
    );
    process.exit(1);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "request failed";
  process.stderr.write(`Pinvites health check failed: ${message}\n`);
  process.exit(1);
}
