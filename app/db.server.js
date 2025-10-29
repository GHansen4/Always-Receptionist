import { PrismaClient } from "@prisma/client";

// Use DATABASE_URL_CUSTOM as the connection string
const databaseUrl = process.env.DATABASE_URL_CUSTOM || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL_CUSTOM is not set in environment variables");
}

// Declare global type for TypeScript compatibility
const globalForPrisma = global;

// Use global singleton pattern in ALL environments (including production)
if (!globalForPrisma.prismaGlobal) {
  console.log("🔌 Connecting to database...");
  console.log("   Using:", databaseUrl.substring(0, 30) + "...");
  
  globalForPrisma.prismaGlobal = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
}

const prisma = globalForPrisma.prismaGlobal;

export default prisma;