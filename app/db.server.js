import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

// Configure WebSocket for Node.js environments
neonConfig.webSocketConstructor = ws

const globalForPrisma = global

// DEBUG: Log ALL environment variables that start with DATABASE
console.log('=== DATABASE ENVIRONMENT VARIABLES ===')
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL)
console.log('DATABASE_URL_CUSTOM exists:', !!process.env.DATABASE_URL_CUSTOM)
console.log('DATABASE_URL value:', process.env.DATABASE_URL?.substring(0, 50) + '...')
console.log('DATABASE_URL_CUSTOM value:', process.env.DATABASE_URL_CUSTOM?.substring(0, 50) + '...')

let prisma

// Use custom DATABASE_URL with connection pooling params if available
const connectionString = process.env.DATABASE_URL_CUSTOM || process.env.DATABASE_URL

console.log('Final connection string exists:', !!connectionString)
console.log('Final connection string starts with:', connectionString?.substring(0, 20))

if (!connectionString) {
  throw new Error('No DATABASE_URL or DATABASE_URL_CUSTOM found in environment variables')
}

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