require('dotenv').config()
const axios = require('axios')
const express = require('express')
const { apiClient, apiUtils } = require('./config/axios')
const app = express()

app.use(express.json())
app.use(express.static('public'))

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.post('/webhook', async (req, res) => {
    try {
        // Encaminhar para N8N
        await axios.post(process.env.EXTERNAL_API_URL_N8N, req.body)
        
        // Se for uma nova mensagem recebida, notificar via WebSocket
        const io = app.get('io')
        if (io && req.body.event === 'message' && req.body.payload) {
            const { session, chatId, from, body, timestamp, id } = req.body.payload
            
            // Notificar clientes conectados sobre nova mensagem
            const roomId = `${session}-${chatId}`
            io.to(roomId).emit('new-message', {
                id,
                sessionId: session,
                chatId,
                from,
                text: body,
                timestamp,
                direction: 'inbound',
                type: 'text'
            })
            
            console.log(`[WEBHOOK] Nova mensagem notificada via WebSocket para ${roomId}`)
        }
        
        res.status(200).send(req.body)
    } catch (error) {
        console.error('Error forwarding webhook:', error)
        res.status(500).send('Error processing webhook')
    }
})

// Rotas para gerenciar mensagens via API WAHA
app.get('/api/sessions', async (req, res) => {
    try {
        const response = await apiUtils.listSessions()
        res.json(response.data)
    } catch (error) {
        console.error('Erro ao listar sessões:', error)
        res.status(500).json({ 
            error: 'Erro ao buscar sessões',
            details: error.response?.data || error.message 
        })
    }
})

app.get('/api/sessions/:sessionId/status', async (req, res) => {
    try {
        const { sessionId } = req.params
        const response = await apiUtils.getSessionStatus(sessionId)
        res.json(response.data)
    } catch (error) {
        console.error('Erro ao verificar status da sessão:', error)
        res.status(500).json({ 
            error: 'Erro ao verificar status da sessão',
            details: error.response?.data || error.message 
        })
    }
})

app.get('/api/chats/:chatId', async (req, res) => {
    try {
        const { chatId } = req.params
        const { session } = req.query
        
        if (!session) {
            return res.status(400).json({ error: 'Session é obrigatório' })
        }
        
        const response = await apiUtils.getChatInfo(chatId, session)
        res.json(response.data)
    } catch (error) {
        console.error('Erro ao buscar informações do chat:', error)
        res.status(500).json({ 
            error: 'Erro ao buscar informações do chat',
            details: error.response?.data || error.message 
        })
    }
})

app.post('/api/messages/send', async (req, res) => {
    try {
        const { sessionId, chatId, text, messageType = 'text' } = req.body
        
        if (!sessionId || !chatId || !text) {
            return res.status(400).json({ 
                error: 'sessionId, chatId e text são obrigatórios' 
            })
        }

        let response
        
        switch (messageType) {
            case 'text':
                response = await apiUtils.sendText(chatId, text, sessionId)
                break
            case 'buttons':
                const { header, body, footer, buttons, headerImage } = req.body
                response = await apiUtils.sendButtons(
                    chatId, header, body, footer, buttons, sessionId, headerImage
                )
                break
            default:
                return res.status(400).json({ error: `Tipo de mensagem não suportado: ${messageType}` })
        }

        // Notificar via WebSocket
        const io = app.get('io')
        if (io) {
            const roomId = `${sessionId}-${chatId}`
            io.to(roomId).emit('message-sent', {
                id: response.data?.id || Date.now(),
                sessionId,
                chatId,
                text,
                messageType,
                timestamp: new Date().toISOString(),
                direction: 'outbound',
                status: 'sent'
            })
        }

        res.json(response.data)
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error)
        res.status(500).json({ 
            error: 'Erro ao enviar mensagem',
            details: error.response?.data || error.message 
        })
    }
})

app.post('/api/messages/seen', async (req, res) => {
    try {
        const { sessionId, chatId, messageId, participant } = req.body
        
        if (!sessionId || !chatId || !messageId) {
            return res.status(400).json({ 
                error: 'sessionId, chatId e messageId são obrigatórios' 
            })
        }

        const response = await apiUtils.sendSeen(chatId, messageId, sessionId, participant)

        // Notificar via WebSocket
        const io = app.get('io')
        if (io) {
            const roomId = `${sessionId}-${chatId}`
            io.to(roomId).emit('message-seen', {
                sessionId,
                chatId,
                messageId,
                participant,
                timestamp: new Date().toISOString()
            })
        }

        res.json(response.data)
    } catch (error) {
        console.error('Erro ao marcar mensagem como vista:', error)
        res.status(500).json({ 
            error: 'Erro ao marcar mensagem como vista',
            details: error.response?.data || error.message 
        })
    }
})

// Rota para obter estatísticas das conexões WebSocket
app.get('/api/socket/stats', (req, res) => {
    const io = app.get('io')
    if (!io) {
        return res.status(503).json({ error: 'WebSocket não está disponível' })
    }

    try {
        // Obter estatísticas básicas do Socket.IO
        const sockets = io.sockets.sockets
        const rooms = io.sockets.adapter.rooms
        
        const stats = {
            connectedSockets: sockets.size,
            totalRooms: rooms.size,
            rooms: {}
        }

        // Listar salas e conexões
        rooms.forEach((socketIds, roomId) => {
            // Pular salas que são IDs de socket individual
            if (!sockets.has(roomId)) {
                stats.rooms[roomId] = {
                    connections: socketIds.size,
                    socketIds: Array.from(socketIds)
                }
            }
        })

        res.json(stats)
    } catch (error) {
        console.error('Erro ao obter estatísticas do socket:', error)
        res.status(500).json({ 
            error: 'Erro ao obter estatísticas',
            details: error.message 
        })
    }
})

module.exports = app