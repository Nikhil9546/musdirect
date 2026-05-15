/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Several @mezo-org/* packages (notably orangekit-contracts) ship raw .ts
  // files instead of pre-built JS. Next won't transpile node_modules by default,
  // so we explicitly opt them in.
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
  ],
  webpack: (config) => {
    // Passport bundles RainbowKit which expects pino-pretty in some logger
    // paths and `encoding` from a node-fetch transitive — both safe to omit
    // in the browser.
    config.externals = [...(config.externals ?? []), "pino-pretty", "encoding"];
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false };
    return config;
  },
};

export default nextConfig;
