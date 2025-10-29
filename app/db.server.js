import { PrismaClient } from "@prisma/client";

// Use DATABASE_URL_CUSTOM as the connection string
const databaseUrl = process.env.DATABASE_URL_CUSTOM || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL_CUSTOM is not set in environment variables");
}

// Use global singleton pattern to prevent multiple instances
if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    console.log("🔌 Connecting to database...");
    console.log("   Using:", databaseUrl.substring(0, 30) + "...");
    
    global.prismaGlobal = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

export default prisma;