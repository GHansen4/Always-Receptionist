/**
 * VAPI Debug Endpoint
 *
 * Provides diagnostic information for debugging VAPI integration issues.
 * This endpoint is accessible via GET request and returns system status.
 */

import prisma from "../db.server";

/**
 * GET handler for debug information
 */
export async function loader({ request }) {
  console.log('=== VAPI Debug Endpoint Called ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('URL:', request.url);

  try {
    // Environment checks
    const environmentStatus = {
      NODE_ENV: process.env.NODE_ENV,
      VAPI_PRIVATE_KEY_SET: !!process.env.VAPI_PRIVATE_KEY,
      VAPI_PRIVATE_KEY_LENGTH: process.env.VAPI_PRIVATE_KEY?.length || 0,
      DATABASE_URL_SET: !!process.env.DATABASE_URL,
      SHOPIFY_API_KEY_SET: !!process.env.SHOPIFY_API_KEY,
      SHOPIFY_API_SECRET_SET: !!process.env.SHOPIFY_API_SECRET,
    };

    console.log('Environment status:', environmentStatus);

    // Database connectivity check
    let databaseStatus;
    try {
      const vapiConfigCount = await prisma.vapiConfig.count();
      const sessionCount = await prisma.session.count();

      databaseStatus = {
        connected: true,
        vapiConfigCount,
        sessionCount,
      };

      console.log('Database status:', databaseStatus);
    } catch (dbError) {
      console.error('Database error:', dbError);
      databaseStatus = {
        connected: false,
        error: dbError.message,
      };
    }

    // Sample VapiConfig (without sensitive data)
    let sampleConfig = null;
    try {
      const config = await prisma.vapiConfig.findFirst();
      if (config) {
        sampleConfig = {
          id: config.id,
          shop: config.shop,
          hasSignature: !!config.vapiSignature,
          signatureLength: config.vapiSignature?.length || 0,
          hasAssistantId: !!config.assistantId,
          assistantId: config.assistantId,
          hasPhoneNumber: !!config.phoneNumber,
          createdAt: config.createdAt,
        };
      }
      console.log('Sample config:', sampleConfig);
    } catch (configError) {
      console.error('Error fetching sample config:', configError);
    }

    // Sample Session (without sensitive data)
    let sampleSession = null;
    try {
      const session = await prisma.session.findFirst();
      if (session) {
        sampleSession = {
          id: session.id,
          shop: session.shop,
          hasAccessToken: !!session.accessToken,
          tokenLength: session.accessToken?.length || 0,
          scope: session.scope,
          isOnline: session.isOnline,
          expires: session.expires,
        };
      }
      console.log('Sample session:', sampleSession);
    } catch (sessionError) {
      console.error('Error fetching sample session:', sessionError);
    }

    const debugInfo = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: environmentStatus,
      database: databaseStatus,
      sampleConfig,
      sampleSession,
      endpoints: {
        functions: '/api/vapi/functions',
        products: '/api/vapi/products (legacy)',
        debug: '/api/vapi/debug',
      },
      architecture: {
        tier1: 'Function Calling Endpoint',
        tier2: 'Shop Resolution (VapiConfig table)',
        tier3: 'OAuth Session (Session table)',
        tier4: 'Shopify GraphQL API',
      },
    };

    console.log('Debug info compiled successfully');
    console.log('=== VAPI Debug Endpoint Completed ===');

    return Response.json(debugInfo, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

  } catch (error) {
    console.error('=== VAPI Debug Endpoint Error ===');
    console.error('Error:', error);

    return Response.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        type: error.constructor.name,
      },
    }, {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
