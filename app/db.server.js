import { PrismaClient } from '@prisma/client'

const globalForPrisma = global

// Retry wrapper for database operations (not client creation)
export async function withRetry(operation, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      const isConnectionError = 
        error.message?.includes("Can't reach database") ||
        error.message?.includes("Connection timeout") ||
        error.message?.includes("ETIMEDOUT")
      
      if (!isConnectionError || attempt === maxRetries) {
        throw error
      }
      
      console.log(`⚠️  Database operation attempt ${attempt} failed, retrying...`)
      // Wait before retrying (exponential backoff: 1s, 2s, 3s)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
    }
  }
}

let prisma

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    log: ['error'],
  })
} else {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log: ['query', 'error', 'warn'],
    })
  }
  prisma = globalForPrisma.prisma
}

export default prisma