const path = require('path')
const outputPath = path.join(__dirname, 'dist')
const CopyWebpackPlugin = require('copy-webpack-plugin')

module.exports = (env, argv) => {
  const isProd = argv && argv.mode === 'production'

  return {
    target: 'web',
    mode: isProd ? 'production' : 'development',
    // 打包目录不包含调试文件（如 *.map）
    devtool: isProd ? false : 'eval-cheap-module-source-map',
    entry: {
      index: './src/index.js'
    },
    output: {
      filename: '[name].js',
      path: outputPath,
      // 构建前清理 dist，避免上次构建残留调试文件
      clean: true
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          // 复制 node_modules（preload 运行依赖），但排除调试文件
          {
            from: 'public/node_modules',
            to: path.join(outputPath, 'node_modules'),
            globOptions: {
              ignore: [
                '**/*.map',
                '**/*.js.gz',
                '**/*.css.gz',
                '**/*.gz',
                '**/.DS_Store'
              ]
            }
          },
          // 复制 public 其他资源，排除 node_modules 和调试文件
          {
            from: 'public',
            to: outputPath,
            globOptions: {
              ignore: [
                '**/node_modules/**',
                '**/*.map',
                '**/*.js.gz',
                '**/*.css.gz',
                '**/*.gz',
                '**/.DS_Store'
              ]
            }
          }
        ]
      })
    ],
    performance: {
      hints: false
    },
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [['@babel/preset-env', { targets: { chrome: 91 } }], '@babel/preset-react'],
              plugins: [
                '@babel/plugin-proposal-class-properties',
                ['import', { libraryName: '@material-ui/core', libraryDirectory: 'esm', camel2DashComponentName: false }, 'core'],
                ['import', { libraryName: '@material-ui/lab', libraryDirectory: 'esm', camel2DashComponentName: false }, 'lab'],
                ['import', { libraryName: '@material-ui/icons', libraryDirectory: 'esm', camel2DashComponentName: false }, 'icons'],
                ['import', { libraryName: '@material-ui/styles', libraryDirectory: 'esm', camel2DashComponentName: false }, 'styles']
              ]
            }
          }
        },
        {
          test: /\.(less|css)$/,
          use: [
            {
              loader: 'style-loader'
            },
            {
              loader: 'css-loader',
              options: { url: false }
            },
            {
              loader: 'less-loader'
            }
          ]
        }
      ]
    }
  }
}
