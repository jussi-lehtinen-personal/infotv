const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
    app.use(
        '/tilamisu',
        createProxyMiddleware({
          target: 'https://valkeakoski.tilamisu.fi',
          headers: {
            Connection: 'keep-alive',
          },
          changeOrigin: true,
          pathRewrite: {
            '^/tilamisu': ''
          },
      
        })
      );
};