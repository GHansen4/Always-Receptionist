import { useLoaderData, useSubmit, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Loader: Get current phone number status
export async function loader({ request }) {
  try {
    const { session } = await authenticate.admin(request);

    const vapiConfig = await prisma.vapiConfig.findUnique({
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
  } catch (error) {
    console.error("Error loading phone numbers:", error);
    return { error: error.message };
  }
}

// Action: Provision or release phone number
export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

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
    console.error("Phone number action error:", error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

// Component using Polaris web components
export default function PhoneNumbers() {
  const { phoneNumber, hasAssistant } = useLoaderData();
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