import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

// Configure WebSocket for Node.js environments
neonConfig.webSocketConstructor = ws

export function createPrismaClient() {
  // ONLY use DATABASE_URL_CUSTOM - it has the connection pooling params
  const connectionString = process.env.DATABASE_URL_CUSTOM
  
  console.log('DATABASE_URL_CUSTOM value:', process.env.DATABASE_URL_CUSTOM)
  
  if (!connectionString) {
    throw new Error('DATABASE_URL_CUSTOM is required')
  }

  console.log('Creating Prisma client with full connection string:', connectionString)

  const pool = new Pool({ connectionString })
  const adapter = new PrismaNeon(pool)
  
  return new PrismaClient({ 
    adapter,
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn']
  })
}

// Default export
const db = createPrismaClient()
export default db