// Wraps OpenNext's generated Lambda handler (index.mjs, sitting alongside
// this file once copied into .open-next/server-functions/default/ by the
// build — see .github/workflows/deploy.yml) to load this app's 6 required
// env vars from SSM Parameter Store before the first real request is
// served.
//
// This can't run at module top level: the AWS Parameters and Secrets
// Lambda Extension can only be called during Lambda's INVOKE phase, not
// during INIT (verified against AWS's own docs) — so the fetch happens
// inside the handler, guarded by a flag so it only runs once per warm
// container, not on every invocation.
const EXTENSION_PORT = 2773;
const REQUIRED_KEYS = [
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
  "GOOGLE_SHEET_ID",
  "ANTHROPIC_API_KEY",
  "ADMIN_PASSWORD",
  "SESSION_SECRET",
];

let configLoaded = false;

async function loadConfigFromSsm() {
  if (configLoaded) return;

  const prefix = process.env.SSM_PARAMETER_PREFIX;
  if (!prefix) {
    throw new Error("SSM_PARAMETER_PREFIX environment variable is not set.");
  }

  // Read fresh on every cold start rather than caching at module scope, so
  // this stays correct regardless of how Lambda resolved the session
  // credentials for this particular init.
  const token = process.env.AWS_SESSION_TOKEN;
  if (!token) {
    throw new Error("AWS_SESSION_TOKEN environment variable is not set.");
  }

  for (const key of REQUIRED_KEYS) {
    const paramName = encodeURIComponent(`${prefix}${key}`);
    const url = `http://localhost:${EXTENSION_PORT}/systemsmanager/parameters/get?name=${paramName}&withDecryption=true`;
    const res = await fetch(url, {
      headers: { "X-Aws-Parameters-Secrets-Token": token },
    });
    if (!res.ok) {
      throw new Error(
        `Failed to load SSM parameter "${prefix}${key}": HTTP ${res.status}`
      );
    }
    const body = await res.json();
    process.env[key] = body.Parameter.Value;
  }

  configLoaded = true;
}

export const handler = async (event, context) => {
  await loadConfigFromSsm();
  // Deferred until after config is loaded: if the real handler's module
  // does any top-level work that reads process.env (Next.js server
  // singletons, etc.), it must not run before the env vars above are set.
  // Dynamic import is cached by Node after the first call, so this is a
  // no-op re-import (not a re-evaluation) on every subsequent invocation
  // in the same warm container.
  const { handler: openNextHandler } = await import("./index.mjs");
  return openNextHandler(event, context);
};
