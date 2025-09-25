require('dotenv').config()
const app = require('./src/app')
const { createServer } = require('http')
const { Server } = require('socket.io')
const { initializeSocket } = require('./src/config/socket')

const PORT = process.env.PORT || 3000
const server = createServer(app)

const io = new Server(server, {
  cors: {
    origin: "*",
  }
})

// Inicializar configurações do socket
initializeSocket(io)

// Tornar io acessível globalmente
app.set('io', io)

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
  console.log(`Socket.IO server is ready`)
})