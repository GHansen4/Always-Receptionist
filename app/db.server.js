import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { Pool, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

// Configure WebSocket for Node.js environments
neonConfig.webSocketConstructor = ws

// DEBUG: Log all DATABASE-related env vars
console.log('=== DB.SERVER.JS LOADING ===')
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL)
console.log('DATABASE_URL length:', process.env.DATABASE_URL?.length || 0)
console.log('DATABASE_URL starts with:', process.env.DATABASE_URL?.substring(0, 30))
console.log('NODE_ENV:', process.env.NODE_ENV)
console.log('===================================')

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error('❌ DATABASE_URL not found in environment variables')
  throw new Error('DATABASE_URL is required but not set')
}

console.log('✅ Creating Prisma client with Neon adapter...')

// Pass connectionString to BOTH Pool AND PrismaNeon adapter
const pool = new Pool({ connectionString })
const adapter = new PrismaNeon(pool, { connectionString })  // ← Added connectionString here!

// Create Prisma client immediately at module load
const prisma = new PrismaClient({ 
  adapter,
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn']
})

console.log('✅ Prisma client created successfully')

export default prisma