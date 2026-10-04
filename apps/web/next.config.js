const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@casebench/domain",
    "@casebench/simulation-engine",
    "@casebench/ai",
    "@casebench/database",
  ],
  // Monorepo: trace server files from the repo root, and ship the role-pack
  // content (read from disk at runtime, so the tracer can't see it) with
  // every server function. Without this, a deployed dashboard is empty.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  outputFileTracingIncludes: {
    "/**": ["../../content/role-packs/**/*"],
  },
};

module.exports = nextConfig;
