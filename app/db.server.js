import { PrismaClient } from "@prisma/client";

let prisma;

export function createPrismaClient() {
  // Use DATABASE_URL_CUSTOM as the connection string
  const databaseUrl = process.env.DATABASE_URL_CUSTOM || process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    throw new Error("DATABASE_URL_CUSTOM is not set in environment variables");
  }
  
  if (!prisma) {
    console.log("🔌 Connecting to database...");
    console.log("   Using:", databaseUrl.substring(0, 30) + "...");
    
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
  }
  return prisma;
}