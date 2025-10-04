# Customer Payment Portal - Quick Start Guide

## Overview
Customer payment portal allows customers to view invoices, make payments, and manage payment methods through secure token-based authentication.

## Quick Setup (5 minutes)

### 1. Database Setup
```bash
# Apply migration
npm run prisma:generate
sqlite3 prisma/dev.db < prisma/migrations/20251003021738_add_customer_payment_token/migration.sql

# Verify table
sqlite3 prisma/dev.db ".schema customer_payment_tokens"
```

### 2. Environment Variables
```bash
# Add to .env
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
PAYMENT_TOKEN_LIFETIME_DAYS=7
```

### 3. Start Server
```bash
npm run dev
# Server running at http://localhost:3000
```

## API Endpoints

All endpoints: `/api/v1/public/payment/:token/*`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:token/invoice` | View invoice & balance |
| POST | `/:token/create-intent` | Create payment intent |
| POST | `/:token/confirm` | Confirm payment |
| GET | `/:token/history` | Payment history |
| GET | `/:token/methods` | List payment methods |
| POST | `/:token/methods` | Add payment method |
| DELETE | `/:token/methods/:id` | Remove payment method |
| PUT | `/:token/methods/:id/default` | Set default method |

## Usage Examples

### Generate Token (Backend)
```typescript
import { paymentPortalService } from './src/services/payment-portal.service';

const result = await paymentPortalService.generateCustomerPaymentToken(
  'customer_id',
  'organization_id',
  'invoice_id', // optional
  'admin_user_id', // optional
  7 // days until expiration
);

console.log('Payment Link:', `https://pay.example.com/${result.token}`);
// Send token to customer via email
```

### View Invoice (Frontend)
```javascript
fetch(`/api/v1/public/payment/${token}/invoice`)
  .then(res => res.json())
  .then(data => {
    console.log('Invoice:', data.invoice);
    console.log('Balance:', data.balance.totalOutstanding);
  });
```

### Make Payment (Frontend with Stripe.js)
```javascript
// 1. Create payment intent
const intentResponse = await fetch(`/api/v1/public/payment/${token}/create-intent`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ amount: 1130.00 })
});

const { clientSecret } = await intentResponse.json();

// 2. Collect payment with Stripe.js
const { paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
  payment_method: {
    card: cardElement,
    billing_details: { name: 'John Doe' }
  }
});

// 3. Confirm with backend
await fetch(`/api/v1/public/payment/${token}/confirm`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ paymentIntentId: paymentIntent.id })
});
```

### Manage Payment Methods
```javascript
// List methods
const methods = await fetch(`/api/v1/public/payment/${token}/methods`)
  .then(res => res.json());

// Add method (after creating with Stripe.js)
await fetch(`/api/v1/public/payment/${token}/methods`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    stripePaymentMethodId: 'pm_...',
    setAsDefault: true
  })
});

// Set default
await fetch(`/api/v1/public/payment/${token}/methods/${methodId}/default`, {
  method: 'PUT'
});

// Remove method
await fetch(`/api/v1/public/payment/${token}/methods/${methodId}`, {
  method: 'DELETE'
});
```

## Rate Limits

- **Viewing/Listing:** 20 requests per minute
- **Payment Actions:** 5 requests per minute
- **Method Changes:** 5 requests per minute

## Security Features

- ✅ Bcrypt token hashing (10 rounds)
- ✅ Token expiration (default: 7 days)
- ✅ IP address logging
- ✅ Usage tracking
- ✅ PCI DSS compliant
- ✅ Audit logging
- ✅ Rate limiting

## Testing

```bash
# Run integration tests
npm run test:integration -- tests/integration/public-payment-portal.test.ts

# Test token generation
node -e "
const { paymentPortalService } = require('./src/services/payment-portal.service');
paymentPortalService.generateCustomerPaymentToken('cust_123', 'org_123')
  .then(r => console.log('Token:', r.token));
"
```

## Troubleshooting

### Token Validation Fails
```bash
# Check token status
sqlite3 prisma/dev.db "SELECT * FROM customer_payment_tokens WHERE tokenHash = '...'"

# Check expiration
sqlite3 prisma/dev.db "SELECT id, status, expiresAt FROM customer_payment_tokens WHERE status = 'ACTIVE'"
```

### Payment Intent Creation Fails
```bash
# Verify Stripe configuration
echo $STRIPE_SECRET_KEY

# Test Stripe API
curl https://api.stripe.com/v1/payment_intents \
  -u $STRIPE_SECRET_KEY: \
  -d amount=1000 \
  -d currency=cad
```

### Rate Limit Exceeded
```bash
# Check audit logs
sqlite3 prisma/dev.db "SELECT * FROM audit_logs WHERE entityType = 'PaymentPortal' AND details LIKE '%RATE_LIMIT%'"
```

## Key Files

- **Service:** `/src/services/payment-portal.service.ts`
- **Controller:** `/src/controllers/public-payment.controller.ts`
- **Routes:** `/src/routes/public-payment.routes.ts`
- **Tests:** `/tests/integration/public-payment-portal.test.ts`
- **Schema:** `prisma/schema.prisma` (CustomerPaymentToken model)

## Documentation

- **API Docs:** http://localhost:3000/api-docs
- **Full Guide:** `CUSTOMER_PAYMENT_PORTAL_IMPLEMENTATION.md`
- **Complete Summary:** `IMPLEMENTATION_COMPLETE.md`

## Next Steps

1. ✅ Backend implementation complete
2. ⏳ Run integration tests
3. ⏳ Add admin token generation endpoint
4. ⏳ Implement email notifications
5. ⏳ Build customer-facing UI

---

**Quick Questions?**
- API not starting? Check `.env` file and database migration
- Stripe errors? Verify API keys and test mode
- Rate limited? Wait 60 seconds or adjust limits in middleware

**Need Help?**
- Check Swagger docs: http://localhost:3000/api-docs
- Review test examples: `tests/integration/public-payment-portal.test.ts`
- Read implementation docs: `CUSTOMER_PAYMENT_PORTAL_IMPLEMENTATION.md`
