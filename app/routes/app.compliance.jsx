/**
 * GDPR Compliance Dashboard
 *
 * Displays history of GDPR requests and provides tools for compliance management.
 * Merchants can view data requests, redaction records, and download customer data.
 */

import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }) {
  console.log("\n=== COMPLIANCE PAGE LOADER ===");

  try {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    console.log("Shop:", shop);

    // Fetch all GDPR requests for this shop
    const gdprRequests = await prisma.gdprRequest.findMany({
      where: { shop },
      orderBy: { createdAt: 'desc' },
      take: 100 // Limit to most recent 100 requests
    });

    console.log(`Found ${gdprRequests.length} GDPR requests`);

    // Calculate statistics
    const stats = {
      total: gdprRequests.length,
      dataRequests: gdprRequests.filter(r => r.requestType === 'data_request').length,
      customerRedactions: gdprRequests.filter(r => r.requestType === 'customer_redact').length,
      shopRedactions: gdprRequests.filter(r => r.requestType === 'shop_redact').length,
      pending: gdprRequests.filter(r => r.status === 'pending').length,
      completed: gdprRequests.filter(r => r.status === 'completed').length,
      failed: gdprRequests.filter(r => r.status === 'failed').length
    };

    return {
      shop,
      gdprRequests,
      stats
    };

  } catch (error) {
    console.error("❌ COMPLIANCE LOADER ERROR:", error.message);
    if (error.status === 401 || error.statusCode === 401) {
      throw error;
    }
    return { error: error.message, gdprRequests: [], stats: {} };
  }
}

export default function Compliance() {
  const data = useLoaderData();
  const { gdprRequests, stats } = data;

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  // Get badge tone based on status
  const getStatusTone = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'failed': return 'critical';
      case 'pending': return 'attention';
      case 'processing': return 'info';
      default: return 'default';
    }
  };

  // Get request type label
  const getRequestTypeLabel = (requestType) => {
    switch (requestType) {
      case 'data_request': return 'Customer Data Request';
      case 'customer_redact': return 'Customer Data Deletion';
      case 'shop_redact': return 'Shop Data Deletion';
      case 'app_uninstalled': return 'App Uninstalled';
      default: return requestType;
    }
  };

  return (
    <s-page heading="GDPR Compliance">
      <s-block-stack gap="500">
        {/* Overview Statistics */}
        <s-section>
          <s-block-stack gap="400">
            <s-text variant="headingMd" as="h2">Compliance Overview</s-text>

            <s-text as="p">
              This page tracks all GDPR and privacy compliance requests for your store.
              All requests are automatically processed and logged for audit purposes.
            </s-text>

            <s-inline-stack gap="400" wrap={false}>
              <s-card>
                <s-block-stack gap="200">
                  <s-text variant="headingSm" as="h3">Total Requests</s-text>
                  <s-text variant="heading2xl" as="p">{stats.total || 0}</s-text>
                </s-block-stack>
              </s-card>

              <s-card>
                <s-block-stack gap="200">
                  <s-text variant="headingSm" as="h3">Data Requests</s-text>
                  <s-text variant="heading2xl" as="p">{stats.dataRequests || 0}</s-text>
                </s-block-stack>
              </s-card>

              <s-card>
                <s-block-stack gap="200">
                  <s-text variant="headingSm" as="h3">Deletions</s-text>
                  <s-text variant="heading2xl" as="p">{stats.customerRedactions || 0}</s-text>
                </s-block-stack>
              </s-card>

              <s-card>
                <s-block-stack gap="200">
                  <s-text variant="headingSm" as="h3">Pending</s-text>
                  <s-text variant="heading2xl" as="p">{stats.pending || 0}</s-text>
                </s-block-stack>
              </s-card>
            </s-inline-stack>
          </s-block-stack>
        </s-section>

        {/* Information Banner */}
        <s-banner tone="info">
          <s-block-stack gap="200">
            <s-text variant="headingSm" as="h3">About GDPR Compliance</s-text>
            <s-text as="p">
              <strong>Data Requests:</strong> When a customer requests their data, we collect all call logs,
              transcripts, and phone numbers associated with them. You have 30 days to provide this data.
            </s-text>
            <s-text as="p">
              <strong>Data Deletions:</strong> When a customer requests deletion, all their data is permanently
              removed from our systems within 48 hours.
            </s-text>
            <s-text as="p">
              <strong>Shop Deletions:</strong> When you uninstall the app, all your shop data is immediately
              deleted and cannot be recovered.
            </s-text>
          </s-block-stack>
        </s-banner>

        {/* GDPR Request History */}
        <s-section>
          <s-block-stack gap="400">
            <s-text variant="headingMd" as="h2">Request History</s-text>

            {gdprRequests.length === 0 ? (
              <s-banner tone="success">
                <s-text as="p">
                  No GDPR requests have been received yet. This is a good sign - it means your customers
                  haven't needed to request their data or request deletion.
                </s-text>
              </s-banner>
            ) : (
              <s-card>
                <s-data-table>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Customer</th>
                        <th>Status</th>
                        <th>Processed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gdprRequests.map((request) => (
                        <tr key={request.id}>
                          <td>
                            <s-text as="span">{formatDate(request.createdAt)}</s-text>
                          </td>
                          <td>
                            <s-text as="span">{getRequestTypeLabel(request.requestType)}</s-text>
                          </td>
                          <td>
                            <s-block-stack gap="100">
                              {request.customerEmail && (
                                <s-text as="span" variant="bodySm">{request.customerEmail}</s-text>
                              )}
                              {request.customerPhone && (
                                <s-text as="span" variant="bodySm">{request.customerPhone}</s-text>
                              )}
                              {!request.customerEmail && !request.customerPhone && (
                                <s-text as="span" variant="bodySm" tone="subdued">Shop-level request</s-text>
                              )}
                            </s-block-stack>
                          </td>
                          <td>
                            <s-badge tone={getStatusTone(request.status)}>
                              {request.status}
                            </s-badge>
                          </td>
                          <td>
                            <s-text as="span" variant="bodySm" tone="subdued">
                              {formatDate(request.processedAt)}
                            </s-text>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </s-data-table>
              </s-card>
            )}
          </s-block-stack>
        </s-section>

        {/* Compliance Resources */}
        <s-section>
          <s-block-stack gap="400">
            <s-text variant="headingMd" as="h2">Compliance Resources</s-text>

            <s-card>
              <s-block-stack gap="300">
                <s-text as="p">
                  <strong>What data does this app store?</strong>
                </s-text>
                <s-unordered-list>
                  <s-list-item>Call logs (call ID, date, duration)</s-list-item>
                  <s-list-item>Call transcripts (what was said during calls)</s-list-item>
                  <s-list-item>Caller phone numbers</s-list-item>
                  <s-list-item>Call summaries generated by AI</s-list-item>
                  <s-list-item>VAPI assistant configuration</s-list-item>
                  <s-list-item>Shop authentication tokens (OAuth)</s-list-item>
                </s-unordered-list>

                <s-text as="p">
                  <strong>How long is data retained?</strong>
                </s-text>
                <s-text as="p">
                  Call logs and transcripts are retained indefinitely unless:
                  - A customer requests deletion (deleted within 48 hours)
                  - You uninstall the app (all data deleted immediately)
                  - A shop/redact webhook is received (all data deleted within 48 hours)
                </s-text>

                <s-text as="p">
                  <strong>Need help with compliance?</strong>
                </s-text>
                <s-text as="p">
                  Contact our support team if you have questions about GDPR, CCPA, or other
                  privacy regulations. We're here to help you stay compliant.
                </s-text>
              </s-block-stack>
            </s-card>
          </s-block-stack>
        </s-section>
      </s-block-stack>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
