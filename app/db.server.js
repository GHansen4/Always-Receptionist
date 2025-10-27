import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

// Configure WebSocket for Node.js environments
neonConfig.webSocketConstructor = ws

const globalForPrisma = global

let prisma

// DEBUG: Log what we have
console.log('DATABASE_URL_CUSTOM exists:', !!process.env.DATABASE_URL_CUSTOM)
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL)

// Use custom DATABASE_URL with connection pooling params if available
const connectionString = process.env.DATABASE_URL_CUSTOM || process.env.DATABASE_URL

if (process.env.NODE_ENV === 'production') {
  // Use Neon serverless driver adapter for production
  const pool = new Pool({ connectionString })
  const adapter = new PrismaNeon(pool)
  
  prisma = new PrismaClient({ 
    adapter,
    log: ['error']
  })
} else {
  if (!globalForPrisma.prisma) {
    // Use Neon serverless driver adapter for development too
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