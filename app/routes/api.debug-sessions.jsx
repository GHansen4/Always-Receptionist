import { json } from "@remix-run/node";
import { createPrismaClient } from "../db.server";

export async function loader({ request }) {
  const db = createPrismaClient();
  
  try {
    console.log('=== Checking sessions in database ===');
    
    // Get all sessions
    const sessions = await db.session.findMany({
      select: {
        id: true,
        shop: true,
        state: true,
        isOnline: true,
        expires: true,
        accessToken: true,
      },
      orderBy: {
        expires: 'desc'
      }
    });
    
    console.log(`Found ${sessions.length} sessions in database`);
    
    // Format for display (hide actual access tokens)
    const sessionInfo = sessions.map(s => ({
      shop: s.shop,
      hasAccessToken: !!s.accessToken,
      accessTokenLength: s.accessToken?.length,
      expires: s.expires,
      isExpired: s.expires ? s.expires < new Date() : false,
      isOnline: s.isOnline,
      state: s.state,
      id: s.id.substring(0, 20) + '...' // Truncate long IDs
    }));
    
    return json({
      success: true,
      totalSessions: sessions.length,
      sessions: sessionInfo,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error checking sessions:', error);
    return json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  } finally {
    await db.$disconnect();
  }
}
