const nodeExternals = require("webpack-node-externals");

module.exports = {
	webpack: {
		configure: {
			target: "electron-renderer",
			externals: [nodeExternals()],
		},
	},
};
