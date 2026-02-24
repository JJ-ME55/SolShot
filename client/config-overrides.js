const webpack = require('webpack');

module.exports = function override(config) {
    // Node.js polyfills required by Solana wallet adapter libraries
    // and Reown/WalletConnect (added for @jup-ag/jup-mobile-adapter)
    config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
        buffer: require.resolve('buffer/'),
        vm: false, // Not needed at runtime — silence asn1.js warning
        assert: require.resolve('assert/'),
        http: require.resolve('stream-http'),
        https: require.resolve('https-browserify'),
        os: require.resolve('os-browserify/browser'),
        url: require.resolve('url/'),
    };

    // Alias 'process/browser' to the actual file path (ESM compat)
    config.resolve.alias = {
        ...config.resolve.alias,
        'process/browser': require.resolve('process/browser.js'),
    };

    // Disable fullySpecified for ESM modules that import without extensions
    config.module.rules.push({
        test: /\.m?js$/,
        resolve: {
            fullySpecified: false,
        },
    });

    config.plugins = [
        ...config.plugins,
        new webpack.ProvidePlugin({
            Buffer: ['buffer', 'Buffer'],
            process: 'process/browser.js',
        }),
    ];

    // Ignore source-map warnings from node_modules
    config.ignoreWarnings = [/Failed to parse source map/];

    return config;
};
