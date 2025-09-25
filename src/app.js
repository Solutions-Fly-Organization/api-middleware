require('dotenv').config()
const axios = require('axios')
const express = require('express')
const app = express()

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.post('/webhook', async (req, res) => {
    try {
        await axios.post(process.env.EXTERNAL_API_URL_N8N, req.body)
        // Lógica para processar o webhook
        res.status(200).send('Webhook received!')
    } catch (error) {
        console.error('Error forwarding webhook:', error)
        res.status(500).send('Error processing webhook')
    }
})

module.exports = app