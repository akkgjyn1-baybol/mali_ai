const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: false,
  skipWaiting: true,
  importScripts: ["/push-sw.js"],
  fallbacks: {
    document: "/offline",
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    instrumentationHook: true,
  },
};

module.exports = withPWA(nextConfig);
