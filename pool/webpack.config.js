const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

/** @type {(env: unknown, argv: { mode?: string }) => import('webpack').Configuration} */
module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';

  return {
    entry: './src/game.ts',
    devtool: isProd ? 'source-map' : 'eval-cheap-module-source-map',
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
    },
    output: {
      filename: 'bundle.js',
      path: path.resolve(__dirname, 'dist'),
      clean: true,
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [{ from: 'public', to: '.' }],
      }),
    ],
    devServer: {
      static: { directory: path.resolve(__dirname, 'dist') },
      port: 8765,
      hot: true,
      open: false,
    },
    performance: {
      // bundle is ~50KB — silence "asset too large" hints from default 244KB threshold
      hints: false,
    },
  };
};
