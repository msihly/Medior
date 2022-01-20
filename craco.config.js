const nodeExternals = require("webpack-node-externals");

module.exports = {
  webpack: {
    configure: {
      mode: "development",
      target: "electron-renderer",
      // externals: { sharp: "commonjs sharp" },
      // externals: [nodeExternals()],
      externals: [nodeExternals(), "commonjs sharp"],
      // resolve: {
      //   extensions: [".ts", ".tsx", ".js", ".jsx"],
      // },
      // module: {
      //   rules: [
      //     {
      //       test: /\.tsx?$/,
      //       use: [{ loader: "ts-loader" }],
      //       exclude: /node_modules/,
      //     },
      //   ],
      // },
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
