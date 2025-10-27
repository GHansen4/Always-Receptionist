import { shopifyApp } from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { restResources } from "@shopify/shopify-api/rest/admin/2024-10";
import { createPrismaClient } from "./db.server";
import crypto from "crypto";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: "2024-10",
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(createPrismaClient()),
  restResources,
  
  // SHOPIFY'S PRESCRIBED HOOK FOR POST-INSTALL LOGIC
  hooks: {
    afterAuth: async ({ session, admin }) => {
      console.log('afterAuth hook triggered for shop:', session.shop);
      
      const prisma = createPrismaClient();
      
      try {
        // Register webhooks (if you have any)
        shopify.registerWebhooks({ session });
        
        // Create or update VAPI config for this shop
        const vapiSignature = crypto.randomBytes(32).toString('hex');
        
        await prisma.vapiConfig.upsert({
          where: { shop: session.shop },
          update: {
            // Update timestamp only on reinstall
            updatedAt: new Date()
          },
          create: {
            shop: session.shop,
            vapiSignature: vapiSignature,
            // phoneNumber will be added later by merchant
          }
        });
        
        console.log('VAPI config created/updated for shop:', session.shop);
      } finally {
        await prisma.$disconnect();
      }
    },
  },
});

export default shopify;
export const authenticate = shopify.authenticate;