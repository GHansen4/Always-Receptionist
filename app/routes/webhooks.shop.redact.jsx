/**
 * GDPR Webhook: shop/redact
 *
 * Triggered when a merchant uninstalls your app or requests their shop data be deleted.
 * The app must delete ALL data associated with the shop.
 *
 * Reference: https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance#shop-redact
 *
 * Important Notes:
 * - This webhook is sent 48 hours after a merchant uninstalls your app
 * - You must permanently delete ALL shop data from your systems
 * - This includes: sessions, settings, call logs, customer data, everything
 * - You must return a 200 OK response immediately
 * - You have 30 days to complete the deletion, but should do it immediately
 * - This is legally binding under GDPR, CCPA, and similar privacy laws
 *
 * Difference from app/uninstalled:
 * - app/uninstalled: Fires immediately when app is uninstalled (for cleanup)
 * - shop/redact: Fires 48 hours later (for GDPR compliance and final deletion)
 */

import { authenticate } from "../shopify.server";
import {
  redactShopData,
  logGdprRequest,
  updateGdprRequestStatus
} from "../utils/gdpr.server";

export const action = async ({ request }) => {
  console.log('\n' + '='.repeat(60));
  console.log('🗑️ GDPR WEBHOOK: shop/redact');
  console.log('='.repeat(60));

  try {
    // Authenticate the webhook request
    const { shop, payload, topic } = await authenticate.webhook(request);

    console.log('Shop:', shop);
    console.log('Topic:', topic);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    // Log the GDPR request for audit trail
    // Note: This record will be deleted along with all other shop data
    const gdprRequest = await logGdprRequest({
      shop,
      requestType: 'shop_redact',
      payload
    });

    console.log('✅ GDPR shop redaction request logged:', gdprRequest?.id);

    // Redact (delete) ALL shop data
    try {
      const result = await redactShopData(shop);

      console.log('✅ Shop data redacted successfully');
      console.log('Deleted records:', result.deletedRecords);

      // Note: We cannot mark this request as completed because we just deleted it!
      // The logging is primarily for real-time monitoring before deletion

      console.log('='.repeat(60));
      console.log('✅ shop/redact webhook processed successfully');
      console.log('🗑️ Deleted records summary:');
      console.log('   - Sessions:', result.deletedRecords.sessions);
      console.log('   - VAPI Config:', result.deletedRecords.vapiConfig);
      console.log('   - Shop Settings:', result.deletedRecords.shopSettings);
      console.log('   - Call Logs:', result.deletedRecords.callLogs);
      console.log('   - GDPR Requests:', result.deletedRecords.gdprRequests);
      console.log('='.repeat(60) + '\n');

      // Return 200 OK to acknowledge receipt
      return new Response(JSON.stringify({
        success: true,
        deletedRecords: result.deletedRecords,
        message: 'Shop data redacted successfully'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (redactionError) {
      console.error('❌ Error redacting shop data:', redactionError);

      // Try to mark as failed, but this might also fail if DB is corrupted
      try {
        await updateGdprRequestStatus(gdprRequest?.id, 'failed');
      } catch (updateError) {
        console.error('❌ Could not update GDPR request status:', updateError.message);
      }

      throw redactionError;
    }

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ ERROR PROCESSING shop/redact WEBHOOK');
    console.error('='.repeat(60));
    console.error('Error Type:', error.constructor.name);
    console.error('Error Message:', error.message);
    console.error('Stack Trace:', error.stack);
    console.error('='.repeat(60) + '\n');

    // Return 200 OK even on error (Shopify recommends this to prevent retries)
    // The error is logged for manual investigation and remediation
    // This is CRITICAL - you must manually verify the data was deleted
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      note: 'CRITICAL: Manual verification required - ensure all shop data is deleted'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
