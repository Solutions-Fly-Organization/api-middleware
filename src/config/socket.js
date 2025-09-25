const { apiUtils } = require('./axios');

// Armazenar conexões por sessão
const connections = new Map();

// Inicializar configurações do Socket.IO
function initializeSocket(io) {
  console.log('[SOCKET] Configurando Socket.IO...');

  io.on('connection', (socket) => {
    console.log(`[SOCKET] Cliente conectado: ${socket.id}`);

    // Evento para entrar em uma sessão/sala específica
    socket.on('join-session', (sessionData) => {
      const { sessionId, chatId } = sessionData;
      
      if (!sessionId) {
        socket.emit('error', { message: 'Session ID é obrigatório' });
        return;
      }

      // Criar identificador único para a sala
      const roomId = chatId ? `${sessionId}-${chatId}` : sessionId;
      
      // Entrar na sala
      socket.join(roomId);
      
      // Armazenar informações da conexão
      socket.sessionId = sessionId;
      socket.chatId = chatId;
      socket.roomId = roomId;

      // Adicionar à lista de conexões
      if (!connections.has(roomId)) {
        connections.set(roomId, new Set());
      }
      connections.get(roomId).add(socket.id);

      console.log(`[SOCKET] Cliente ${socket.id} entrou na sala: ${roomId}`);
      
      socket.emit('joined-session', { 
        sessionId, 
        chatId, 
        roomId,
        message: 'Conectado com sucesso à sessão' 
      });

      // Notificar outros clientes na mesma sala
      socket.to(roomId).emit('user-joined', { 
        socketId: socket.id, 
        sessionId, 
        chatId 
      });
    });

    // Evento para deixar uma sessão
    socket.on('leave-session', () => {
      if (socket.roomId) {
        socket.leave(socket.roomId);
        
        // Remover da lista de conexões
        if (connections.has(socket.roomId)) {
          connections.get(socket.roomId).delete(socket.id);
          if (connections.get(socket.roomId).size === 0) {
            connections.delete(socket.roomId);
          }
        }

        console.log(`[SOCKET] Cliente ${socket.id} saiu da sala: ${socket.roomId}`);
        
        // Notificar outros clientes
        socket.to(socket.roomId).emit('user-left', { 
          socketId: socket.id,
          sessionId: socket.sessionId,
          chatId: socket.chatId
        });

        // Limpar dados do socket
        delete socket.sessionId;
        delete socket.chatId;
        delete socket.roomId;
      }
    });

    // Evento para enviar mensagem
    socket.on('send-message', async (messageData) => {
      try {
        const { sessionId, chatId, text, messageType = 'text' } = messageData;

        if (!sessionId || !chatId || !text) {
          socket.emit('error', { 
            message: 'sessionId, chatId e text são obrigatórios' 
          });
          return;
        }

        // Mostrar que está digitando
        await apiUtils.startTyping(chatId, sessionId);

        let response;
        
        // Enviar mensagem baseado no tipo
        switch (messageType) {
          case 'text':
            response = await apiUtils.sendText(chatId, text, sessionId);
            break;
          case 'buttons':
            const { header, body, footer, buttons, headerImage } = messageData;
            response = await apiUtils.sendButtons(
              chatId, header, body, footer, buttons, sessionId, headerImage
            );
            break;
          default:
            throw new Error(`Tipo de mensagem não suportado: ${messageType}`);
        }

        // Parar de mostrar que está digitando
        await apiUtils.stopTyping(chatId, sessionId);

        // Preparar dados da mensagem enviada
        const sentMessage = {
          id: response.data?.id || Date.now(),
          sessionId,
          chatId,
          text,
          messageType,
          timestamp: new Date().toISOString(),
          direction: 'outbound',
          status: 'sent',
          ...messageData
        };

        // Emitir para todos na sala
        const roomId = `${sessionId}-${chatId}`;
        io.to(roomId).emit('message-sent', sentMessage);

        console.log(`[SOCKET] Mensagem enviada para ${chatId}:`, text);

      } catch (error) {
        console.error('[SOCKET] Erro ao enviar mensagem:', error);
        
        // Parar de mostrar que está digitando em caso de erro
        if (messageData.sessionId && messageData.chatId) {
          try {
            await apiUtils.stopTyping(messageData.chatId, messageData.sessionId);
          } catch (stopTypingError) {
            console.error('[SOCKET] Erro ao parar typing:', stopTypingError);
          }
        }

        socket.emit('error', { 
          message: 'Erro ao enviar mensagem',
          details: error.response?.data || error.message 
        });
      }
    });

    // Evento para marcar mensagem como vista
    socket.on('mark-as-seen', async (seenData) => {
      try {
        const { sessionId, chatId, messageId, participant } = seenData;

        if (!sessionId || !chatId || !messageId) {
          socket.emit('error', { 
            message: 'sessionId, chatId e messageId são obrigatórios' 
          });
          return;
        }

        await apiUtils.sendSeen(chatId, messageId, sessionId, participant);

        // Notificar todos na sala
        const roomId = `${sessionId}-${chatId}`;
        io.to(roomId).emit('message-seen', {
          sessionId,
          chatId,
          messageId,
          participant,
          timestamp: new Date().toISOString()
        });

        console.log(`[SOCKET] Mensagem marcada como vista: ${messageId}`);

      } catch (error) {
        console.error('[SOCKET] Erro ao marcar mensagem como vista:', error);
        socket.emit('error', { 
          message: 'Erro ao marcar mensagem como vista',
          details: error.response?.data || error.message 
        });
      }
    });

    // Evento para indicar que está digitando
    socket.on('start-typing', async (typingData) => {
      try {
        const { sessionId, chatId } = typingData;

        if (!sessionId || !chatId) {
          socket.emit('error', { 
            message: 'sessionId e chatId são obrigatórios' 
          });
          return;
        }

        await apiUtils.startTyping(chatId, sessionId);

        // Notificar outros clientes na sala (exceto o remetente)
        const roomId = `${sessionId}-${chatId}`;
        socket.to(roomId).emit('user-typing', {
          sessionId,
          chatId,
          socketId: socket.id,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('[SOCKET] Erro ao iniciar typing:', error);
        socket.emit('error', { 
          message: 'Erro ao indicar digitação',
          details: error.response?.data || error.message 
        });
      }
    });

    // Evento para parar de indicar que está digitando
    socket.on('stop-typing', async (typingData) => {
      try {
        const { sessionId, chatId } = typingData;

        if (!sessionId || !chatId) {
          socket.emit('error', { 
            message: 'sessionId e chatId são obrigatórios' 
          });
          return;
        }

        await apiUtils.stopTyping(chatId, sessionId);

        // Notificar outros clientes na sala
        const roomId = `${sessionId}-${chatId}`;
        socket.to(roomId).emit('user-stopped-typing', {
          sessionId,
          chatId,
          socketId: socket.id,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('[SOCKET] Erro ao parar typing:', error);
        socket.emit('error', { 
          message: 'Erro ao parar indicação de digitação',
          details: error.response?.data || error.message 
        });
      }
    });

    // Evento de desconexão
    socket.on('disconnect', () => {
      console.log(`[SOCKET] Cliente desconectado: ${socket.id}`);

      // Limpar da lista de conexões
      if (socket.roomId && connections.has(socket.roomId)) {
        connections.get(socket.roomId).delete(socket.id);
        if (connections.get(socket.roomId).size === 0) {
          connections.delete(socket.roomId);
        }

        // Notificar outros clientes
        socket.to(socket.roomId).emit('user-disconnected', { 
          socketId: socket.id,
          sessionId: socket.sessionId,
          chatId: socket.chatId
        });
      }
    });
  });

  // Retornar funções utilitárias para uso externo
  return {
    // Função para notificar nova mensagem recebida
    notifyNewMessage: (sessionId, chatId, messageData) => {
      const roomId = chatId ? `${sessionId}-${chatId}` : sessionId;
      io.to(roomId).emit('new-message', {
        ...messageData,
        sessionId,
        chatId,
        direction: 'inbound',
        timestamp: new Date().toISOString()
      });
      console.log(`[SOCKET] Nova mensagem notificada para sala: ${roomId}`);
    },

    // Função para notificar mudança de status
    notifyStatusChange: (sessionId, chatId, statusData) => {
      const roomId = chatId ? `${sessionId}-${chatId}` : sessionId;
      io.to(roomId).emit('status-change', {
        ...statusData,
        sessionId,
        chatId,
        timestamp: new Date().toISOString()
      });
      console.log(`[SOCKET] Status change notificado para sala: ${roomId}`);
    },

    // Função para obter estatísticas de conexões
    getConnectionStats: () => {
      const stats = {
        totalRooms: connections.size,
        totalConnections: Array.from(connections.values())
          .reduce((total, room) => total + room.size, 0),
        rooms: {}
      };

      connections.forEach((sockets, roomId) => {
        stats.rooms[roomId] = {
          connections: sockets.size,
          socketIds: Array.from(sockets)
        };
      });

      return stats;
    }
  };
}

module.exports = {
  initializeSocket
};