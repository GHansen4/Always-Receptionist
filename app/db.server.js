import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

// Configure WebSocket for Node.js environments
neonConfig.webSocketConstructor = ws

const globalForPrisma = global

let prisma

// Use DATABASE_URL (no custom parameters needed with serverless driver)
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error('❌ DATABASE_URL not found in environment variables')
  throw new Error('DATABASE_URL is required but not set')
}

console.log('✅ Database connection string found')

if (process.env.NODE_ENV === 'production') {
  const pool = new Pool({ connectionString })
  const adapter = new PrismaNeon(pool)
  
  prisma = new PrismaClient({ 
    adapter,
    log: ['error']
  })
} else {
  if (!globalForPrisma.prisma) {
    const pool = new Pool({ connectionString })
    const adapter = new PrismaNeon(pool)
    
    globalForPrisma.prisma = new PrismaClient({ 
      adapter,
      log: ['query', 'error', 'warn']
    })
  }
  prisma = globalForPrisma.prisma
}

export default prisma