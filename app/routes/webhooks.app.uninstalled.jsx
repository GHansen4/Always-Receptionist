/**
 * App Lifecycle Webhook: app/uninstalled
 *
 * Triggered immediately when a merchant uninstalls your app.
 * This webhook should clean up all shop data immediately.
 *
 * Note: The shop/redact webhook will also be sent 48 hours later for GDPR compliance.
 * Both webhooks should perform the same data deletion to ensure compliance.
 *
 * Reference: https://shopify.dev/docs/apps/build/webhooks/subscribe
 */

import { authenticate } from "../shopify.server";
import { redactShopData, logGdprRequest } from "../utils/gdpr.server";

export const action = async ({ request }) => {
  console.log('\n' + '='.repeat(60));
  console.log('📦 WEBHOOK: app/uninstalled');
  console.log('='.repeat(60));

  try {
    const { shop, session, topic } = await authenticate.webhook(request);

    console.log('Shop:', shop);
    console.log('Topic:', topic);
    console.log('Session exists:', !!session);

    // Webhook requests can trigger multiple times and after an app has already been uninstalled.
    // If this webhook already ran, the data may have been deleted previously.
    if (!session) {
      console.log('⚠️ No session found - data may have been already deleted');
      console.log('='.repeat(60) + '\n');
      return new Response(JSON.stringify({
        success: true,
        message: 'Already processed or no data to delete'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Log the uninstall event
    try {
      await logGdprRequest({
        shop,
        requestType: 'app_uninstalled',
        payload: { topic, timestamp: new Date().toISOString() }
      });
    } catch (logError) {
      console.error('⚠️ Could not log uninstall event:', logError.message);
      // Continue with deletion even if logging fails
    }

    // Delete ALL shop data (sessions, configs, call logs, everything)
    const result = await redactShopData(shop);

    console.log('✅ Shop data deleted successfully');
    console.log('Deleted records:', result.deletedRecords);
    console.log('='.repeat(60));
    console.log('✅ app/uninstalled webhook processed successfully');
    console.log('🗑️ Deleted records summary:');
    console.log('   - Sessions:', result.deletedRecords.sessions);
    console.log('   - VAPI Config:', result.deletedRecords.vapiConfig);
    console.log('   - Shop Settings:', result.deletedRecords.shopSettings);
    console.log('   - Call Logs:', result.deletedRecords.callLogs);
    console.log('   - GDPR Requests:', result.deletedRecords.gdprRequests);
    console.log('='.repeat(60) + '\n');

    return new Response(JSON.stringify({
      success: true,
      deletedRecords: result.deletedRecords,
      message: 'App uninstalled and data deleted successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ ERROR PROCESSING app/uninstalled WEBHOOK');
    console.error('='.repeat(60));
    console.error('Error Type:', error.constructor.name);
    console.error('Error Message:', error.message);
    console.error('Stack Trace:', error.stack);
    console.error('='.repeat(60) + '\n');

    // Return 200 OK to prevent retries, but log the error for investigation
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      note: 'Error logged for manual remediation'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};