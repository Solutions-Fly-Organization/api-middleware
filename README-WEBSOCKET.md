# API Middleware com WebSocket - Consultório Chat

Este projeto implementa um middleware API com WebSocket usando Socket.IO para comunicação em tempo real com a API WAHA (WhatsApp HTTP API).

## Funcionalidades

- ✅ WebSocket com Socket.IO para comunicação em tempo real
- ✅ Integração com API WAHA para envio/recebimento de mensagens
- ✅ Salas por sessão e chat ID
- ✅ Eventos de digitação (typing indicators)
- ✅ Marcação de mensagens como vistas
- ✅ Notificações automáticas via webhook
- ✅ Interface de teste HTML

## Instalação e Configuração

### 1. Instalar Dependências

```bash
npm install
```

### 2. Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
# Porta do servidor
PORT=3000

# URL da API WAHA
EXTERNAL_API_URL_WAHA=http://localhost:3001

# URL do N8N (opcional)
EXTERNAL_API_URL_N8N=http://localhost:5678/webhook

# Timeout da API (em ms)
API_TIMEOUT=10000

# Chave de API (se necessário)
API_KEY=your-api-key-here

# URL do frontend (para CORS)
FRONTEND_URL=http://localhost:3000
```

### 3. Iniciar o Servidor

```bash
npm start
```

O servidor estará disponível em `http://localhost:3000`

## Uso do WebSocket

### Conectar ao WebSocket

```javascript
const socket = io('http://localhost:3000');

socket.on('connect', () => {
    console.log('Conectado ao WebSocket');
});
```

### Entrar em uma Sessão

```javascript
// Para uma sessão específica
socket.emit('join-session', {
    sessionId: 'default',
    chatId: '5511999999999@c.us'  // Opcional
});

// Resposta do servidor
socket.on('joined-session', (data) => {
    console.log('Conectado à sessão:', data);
});
```

### Enviar Mensagens

```javascript
// Enviar mensagem de texto
socket.emit('send-message', {
    sessionId: 'default',
    chatId: '5511999999999@c.us',
    text: 'Olá, como posso ajudar?',
    messageType: 'text'
});

// Enviar mensagem com botões
socket.emit('send-message', {
    sessionId: 'default',
    chatId: '5511999999999@c.us',
    messageType: 'buttons',
    header: 'Atendimento',
    body: 'Como posso ajudar você hoje?',
    footer: 'Consultório Médico',
    buttons: [
        { buttonId: 'agenda', buttonText: { displayText: 'Agendar Consulta' } },
        { buttonId: 'info', buttonText: { displayText: 'Informações' } }
    ]
});
```

### Escutar Eventos

```javascript
// Nova mensagem recebida
socket.on('new-message', (message) => {
    console.log('Nova mensagem:', message);
});

// Mensagem enviada confirmada
socket.on('message-sent', (message) => {
    console.log('Mensagem enviada:', message);
});

// Usuário digitando
socket.on('user-typing', (data) => {
    console.log('Usuário digitando:', data);
});

// Mensagem vista
socket.on('message-seen', (data) => {
    console.log('Mensagem vista:', data);
});

// Erros
socket.on('error', (error) => {
    console.error('Erro:', error);
});
```

### Indicadores de Digitação

```javascript
// Começar a digitar
socket.emit('start-typing', {
    sessionId: 'default',
    chatId: '5511999999999@c.us'
});

// Parar de digitar
socket.emit('stop-typing', {
    sessionId: 'default',
    chatId: '5511999999999@c.us'
});
```

### Marcar Mensagem como Vista

```javascript
socket.emit('mark-as-seen', {
    sessionId: 'default',
    chatId: '5511999999999@c.us',
    messageId: 'message-id-here',
    participant: '5511999999999@c.us'  // Opcional
});
```

## API REST Endpoints

### Sessões

- `GET /api/sessions` - Listar todas as sessões
- `GET /api/sessions/:sessionId/status` - Status de uma sessão

### Chats

- `GET /api/chats/:chatId?session=sessionId` - Informações do chat

### Mensagens

- `POST /api/messages/send` - Enviar mensagem
- `POST /api/messages/seen` - Marcar mensagem como vista

### WebSocket Stats

- `GET /api/socket/stats` - Estatísticas das conexões WebSocket

### Exemplo de Requisição REST

```bash
# Enviar mensagem via API REST
curl -X POST http://localhost:3000/api/messages/send \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "default",
    "chatId": "5511999999999@c.us",
    "text": "Mensagem via API REST",
    "messageType": "text"
  }'
```

## Teste da Interface Web

Acesse `http://localhost:3000/test-websocket.html` para uma interface de teste completa.

## Estrutura de Eventos WebSocket

### Eventos do Cliente para o Servidor

| Evento | Descrição | Parâmetros |
|--------|-----------|------------|
| `join-session` | Entrar em uma sessão | `{ sessionId, chatId? }` |
| `leave-session` | Sair da sessão atual | - |
| `send-message` | Enviar mensagem | `{ sessionId, chatId, text, messageType? }` |
| `mark-as-seen` | Marcar como vista | `{ sessionId, chatId, messageId, participant? }` |
| `start-typing` | Iniciar digitação | `{ sessionId, chatId }` |
| `stop-typing` | Parar digitação | `{ sessionId, chatId }` |

### Eventos do Servidor para o Cliente

| Evento | Descrição | Dados |
|--------|-----------|-------|
| `joined-session` | Confirmação de entrada na sessão | `{ sessionId, chatId, roomId, message }` |
| `user-joined` | Outro usuário entrou | `{ socketId, sessionId, chatId }` |
| `user-left` | Usuário saiu | `{ socketId, sessionId, chatId }` |
| `new-message` | Nova mensagem recebida | `{ id, sessionId, chatId, text, timestamp, direction }` |
| `message-sent` | Mensagem enviada confirmada | `{ id, sessionId, chatId, text, timestamp, status }` |
| `message-seen` | Mensagem vista | `{ sessionId, chatId, messageId, participant, timestamp }` |
| `user-typing` | Usuário digitando | `{ sessionId, chatId, socketId, timestamp }` |
| `user-stopped-typing` | Usuário parou de digitar | `{ sessionId, chatId, socketId, timestamp }` |
| `user-disconnected` | Usuário desconectado | `{ socketId, sessionId, chatId }` |
| `error` | Erro | `{ message, details? }` |

## Webhook Integration

O sistema automaticamente escuta webhooks no endpoint `/webhook` e notifica os clientes WebSocket conectados quando novas mensagens são recebidas.

### Exemplo de Payload do Webhook

```json
{
  "event": "message",
  "payload": {
    "session": "default",
    "chatId": "5511999999999@c.us",
    "from": "5511999999999@c.us",
    "body": "Olá!",
    "timestamp": "2023-09-25T10:30:00Z",
    "id": "message-id-123"
  }
}
```

## Monitoramento

- Use `GET /api/socket/stats` para monitorar conexões ativas
- Logs detalhados no console do servidor
- Interface de teste com log de eventos em tempo real

## Estrutura do Projeto

```
├── src/
│   ├── app.js              # Express app com rotas API
│   └── config/
│       ├── axios.js        # Configuração da API WAHA
│       └── socket.js       # Configuração do WebSocket
├── public/
│   └── test-websocket.html # Interface de teste
├── index.js                # Servidor principal
└── package.json
```

## Troubleshooting

### Problema de Conexão WebSocket

1. Verifique se o servidor está rodando na porta correta
2. Confirme que o CORS está configurado adequadamente
3. Verifique os logs do servidor para erros

### Mensagens não são enviadas

1. Confirme que a API WAHA está rodando e acessível
2. Verifique as variáveis de ambiente
3. Confirme que o sessionId e chatId estão corretos

### Webhooks não funcionam

1. Verifique se a URL do webhook está configurada corretamente na API WAHA
2. Confirme que o endpoint `/webhook` está acessível
3. Verifique os logs para erros de parsing do payload