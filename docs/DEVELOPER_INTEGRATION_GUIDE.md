# 🔧 Developer Integration Guide

> **Complete guide for integrating with the Enterprise Accounting API**

## 📋 Table of Contents

- [Getting Started](#getting-started)
- [Authentication Workflows](#authentication-workflows)
- [API Client Examples](#api-client-examples)
- [Rate Limiting & Best Practices](#rate-limiting--best-practices)
- [Error Handling Patterns](#error-handling-patterns)
- [Webhook Integration](#webhook-integration)
- [SDK Generation](#sdk-generation)
- [External Service Integration](#external-service-integration)

---

## 🚀 Getting Started

### API Base URL

```
Production:  https://api.accounting.example.com
Staging:     https://staging-api.accounting.example.com
Development: http://localhost:3000
```

### Authentication Overview

The API uses **JWT Bearer tokens** with refresh token rotation:

1. **Register/Login** to get access + refresh tokens
2. **Include Bearer token** in Authorization header
3. **Refresh tokens** when they expire (15 minutes)
4. **Handle organization context** automatically

---

## 🔐 Authentication Workflows

### 1. Organization Registration

```typescript
// POST /api/v1/auth/register
interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  organizationType?: 'SINGLE_BUSINESS' | 'MULTI_BUSINESS' | 'ACCOUNTING_FIRM';
}

interface RegisterResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
  organization: {
    id: string;
    name: string;
    type: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
  };
}
```

### 2. User Login

```typescript
// POST /api/v1/auth/login
interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    organizationId: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
  };
}
```

### 3. Token Refresh

```typescript
// POST /api/v1/auth/refresh
interface RefreshRequest {
  refreshToken: string;
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}
```

### 4. Complete Authentication Flow

```typescript
class AccountingAPIAuth {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: Date | null = null;

  async login(email: string, password: string): Promise<void> {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    const data = await response.json();
    this.setTokens(data.tokens);
  }

  async refreshTokens(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.refreshToken })
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const data = await response.json();
    this.setTokens(data);
  }

  async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    // Check if token needs refresh
    if (this.tokenExpiry && new Date() >= this.tokenExpiry) {
      await this.refreshTokens();
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Handle 401 - token might be expired
    if (response.status === 401) {
      await this.refreshTokens();
      return this.makeAuthenticatedRequest(url, options);
    }

    return response;
  }

  private setTokens(tokens: any): void {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.tokenExpiry = new Date(tokens.expiresAt);
  }
}
```

---

## 📚 API Client Examples

### JavaScript/Node.js Client

```typescript
// accounting-api-client.ts
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

interface ClientConfig {
  baseURL: string;
  timeout?: number;
}

interface Customer {
  id: string;
  customerNumber: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  status: 'PROSPECT' | 'ACTIVE' | 'INACTIVE';
  tier: 'PERSONAL' | 'BUSINESS' | 'ENTERPRISE';
}

interface Quote {
  id: string;
  quoteNumber: string;
  customerId: string;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  total: number;
  validUntil: string;
  items: QuoteItem[];
}

interface QuoteItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

class AccountingAPIClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor(config: ClientConfig) {
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use((config) => {
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });

    // Response interceptor for token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401 && this.refreshToken) {
          try {
            await this.refreshTokens();
            // Retry original request
            return this.client.request(error.config);
          } catch (refreshError) {
            // Refresh failed, user needs to login again
            this.logout();
            throw refreshError;
          }
        }
        throw error;
      }
    );
  }

  // Authentication methods
  async login(email: string, password: string): Promise<any> {
    const response = await this.client.post('/api/v1/auth/login', {
      email,
      password
    });

    const { tokens, user } = response.data;
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;

    return { user, tokens };
  }

  async refreshTokens(): Promise<void> {
    const response = await this.client.post('/api/v1/auth/refresh', {
      refreshToken: this.refreshToken
    });

    const tokens = response.data;
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
  }

  logout(): void {
    this.accessToken = null;
    this.refreshToken = null;
  }

  // Customer methods
  async getCustomers(params?: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  }): Promise<{ customers: Customer[]; total: number }> {
    const response = await this.client.get('/api/v1/customers', { params });
    return response.data;
  }

  async getCustomer(customerId: string): Promise<Customer> {
    const response = await this.client.get(`/api/v1/customers/${customerId}`);
    return response.data;
  }

  async createCustomer(customer: Partial<Customer>): Promise<Customer> {
    const response = await this.client.post('/api/v1/customers', customer);
    return response.data;
  }

  async updateCustomer(customerId: string, updates: Partial<Customer>): Promise<Customer> {
    const response = await this.client.put(`/api/v1/customers/${customerId}`, updates);
    return response.data;
  }

  // Quote methods
  async getQuotes(params?: {
    customerId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ quotes: Quote[]; total: number }> {
    const response = await this.client.get('/api/v1/quotes', { params });
    return response.data;
  }

  async createQuote(quote: {
    customerId: string;
    validUntil: string;
    items: QuoteItem[];
    description?: string;
    terms?: string;
  }): Promise<Quote> {
    const response = await this.client.post('/api/v1/quotes', quote);
    return response.data;
  }

  async sendQuote(quoteId: string): Promise<Quote> {
    const response = await this.client.post(`/api/v1/quotes/${quoteId}/send`);
    return response.data;
  }

  // Payment methods
  async processPayment(payment: {
    customerId: string;
    invoiceId?: string;
    amount: number;
    paymentMethod: 'STRIPE_CARD' | 'ETRANSFER' | 'CASH' | 'CHEQUE';
    stripePaymentMethodId?: string;
    metadata?: Record<string, any>;
  }): Promise<any> {
    const response = await this.client.post('/api/v1/payments', payment);
    return response.data;
  }

  // E-Transfer methods
  async createETransfer(etransfer: {
    customerId: string;
    invoiceId?: string;
    amount: number;
    recipientEmail: string;
    recipientName: string;
    securityQuestion?: string;
    securityAnswer?: string;
    message?: string;
    autoDeposit?: boolean;
    expiryHours?: number;
  }): Promise<any> {
    const response = await this.client.post('/api/v1/etransfers', etransfer);
    return response.data;
  }
}

// Usage example
const client = new AccountingAPIClient({
  baseURL: 'https://api.accounting.example.com'
});

async function example() {
  try {
    // Login
    await client.login('user@example.com', 'password');

    // Create customer
    const customer = await client.createCustomer({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      tier: 'BUSINESS',
      status: 'PROSPECT'
    });

    // Create quote
    const quote = await client.createQuote({
      customerId: customer.id,
      validUntil: '2024-12-31T23:59:59Z',
      items: [
        {
          description: 'Web Development Services',
          quantity: 40,
          unitPrice: 150.00,
          taxRate: 0.13
        }
      ]
    });

    // Send quote
    await client.sendQuote(quote.id);

    console.log('Quote sent successfully:', quote.quoteNumber);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}
```

### Python Client

```python
# accounting_api_client.py
import requests
import json
from typing import Optional, Dict, List, Any
from datetime import datetime, timedelta
import time

class AccountingAPIClient:
    def __init__(self, base_url: str, timeout: int = 30):
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.token_expiry: Optional[datetime] = None
        self.session = requests.Session()

    def _make_request(self, method: str, endpoint: str, **kwargs) -> requests.Response:
        """Make authenticated request with automatic token refresh"""
        url = f"{self.base_url}{endpoint}"

        # Add auth header if we have a token
        if self.access_token:
            headers = kwargs.get('headers', {})
            headers['Authorization'] = f'Bearer {self.access_token}'
            kwargs['headers'] = headers

        # Check if token needs refresh
        if self.token_expiry and datetime.now() >= self.token_expiry:
            self.refresh_tokens()

        response = self.session.request(method, url, timeout=self.timeout, **kwargs)

        # Handle 401 - token might be expired
        if response.status_code == 401 and self.refresh_token:
            self.refresh_tokens()
            # Retry with new token
            if self.access_token:
                headers = kwargs.get('headers', {})
                headers['Authorization'] = f'Bearer {self.access_token}'
                kwargs['headers'] = headers
            response = self.session.request(method, url, timeout=self.timeout, **kwargs)

        return response

    def login(self, email: str, password: str) -> Dict[str, Any]:
        """Login and store tokens"""
        response = self.session.post(
            f"{self.base_url}/api/v1/auth/login",
            json={'email': email, 'password': password},
            timeout=self.timeout
        )
        response.raise_for_status()

        data = response.json()
        tokens = data['tokens']

        self.access_token = tokens['accessToken']
        self.refresh_token = tokens['refreshToken']
        self.token_expiry = datetime.fromisoformat(
            tokens['expiresAt'].replace('Z', '+00:00')
        )

        return data

    def refresh_tokens(self) -> None:
        """Refresh access token"""
        if not self.refresh_token:
            raise Exception("No refresh token available")

        response = self.session.post(
            f"{self.base_url}/api/v1/auth/refresh",
            json={'refreshToken': self.refresh_token},
            timeout=self.timeout
        )
        response.raise_for_status()

        tokens = response.json()
        self.access_token = tokens['accessToken']
        self.refresh_token = tokens['refreshToken']
        self.token_expiry = datetime.fromisoformat(
            tokens['expiresAt'].replace('Z', '+00:00')
        )

    def get_customers(self, page: int = 1, limit: int = 50, **filters) -> Dict[str, Any]:
        """Get customers with pagination"""
        params = {'page': page, 'limit': limit, **filters}
        response = self._make_request('GET', '/api/v1/customers', params=params)
        response.raise_for_status()
        return response.json()

    def create_customer(self, customer_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create new customer"""
        response = self._make_request('POST', '/api/v1/customers', json=customer_data)
        response.raise_for_status()
        return response.json()

    def create_quote(self, quote_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create new quote"""
        response = self._make_request('POST', '/api/v1/quotes', json=quote_data)
        response.raise_for_status()
        return response.json()

    def process_payment(self, payment_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process payment"""
        response = self._make_request('POST', '/api/v1/payments', json=payment_data)
        response.raise_for_status()
        return response.json()

# Usage example
if __name__ == "__main__":
    client = AccountingAPIClient("https://api.accounting.example.com")

    try:
        # Login
        login_result = client.login("user@example.com", "password")
        print(f"Logged in as: {login_result['user']['email']}")

        # Create customer
        customer = client.create_customer({
            "firstName": "Jane",
            "lastName": "Smith",
            "email": "jane@example.com",
            "tier": "BUSINESS",
            "status": "PROSPECT"
        })
        print(f"Created customer: {customer['customerNumber']}")

        # Create quote
        quote = client.create_quote({
            "customerId": customer["id"],
            "validUntil": "2024-12-31T23:59:59Z",
            "items": [
                {
                    "description": "Consulting Services",
                    "quantity": 10,
                    "unitPrice": 200.00,
                    "taxRate": 0.13
                }
            ]
        })
        print(f"Created quote: {quote['quoteNumber']}")

    except requests.exceptions.RequestException as e:
        print(f"API Error: {e}")
    except Exception as e:
        print(f"Error: {e}")
```

### PHP Client

```php
<?php
// AccountingAPIClient.php

class AccountingAPIClient {
    private $baseUrl;
    private $accessToken;
    private $refreshToken;
    private $tokenExpiry;
    private $timeout;

    public function __construct($baseUrl, $timeout = 30) {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->timeout = $timeout;
    }

    private function makeRequest($method, $endpoint, $data = null, $headers = []) {
        $url = $this->baseUrl . $endpoint;

        // Add auth header if we have a token
        if ($this->accessToken) {
            $headers['Authorization'] = 'Bearer ' . $this->accessToken;
        }

        // Check if token needs refresh
        if ($this->tokenExpiry && time() >= $this->tokenExpiry) {
            $this->refreshTokens();
            $headers['Authorization'] = 'Bearer ' . $this->accessToken;
        }

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $this->timeout);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);

        if ($data) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
            $headers['Content-Type'] = 'application/json';
        }

        if ($headers) {
            $headerArray = [];
            foreach ($headers as $key => $value) {
                $headerArray[] = "$key: $value";
            }
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headerArray);
        }

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        // Handle 401 - token might be expired
        if ($httpCode === 401 && $this->refreshToken) {
            $this->refreshTokens();
            return $this->makeRequest($method, $endpoint, $data, $headers);
        }

        if ($httpCode >= 400) {
            throw new Exception("HTTP Error $httpCode: $response");
        }

        return json_decode($response, true);
    }

    public function login($email, $password) {
        $data = [
            'email' => $email,
            'password' => $password
        ];

        $response = $this->makeRequest('POST', '/api/v1/auth/login', $data);

        $this->accessToken = $response['tokens']['accessToken'];
        $this->refreshToken = $response['tokens']['refreshToken'];
        $this->tokenExpiry = strtotime($response['tokens']['expiresAt']);

        return $response;
    }

    public function refreshTokens() {
        if (!$this->refreshToken) {
            throw new Exception("No refresh token available");
        }

        $data = ['refreshToken' => $this->refreshToken];
        $response = $this->makeRequest('POST', '/api/v1/auth/refresh', $data);

        $this->accessToken = $response['accessToken'];
        $this->refreshToken = $response['refreshToken'];
        $this->tokenExpiry = strtotime($response['expiresAt']);
    }

    public function getCustomers($filters = []) {
        return $this->makeRequest('GET', '/api/v1/customers?' . http_build_query($filters));
    }

    public function createCustomer($customerData) {
        return $this->makeRequest('POST', '/api/v1/customers', $customerData);
    }

    public function createQuote($quoteData) {
        return $this->makeRequest('POST', '/api/v1/quotes', $quoteData);
    }

    public function processPayment($paymentData) {
        return $this->makeRequest('POST', '/api/v1/payments', $paymentData);
    }
}

// Usage example
try {
    $client = new AccountingAPIClient('https://api.accounting.example.com');

    // Login
    $loginResult = $client->login('user@example.com', 'password');
    echo "Logged in as: " . $loginResult['user']['email'] . "\n";

    // Create customer
    $customer = $client->createCustomer([
        'firstName' => 'Bob',
        'lastName' => 'Johnson',
        'email' => 'bob@example.com',
        'tier' => 'PERSONAL',
        'status' => 'PROSPECT'
    ]);
    echo "Created customer: " . $customer['customerNumber'] . "\n";

    // Create quote
    $quote = $client->createQuote([
        'customerId' => $customer['id'],
        'validUntil' => '2024-12-31T23:59:59Z',
        'items' => [
            [
                'description' => 'Design Services',
                'quantity' => 20,
                'unitPrice' => 100.00,
                'taxRate' => 0.13
            ]
        ]
    ]);
    echo "Created quote: " . $quote['quoteNumber'] . "\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
?>
```

### cURL Examples

```bash
#!/bin/bash
# curl-examples.sh

# Set API base URL
API_BASE="https://api.accounting.example.com"

# Login and get tokens
echo "=== LOGIN ==="
LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password"
  }')

echo "$LOGIN_RESPONSE" | jq '.'

# Extract access token
ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.tokens.accessToken')
echo "Access Token: $ACCESS_TOKEN"

# Create customer
echo -e "\n=== CREATE CUSTOMER ==="
CUSTOMER_RESPONSE=$(curl -s -X POST "$API_BASE/api/v1/customers" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+1-555-0123",
    "tier": "BUSINESS",
    "status": "PROSPECT"
  }')

echo "$CUSTOMER_RESPONSE" | jq '.'

# Extract customer ID
CUSTOMER_ID=$(echo "$CUSTOMER_RESPONSE" | jq -r '.id')
echo "Customer ID: $CUSTOMER_ID"

# Create quote
echo -e "\n=== CREATE QUOTE ==="
QUOTE_RESPONSE=$(curl -s -X POST "$API_BASE/api/v1/quotes" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"customerId\": \"$CUSTOMER_ID\",
    \"validUntil\": \"2024-12-31T23:59:59Z\",
    \"items\": [
      {
        \"description\": \"Web Development Services\",
        \"quantity\": 40,
        \"unitPrice\": 150.00,
        \"taxRate\": 0.13
      }
    ]
  }")

echo "$QUOTE_RESPONSE" | jq '.'

# Extract quote ID
QUOTE_ID=$(echo "$QUOTE_RESPONSE" | jq -r '.id')
echo "Quote ID: $QUOTE_ID"

# Send quote
echo -e "\n=== SEND QUOTE ==="
curl -s -X POST "$API_BASE/api/v1/quotes/$QUOTE_ID/send" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" | jq '.'

# Get customers with pagination
echo -e "\n=== GET CUSTOMERS ==="
curl -s -X GET "$API_BASE/api/v1/customers?page=1&limit=10&status=PROSPECT" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq '.'

# Process payment
echo -e "\n=== PROCESS PAYMENT ==="
curl -s -X POST "$API_BASE/api/v1/payments" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"customerId\": \"$CUSTOMER_ID\",
    \"amount\": 1000.00,
    \"paymentMethod\": \"CASH\",
    \"paymentDate\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"referenceNumber\": \"CASH-001\",
    \"adminNotes\": \"Cash payment received\"
  }" | jq '.'

# Create e-Transfer
echo -e "\n=== CREATE E-TRANSFER ==="
curl -s -X POST "$API_BASE/api/v1/etransfers" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"customerId\": \"$CUSTOMER_ID\",
    \"amount\": 500.00,
    \"recipientEmail\": \"john@example.com\",
    \"recipientName\": \"John Doe\",
    \"securityQuestion\": \"What is your pet's name?\",
    \"securityAnswer\": \"Fluffy\",
    \"message\": \"Payment for services\",
    \"autoDeposit\": false,
    \"expiryHours\": 72
  }" | jq '.'

echo -e "\n=== COMPLETE ==="
```

---

## ⚡ Rate Limiting & Best Practices

### Rate Limits

The API implements rate limiting to ensure fair usage:

| Endpoint Category | Rate Limit | Window |
|------------------|------------|---------|
| **Authentication** | 10 requests | 15 minutes |
| **General API** | 100 requests | 15 minutes |
| **File Uploads** | 20 requests | 15 minutes |
| **Reports/Analytics** | 50 requests | 15 minutes |

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1641123456
X-RateLimit-Window: 900
```

### Best Practices

#### 1. Implement Exponential Backoff

```typescript
async function makeRequestWithRetry(
  requestFn: () => Promise<Response>,
  maxRetries: number = 3
): Promise<Response> {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const response = await requestFn();

      if (response.status === 429) {
        // Rate limited - wait and retry
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
        const delay = Math.min(retryAfter * 1000, Math.pow(2, attempt) * 1000);

        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
        continue;
      }

      return response;
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;

      // Exponential backoff for other errors
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt++;
    }
  }

  throw new Error('Max retries exceeded');
}
```

#### 2. Batch Operations

```typescript
// Instead of individual requests
for (const customer of customers) {
  await api.updateCustomer(customer.id, customer.updates);
}

// Use batch operations when available
await api.batchUpdateCustomers(customers.map(c => ({
  id: c.id,
  updates: c.updates
})));
```

#### 3. Efficient Pagination

```typescript
async function getAllCustomers(): Promise<Customer[]> {
  const allCustomers: Customer[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await api.getCustomers({
      page,
      limit: 100  // Use maximum page size
    });

    allCustomers.push(...response.customers);
    hasMore = response.customers.length === 100;
    page++;
  }

  return allCustomers;
}
```

#### 4. Caching Strategy

```typescript
class CachedAPIClient {
  private cache = new Map<string, { data: any; expiry: number }>();

  async getWithCache<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlMs: number = 300000  // 5 minutes
  ): Promise<T> {
    const cached = this.cache.get(key);

    if (cached && Date.now() < cached.expiry) {
      return cached.data;
    }

    const data = await fetchFn();
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlMs
    });

    return data;
  }

  async getCustomer(id: string): Promise<Customer> {
    return this.getWithCache(
      `customer:${id}`,
      () => this.api.getCustomer(id),
      300000  // Cache for 5 minutes
    );
  }
}
```

---

## 🚨 Error Handling Patterns

### Standard Error Response Format

```typescript
interface APIError {
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    requestId: string;
  };
  validationErrors?: Array<{
    field: string;
    code: string;
    message: string;
    value?: any;
  }>;
}
```

### HTTP Status Codes

| Status | Meaning | When to Expect |
|--------|---------|----------------|
| **200** | Success | Successful GET, PUT, POST operations |
| **201** | Created | Resource successfully created |
| **400** | Bad Request | Validation errors, malformed requests |
| **401** | Unauthorized | Invalid or expired token |
| **403** | Forbidden | Insufficient permissions |
| **404** | Not Found | Resource doesn't exist |
| **409** | Conflict | Duplicate resource, business logic violation |
| **422** | Unprocessable Entity | Business logic errors |
| **429** | Too Many Requests | Rate limit exceeded |
| **500** | Internal Server Error | Server-side errors |

### Error Handling Implementation

```typescript
class APIErrorHandler {
  static handle(error: any): never {
    if (error.response) {
      // API returned an error response
      const { status, data } = error.response;

      switch (status) {
        case 400:
          throw new ValidationError(data.error.message, data.validationErrors);
        case 401:
          throw new AuthenticationError(data.error.message);
        case 403:
          throw new AuthorizationError(data.error.message);
        case 404:
          throw new NotFoundError(data.error.message);
        case 409:
          throw new ConflictError(data.error.message);
        case 422:
          throw new BusinessLogicError(data.error.message, data.error.details);
        case 429:
          throw new RateLimitError(data.error.message, error.response.headers);
        case 500:
          throw new ServerError(data.error.message);
        default:
          throw new APIError(`HTTP ${status}: ${data.error.message}`);
      }
    } else if (error.request) {
      // Network error
      throw new NetworkError('Network error - please check your connection');
    } else {
      // Something else happened
      throw new Error(error.message);
    }
  }
}

// Custom error classes
class ValidationError extends Error {
  constructor(message: string, public validationErrors: any[]) {
    super(message);
    this.name = 'ValidationError';
  }
}

class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

class RateLimitError extends Error {
  constructor(message: string, public headers: any) {
    super(message);
    this.name = 'RateLimitError';
  }

  get retryAfter(): number {
    return parseInt(this.headers['retry-after'] || '60');
  }
}

// Usage in API client
async function safeAPICall<T>(apiCall: () => Promise<T>): Promise<T> {
  try {
    return await apiCall();
  } catch (error) {
    APIErrorHandler.handle(error);
  }
}
```

### Validation Error Handling

```typescript
// Handle validation errors
try {
  await api.createCustomer(invalidCustomerData);
} catch (error) {
  if (error instanceof ValidationError) {
    // Display field-specific errors
    error.validationErrors.forEach(validationError => {
      console.error(`${validationError.field}: ${validationError.message}`);
    });
  }
}
```

---

## 🔗 Webhook Integration

### Webhook Events

The API sends webhooks for important events:

| Event | Description | Payload |
|-------|-------------|---------|
| `customer.created` | New customer created | Customer object |
| `customer.updated` | Customer information updated | Customer object + changes |
| `quote.sent` | Quote sent to customer | Quote object |
| `quote.accepted` | Customer accepted quote | Quote object |
| `invoice.created` | New invoice generated | Invoice object |
| `invoice.paid` | Invoice fully paid | Invoice object + payment |
| `payment.succeeded` | Payment processed successfully | Payment object |
| `payment.failed` | Payment processing failed | Payment object + error |
| `project.completed` | Project marked as complete | Project object |

### Webhook Payload Format

```typescript
interface WebhookPayload {
  id: string;
  event: string;
  timestamp: string;
  organizationId: string;
  data: {
    object: any;          // The main object (customer, quote, etc.)
    previous?: any;       // Previous state (for update events)
    changes?: string[];   // List of changed fields
  };
  metadata: {
    requestId: string;
    userId?: string;
    ipAddress?: string;
  };
}
```

### Webhook Endpoint Setup

```typescript
// Express.js webhook handler
app.post('/webhooks/accounting-api', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = req.body;

  // Verify webhook signature
  if (!verifyWebhookSignature(payload, signature)) {
    return res.status(401).send('Invalid signature');
  }

  const event = JSON.parse(payload.toString());

  try {
    handleWebhookEvent(event);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).send('Error processing webhook');
  }
});

function verifyWebhookSignature(payload: Buffer, signature: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET!)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

function handleWebhookEvent(event: WebhookPayload): void {
  switch (event.event) {
    case 'customer.created':
      handleCustomerCreated(event.data.object);
      break;

    case 'quote.accepted':
      handleQuoteAccepted(event.data.object);
      break;

    case 'payment.succeeded':
      handlePaymentSucceeded(event.data.object);
      break;

    case 'invoice.paid':
      handleInvoicePaid(event.data.object);
      break;

    default:
      console.log(`Unhandled event: ${event.event}`);
  }
}
```

### Webhook Configuration

```bash
# Set webhook URL in your environment
WEBHOOK_URL="https://your-app.com/webhooks/accounting-api"
WEBHOOK_SECRET="your-webhook-secret-key"

# Configure webhook endpoints via API
curl -X POST "https://api.accounting.example.com/api/v1/webhooks" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/accounting-api",
    "events": [
      "customer.created",
      "quote.accepted",
      "payment.succeeded",
      "invoice.paid"
    ],
    "secret": "your-webhook-secret-key"
  }'
```

---

## 🛠️ SDK Generation

### OpenAPI Code Generation

Generate client SDKs from the OpenAPI specification:

```bash
# Install OpenAPI Generator
npm install -g @openapitools/openapi-generator-cli

# Generate TypeScript SDK
openapi-generator-cli generate \
  -i https://api.accounting.example.com/docs/openapi.yaml \
  -g typescript-axios \
  -o ./generated/typescript-client \
  --additional-properties=npmName=accounting-api-client

# Generate Python SDK
openapi-generator-cli generate \
  -i https://api.accounting.example.com/docs/openapi.yaml \
  -g python \
  -o ./generated/python-client \
  --additional-properties=packageName=accounting_api_client

# Generate Java SDK
openapi-generator-cli generate \
  -i https://api.accounting.example.com/docs/openapi.yaml \
  -g java \
  -o ./generated/java-client \
  --additional-properties=groupId=com.example,artifactId=accounting-api-client
```

### Custom SDK Configuration

```yaml
# sdk-config.yaml
generatorName: typescript-axios
inputSpec: https://api.accounting.example.com/docs/openapi.yaml
outputDir: ./sdk/typescript
additionalProperties:
  npmName: "@your-org/accounting-api-client"
  npmVersion: "1.0.0"
  modelPropertyNaming: camelCase
  supportsES6: true
  withInterfaces: true
  useSingleRequestParameter: true
globalProperties:
  models: true
  apis: true
  supportingFiles: true
```

### Generated SDK Usage

```typescript
// Using generated TypeScript SDK
import { Configuration, CustomerApi, QuoteApi } from '@your-org/accounting-api-client';

const config = new Configuration({
  basePath: 'https://api.accounting.example.com',
  accessToken: 'your-access-token'
});

const customerApi = new CustomerApi(config);
const quoteApi = new QuoteApi(config);

// Create customer
const customer = await customerApi.createCustomer({
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com'
});

// Create quote
const quote = await quoteApi.createQuote({
  customerId: customer.id,
  validUntil: '2024-12-31T23:59:59Z',
  items: [
    {
      description: 'Services',
      quantity: 1,
      unitPrice: 1000.00,
      taxRate: 0.13
    }
  ]
});
```

---

## 🔧 External Service Integration

### Stripe Integration

```typescript
// Stripe payment processing
interface StripePaymentRequest {
  customerId: string;
  invoiceId?: string;
  amount: number;
  currency: string;
  paymentMethodId: string;
  metadata?: Record<string, string>;
}

async function processStripePayment(payment: StripePaymentRequest): Promise<any> {
  return await apiClient.post('/api/v1/payments', {
    ...payment,
    paymentMethod: 'STRIPE_CARD'
  });
}

// Handle Stripe webhooks
function handleStripeWebhook(event: any): void {
  switch (event.type) {
    case 'payment_intent.succeeded':
      // Update payment status in your system
      updatePaymentStatus(event.data.object.id, 'COMPLETED');
      break;

    case 'payment_intent.payment_failed':
      // Handle failed payment
      updatePaymentStatus(event.data.object.id, 'FAILED');
      break;
  }
}
```

### Email Service Integration

```typescript
// Email notification integration
interface EmailNotification {
  to: string[];
  subject: string;
  template: string;
  variables: Record<string, any>;
}

async function sendQuoteEmail(quoteId: string): Promise<void> {
  const quote = await apiClient.get(`/api/v1/quotes/${quoteId}`);

  const emailData: EmailNotification = {
    to: [quote.customer.email],
    subject: `Quote ${quote.quoteNumber} from ${quote.organization.name}`,
    template: 'quote-notification',
    variables: {
      customerName: quote.customer.firstName,
      quoteNumber: quote.quoteNumber,
      total: quote.total,
      validUntil: quote.validUntil,
      viewUrl: `https://your-app.com/quotes/${quote.id}/view`
    }
  };

  await emailService.send(emailData);
}
```

### Calendar Integration

```typescript
// Calendar appointment integration
interface CalendarAppointment {
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  attendees: string[];
  location?: string;
}

async function createCalendarAppointment(appointmentId: string): Promise<void> {
  const appointment = await apiClient.get(`/api/v1/appointments/${appointmentId}`);

  const calendarEvent: CalendarAppointment = {
    title: appointment.title,
    description: appointment.description,
    startTime: new Date(appointment.startTime),
    endTime: new Date(appointment.endTime),
    attendees: [appointment.customer.email],
    location: appointment.location?.address
  };

  await calendarService.createEvent(calendarEvent);
}
```

### CRM Integration

```typescript
// CRM synchronization
async function syncCustomerToCRM(customerId: string): Promise<void> {
  const customer = await apiClient.get(`/api/v1/customers/${customerId}`);

  const crmContact = {
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone,
    company: customer.business?.legalName,
    status: customer.status,
    tier: customer.tier,
    customFields: {
      customerNumber: customer.customerNumber,
      accountingApiId: customer.id
    }
  };

  await crmService.createOrUpdateContact(crmContact);
}
```

---

This comprehensive integration guide provides everything developers need to successfully integrate with the Enterprise Accounting API, from basic authentication to advanced webhook handling and external service integration.