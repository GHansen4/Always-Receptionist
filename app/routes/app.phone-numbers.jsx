import { useLoaderData, useSubmit, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Loader: Get current phone number status
export async function loader({ request }) {
  console.log("\n=== PHONE NUMBERS ROUTE LOADER ===");
  console.log("URL:", request.url);
  console.log("Method:", request.method);
  
  try {
    console.log("🔐 Attempting authentication...");
    const { session } = await authenticate.admin(request);
    console.log("✅ Authentication successful!");
    console.log("Session ID:", session.id);
    console.log("Shop:", session.shop);

    const vapiConfig = await prisma.vapiConfig.findUnique({
      where: { shop: session.shop },
      select: {
        phoneNumber: true,
        phoneNumberId: true,
        assistantId: true,
      }
    });

    let assistant = null;

    // Fetch assistant details from VAPI if we have an assistantId
    if (vapiConfig?.assistantId) {
      try {
        const response = await fetch(`https://api.vapi.ai/assistant/${vapiConfig.assistantId}`, {
          headers: {
            'Authorization': `Bearer ${process.env.VAPI_PRIVATE_KEY}`
          }
        });

        if (response.ok) {
          assistant = await response.json();
          console.log("✅ Fetched assistant:", assistant.name);
        } else {
          console.log("⚠️ Could not fetch assistant:", response.status);
        }
      } catch (vapiError) {
        console.log("⚠️ Error fetching assistant:", vapiError.message);
      }
    }

    return {
      phoneNumber: vapiConfig?.phoneNumber || null,
      hasAssistant: !!vapiConfig?.assistantId,
      assistant,
      shop: session.shop,
    };
  } catch (error) {
    console.error("\n❌ PHONE NUMBERS LOADER ERROR");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    console.error("Status:", error.status || error.statusCode || "unknown");
    console.error("Stack:", error.stack);
    
    // Re-throw authentication errors
    if (error.status === 401 || error.statusCode === 401 || error.message?.includes('Unauthorized')) {
      console.error("Authentication error detected - re-throwing for React Router");
      throw error;
    }
    
    return { error: error.message };
  }
}

// Action: Provision or release phone number
export async function action({ request }) {
  console.log("\n=== PHONE NUMBERS ROUTE ACTION ===");
  console.log("URL:", request.url);
  console.log("Method:", request.method);
  
  try {
    console.log("🔐 Attempting authentication...");
    const { session } = await authenticate.admin(request);
    console.log("✅ Authentication successful!");
    console.log("Session ID:", session.id);
    console.log("Shop:", session.shop);
    
    const formData = await request.formData();
    const action = formData.get("action");

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
      await prisma.vapiConfig.update({
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
      const vapiConfig = await prisma.vapiConfig.findUnique({
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
        await prisma.vapiConfig.update({
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
    console.error("\n❌ PHONE NUMBERS ACTION ERROR");
    console.error("Error type:", error.constructor.name);
    console.error("Error message:", error.message);
    console.error("Status:", error.status || error.statusCode || "unknown");
    console.error("Stack:", error.stack);
    
    // Re-throw authentication errors
    if (error.status === 401 || error.statusCode === 401 || error.message?.includes('Unauthorized')) {
      console.error("Authentication error detected - re-throwing for React Router");
      throw error;
    }
    
    return { 
      success: false, 
      error: error.message 
    };
  }
}

// Component using Polaris web components
export default function PhoneNumbers() {
  const { phoneNumber, hasAssistant, assistant } = useLoaderData();
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
    <s-page title="Phone Numbers">
      <s-layout>
        {!hasAssistant && (
          <s-layout-section>
            <s-banner tone="warning">
              <p>Your AI assistant is not configured yet. Please complete setup first.</p>
            </s-banner>
          </s-layout-section>
        )}

        {assistant && (
          <s-layout-section>
            <s-card>
              <s-block-stack gap="400">
                <s-text variant="headingMd" as="h2">
                  AI Assistant Configuration
                </s-text>

                <s-block-stack gap="200">
                  <s-inline-stack gap="200" block-align="center">
                    <s-text variant="bodyMd" as="span" tone="subdued">Name:</s-text>
                    <s-text variant="bodyMd" as="span">{assistant.name}</s-text>
                  </s-inline-stack>

                  <s-inline-stack gap="200" block-align="center">
                    <s-text variant="bodyMd" as="span" tone="subdued">Assistant ID:</s-text>
                    <s-text variant="bodySm" as="span" style={{fontFamily: 'monospace'}}>{assistant.id}</s-text>
                  </s-inline-stack>

                  {assistant.voice && (
                    <>
                      <s-inline-stack gap="200" block-align="center">
                        <s-text variant="bodyMd" as="span" tone="subdued">Voice Provider:</s-text>
                        <s-text variant="bodyMd" as="span">{assistant.voice.provider}</s-text>
                      </s-inline-stack>

                      <s-inline-stack gap="200" block-align="center">
                        <s-text variant="bodyMd" as="span" tone="subdued">Voice ID:</s-text>
                        <s-text variant="bodyMd" as="span">{assistant.voice.voiceId}</s-text>
                      </s-inline-stack>
                    </>
                  )}

                  {assistant.model && (
                    <s-inline-stack gap="200" block-align="center">
                      <s-text variant="bodyMd" as="span" tone="subdued">Model:</s-text>
                      <s-text variant="bodyMd" as="span">{assistant.model.model}</s-text>
                    </s-inline-stack>
                  )}
                </s-block-stack>

                <s-banner tone="success">
                  <p>Your AI assistant is active and ready to handle calls!</p>
                </s-banner>
              </s-block-stack>
            </s-card>
          </s-layout-section>
        )}

        <s-layout-section>
          <s-card>
            <s-block-stack gap="400">
              <s-text variant="headingMd" as="h2">
                Active Phone Number
              </s-text>

              {phoneNumber ? (
                <s-block-stack gap="300">
                  <s-inline-stack align="space-between" block-align="center">
                    <s-block-stack gap="100">
                      <s-text variant="headingLg" as="p">
                        {phoneNumber}
                      </s-text>
                      <s-text variant="bodySm" tone="subdued">
                        This number is active and receiving calls
                      </s-text>
                    </s-block-stack>
                    
                    <s-button
                      tone="critical"
                      onClick={handleRelease}
                      loading={isLoading}
                      disabled={isLoading}
                    >
                      Release Number
                    </s-button>
                  </s-inline-stack>

                  <s-banner tone="info">
                    <p>
                      Test your AI receptionist by calling <strong>{phoneNumber}</strong>
                    </p>
                  </s-banner>
                </s-block-stack>
              ) : (
                <s-block-stack gap="300">
                  <s-text tone="subdued">
                    No phone number provisioned yet. Get started by provisioning your first number.
                  </s-text>
                  
                  <s-inline-stack>
                    <s-button
                      variant="primary"
                      onClick={handleProvision}
                      loading={isLoading}
                      disabled={isLoading || !hasAssistant}
                    >
                      Provision Phone Number
                    </s-button>
                  </s-inline-stack>

                  {!hasAssistant && (
                    <s-text variant="bodySm" tone="subdued">
                      Complete assistant setup before provisioning a number
                    </s-text>
                  )}
                </s-block-stack>
              )}
            </s-block-stack>
          </s-card>
        </s-layout-section>

        <s-layout-section>
          <s-card>
            <s-block-stack gap="200">
              <s-text variant="headingMd" as="h2">
                How it works
              </s-text>
              <s-text tone="subdued">
                When you provision a phone number, customers can call your AI receptionist 24/7. 
                The AI can answer questions about products, check inventory, and help customers 
                find what they're looking for.
              </s-text>
            </s-block-stack>
          </s-card>
        </s-layout-section>
      </s-layout>
    </s-page>
  );
}