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
    "@wagmi/connectors",
    "@wagmi/core",
  ],
  webpack: (config) => {
    // Passport bundles RainbowKit which expects pino-pretty in some logger
    // paths and `encoding` from a node-fetch transitive — both safe to omit
    // in the browser.
    config.externals = [...(config.externals ?? []), "pino-pretty", "encoding"];
    
    // Disable symlinks resolution. This ensures that linked packages (like our SDKs)
    // resolve their own dependencies (React, Wagmi, etc.) from the application's
    // node_modules, effectively preventing "Two Reacts" and other version mismatches.
    config.resolve.symlinks = false;

    // Map the SDK package names to their source directories within the symlinked
    // node_modules path. This allows us to develop the SDKs in real-time without
    // a build step while maintaining proper dependency resolution.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@musdirect/sdk": path.resolve(process.cwd(), "node_modules/@musdirect/sdk/src"),
      "@musdirect/x402": path.resolve(process.cwd(), "node_modules/@musdirect/x402/src"),
    };

    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false };
    return config;
  },
};

export default nextConfig;
