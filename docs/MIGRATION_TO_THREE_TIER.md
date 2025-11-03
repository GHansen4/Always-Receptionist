# Migration to Three-Tier Architecture

## Overview

This document describes the migration from the single-function product lookup system to the comprehensive three-tier architecture with multiple function support.

## What Changed

### Before (Old System)

- **Single endpoint:** `/api/vapi/products`
- **Single function:** `getProductInfo`
- **Inline tool definition** in VAPI assistant config
- **Direct GraphQL queries** in route handler

### After (New System)

- **Centralized endpoint:** `/api/vapi/functions`
- **Three functions:** `get_products`, `search_products`, `check_order_status`
- **Server-based tool definitions** (cleaner, more maintainable)
- **Dedicated utility layer** for Shopify GraphQL operations

## New Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     VAPI AI Assistant                        │
│  (Customer calls, AI decides which function to use)          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│          Tier 1: Function Calling Endpoint                   │
│             /app/routes/api.vapi.functions.jsx               │
│                                                              │
│  • Validates X-Vapi-Signature header                        │
│  • Routes to appropriate function handler                    │
│  • Returns formatted results to AI                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│          Tier 2: Shop Resolution Layer                       │
│              Database: VapiConfig table                      │
│                                                              │
│  • Maps: X-Vapi-Signature → shop_domain                    │
│  • Separates business logic from auth                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│          Tier 3: OAuth Session Layer                         │
│               Database: Session table                        │
│                                                              │
│  • Retrieves: shop_domain → access_token                   │
│  • Secured with Row Level Security                           │
│  • Offline tokens (long-lived)                               │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│          Tier 4: Shopify GraphQL API Layer                   │
│      /app/utils/shopify-admin-graphql.server.js              │
│                                                              │
│  • getProducts(session, options)                             │
│  • searchProducts(session, options)                          │
│  • getOrderStatus(session, options)                          │
│  • adminGraphQL(session, query, variables)                   │
└─────────────────────────────────────────────────────────────┘
```

## File Changes

### New Files Created

1. **`/app/routes/api.vapi.functions.jsx`**
   - Main function calling endpoint
   - Handles all three function types
   - Implements three-tier architecture

2. **`/app/utils/shopify-admin-graphql.server.js`**
   - Specialized Shopify GraphQL utilities
   - Three main functions: getProducts, searchProducts, getOrderStatus
   - Reusable adminGraphQL() helper

3. **`/docs/VAPI_PRODUCT_FUNCTIONS_COMPLETE.md`**
   - Comprehensive documentation
   - Architecture diagrams
   - API reference

4. **`/docs/MIGRATION_TO_THREE_TIER.md`** (this file)
   - Migration guide
   - Comparison of old vs new

### Modified Files

1. **`/app/utils/vapi.server.js`**
   - Updated `createVapiAssistant()` function
   - Changed from single tool to three separate tools
   - Updated system prompt to describe all functions
   - Changed serverUrl from `/api/vapi/products` to `/api/vapi/functions`

### Deprecated (But Kept) Files

1. **`/app/routes/api.vapi.products.jsx`**
   - Old single-function endpoint
   - Kept for backward compatibility
   - Can be removed after all assistants migrated

## Database Schema

### No Changes Required

The existing schema already supports the three-tier architecture:

```prisma
// Tier 2: Shop Resolution
model VapiConfig {
  id              String   @id @default(cuid())
  shop            String   @unique
  vapiSignature   String   @unique
  assistantId     String?
  phoneNumber     String?
  phoneNumberId   String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

// Tier 3: OAuth Session
model Session {
  id            String    @id
  shop          String
  accessToken   String
  scope         String?
  expires       DateTime?
  // ... additional fields
}
```

## Function Comparison

### Old Function: `getProductInfo`

```javascript
{
  type: "function",
  function: {
    name: "getProductInfo",
    description: "Search for product information...",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Product search query"
        }
      },
      required: ["query"]
    }
  },
  server: {
    url: "https://always-ai-receptionist.vercel.app/api/vapi/products?shop=${shop}"
  }
}
```

### New Functions

#### 1. `get_products`

```javascript
{
  type: "function",
  function: {
    name: "get_products",
    description: "Get a list of available products from the store",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of products to return"
        }
      }
    }
  }
}
```

#### 2. `search_products`

```javascript
{
  type: "function",
  function: {
    name: "search_products",
    description: "Search for products by keyword",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search keyword or phrase"
        }
      },
      required: ["query"]
    }
  }
}
```

#### 3. `check_order_status`

```javascript
{
  type: "function",
  function: {
    name: "check_order_status",
    description: "Look up order status and details",
    parameters: {
      type: "object",
      properties: {
        orderNumber: {
          type: "string",
          description: "Order number"
        },
        email: {
          type: "string",
          description: "Customer email address"
        }
      }
    }
  }
}
```

## Migration Steps

### For New Installations

1. Install app as normal
2. `afterAuth` hook automatically creates assistant with new functions
3. All three functions available immediately

### For Existing Installations

#### Option 1: Automatic Migration (Recommended)

Existing assistants will automatically start using the new endpoint on next update:

```javascript
// In /app/routes/app.assistant.jsx
async function updateExistingAssistants() {
  const configs = await prisma.vapiConfig.findMany({
    where: { assistantId: { not: null } }
  });

  for (const config of configs) {
    await updateVapiAssistant(config.assistantId, {
      serverUrl: 'https://always-receptionist.vercel.app/api/vapi/functions'
      // ... update tool definitions
    });
  }
}
```

#### Option 2: Manual Migration

1. Go to assistant management page
2. Click "Edit" on existing assistant
3. Assistant will be updated with new functions
4. Test by making a test call

#### Option 3: Recreation

1. Delete existing assistant
2. Create new assistant
3. New assistant will have all three functions

## Testing the Migration

### Test get_products

**Customer says:** "What products do you have?"

**Expected AI behavior:**
- Calls `get_products` function
- Receives product list
- Speaks products naturally to customer

### Test search_products

**Customer says:** "Do you have any laptops?"

**Expected AI behavior:**
- Calls `search_products` with query="laptops"
- Receives matching products
- Describes laptops to customer

### Test check_order_status

**Customer says:** "What's the status of order 1001?"

**Expected AI behavior:**
- Calls `check_order_status` with orderNumber="1001"
- Receives order details
- Tells customer order status

## Rollback Plan

If issues occur, you can rollback:

1. **Revert VAPI config:**
   ```javascript
   await updateVapiAssistant(assistantId, {
     serverUrl: 'https://always-receptionist.vercel.app/api/vapi/products'
   });
   ```

2. **Old endpoint still works:**
   - `/api/vapi/products` not removed
   - Can continue using for compatibility

3. **Git revert:**
   ```bash
   git revert <commit-hash>
   git push origin branch-name
   ```

## Benefits of New Architecture

### 1. Separation of Concerns

- **Authentication** - Handled once, reused
- **Shop Resolution** - Centralized mapping
- **Data Access** - Dedicated utility layer

### 2. Maintainability

- Easy to add new functions
- Reusable GraphQL utilities
- Clear code organization

### 3. Security

- Token isolation in Session table
- Row Level Security (RLS)
- No client-side token exposure
- Request validation at every tier

### 4. Scalability

- Can add more functions without changing core architecture
- Shopify GraphQL utilities reusable across app
- Easy to implement caching layer

### 5. Developer Experience

- Clear function definitions
- Comprehensive documentation
- Easy to test individual functions
- Type-safe parameter handling

## Common Issues

### Issue: Functions not working after migration

**Solution:**
```bash
# Verify assistant configuration
curl https://api.vapi.ai/assistant/<id> \
  -H "Authorization: Bearer $VAPI_PRIVATE_KEY"

# Check serverUrl points to /api/vapi/functions
```

### Issue: Old endpoint still being called

**Solution:**
- Update VAPI assistant configuration
- Verify serverUrl in assistant payload
- Check VAPI dashboard for tool configuration

### Issue: GraphQL errors

**Solution:**
```javascript
// Check Shopify API version compatibility
const SHOPIFY_API_VERSION = '2024-10';

// Verify token scopes
console.log(session.scope);
// Should include: read_products, read_orders
```

## Next Steps

After migration:

1. **Monitor logs** for any errors
2. **Test all three functions** with real data
3. **Update any custom integrations** to use new endpoint
4. **Consider removing** old `/api/vapi/products` endpoint after 30 days
5. **Add more functions** as needed (inventory updates, customer creation, etc.)

## Support

For migration assistance:
- Review `/docs/VAPI_PRODUCT_FUNCTIONS_COMPLETE.md`
- Check GitHub issues
- Contact support team

---

**Migration Date:** 2025-11-03
**Architecture Version:** 2.0 (Three-Tier)
**Backward Compatible:** Yes (old endpoint preserved)
