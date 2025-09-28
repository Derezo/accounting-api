"""
Accounting API - Python Client Example

This example demonstrates how to interact with the Accounting API
using Python with the requests library.
"""

import requests
import json
from typing import Optional, Dict, Any
from datetime import datetime, timedelta


class AccountingApiClient:
    def __init__(self, base_url: str = "http://localhost:3000/api/v1"):
        self.base_url = base_url
        self.access_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.session = requests.Session()

        # Set default headers
        self.session.headers.update({
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        })

    def _get_headers(self) -> Dict[str, str]:
        headers = {}
        if self.access_token:
            headers['Authorization'] = f'Bearer {self.access_token}'
        return headers

    def _handle_response(self, response: requests.Response) -> Dict[str, Any]:
        if response.status_code == 401:
            raise Exception("Authentication failed. Please login again.")

        response.raise_for_status()
        return response.json()

    def login(self, email: str, password: str, organization_id: str) -> Dict[str, Any]:
        """Login and obtain access tokens."""
        url = f"{self.base_url}/auth/login"
        data = {
            "email": email,
            "password": password,
            "organizationId": organization_id
        }

        response = self.session.post(url, json=data)
        result = self._handle_response(response)

        self.access_token = result['accessToken']
        self.refresh_token = result['refreshToken']

        return result

    def refresh_access_token(self) -> Dict[str, Any]:
        """Refresh the access token using the refresh token."""
        if not self.refresh_token:
            raise Exception("No refresh token available")

        url = f"{self.base_url}/auth/refresh"
        data = {"refreshToken": self.refresh_token}

        response = self.session.post(url, json=data)
        result = self._handle_response(response)

        self.access_token = result['accessToken']
        self.refresh_token = result['refreshToken']

        return result

    def get_customers(self, **params) -> Dict[str, Any]:
        """Get list of customers with optional filtering and pagination."""
        url = f"{self.base_url}/customers"
        headers = self._get_headers()

        response = self.session.get(url, headers=headers, params=params)
        return self._handle_response(response)

    def create_customer(self, customer_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new customer."""
        url = f"{self.base_url}/customers"
        headers = self._get_headers()

        response = self.session.post(url, headers=headers, json=customer_data)
        return self._handle_response(response)

    def get_customer(self, customer_id: str) -> Dict[str, Any]:
        """Get a specific customer by ID."""
        url = f"{self.base_url}/customers/{customer_id}"
        headers = self._get_headers()

        response = self.session.get(url, headers=headers)
        return self._handle_response(response)

    def create_invoice(self, invoice_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new invoice."""
        url = f"{self.base_url}/invoices"
        headers = self._get_headers()

        response = self.session.post(url, headers=headers, json=invoice_data)
        return self._handle_response(response)

    def get_invoices(self, **params) -> Dict[str, Any]:
        """Get list of invoices with optional filtering and pagination."""
        url = f"{self.base_url}/invoices"
        headers = self._get_headers()

        response = self.session.get(url, headers=headers, params=params)
        return self._handle_response(response)


def example_usage():
    """Example usage of the Accounting API client."""
    client = AccountingApiClient()

    try:
        # Login
        login_result = client.login(
            email="admin@example.com",
            password="SecurePassword123!",
            organization_id="550e8400-e29b-41d4-a716-446655440000"
        )
        print("Login successful:", login_result['user']['email'])

        # Get customers with pagination
        customers = client.get_customers(
            limit=20,
            offset=0,
            sort_by="createdAt",
            sort_order="desc"
        )
        print(f"Found {customers['meta']['total']} customers")

        # Create a new customer
        new_customer_data = {
            "type": "PERSON",
            "tier": "PERSONAL",
            "firstName": "Jane",
            "lastName": "Smith",
            "email": "jane.smith@example.com",
            "phone": "+1 (555) 987-6543",
            "address": {
                "street": "456 Oak Ave",
                "city": "Vancouver",
                "province": "BC",
                "postalCode": "V6B 1A1",
                "country": "Canada"
            }
        }

        new_customer = client.create_customer(new_customer_data)
        print("New customer created:", new_customer['id'])

        # Create an invoice for the new customer
        invoice_data = {
            "customerId": new_customer['id'],
            "items": [
                {
                    "description": "Consulting Services",
                    "quantity": "10.00",
                    "unitPrice": "100.00",
                    "total": "1000.00"
                }
            ],
            "subtotal": "1000.00",
            "taxRate": "0.13",
            "taxAmount": "130.00",
            "total": "1130.00",
            "dueDate": (datetime.now() + timedelta(days=30)).isoformat()
        }

        new_invoice = client.create_invoice(invoice_data)
        print("New invoice created:", new_invoice['id'])

    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    example_usage()
