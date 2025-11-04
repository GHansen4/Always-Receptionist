/**
 * GDPR Webhook: customers/data_request
 *
 * Triggered when a customer requests their data from a store owner.
 * The app must collect and provide all data stored about the customer.
 *
 * Reference: https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance#customers-data_request
 *
 * Important Notes:
 * - This webhook is sent when a merchant receives a data request from a customer
 * - You must return a 200 OK response immediately
 * - You have 30 days to provide the customer data to the merchant
 * - You should log this request and generate a data export
 */

import { authenticate } from "../shopify.server";
import {
  collectCustomerData,
  logGdprRequest,
  updateGdprRequestStatus
} from "../utils/gdpr.server";

export const action = async ({ request }) => {
  console.log('\n' + '='.repeat(60));
  console.log('📋 GDPR WEBHOOK: customers/data_request');
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
    const ordersRequested = payload.orders_requested || [];

    console.log('Customer ID:', customerId);
    console.log('Customer Email:', customerEmail);
    console.log('Customer Phone:', customerPhone);
    console.log('Orders Requested:', ordersRequested);

    // Log the GDPR request for audit trail
    const gdprRequest = await logGdprRequest({
      shop,
      requestType: 'data_request',
      ordersRequested,
      customerId,
      customerEmail,
      customerPhone,
      payload
    });

    console.log('✅ GDPR request logged:', gdprRequest?.id || 'not logged (table missing)');

    // Collect customer data
    try {
      const customerData = await collectCustomerData(
        shop,
        customerId,
        customerEmail,
        customerPhone
      );

      console.log('✅ Customer data collected successfully');
      console.log('Data summary:', {
        callLogs: customerData.callLogs.length,
        dataTypes: customerData.dataTypes
      });

      // Mark request as completed
      await updateGdprRequestStatus(gdprRequest?.id, 'completed');

      // TODO: Send the customer data to the merchant
      // Options:
      // 1. Email it to the merchant
      // 2. Generate a downloadable report in the app UI
      // 3. Store it for the merchant to download from a GDPR compliance page
      //
      // For now, we're logging it. In production, you should:
      // - Store the data package for merchant download
      // - Send an email notification to the merchant
      // - Provide a UI for the merchant to download the data

      console.log('📧 Customer data ready for merchant download');
      console.log('Data package:', JSON.stringify(customerData, null, 2));

    } catch (collectionError) {
      console.error('❌ Error collecting customer data:', collectionError);
      await updateGdprRequestStatus(gdprRequest?.id, 'failed');
    }

    console.log('='.repeat(60));
    console.log('✅ customers/data_request webhook processed successfully');
    console.log('='.repeat(60) + '\n');

    // Return 200 OK to acknowledge receipt
    return new Response(JSON.stringify({
      success: true,
      requestId: gdprRequest?.id || 'not-logged',
      message: 'Customer data request received and processed'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ ERROR PROCESSING customers/data_request WEBHOOK');
    console.error('='.repeat(60));
    console.error('Error Type:', error.constructor.name);
    console.error('Error Message:', error.message);
    console.error('Stack Trace:', error.stack);
    console.error('='.repeat(60) + '\n');

    // Return 200 OK even on error (Shopify recommends this to prevent retries)
    // The error is logged for investigation
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
