const nodeExternals = require("webpack-node-externals");

module.exports = {
  babel: {
    plugins: ["@babel/plugin-proposal-logical-assignment-operators"],
  },
  eslint: {
    enable: false,
  },
  webpack: {
    configure: {
      mode: "development",
      target: "electron-renderer",
      externals: [nodeExternals(), "commonjs sharp"],
    },
    compilerOptions: {
      test: /\.[jt]s$/,
      exclude: /node_modules/,
      use: [
        {
          loader: "ts-loader",
          options: {
            compilerOptions: {
              allowJs: true,
              allowSyntheticDefaultImports: true,
              baseUrl: "src",
              esModuleInterop: true,
              forceConsistentCasingInFileNames: true,
              isolatedModules: true,
              jsx: "react",
              lib: ["dom", "dom.iterable", "esnext"],
              module: "esnext",
              moduleResolution: "node",
              noEmit: false,
              noFallthroughCasesInSwitch: false,
              noImplicitAny: false,
              resolveJsonModule: true,
              skipLibCheck: true,
              strict: false,
              target: "es2021",
            },
            exclude: ["node_modules"],
            include: ["src"],
          },
        },
      ],
    },
  },
};
