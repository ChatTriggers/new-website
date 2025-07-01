import webpack from "webpack";

/** @type {import('next').NextConfig} */
export default {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["@discordjs"],
  },
  webpack: config => {
    config.experiments = {
      ...config.experiments,
      topLevelAwait: true,
    };
    config.plugins.push(
      new webpack.IgnorePlugin({ resourceRegExp: /^zlib-sync$/ }),
      new webpack.IgnorePlugin({ resourceRegExp: /^bufferutil$/ }),
    );
    config.module.rules.push({
      test: /\.node$/,
      use: "node-loader",
    });
    return config;
  },
};
