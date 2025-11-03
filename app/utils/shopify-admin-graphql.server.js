/**
 * Shopify Admin GraphQL API Utilities
 *
 * Provides specialized functions for fetching product and order data
 * from Shopify using the Admin GraphQL API.
 *
 * Security:
 * - Uses offline access tokens from Session table
 * - Tokens secured with Row Level Security (RLS)
 * - No client-side token exposure
 */

const SHOPIFY_API_VERSION = '2024-10';

/**
 * Make an authenticated GraphQL request to Shopify Admin API
 * @param {Object} session - Session object with shop and accessToken
 * @param {string} query - GraphQL query string
 * @param {Object} variables - Query variables (optional)
 * @returns {Promise<Object>} GraphQL response data
 */
async function adminGraphQL(session, query, variables = {}) {
  if (!session || !session.shop || !session.accessToken) {
    throw new Error('Invalid session: missing shop or access token');
  }

  const url = `https://${session.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': session.accessToken,
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Shopify authentication failed - token may be invalid');
    }
    if (response.status === 429) {
      throw new Error('Shopify rate limit exceeded - please try again later');
    }
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.errors) {
    console.error('Shopify GraphQL errors:', data.errors);
    throw new Error(`GraphQL error: ${data.errors[0]?.message || 'Unknown error'}`);
  }

  return data;
}

/**
 * Get products from Shopify store
 * @param {Object} session - Shopify session with access token
 * @param {Object} options - Query options
 * @param {number} options.limit - Maximum number of products to return (default: 10)
 * @returns {Promise<Array>} Array of product objects
 */
export async function getProducts(session, options = {}) {
  const limit = options.limit || 10;

  const query = `
    query getProducts($first: Int!) {
      products(first: $first) {
        edges {
          node {
            id
            title
            description
            status
            variants(first: 5) {
              edges {
                node {
                  id
                  price
                  inventoryQuantity
                  availableForSale
                }
              }
            }
          }
        }
      }
    }
  `;

  const variables = { first: limit };

  try {
    const data = await adminGraphQL(session, query, variables);
    const products = data.data?.products?.edges?.map(({ node }) => ({
      id: node.id,
      title: node.title,
      description: node.description || '',
      status: node.status,
      price: node.variants.edges[0]?.node.price || '0.00',
      inventory: node.variants.edges[0]?.node.inventoryQuantity || 0,
      availableForSale: node.variants.edges[0]?.node.availableForSale || false
    })) || [];

    return products;
  } catch (error) {
    console.error('Error fetching products:', error);
    throw error;
  }
}

/**
 * Search products by keyword
 * @param {Object} session - Shopify session with access token
 * @param {Object} options - Search options
 * @param {string} options.query - Search query/keyword
 * @param {number} options.limit - Maximum number of results (default: 10)
 * @returns {Promise<Array>} Array of matching product objects
 */
export async function searchProducts(session, options = {}) {
  const searchQuery = options.query || '';
  const limit = options.limit || 10;

  // Shopify search query syntax: title, vendor, product_type, tag
  const query = `
    query searchProducts($query: String!, $first: Int!) {
      products(first: $first, query: $query) {
        edges {
          node {
            id
            title
            description
            status
            productType
            vendor
            variants(first: 5) {
              edges {
                node {
                  id
                  price
                  inventoryQuantity
                  availableForSale
                  sku
                }
              }
            }
          }
        }
      }
    }
  `;

  const variables = {
    query: searchQuery,
    first: limit
  };

  try {
    const data = await adminGraphQL(session, query, variables);
    const products = data.data?.products?.edges?.map(({ node }) => ({
      id: node.id,
      title: node.title,
      description: node.description || '',
      productType: node.productType,
      vendor: node.vendor,
      status: node.status,
      price: node.variants.edges[0]?.node.price || '0.00',
      inventory: node.variants.edges[0]?.node.inventoryQuantity || 0,
      availableForSale: node.variants.edges[0]?.node.availableForSale || false,
      sku: node.variants.edges[0]?.node.sku || ''
    })) || [];

    return products;
  } catch (error) {
    console.error('Error searching products:', error);
    throw error;
  }
}

/**
 * Get order status by order number or customer email
 * @param {Object} session - Shopify session with access token
 * @param {Object} options - Query options
 * @param {string} options.orderNumber - Order number (name field in Shopify)
 * @param {string} options.email - Customer email
 * @returns {Promise<Object|null>} Order object or null if not found
 */
export async function getOrderStatus(session, options = {}) {
  const { orderNumber, email } = options;

  if (!orderNumber && !email) {
    throw new Error('Either orderNumber or email is required');
  }

  // Build search query based on provided parameters
  let searchQuery = '';
  if (orderNumber) {
    searchQuery = `name:${orderNumber}`;
  } else if (email) {
    searchQuery = `email:${email}`;
  }

  const query = `
    query getOrder($query: String!, $first: Int!) {
      orders(first: $first, query: $query, reverse: true) {
        edges {
          node {
            id
            name
            displayFulfillmentStatus
            displayFinancialStatus
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            createdAt
            customer {
              email
              firstName
              lastName
            }
            shippingAddress {
              address1
              city
              provinceCode
              zip
              countryCode
            }
            lineItems(first: 5) {
              edges {
                node {
                  title
                  quantity
                  originalTotalSet {
                    shopMoney {
                      amount
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const variables = {
    query: searchQuery,
    first: 1 // Get most recent order matching criteria
  };

  try {
    const data = await adminGraphQL(session, query, variables);
    const orderEdge = data.data?.orders?.edges?.[0];

    if (!orderEdge) {
      return null;
    }

    const node = orderEdge.node;
    const order = {
      id: node.id,
      name: node.name,
      displayFulfillmentStatus: node.displayFulfillmentStatus,
      displayFinancialStatus: node.displayFinancialStatus,
      totalPrice: node.totalPriceSet?.shopMoney?.amount || '0.00',
      currency: node.totalPriceSet?.shopMoney?.currencyCode || 'USD',
      createdAt: node.createdAt,
      customer: node.customer ? {
        email: node.customer.email,
        firstName: node.customer.firstName,
        lastName: node.customer.lastName
      } : null,
      shippingAddress: node.shippingAddress,
      items: node.lineItems.edges.map(({ node: item }) => ({
        title: item.title,
        quantity: item.quantity,
        total: item.originalTotalSet?.shopMoney?.amount || '0.00'
      }))
    };

    return order;
  } catch (error) {
    console.error('Error fetching order status:', error);
    throw error;
  }
}

/**
 * Export adminGraphQL for custom queries
 */
export { adminGraphQL };
