# VAPI Product Functions - Complete Documentation

## Overview

This document describes the three-tier architecture that allows VAPI AI assistants to securely access Shopify product and order information during customer phone calls.

## Architecture

### Core Strategy: Three-Tier Architecture

```
VAPI AI Call → /api/vapi/functions → Shop Resolution → OAuth Session → Shopify GraphQL API
```

This architecture maintains clear separation of concerns:
1. **Authentication Layer** - Validates VAPI requests
2. **Shop Resolution Layer** - Maps assistant to store
3. **OAuth Session Layer** - Secures access tokens
4. **Shopify GraphQL API** - Fetches data

---

## Key Components

### 1. Function Calling Endpoint

**File:** `/app/routes/api.vapi.functions.jsx`

The main entry point for VAPI function calls. Handles three core functions:

- **`get_products`** - List available products
- **`search_products`** - Search by keyword
- **`check_order_status`** - Look up orders

**Request Flow:**
1. Receives POST request from VAPI during AI conversation
2. Validates `X-Vapi-Signature` header
3. Resolves shop from signature
4. Retrieves OAuth session
5. Executes requested function
6. Returns formatted result to AI

**Example Request:**
```json
{
  "message": {
    "toolCallList": [
      {
        "id": "call_abc123",
        "function": {
          "name": "search_products",
          "arguments": {
            "query": "laptop"
          }
        }
      }
    ]
  }
}
```

**Example Response:**
```json
{
  "results": [
    {
      "toolCallId": "call_abc123",
      "result": "I found 3 product(s) matching 'laptop': 1. MacBook Pro - $1299.00 (5 in stock) - High-performance laptop. 2. Dell XPS 13 - $999.00 (3 in stock) - Compact and powerful. 3. Lenovo ThinkPad - $799.00 (7 in stock) - Business laptop."
    }
  ]
}
```

---

### 2. Shop Resolution Layer

**Database Table:** `VapiConfig`

Maps VAPI assistant requests to Shopify stores:

```prisma
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
```

**Mapping Flow:**
```
X-Vapi-Signature header → vapiSignature → shop domain
```

This keeps business logic separate from authentication tokens, enabling:
- Multi-tenant support (multiple stores)
- Signature rotation without affecting store data
- Centralized assistant management

---

### 3. OAuth Session Layer

**Database Table:** `Session`

Stores long-lived offline access tokens:

```prisma
model Session {
  id            String    @id
  shop          String
  accessToken   String
  scope         String?
  expires       DateTime?
  // ... user info fields
}
```

**Security Features:**
- **Row Level Security (RLS)** - Service role only
- **Offline tokens** - Long-lived, no user re-authentication
- **Scoped access** - `read_products`, `read_orders`, `read_customers`
- **Server-side only** - Never exposed to client

**Session Lookup:**
```javascript
const sessionId = `offline_${shop}`;
const session = await prisma.session.findUnique({
  where: { id: sessionId }
});
```

---

### 4. Shopify GraphQL API

**File:** `/app/utils/shopify-admin-graphql.server.js`

Provides three specialized functions:

#### `getProducts(session, options)`

Fetches products from Shopify store.

**Parameters:**
- `session` - Shopify session object
- `options.limit` - Max products to return (default: 10)

**Returns:**
```javascript
[
  {
    id: "gid://shopify/Product/123",
    title: "Product Name",
    description: "Product description",
    price: "29.99",
    inventory: 10,
    availableForSale: true
  }
]
```

#### `searchProducts(session, options)`

Searches products by keyword.

**Parameters:**
- `session` - Shopify session object
- `options.query` - Search keyword
- `options.limit` - Max results (default: 10)

**Returns:**
```javascript
[
  {
    id: "gid://shopify/Product/456",
    title: "Matching Product",
    description: "Description",
    productType: "Electronics",
    vendor: "Brand Name",
    price: "99.99",
    inventory: 5,
    sku: "SKU-123"
  }
]
```

#### `getOrderStatus(session, options)`

Looks up order information.

**Parameters:**
- `session` - Shopify session object
- `options.orderNumber` - Order number (e.g., "#1001")
- `options.email` - Customer email

**Returns:**
```javascript
{
  id: "gid://shopify/Order/789",
  name: "#1001",
  displayFulfillmentStatus: "FULFILLED",
  displayFinancialStatus: "PAID",
  totalPrice: "149.99",
  currency: "USD",
  createdAt: "2025-01-15T10:30:00Z",
  customer: {
    email: "customer@example.com",
    firstName: "John",
    lastName: "Doe"
  },
  items: [
    {
      title: "Product Name",
      quantity: 2,
      total: "59.98"
    }
  ]
}
```

---

## Data Flow Example

### Scenario: Customer asks "What products do you have?"

1. **VAPI AI Decision**
   - AI recognizes product inquiry
   - Decides to call `get_products` function

2. **Function Call**
   ```
   POST /api/vapi/functions
   Headers: X-Vapi-Signature: shop_signature_xyz
   Body: {
     "message": {
       "toolCallList": [{
         "id": "call_123",
         "function": {
           "name": "get_products",
           "arguments": { "limit": 10 }
         }
       }]
     }
   }
   ```

3. **Shop Resolution**
   ```javascript
   const vapiConfig = await prisma.vapiConfig.findUnique({
     where: { vapiSignature: "shop_signature_xyz" }
   });
   // Returns: { shop: "example-store.myshopify.com" }
   ```

4. **Session Lookup**
   ```javascript
   const session = await prisma.session.findUnique({
     where: { id: "offline_example-store.myshopify.com" }
   });
   // Returns: { accessToken: "shpat_...", shop: "..." }
   ```

5. **Shopify GraphQL Query**
   ```javascript
   const products = await getProducts(session, { limit: 10 });
   ```

6. **Format Response**
   ```
   "Here are our available products: 1. Product A - $29.99 (10 in stock).
   2. Product B - $49.99 (5 in stock). 3. Product C - $19.99 (20 in stock)"
   ```

7. **AI Response**
   - VAPI receives formatted product list
   - AI speaks response to customer naturally
   - Example: "We have several products available. First, we have Product A for $29.99, we have 10 in stock..."

---

## Security Features

### 1. Token Isolation

Access tokens stored separately in `Session` table:
- Not in `VapiConfig` (which stores assistant info)
- Not in `ShopSettings` (user preferences)
- Dedicated table with RLS protection

### 2. Row Level Security (RLS)

Database configured for service role access only:
```javascript
// Only server-side code can access
const session = await prisma.session.findUnique({...});
```

Client-side code cannot access tokens.

### 3. Request Validation

Every request validated:
- **Signature Check** - Must match stored `vapiSignature`
- **Type Checking** - Function parameters validated
- **Error Handling** - No sensitive data in error messages

### 4. No Client Exposure

Tokens never sent to browser:
- All API calls server-side
- GraphQL requests use server session
- Frontend receives processed data only

---

## Key Files Reference

### API Routes
| File | Purpose |
|------|---------|
| `/app/routes/api.vapi.functions.jsx` | Main function calling endpoint |
| `/app/routes/api.vapi.products.jsx` | Legacy product endpoint (deprecated) |

### Utilities
| File | Purpose |
|------|---------|
| `/app/utils/shopify-admin-graphql.server.js` | Product/order fetching utilities |
| `/app/utils/shopify-client.server.js` | Generic GraphQL client |
| `/app/utils/vapi.server.js` | VAPI assistant configuration |
| `/app/utils/vapi-auth.server.js` | Authentication helpers |

### Configuration
| File | Purpose |
|------|---------|
| `/app/shopify.server.js` | Shopify app setup, OAuth hooks |
| `/prisma/schema.prisma` | Database schema |

---

## Environment Variables

Required environment variables:

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Shopify
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SHOPIFY_APP_URL=https://your-app.vercel.app
SCOPES=read_products,read_orders,read_customers

# VAPI
VAPI_PRIVATE_KEY=your_vapi_api_key

# Environment
NODE_ENV=production
```

---

## Installation Flow

When a merchant installs the app:

1. **OAuth Callback** (`/auth/$`)
   - Shopify redirects with authorization code
   - App exchanges code for access token

2. **afterAuth Hook** (`/app/shopify.server.js`)
   ```javascript
   async afterAuth({ session, admin }) {
     // Generate unique signature
     const vapiSignature = crypto.randomBytes(32).toString('hex');

     // Create VAPI assistant
     const assistant = await createVapiAssistant(shop, vapiSignature);

     // Save to database
     await prisma.vapiConfig.create({
       data: {
         shop,
         vapiSignature,
         assistantId: assistant.id
       }
     });
   }
   ```

3. **Session Storage**
   - Offline token saved to `Session` table
   - Token persists until app uninstalled

4. **Assistant Ready**
   - Merchant can assign phone number
   - Customers can start calling
   - AI has access to product/order data

---

## Testing

### Testing get_products

```bash
curl -X POST https://your-app.vercel.app/api/vapi/functions \
  -H "Content-Type: application/json" \
  -H "X-Vapi-Signature: your_signature_here" \
  -d '{
    "message": {
      "toolCallList": [{
        "id": "test_123",
        "function": {
          "name": "get_products",
          "arguments": { "limit": 5 }
        }
      }]
    }
  }'
```

### Testing search_products

```bash
curl -X POST https://your-app.vercel.app/api/vapi/functions \
  -H "Content-Type: application/json" \
  -H "X-Vapi-Signature: your_signature_here" \
  -d '{
    "message": {
      "toolCallList": [{
        "id": "test_456",
        "function": {
          "name": "search_products",
          "arguments": { "query": "laptop" }
        }
      }]
    }
  }'
```

### Testing check_order_status

```bash
curl -X POST https://your-app.vercel.app/api/vapi/functions \
  -H "Content-Type: application/json" \
  -H "X-Vapi-Signature: your_signature_here" \
  -d '{
    "message": {
      "toolCallList": [{
        "id": "test_789",
        "function": {
          "name": "check_order_status",
          "arguments": { "orderNumber": "#1001" }
        }
      }]
    }
  }'
```

---

## Troubleshooting

### Function Call Not Working

1. **Check signature**
   ```javascript
   const config = await prisma.vapiConfig.findUnique({
     where: { vapiSignature: 'your_signature' }
   });
   console.log(config);
   ```

2. **Verify session**
   ```javascript
   const session = await prisma.session.findUnique({
     where: { id: `offline_${shop}` }
   });
   console.log('Has token:', !!session?.accessToken);
   ```

3. **Test Shopify API**
   ```bash
   curl -X POST https://shop.myshopify.com/admin/api/2024-10/graphql.json \
     -H "X-Shopify-Access-Token: token" \
     -H "Content-Type: application/json" \
     -d '{"query": "{ shop { name } }"}'
   ```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Missing authentication header` | No `X-Vapi-Signature` | Check VAPI serverUrlSecret config |
| `Invalid authentication signature` | Wrong signature | Verify signature in VapiConfig table |
| `Store not connected to Shopify` | No session | Reinstall app, check OAuth flow |
| `Shopify authentication failed` | Invalid token | Token expired, reinstall app |

---

## Migration from Old System

If migrating from the old `/api/vapi/products` endpoint:

1. **Keep old endpoint** temporarily for backward compatibility
2. **Update VAPI assistant** to use new `/api/vapi/functions` endpoint
3. **Test all three functions** with real data
4. **Monitor logs** for any errors
5. **Remove old endpoint** after successful transition

---

## Future Enhancements

Potential additions to this architecture:

- **Customer creation** - Allow AI to create customer accounts
- **Order creation** - Place orders via AI
- **Inventory updates** - Real-time stock notifications
- **Custom functions** - Store-specific business logic
- **Analytics** - Track function usage and performance
- **Caching** - Redis cache for frequently accessed products
- **Rate limiting** - Prevent abuse of functions endpoint

---

## Support

For issues or questions:
- GitHub Issues: https://github.com/GHansen4/Always-Receptionist/issues
- Documentation: This file
- VAPI Docs: https://docs.vapi.ai

---

## License

This implementation is part of the Always-Receptionist project.
