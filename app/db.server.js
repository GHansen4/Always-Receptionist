import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

// Configure WebSocket for Node.js environments
neonConfig.webSocketConstructor = ws

export function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL_CUSTOM
  if (!connectionString) throw new Error('Missing DATABASE_URL_CUSTOM')
  

    const adapter = new PrismaNeon({ connectionString })

  return new PrismaClient({ 
    adapter,
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn']
  })
}