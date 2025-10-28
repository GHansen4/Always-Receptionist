import { useLoaderData, useSubmit, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { Page, Layout, Card, Button, Text, InlineStack, BlockStack, Banner } from "@shopify/polaris";
import { createPrismaClient } from "../db.server";

// Loader: Get current phone number status
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const db = createPrismaClient();

  try {
    const vapiConfig = await db.vapiConfig.findUnique({
      where: { shop: session.shop },
      select: {
        phoneNumber: true,
        phoneNumberId: true,
        assistantId: true,
      }
    });

    return {
      phoneNumber: vapiConfig?.phoneNumber || null,
      hasAssistant: !!vapiConfig?.assistantId,
      shop: session.shop,
    };
  } finally {
    await db.$disconnect();
  }
}

// Action: Provision or release phone number
export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  const db = createPrismaClient();

  try {
    if (action === "provision") {
      // Call VAPI API to buy a phone number
      const vapiResponse = await fetch("https://api.vapi.ai/phone-number", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "twilio",
        })
      });

      if (!vapiResponse.ok) {
        const error = await vapiResponse.json();
        return { 
          success: false, 
          error: error.message || "Failed to provision number" 
        };
      }

      const phoneNumberData = await vapiResponse.json();

      // Update database with phone number
      await db.vapiConfig.update({
        where: { shop: session.shop },
        data: {
          phoneNumber: phoneNumberData.number,
          phoneNumberId: phoneNumberData.id,
        }
      });

      return { 
        success: true, 
        phoneNumber: phoneNumberData.number 
      };
    }

    if (action === "release") {
      const vapiConfig = await db.vapiConfig.findUnique({
        where: { shop: session.shop }
      });

      if (vapiConfig?.phoneNumberId) {
        // Call VAPI API to release the number
        await fetch(`https://api.vapi.ai/phone-number/${vapiConfig.phoneNumberId}`, {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${process.env.VAPI_PRIVATE_KEY}`,
          }
        });

        // Update database
        await db.vapiConfig.update({
          where: { shop: session.shop },
          data: {
            phoneNumber: null,
            phoneNumberId: null,
          }
        });
      }

      return { success: true };
    }

    return { success: false, error: "Invalid action" };
    
  } catch (error) {
    console.error("Phone number action error:", error);
    return { 
      success: false, 
      error: error.message 
    };
  } finally {
    await db.$disconnect();
  }
}

// Component
export default function PhoneNumbers() {
  const { phoneNumber, hasAssistant, shop } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  const handleProvision = () => {
    const formData = new FormData();
    formData.append("action", "provision");
    submit(formData, { method: "post" });
  };

  const handleRelease = () => {
    if (confirm("Are you sure you want to release this phone number? This cannot be undone.")) {
      const formData = new FormData();
      formData.append("action", "release");
      submit(formData, { method: "post" });
    }
  };

  return (
    <Page
      title="Phone Numbers"
      subtitle="Manage your AI receptionist phone numbers"
    >
      <Layout>
        {!hasAssistant && (
          <Layout.Section>
            <Banner tone="warning">
              <p>Your AI assistant is not configured yet. Please complete setup first.</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Active Phone Number
              </Text>

              {phoneNumber ? (
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text variant="headingLg" as="p">
                        {phoneNumber}
                      </Text>
                      <Text variant="bodySm" tone="subdued">
                        This number is active and receiving calls
                      </Text>
                    </BlockStack>
                    
                    <Button
                      tone="critical"
                      onClick={handleRelease}
                      loading={isLoading}
                      disabled={isLoading}
                    >
                      Release Number
                    </Button>
                  </InlineStack>

                  <Banner tone="info">
                    <p>
                      Test your AI receptionist by calling <strong>{phoneNumber}</strong>
                    </p>
                  </Banner>
                </BlockStack>
              ) : (
                <BlockStack gap="300">
                  <Text tone="subdued">
                    No phone number provisioned yet. Get started by provisioning your first number.
                  </Text>
                  
                  <InlineStack>
                    <Button
                      variant="primary"
                      onClick={handleProvision}
                      loading={isLoading}
                      disabled={isLoading || !hasAssistant}
                    >
                      Provision Phone Number
                    </Button>
                  </InlineStack>

                  {!hasAssistant && (
                    <Text variant="bodySm" tone="subdued">
                      Complete assistant setup before provisioning a number
                    </Text>
                  )}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">
                How it works
              </Text>
              <Text tone="subdued">
                When you provision a phone number, customers can call your AI receptionist 24/7. 
                The AI can answer questions about products, check inventory, and help customers 
                find what they're looking for.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
