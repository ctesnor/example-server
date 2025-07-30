// server.js
const http = require('http');
const app = require('./app'); // We'll create app.js next
const port = process.env.PORT || 3005;

const server = http.createServer(app);

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});