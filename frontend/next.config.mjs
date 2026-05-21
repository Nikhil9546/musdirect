/** @type {import('next').NextConfig} */
import path from "path";

const nextConfig = {
  reactStrictMode: true,
  // Several @mezo-org/* packages (notably orangekit-contracts) ship raw .ts
  // files instead of pre-built JS. Next won't transpile node_modules by default,
  // so we explicitly opt them in.
  //
  // We also transpile porto and wagmi to ensure their ESM exports (like 'export * as z')
  // are correctly handled by the Next.js build system.
  transpilePackages: [
    "@mezo-org/passport",
    "@mezo-org/orangekit",
    "@mezo-org/orangekit-contracts",
    "@mezo-org/orangekit-smart-account",
    "@mezo-org/musd-contracts",
    "@mezo-org/mezod-contracts",
    "@mezo-org/sign-in-with-wallet",
    "@mezo-org/mezo-clay",
    "@musdirect/sdk",
    "@musdirect/x402",
    "porto",
    "wagmi",
    "zod",
    "@noble/hashes",
    "@wagmi/connectors",
    "@wagmi/core",
  ],
  webpack: (config, { isServer }) => {
    // Passport bundles RainbowKit which expects pino-pretty in some logger
    // paths and `encoding` from a node-fetch transitive — both safe to omit
    // in the browser.
    config.externals = [...(config.externals ?? []), "pino-pretty", "encoding"];
    
    // Keep pnpm symlinks resolved to their real package locations so transitive
    // dependencies can use the versions installed beside each virtual package.
    config.resolve.symlinks = true;

    // Map the SDK package names to their source directories within the symlinked
    // node_modules path. This allows us to develop the SDKs in real-time without
    // a build step while maintaining proper dependency resolution.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@musdirect/sdk": path.resolve(process.cwd(), "node_modules/@musdirect/sdk/src"),
      "@musdirect/x402": path.resolve(process.cwd(), "node_modules/@musdirect/x402/src"),
      wagmi: path.resolve(process.cwd(), "node_modules/wagmi"),
      viem: path.resolve(process.cwd(), "node_modules/viem"),
      "@tanstack/react-query": path.resolve(process.cwd(), "node_modules/@tanstack/react-query"),
      // Fix for "z" is not exported from "porto/internal"
      "porto/internal": path.resolve(process.cwd(), "node_modules/porto/dist/internal/index.js"),
      "zod/mini": path.resolve(process.cwd(), "node_modules/zod/mini/index.js"),
      // Fix for "Cannot read properties of undefined (reading 'CURVE')"
      "ethereum-cryptography/secp256k1": path.resolve(process.cwd(), "node_modules/ethereum-cryptography/secp256k1.js"),
      "ethereum-cryptography/utils": path.resolve(process.cwd(), "node_modules/ethereum-cryptography/utils.js"),
      "ethereum-cryptography/keccak": path.resolve(process.cwd(), "node_modules/ethereum-cryptography/keccak.js"),
      // Fix for semver subpaths
      "semver/functions/satisfies": path.resolve(process.cwd(), "node_modules/semver/functions/satisfies.js"),
    };
    config.resolve.fallback = { 
      ...config.resolve.fallback, 
      fs: false, 
      net: false, 
      tls: false,
      crypto: path.resolve(process.cwd(), "node_modules/crypto-browserify"),
      stream: path.resolve(process.cwd(), "node_modules/stream-browserify"),
    };
    return config;
  },
};

export default nextConfig;
