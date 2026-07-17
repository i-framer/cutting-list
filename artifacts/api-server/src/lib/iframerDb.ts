import mysql from "mysql2/promise";

export type IframerEnv = "dev" | "beta" | "prod";

const ENV_PREFIXES: Record<IframerEnv, string> = {
  dev: "DB_",
  beta: "DB_BETA_",
  prod: "DB_PROD_",
};

function makeConfig(prefix: string) {
  return {
    host: process.env[`${prefix}HOST`],
    user: process.env[`${prefix}USER`],
    password: process.env[`${prefix}PASSWORD`],
    database: process.env[`${prefix}NAME`],
    port: Number(process.env[`${prefix}PORT`]) || 3306,
  };
}

const pools = new Map<IframerEnv, mysql.Pool>();

function buildPool(env: IframerEnv): mysql.Pool {
  const prefix = ENV_PREFIXES[env];
  const cfg = makeConfig(prefix);
  if (!cfg.host) {
    throw new Error(
      `Database for environment "${env}" is not configured — set ${prefix}HOST, ${prefix}USER, ${prefix}PASSWORD, ${prefix}NAME, ${prefix}PORT`,
    );
  }
  return mysql.createPool({
    ...cfg,
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 10000,
  });
}

function resolveAlias(env: IframerEnv): IframerEnv {
  const seen = new Set<IframerEnv>();
  let current = env;
  while (!seen.has(current)) {
    seen.add(current);
    const alias = (process.env[`${ENV_PREFIXES[current]}ALIAS`] || "").trim().toLowerCase();
    let next: IframerEnv | null = null;
    if (alias === "dev" || alias === "development") next = "dev";
    else if (alias === "beta") next = "beta";
    else if (alias === "prod" || alias === "live" || alias === "production") next = "prod";
    if (!next || next === current) break;
    current = next;
  }
  return current;
}

export function getPool(env: IframerEnv = "dev"): mysql.Pool {
  const key = resolveAlias(env);
  let p = pools.get(key);
  if (!p) {
    p = buildPool(key);
    pools.set(key, p);
  }
  return p;
}

export function resolveEnv(serverType?: string, portalUrl?: string): IframerEnv {
  const s = (serverType || "").trim().toLowerCase();
  if (s === "beta") return "beta";
  if (s === "prod" || s === "live" || s === "production") return "prod";
  if (s === "dev" || s === "development") return "dev";
  if (portalUrl) {
    try {
      const host = new URL(portalUrl).hostname.toLowerCase();
      if (host.includes(".beta.")) return "beta";
      if (host.includes(".dev.") || host.includes(".staging.")) return "dev";
      if (host === "i-framer.com" || host.endsWith(".i-framer.com")) return "prod";
    } catch { /* ignore */ }
  }
  return "dev";
}

export function isConfigured(env: IframerEnv = "dev"): boolean {
  const prefix = ENV_PREFIXES[resolveAlias(env)];
  return !!process.env[`${prefix}HOST`];
}
