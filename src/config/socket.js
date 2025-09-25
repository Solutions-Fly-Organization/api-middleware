const { Server } = require('socket.io');
const messageStore = require('../models/MessageStore');

class SocketHandler {
  constructor(server) {
    this.io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.activeUsers = new Map(); // Map de socket.id para user info
    this.roomUsers = new Map(); // Map de roomId para Set de users

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`Usuário conectado: ${socket.id}`);

      // Usuário entra em uma sala
      socket.on('joinRoom', (data) => {
        const { roomId = 'general', userId, username } = data;
        
        // Sair de todas as salas primeiro
        Object.keys(socket.rooms).forEach(room => {
          if (room !== socket.id) {
            socket.leave(room);
          }
        });

        // Entrar na nova sala
        socket.join(roomId);
        
        // Atualizar informações do usuário
        this.activeUsers.set(socket.id, { userId, username, roomId });
        
        // Atualizar usuários da sala
        if (!this.roomUsers.has(roomId)) {
          this.roomUsers.set(roomId, new Set());
        }
        this.roomUsers.get(roomId).add(username);

        console.log(`${username} entrou na sala ${roomId}`);

        // Notificar outros usuários da sala
        socket.to(roomId).emit('userJoined', {
          username,
          message: `${username} entrou na sala`,
          timestamp: new Date()
        });

        // Enviar lista de usuários online para o usuário que entrou
        socket.emit('roomUsers', {
          roomId,
          users: Array.from(this.roomUsers.get(roomId))
        });

        // Enviar mensagens recentes da sala
        const recentMessages = messageStore.getByRoom(roomId, 50);
        socket.emit('recentMessages', recentMessages);
      });

      // Usuário envia mensagem via WebSocket
      socket.on('sendMessage', (data) => {
        try {
          const user = this.activeUsers.get(socket.id);
          if (!user) {
            socket.emit('error', { message: 'Usuário não identificado' });
            return;
          }

          const { content, roomId = user.roomId } = data;
          
          // Criar mensagem
          const message = messageStore.create(
            content, 
            user.userId, 
            user.username, 
            roomId
          );

          // Emitir para todos na sala (incluindo o remetente)
          this.io.to(roomId).emit('newMessage', message.toJSON());

          console.log(`Mensagem de ${user.username} na sala ${roomId}: ${content}`);
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      });

      // Usuário está digitando
      socket.on('typing', (data) => {
        const user = this.activeUsers.get(socket.id);
        if (user) {
          socket.to(user.roomId).emit('userTyping', {
            username: user.username,
            isTyping: data.isTyping
          });
        }
      });

      // Usuário desconecta
      socket.on('disconnect', () => {
        const user = this.activeUsers.get(socket.id);
        
        if (user) {
          console.log(`${user.username} desconectou da sala ${user.roomId}`);
          
          // Remover usuário da sala
          if (this.roomUsers.has(user.roomId)) {
            this.roomUsers.get(user.roomId).delete(user.username);
            
            // Se a sala ficar vazia, remover
            if (this.roomUsers.get(user.roomId).size === 0) {
              this.roomUsers.delete(user.roomId);
            }
          }

          // Notificar outros usuários
          socket.to(user.roomId).emit('userLeft', {
            username: user.username,
            message: `${user.username} saiu da sala`,
            timestamp: new Date()
          });

          // Remover usuário da lista de ativos
          this.activeUsers.delete(socket.id);
        }

        console.log(`Usuário desconectado: ${socket.id}`);
      });
    });
  }

  // Método para obter estatísticas do socket
  getStats() {
    const stats = {
      connectedUsers: this.activeUsers.size,
      activeRooms: this.roomUsers.size,
      roomDetails: {}
    };

    this.roomUsers.forEach((users, roomId) => {
      stats.roomDetails[roomId] = {
        userCount: users.size,
        users: Array.from(users)
      };
    });

    return stats;
  }

  // Método para enviar mensagem para uma sala específica
  sendToRoom(roomId, event, data) {
    this.io.to(roomId).emit(event, data);
  }

  // Método para obter IO instance
  getIO() {
    return this.io;
  }
}

module.exports = SocketHandler;