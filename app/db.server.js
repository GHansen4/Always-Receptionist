import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

// Configure WebSocket for Node.js environments
neonConfig.webSocketConstructor = ws

const globalForPrisma = global

let prisma

function getPrismaClient() {
  if (prisma) {
    return prisma
  }

  // Get connection string at runtime, not module load time
  const connectionString = process.env.DATABASE_URL_CUSTOM || process.env.DATABASE_URL
  
  if (!connectionString) {
    throw new Error('No DATABASE_URL or DATABASE_URL_CUSTOM found')
  }

  console.log('Creating Prisma client with connection string:', connectionString.substring(0, 30))

  const pool = new Pool({ connectionString })
  const adapter = new PrismaNeon(pool)
  
  prisma = new PrismaClient({ 
    adapter,
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn']
  })

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma
  }

  return prisma
}

export default new Proxy({}, {
  get(_target, prop) {
    return getPrismaClient()[prop]
  }
})