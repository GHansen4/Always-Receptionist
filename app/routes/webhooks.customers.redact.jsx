/**
 * GDPR Webhook: customers/redact
 *
 * Triggered when a merchant requests deletion of customer data.
 * The app must delete all data associated with the customer.
 *
 * Reference: https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance#customers-redact
 *
 * Important Notes:
 * - This webhook is sent 48 hours after a customer's data is redacted in the merchant's store
 * - You must permanently delete all customer data from your systems
 * - You must return a 200 OK response immediately
 * - You have 30 days to complete the deletion, but should do it immediately
 * - This is legally binding under GDPR, CCPA, and similar privacy laws
 */

import { authenticate } from "../shopify.server";
import {
  redactCustomerData,
  logGdprRequest,
  updateGdprRequestStatus
} from "../utils/gdpr.server";

export const action = async ({ request }) => {
  console.log('\n' + '='.repeat(60));
  console.log('🗑️ GDPR WEBHOOK: customers/redact');
  console.log('='.repeat(60));

  try {
    // Authenticate the webhook request
    const { shop, payload, topic } = await authenticate.webhook(request);

    console.log('Shop:', shop);
    console.log('Topic:', topic);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    // Extract customer information from webhook payload
    const customerId = payload.customer?.id?.toString();
    const customerEmail = payload.customer?.email;
    const customerPhone = payload.customer?.phone;
    const ordersToRedact = payload.orders_to_redact || [];

    console.log('Customer ID:', customerId);
    console.log('Customer Email:', customerEmail);
    console.log('Customer Phone:', customerPhone);
    console.log('Orders to Redact:', ordersToRedact);

    // Log the GDPR request for audit trail
    const gdprRequest = await logGdprRequest({
      shop,
      requestType: 'customer_redact',
      ordersRequested: ordersToRedact,
      customerId,
      customerEmail,
      customerPhone,
      payload
    });

    console.log('✅ GDPR redaction request logged:', gdprRequest?.id);

    // Redact (delete) customer data
    try {
      const result = await redactCustomerData(
        shop,
        customerId,
        customerEmail,
        customerPhone
      );

      console.log('✅ Customer data redacted successfully');
      console.log('Deleted records:', result.deletedRecords);

      // Mark request as completed
      await updateGdprRequestStatus(gdprRequest?.id, 'completed');

      console.log('='.repeat(60));
      console.log('✅ customers/redact webhook processed successfully');
      console.log(`🗑️ Deleted ${result.deletedRecords.callLogs} call logs`);
      console.log('='.repeat(60) + '\n');

      // Return 200 OK to acknowledge receipt
      return new Response(JSON.stringify({
        success: true,
        requestId: gdprRequest?.id,
        deletedRecords: result.deletedRecords,
        message: 'Customer data redacted successfully'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (redactionError) {
      console.error('❌ Error redacting customer data:', redactionError);
      await updateGdprRequestStatus(gdprRequest?.id, 'failed');
      throw redactionError;
    }

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ ERROR PROCESSING customers/redact WEBHOOK');
    console.error('='.repeat(60));
    console.error('Error Type:', error.constructor.name);
    console.error('Error Message:', error.message);
    console.error('Stack Trace:', error.stack);
    console.error('='.repeat(60) + '\n');

    // Return 200 OK even on error (Shopify recommends this to prevent retries)
    // The error is logged for investigation and manual remediation
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
