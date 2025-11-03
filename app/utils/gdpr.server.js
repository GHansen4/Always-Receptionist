/**
 * GDPR Compliance Utilities
 *
 * Handles Shopify mandatory compliance webhooks:
 * - customers/data_request: Collect customer data
 * - customers/redact: Delete customer data
 * - shop/redact: Delete all shop data
 *
 * References:
 * https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance
 * https://shopify.dev/docs/apps/webhooks/configuration/mandatory-webhooks
 */

import prisma from "../db.server";

/**
 * Collect all customer data for GDPR data request
 * This function gathers all data associated with a customer that your app stores
 *
 * @param {string} shop - Shop domain
 * @param {string} customerId - Shopify customer ID
 * @param {string} customerEmail - Customer email
 * @param {string} customerPhone - Customer phone
 * @returns {Object} Customer data package
 */
export async function collectCustomerData(shop, customerId, customerEmail, customerPhone) {
  console.log('📊 Collecting customer data for GDPR request...');
  console.log('Shop:', shop);
  console.log('Customer ID:', customerId);
  console.log('Customer Email:', customerEmail);
  console.log('Customer Phone:', customerPhone);

  try {
    // Collect call logs for this customer
    // Match by phone number or email mentioned in transcript
    const callLogs = await prisma.callLog.findMany({
      where: {
        shop,
        OR: [
          { phoneNumber: customerPhone },
          { transcript: { contains: customerEmail } },
          { transcript: { contains: customerPhone } }
        ]
      },
      select: {
        id: true,
        callId: true,
        phoneNumber: true,
        duration: true,
        transcript: true,
        summary: true,
        createdAt: true
      }
    });

    console.log(`✅ Found ${callLogs.length} call logs for customer`);

    // Package the data
    const customerDataPackage = {
      shop,
      customerId,
      customerEmail,
      customerPhone,
      dataCollectedAt: new Date().toISOString(),
      callLogs: callLogs.map(log => ({
        callId: log.callId,
        phoneNumber: log.phoneNumber,
        duration: log.duration,
        transcript: log.transcript,
        summary: log.summary,
        date: log.createdAt.toISOString()
      })),
      dataTypes: {
        callLogs: callLogs.length,
        transcripts: callLogs.filter(l => l.transcript).length
      }
    };

    console.log('✅ Customer data package created');
    return customerDataPackage;

  } catch (error) {
    console.error('❌ Error collecting customer data:', error);
    throw error;
  }
}

/**
 * Redact (delete) all customer data from the system
 * This function removes all data associated with a customer
 *
 * @param {string} shop - Shop domain
 * @param {string} customerId - Shopify customer ID
 * @param {string} customerEmail - Customer email
 * @param {string} customerPhone - Customer phone
 * @returns {Object} Deletion summary
 */
export async function redactCustomerData(shop, customerId, customerEmail, customerPhone) {
  console.log('🗑️ Redacting customer data...');
  console.log('Shop:', shop);
  console.log('Customer ID:', customerId);
  console.log('Customer Email:', customerEmail);
  console.log('Customer Phone:', customerPhone);

  try {
    // Delete call logs for this customer
    const deletedCallLogs = await prisma.callLog.deleteMany({
      where: {
        shop,
        OR: [
          { phoneNumber: customerPhone },
          { transcript: { contains: customerEmail } },
          { transcript: { contains: customerPhone } }
        ]
      }
    });

    console.log(`✅ Deleted ${deletedCallLogs.count} call logs`);

    return {
      success: true,
      deletedRecords: {
        callLogs: deletedCallLogs.count
      },
      deletedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error redacting customer data:', error);
    throw error;
  }
}

/**
 * Redact (delete) ALL shop data from the system
 * This function removes all data when a shop uninstalls the app
 * Called by both shop/redact webhook and app/uninstalled webhook
 *
 * @param {string} shop - Shop domain
 * @returns {Object} Deletion summary
 */
export async function redactShopData(shop) {
  console.log('🗑️ Redacting ALL shop data...');
  console.log('Shop:', shop);

  try {
    // Use a transaction to ensure all deletes succeed or none do
    const result = await prisma.$transaction(async (tx) => {
      // Delete all sessions for this shop
      const deletedSessions = await tx.session.deleteMany({
        where: { shop }
      });

      // Delete VAPI configuration
      const deletedVapiConfig = await tx.vapiConfig.deleteMany({
        where: { shop }
      });

      // Delete shop settings
      const deletedShopSettings = await tx.shopSettings.deleteMany({
        where: { shop }
      });

      // Delete all call logs (contains PII - transcripts, phone numbers)
      const deletedCallLogs = await tx.callLog.deleteMany({
        where: { shop }
      });

      // Delete all GDPR request records for this shop
      const deletedGdprRequests = await tx.gdprRequest.deleteMany({
        where: { shop }
      });

      return {
        sessions: deletedSessions.count,
        vapiConfig: deletedVapiConfig.count,
        shopSettings: deletedShopSettings.count,
        callLogs: deletedCallLogs.count,
        gdprRequests: deletedGdprRequests.count
      };
    });

    console.log('✅ Shop data redaction complete:', result);

    return {
      success: true,
      deletedRecords: result,
      deletedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error redacting shop data:', error);
    throw error;
  }
}

/**
 * Log a GDPR request to the database for audit trail
 *
 * @param {Object} params - Request parameters
 * @returns {Object} Created GdprRequest record
 */
export async function logGdprRequest({
  shop,
  requestType,
  ordersRequested = [],
  customerId = null,
  customerEmail = null,
  customerPhone = null,
  payload = null
}) {
  console.log('📝 Logging GDPR request...');
  console.log('Type:', requestType);
  console.log('Shop:', shop);

  try {
    const gdprRequest = await prisma.gdprRequest.create({
      data: {
        shop,
        requestType,
        ordersRequested,
        customerId,
        customerEmail,
        customerPhone,
        payload: payload ? JSON.stringify(payload) : null,
        status: 'pending'
      }
    });

    console.log('✅ GDPR request logged:', gdprRequest.id);
    return gdprRequest;

  } catch (error) {
    console.error('❌ Error logging GDPR request:', error);
    throw error;
  }
}

/**
 * Mark a GDPR request as completed
 *
 * @param {string} requestId - GDPR request ID
 * @param {string} status - "completed" or "failed"
 * @returns {Object} Updated GdprRequest record
 */
export async function updateGdprRequestStatus(requestId, status) {
  console.log('📝 Updating GDPR request status...');
  console.log('Request ID:', requestId);
  console.log('New status:', status);

  try {
    const updatedRequest = await prisma.gdprRequest.update({
      where: { id: requestId },
      data: {
        status,
        processedAt: new Date()
      }
    });

    console.log('✅ GDPR request status updated');
    return updatedRequest;

  } catch (error) {
    console.error('❌ Error updating GDPR request status:', error);
    throw error;
  }
}
