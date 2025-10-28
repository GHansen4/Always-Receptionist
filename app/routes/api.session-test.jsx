import prisma from "../db.server";

export async function loader() {
  
  try {
    // Query sessions directly from Prisma
    const sessions = await prisma.session.findMany();
    
    return new Response(
      JSON.stringify({
        message: "Session storage test using Prisma",
        sessionCount: sessions.length,
        sessions: sessions.map(s => ({
          id: s.id,
          shop: s.shop,
          scope: s.scope,
          hasAccessToken: !!s.accessToken
        }))
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack 
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
