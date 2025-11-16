//server.js

const server = require('./src/app')

server.listen(process.env.PORT || 3002, () => {
    console.info("server.started", { port: process.env.PORT || 3002 })
})
