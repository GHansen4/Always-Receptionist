import { createPrismaClient } from "../db.server";

/**
 * Get a valid session for a shop
 * @param {string} shop - Shop domain
 * @returns {Promise<Object|null>} - Session object or null
 */
export async function getValidSession(shop) {
  if (!shop) return null;
  
  const db = createPrismaClient();
  
  try {
    const session = await db.session.findFirst({
      where: { 
        shop,
        expires: { gt: new Date() }
      }
    });
    
    // Additional validation
    if (!session) return null;
    if (!session.accessToken) return null;
    
    // Check if session is truly valid
    if (session.expires && new Date(session.expires) <= new Date()) {
      return null;
    }
    
    return session;
  } catch (error) {
    console.error('Error fetching session:', error);
    return null;
  } finally {
    await db.$disconnect();
  }
}

/**
 * Check if a shop has a valid installation
 * @param {string} shop - Shop domain
 * @returns {Promise<boolean>}
 */
export async function isShopInstalled(shop) {
  const session = await getValidSession(shop);
  return session !== null;
}
