const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
    app.use(
        '/tilamisu',
        createProxyMiddleware({
          target: 'https://valkeakoski.tilamisu.fi',
          changeOrigin: true,
          pathRewrite: {
            '^/tilamisu': ''
          },
      
        })
      );
};