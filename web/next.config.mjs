import createNextIntlPlugin from "next-intl/plugin";

// Branche next-intl sur la config i18n (langue lue depuis le cookie).
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // Requis par WalletConnect (dépendance de RainbowKit) côté navigateur.
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // Le SDK Coinbase (tiré par wagmi) référence des paquets @x402/*
    // optionnels qui n'existent pas sur npm : on les ignore, ils ne
    // sont pas utilisés par notre app.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@coinbase/cdp-sdk": false,
      "@react-native-async-storage/async-storage": false,
      "@x402/core": false,
      "@x402/evm": false,
      "@x402/svm": false,
    };
    return config;
  },
};

export default withNextIntl(nextConfig);
