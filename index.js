import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { connectDB } from './config/database.js'
import config from './config/app.js'
import authRoutes from './routes/authRoutes.js'
import integrationRoutes from './routes/integrationRoutes.js'
import dataRoutes from './routes/dataRoutes.js'
import ErrorHandler from './middleware/errorHandler.js'

const app = express()

connectDB()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/auth', authRoutes)
app.use('/integration', integrationRoutes)
app.use('/', dataRoutes)

app.get('/', (req, res) => {
  res.json({
    message: 'GitHub Integration API',
    endpoints: {
      auth: {
        login: 'GET /auth/github/login',
        callback: 'GET /auth/github/callback',
      },
      integration: {
        status: 'GET /integration/status',
        remove: 'POST /integration/remove',
        resync: 'POST /integration/resync',
      },
      data: {
        collection: 'GET /data/:collection?page=1&limit=10&sort_by=createdAt&sort_order=desc&filter={}&search=keyword',
        search: 'GET /search?q=keyword',
      },
    },
  })
})

app.use((req, res) => ErrorHandler.handleNotFound(req, res))
app.use(ErrorHandler.handleError)

const PORT = config.port
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

export default app
