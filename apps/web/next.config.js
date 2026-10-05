const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@casebench/domain",
    "@casebench/simulation-engine",
    "@casebench/ai",
    "@casebench/database",
    "@casebench/author-agent",
  ],
  // Monorepo: trace server files from the repo root, and ship the role-pack
  // content (read from disk at runtime, so the tracer can't see it) with
  // every server function. Without this, a deployed dashboard is empty.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  outputFileTracingIncludes: {
    "/**": ["../../content/role-packs/**/*"],
  },
  // DuckDB-WASM only ever runs in the browser. Keep the server bundle from
  // pulling in its Node build (which webpack can't analyse statically).
  webpack: (config, { isServer }) => {
    if (isServer) config.externals.push("@duckdb/duckdb-wasm");
    return config;
  },
};

module.exports = nextConfig;
