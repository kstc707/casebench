/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@casebench/domain", "@casebench/simulation-engine", "@casebench/ai"],
};

module.exports = nextConfig;
