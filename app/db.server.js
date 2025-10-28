import { PrismaClient } from "@prisma/client";

// Use global singleton pattern to prevent multiple instances
if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL_CUSTOM || process.env.DATABASE_URL,
        },
      },
    });
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL_CUSTOM || process.env.DATABASE_URL,
    },
  },
});

export default prisma;