/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const path = require("path");
const webpack = require("webpack");
const { ResourceUriPlugin } = require("../../tools/resourceUriPlugin");
const { MozSrcUriPlugin } = require("../../tools/mozsrcUriPlugin");

const absolute = relPath => path.join(__dirname, relPath);

module.exports = (env = {}) => ({
  mode: "none",
  entry: absolute("content-src/activity-stream.jsx"),
  output: {
    path: absolute("data/content"),
    filename: "activity-stream.bundle.js",
    library: "NewtabRenderUtils",
  },
  devtool: env.development ? "inline-source-map" : false,
  plugins: [
    // The ResourceUriPlugin handles translating resource URIs in import
    // statements in .mjs files to paths on the filesystem.
    new ResourceUriPlugin({
      resourcePathRegExes: [
        [new RegExp("^resource://newtab/"), path.join(__dirname, "./")],
        [
          new RegExp("^resource:///modules/topsites/"),
          path.join(__dirname, "../../components/topsites/"),
        ],
        [
          new RegExp("^resource:///modules/Dedupe.sys.mjs"),
          path.join(__dirname, "../../modules/Dedupe.sys.mjs"),
        ],
      ],
    }),
    new MozSrcUriPlugin({ baseDir: path.join(__dirname, "..", "..", "..") }),
    new webpack.BannerPlugin(
      `THIS FILE IS AUTO-GENERATED: ${path.basename(__filename)}`
    ),
    new webpack.optimize.ModuleConcatenationPlugin(),
  ],
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules\/(?!@fluent\/).*/,
        loader: "babel-loader",
        options: {
          presets: ["@babel/preset-react"],
        },
      },
    ],
  },
  // This resolve config allows us to import with paths relative to the root directory, e.g. "lib/ActivityStream.sys.mjs"
  resolve: {
    extensions: [".js", ".jsx", ".mjs"],
    modules: ["node_modules", "."],
  },
  externals: {
    "prop-types": "PropTypes",
    react: "React",
    "react-dom": "ReactDOM",
    redux: "Redux",
    "react-redux": "ReactRedux",
    "react-transition-group": "ReactTransitionGroup",
  },
});
