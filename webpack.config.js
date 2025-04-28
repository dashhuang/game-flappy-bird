const path = require('path');
const Dotenv = require('dotenv-webpack');
const webpack = require('webpack');

module.exports = (env, argv) => {
  // Determine build target: prioritize env variable, default to 'vercel'
  const buildTarget = process.env.BUILD_TARGET || 'vercel';
  console.log(`Webpack building for target: ${buildTarget}`); // Log the target

  return {
    entry: './js/game.js', // Your main game logic entry file
    output: {
      filename: 'bundle.js', // Bundled file name
      path: path.resolve(__dirname, 'dist'), // Output directory
      library: 'Game', // Optional: Expose your game object globally
      libraryTarget: 'umd' // Universal Module Definition
    },
    plugins: [
      // Load .env file variables into process.env
      new Dotenv({
        systemvars: true, // Allow system environment variables to override .env
        silent: true, // Suppress warnings if .env file is missing
        defaults: true // Load ./.env.defaults (optional)
      }),
      // Define global constants at compile time
      new webpack.DefinePlugin({
        // Pass the build target to the frontend code
        'process.env.BUILD_TARGET': JSON.stringify(buildTarget),
        // Pass the SCE token (if defined) to the frontend code
        // !! SECURITY WARNING: Avoid committing tokens directly. Use environment variables during build/deployment.
        'process.env.SCE_DEVELOPER_TOKEN': JSON.stringify(process.env.SCE_DEVELOPER_TOKEN || '')
      })
    ],
    mode: argv.mode === 'production' ? 'production' : 'development', // Set mode based on webpack invocation
    devtool: argv.mode === 'development' ? 'eval-source-map' : 'source-map', // Source maps for debugging
    // Add any other necessary loaders or configurations here (e.g., Babel for older browser compatibility)
  };
}; 