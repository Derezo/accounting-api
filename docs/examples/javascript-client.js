/**
 * Accounting API - JavaScript Client Example
 *
 * This example demonstrates how to interact with the Accounting API
 * using JavaScript/Node.js with axios.
 */

const axios = require('axios');

class AccountingApiClient {
  constructor(baseURL = 'http://localhost:3000/api/v1', apiKey = null) {
    this.baseURL = baseURL;
    this.apiKey = apiKey;
    this.accessToken = null;

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to include auth token
    this.client.interceptors.request.use((config) => {
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          console.error('Authentication failed. Please login again.');
        }
        return Promise.reject(error);
      }
    );
  }

  async login(email, password, organizationId) {
    try {
      const response = await this.client.post('/auth/login', {
        email,
        password,
        organizationId,
      });

      this.accessToken = response.data.accessToken;
      this.refreshToken = response.data.refreshToken;

      return response.data;
    } catch (error) {
      throw new Error(`Login failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async refreshAccessToken() {
    try {
      const response = await this.client.post('/auth/refresh', {
        refreshToken: this.refreshToken,
      });

      this.accessToken = response.data.accessToken;
      this.refreshToken = response.data.refreshToken;

      return response.data;
    } catch (error) {
      throw new Error(`Token refresh failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async getCustomers(params = {}) {
    try {
      const response = await this.client.get('/customers', { params });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch customers: ${error.response?.data?.message || error.message}`);
    }
  }

  async createCustomer(customerData) {
    try {
      const response = await this.client.post('/customers', customerData);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create customer: ${error.response?.data?.message || error.message}`);
    }
  }

  async createInvoice(invoiceData) {
    try {
      const response = await this.client.post('/invoices', invoiceData);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create invoice: ${error.response?.data?.message || error.message}`);
    }
  }
}

// Usage example
async function example() {
  const client = new AccountingApiClient();

  try {
    // Login
    await client.login(
      'admin@example.com',
      'SecurePassword123!',
      '550e8400-e29b-41d4-a716-446655440000'
    );

    // Get customers with pagination
    const customers = await client.getCustomers({
      limit: 20,
      offset: 0,
      sortBy: 'createdAt',
      sortOrder: 'desc'
    });

    console.log('Customers:', customers);

    // Create a new customer
    const newCustomer = await client.createCustomer({
      type: 'PERSON',
      tier: 'PERSONAL',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phone: '+1 (555) 123-4567',
      address: {
        street: '123 Main St',
        city: 'Toronto',
        province: 'ON',
        postalCode: 'M5V 3A8',
        country: 'Canada'
      }
    });

    console.log('New customer created:', newCustomer);

  } catch (error) {
    console.error('API Error:', error.message);
  }
}

module.exports = AccountingApiClient;

// Run example if this file is executed directly
if (require.main === module) {
  example();
}
