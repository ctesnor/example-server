// server.js
const http = require('http');
const app = require('./app'); // We'll create app.js next
const port = process.env.PORT || 3005;
const HOST = process.env.HOST || '0.0.0.0';

const server = http.createServer(app);

server.listen(port, HOST, () => {
    console.log(`Server running at http://${HOST}:${port}`);
});
