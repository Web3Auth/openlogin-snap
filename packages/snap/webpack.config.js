const SnapsWebpackPlugin = require('@metamask/snaps-webpack-plugin').default;

exports.baseConfig = {
  plugins: [new SnapsWebpackPlugin()],
};

exports.umdConfig = {
  output: {
    filename: `bundle.js`,
  },
  plugins: [new SnapsWebpackPlugin()],
};
