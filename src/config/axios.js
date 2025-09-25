const axios = require("axios");
require('dotenv').config();

// Configuração da instância do axios para APIs externas
const apiClient = axios.create({
  baseURL: process.env.EXTERNAL_API_URL_WAHA || "",
  timeout: parseInt(process.env.API_TIMEOUT) || 10000, // 10 segundos
  headers: {
    "Content-Type": "application/json",
    "User-Agent": "Consultorio-Chat-API/1.0.0",
    // Adicionar header de autorização se necessário
    ...(process.env.API_KEY && { "Authorization": `Bearer ${process.env.API_KEY}` })
  }
});

// Interceptor para requests - logging e modificações
apiClient.interceptors.request.use(
  (config) => {
    // Log da requisição
    console.log(`[AXIOS REQUEST] ${config.method?.toUpperCase()} ${config.url}`, {
      data: config.data,
      params: config.params,
      timestamp: new Date().toISOString()
    });

    // Adicionar timestamp ou outros headers dinâmicos se necessário
    config.headers['X-Request-Time'] = new Date().toISOString();
    
    return config;
  },
  (error) => {
    console.error("[AXIOS REQUEST ERROR]", {
      message: error.message,
      timestamp: new Date().toISOString()
    });
    return Promise.reject(error);
  }
);

// Interceptor para responses - logging e tratamento de erros
apiClient.interceptors.response.use(
  (response) => {
    // Log da resposta bem-sucedida
    console.log(`[AXIOS RESPONSE] ${response.status} ${response.config.url}`, {
      status: response.status,
      statusText: response.statusText,
      responseTime: response.headers['x-response-time'] || 'N/A',
      timestamp: new Date().toISOString()
    });
    
    return response;
  },
  (error) => {
    // Log detalhado do erro
    const errorInfo = {
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      method: error.config?.method?.toUpperCase(),
      message: error.message,
      data: error.response?.data,
      timestamp: new Date().toISOString()
    };
    
    console.error("[AXIOS RESPONSE ERROR]", errorInfo);

    // Tratamento específico por status code
    if (error.response?.status === 401) {
      console.warn("[AUTH ERROR] Credenciais inválidas ou expiradas");
    } else if (error.response?.status === 429) {
      console.warn("[RATE LIMIT] Muitas requisições - implementar retry");
    } else if (error.response?.status >= 500) {
      console.error("[SERVER ERROR] Erro no servidor externo");
    }

    return Promise.reject(error);
  }
);

// Função helper para retry automático
const createRetryableRequest = (maxRetries = 3, delayMs = 1000) => {
  return async (requestFn) => {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        
        // Não fazer retry em erros 4xx (exceto 429)
        if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
          throw error;
        }
        
        if (attempt < maxRetries) {
          console.log(`[RETRY] Tentativa ${attempt}/${maxRetries} falhou, tentando novamente em ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        }
      }
    }
    
    throw lastError;
  };
};

// Funções utilitárias específicas para a API
const apiUtils = {
  // Enviar mensagem de texto
  async sendText(chatId, text, session) {
    return apiClient.post("/sendText", {
      chatId,
      text,
      session,
    });
  },

  // Marcar mensagem como vista
  async sendSeen(chatId, messageId, session, participant = null) {
    return apiClient.post("/sendSeen", {
      chatId,
      messageId,
      participant,
      session,
    });
  },

  async startTyping(chatId, session) {
    return apiClient.post("/startTyping", {
      chatId,
      session,
    });
  },

  async stopTyping(chatId, session) {
    return apiClient.post("/stopTyping", {
      chatId,
      session,
    });
  },

  // Enviar mensagem com botões
  async sendButtons(chatId, header, body, footer, buttons, session, headerImage = null) {
    const payload = {
      chatId,
      header,
      body,
      footer,
      buttons,
      session,
    };

    // Adicionar headerImage se fornecido
    if (headerImage) {
      payload.headerImage = headerImage;
    }

    return apiClient.post("/sendButtons", payload);
  },

  // Verificar status da sessão
  async getSessionStatus(session) {
    return apiClient.get(`/sessions/${session}/status`);
  },

  // Obter informações do chat
  async getChatInfo(chatId, session) {
    return apiClient.get(`/chats/${chatId}`, {
      params: { session }
    });
  },

  // Listar sessões ativas
  async listSessions() {
    return apiClient.get("/sessions");
  },

  // Função com retry automático
  withRetry: createRetryableRequest()
};

module.exports = {
  apiClient,
  apiUtils,
  createRetryableRequest
};