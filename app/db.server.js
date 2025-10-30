import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

// Configure WebSocket for Node.js environments
neonConfig.webSocketConstructor = ws

const globalForPrisma = global

let prisma

// DEBUG: Log all DATABASE-related env vars
console.log('=== ENVIRONMENT VARIABLES DEBUG ===')
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL)
console.log('DATABASE_URL length:', process.env.DATABASE_URL?.length || 0)
console.log('DATABASE_URL starts with:', process.env.DATABASE_URL?.substring(0, 30))
console.log('All DATABASE vars:', Object.keys(process.env).filter(k => k.includes('DATABASE')))
console.log('NODE_ENV:', process.env.NODE_ENV)
console.log('===================================')

// Use DATABASE_URL (no custom parameters needed with serverless driver)
const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error('❌ DATABASE_URL not found in environment variables')
  console.error('Available env keys:', Object.keys(process.env).sort())
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