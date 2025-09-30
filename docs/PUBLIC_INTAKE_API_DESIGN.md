# Public Customer & Quote Intake API - Design Document

## Executive Summary

This document outlines the design and implementation of a secure, public-facing customer and quote intake workflow API for the accounting application. The API enables anonymous users to progressively submit customer information and quote requests through a multi-step workflow, with heavy emphasis on security, bot prevention, and abuse mitigation.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Security Architecture](#security-architecture)
3. [Database Schema Design](#database-schema-design)
4. [Token System Design](#token-system-design)
5. [Workflow State Machine](#workflow-state-machine)
6. [API Contract](#api-contract)
7. [Rate Limiting Strategy](#rate-limiting-strategy)
8. [Bot Detection & Prevention](#bot-detection--prevention)
9. [Data Validation & Sanitization](#data-validation--sanitization)
10. [Conversion to Authenticated Records](#conversion-to-authenticated-records)
11. [Threat Model & Mitigations](#threat-model--mitigations)
12. [Best Practices Research](#best-practices-research)
13. [Implementation Roadmap](#implementation-roadmap)

---

## 1. Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Public Internet                          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Public Intake API Layer                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Rate Limiting (Aggressive)                              │  │
│  │  - 10 req/min per IP                                     │  │
│  │  - 100 req/hour per IP                                   │  │
│  │  - 5 token generations per hour per IP                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Bot Detection                                           │  │
│  │  - Honeypot fields                                       │  │
│  │  - Timing analysis                                       │  │
│  │  - User agent validation                                 │  │
│  │  - Behavioral analysis                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Token Validation                                        │  │
│  │  - Cryptographic token (64+ chars)                       │  │
│  │  - Hashed storage                                        │  │
│  │  - 48-hour expiration                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  CSRF Protection                                         │  │
│  │  - Custom headers required                               │  │
│  │  - Origin/Referer checking                               │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Intake Workflow Services                        │
│  ┌──────────────┬──────────────┬──────────────┬─────────────┐  │
│  │   Session    │   Customer   │    Quote     │  Security   │  │
│  │  Management  │    Data      │    Data      │  Monitoring │  │
│  └──────────────┴──────────────┴──────────────┴─────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Intake Database Tables                          │
│  - IntakeSession (token-based sessions)                         │
│  - IntakeCustomerData (progressive customer data)               │
│  - IntakeQuoteData (progressive quote data)                     │
│  - IntakeSecurityEvent (bot detection, abuse tracking)          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼ (on completion)
┌─────────────────────────────────────────────────────────────────┐
│              Main Application (Authenticated)                    │
│  - Customer records                                             │
│  - Quote records                                                │
│  - Organization linking                                         │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Core Principles

1. **Zero Trust**: Treat all public requests as potentially malicious
2. **Progressive Disclosure**: Collect data step-by-step to reduce abandonment
3. **Stateless Tokens**: Session state maintained via cryptographic tokens
4. **Defense in Depth**: Multiple layers of security protection
5. **Graceful Degradation**: Security measures that don't break legitimate users
6. **GDPR Compliance**: Data retention policies, right to deletion
7. **Encryption First**: Sensitive data encrypted at rest

---

## 2. Security Architecture

### 2.1 Security Layers

```
Layer 1: Network/Infrastructure
├─ DDoS protection (Cloudflare/AWS Shield)
├─ Geographic rate limiting
└─ IP reputation filtering

Layer 2: Application Rate Limiting
├─ Per-IP limits (aggressive)
├─ Per-token limits
├─ Sliding window counters
└─ Exponential backoff on violations

Layer 3: Bot Detection
├─ Honeypot fields (invisible to humans)
├─ Time-based analysis (min/max form completion time)
├─ Mouse movement tracking (optional, client-side)
├─ Browser fingerprinting
└─ Behavioral pattern analysis

Layer 4: Request Validation
├─ CSRF token validation
├─ Origin/Referer checking
├─ Custom header requirements
├─ Content-Type enforcement
└─ Payload size limits

Layer 5: Input Validation
├─ Strict Zod schemas
├─ XSS prevention (sanitization)
├─ SQL injection prevention (parameterized queries)
├─ Email format validation
└─ Phone number validation

Layer 6: Data Protection
├─ Field-level encryption (PII)
├─ Token hashing (bcrypt)
├─ Secure random generation
└─ No logging of sensitive data

Layer 7: Monitoring & Response
├─ Real-time abuse detection
├─ Automated IP blocking
├─ Alert generation
└─ Manual review queue
```

### 2.2 Token Security

#### Token Generation
```typescript
// 64-character cryptographically secure random token
token = base64url(crypto.randomBytes(48))
// Example: "A7xK9mPqR3tY8wZnL5cH4vF2jB1dS6eG0iU3oW7kN9pM4rT8yX5"
```

#### Token Storage
```typescript
// NEVER store raw tokens
hashedToken = bcrypt.hash(token, 12) // High cost factor
// Store: hashedToken + salt in database
```

#### Token Validation
```typescript
// Verify against hashed version
isValid = bcrypt.compare(providedToken, storedHashedToken)
// Check expiration, IP match, usage count
```

### 2.3 Rate Limiting Strategy

#### Per-IP Limits
```yaml
Basic Operations:
  - 10 requests per minute
  - 100 requests per hour
  - 500 requests per day

Token Generation:
  - 5 token generations per hour
  - 20 token generations per day

Workflow Step Submission:
  - 3 submissions per minute (per step)
  - 30 submissions per hour

Final Submission:
  - 2 completions per hour
  - 10 completions per day
```

#### Per-Token Limits
```yaml
Session Actions:
  - 50 total requests per token
  - 10 updates per workflow step
  - 1 final submission per token
```

#### Sliding Window Implementation
```typescript
// Use Redis for distributed rate limiting
key = `ratelimit:${category}:${identifier}:${window}`
current = redis.incr(key)
if (current === 1) {
  redis.expire(key, windowSeconds)
}
if (current > limit) {
  throw new RateLimitExceededError()
}
```

---

## 3. Database Schema Design

### 3.1 IntakeSession Table

```prisma
model IntakeSession {
  id                String           @id @default(cuid())

  // Token Management
  tokenHash         String           @unique  // bcrypt hash of token
  tokenVersion      Int              @default(1)

  // Session Metadata
  status            String           @default("ACTIVE") // ACTIVE, COMPLETED, EXPIRED, ABANDONED, BLOCKED
  currentStep       String           @default("EMAIL_CAPTURE") // Current workflow step
  completedSteps    String           // JSON array of completed steps

  // Security Context
  ipAddress         String
  userAgent         String?
  fingerprint       String?          // Browser fingerprint
  origin            String?          // Request origin

  // Bot Detection Flags
  suspicionScore    Int              @default(0) // 0-100, higher = more suspicious
  botFlags          String?          // JSON array of triggered bot detection rules
  honeypotTriggered Boolean          @default(false)

  // Timing Analysis
  sessionStartedAt  DateTime         @default(now())
  lastActivityAt    DateTime         @default(now())
  stepTimings       String?          // JSON object with step completion times

  // Request Tracking
  requestCount      Int              @default(0)
  submissionAttempts Int             @default(0)

  // Data References
  customerDataId    String?          @unique
  quoteDataId       String?          @unique

  // Conversion Tracking
  convertedAt       DateTime?
  convertedToCustomerId String?
  convertedToQuoteId String?

  // Compliance & Retention
  privacyPolicyAccepted Boolean      @default(false)
  termsAccepted     Boolean          @default(false)
  marketingConsent  Boolean          @default(false)

  // Expiration
  expiresAt         DateTime
  deletedAt         DateTime?

  // Timestamps
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  // Relationships
  customerData      IntakeCustomerData?
  quoteData         IntakeQuoteData?
  securityEvents    IntakeSecurityEvent[]

  @@map("intake_sessions")
  @@index([tokenHash])
  @@index([ipAddress])
  @@index([status])
  @@index([expiresAt])
  @@index([suspicionScore])
  @@index([sessionStartedAt])
}
```

### 3.2 IntakeCustomerData Table

```prisma
model IntakeCustomerData {
  id                String           @id @default(cuid())
  sessionId         String           @unique

  // Profile Type
  profileType       String?          // RESIDENTIAL, COMMERCIAL

  // Email (captured first)
  email             String           // Encrypted
  emailVerified     Boolean          @default(false)

  // Personal Information (RESIDENTIAL)
  firstName         String?
  lastName          String?
  phone             String?          // Encrypted

  // Business Information (COMMERCIAL)
  businessName      String?
  contactName       String?
  businessPhone     String?          // Encrypted

  // Address Information
  addressLine1      String?
  addressLine2      String?
  city              String?
  province          String?          // State/Province
  postalCode        String?
  country           String?          @default("CA")

  // Additional Details
  notes             String?          // Customer-provided notes
  referralSource    String?          // How did you hear about us?

  // Data Completeness
  completionPercentage Int           @default(0) // 0-100

  // Timestamps
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  // Relationships
  session           IntakeSession    @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@map("intake_customer_data")
  @@index([email])
  @@index([sessionId])
}
```

### 3.3 IntakeQuoteData Table

```prisma
model IntakeQuoteData {
  id                String           @id @default(cuid())
  sessionId         String           @unique

  // Service Category
  category          String?          // HVAC, PLUMBING, ELECTRICAL, etc.
  subcategory       String?

  // Quote Details
  serviceType       String?          // REPAIR, INSTALLATION, MAINTENANCE, CONSULTATION
  urgency           String?          // EMERGENCY, URGENT, ROUTINE, SCHEDULED
  preferredDate     DateTime?        // Preferred service date

  // Description
  description       String?          // Detailed description of needs
  attachments       String?          // JSON array of uploaded file references

  // Budget
  estimatedBudget   String?          // UNDER_1000, 1000_5000, 5000_10000, 10000_PLUS, UNSURE

  // Location (if different from customer address)
  serviceAddressLine1 String?
  serviceAddressLine2 String?
  serviceCity       String?
  serviceProvince   String?
  servicePostalCode String?
  serviceCountry    String?          @default("CA")

  // Additional Questions
  propertyType      String?          // RESIDENTIAL, COMMERCIAL, INDUSTRIAL
  accessInstructions String?         // How to access property

  // Data Completeness
  completionPercentage Int           @default(0) // 0-100

  // Timestamps
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  // Relationships
  session           IntakeSession    @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@map("intake_quote_data")
  @@index([category])
  @@index([urgency])
  @@index([sessionId])
}
```

### 3.4 IntakeSecurityEvent Table

```prisma
model IntakeSecurityEvent {
  id                String           @id @default(cuid())
  sessionId         String?          // Null for pre-session events

  // Event Classification
  eventType         String           // BOT_DETECTED, RATE_LIMIT_EXCEEDED, HONEYPOT_TRIGGERED, etc.
  severity          String           // LOW, MEDIUM, HIGH, CRITICAL

  // Event Details
  description       String
  ruleTriggered     String?          // Which bot detection rule triggered
  metadata          String?          // JSON metadata

  // Context
  ipAddress         String
  userAgent         String?
  requestPath       String?
  requestMethod     String?
  requestBody       String?          // Sanitized request body

  // Action Taken
  actionTaken       String           // LOGGED, BLOCKED, CHALLENGED, RATE_LIMITED
  blocked           Boolean          @default(false)

  // Timestamp
  timestamp         DateTime         @default(now())

  // Relationships
  session           IntakeSession?   @relation(fields: [sessionId], references: [id], onDelete: SetNull)

  @@map("intake_security_events")
  @@index([sessionId])
  @@index([eventType])
  @@index([severity])
  @@index([ipAddress])
  @@index([timestamp])
  @@index([blocked])
}
```

---

## 4. Token System Design

### 4.1 Token Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                   Token Generation                          │
│  1. User initiates intake workflow                         │
│  2. Generate cryptographically secure random token         │
│  3. Hash token with bcrypt (cost factor 12)                │
│  4. Create IntakeSession record                            │
│  5. Return raw token to client (only time it's exposed)    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Token Usage                               │
│  1. Client includes token in X-Intake-Token header         │
│  2. Server hashes incoming token                           │
│  3. Lookup session by hashed token                         │
│  4. Validate expiration, status, IP match                  │
│  5. Increment request count                                │
│  6. Update lastActivityAt                                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Token Expiration                          │
│  - Default: 48 hours from creation                         │
│  - Extended on activity (up to 7 days max)                 │
│  - Immediate expiration on completion                      │
│  - Cleanup job removes expired sessions                    │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Token Security Properties

```typescript
interface TokenProperties {
  // Entropy
  length: 64,          // 64 characters
  entropy: 384,        // 384 bits of entropy (48 bytes * 8)
  charset: 'base64url', // URL-safe base64

  // Storage
  hashAlgorithm: 'bcrypt',
  costFactor: 12,      // bcrypt cost factor (secure, performant)

  // Validation
  expiration: 48 * 60 * 60 * 1000, // 48 hours in milliseconds
  maxLifetime: 7 * 24 * 60 * 60 * 1000, // 7 days absolute max

  // Security
  singleUse: false,    // Token can be reused within session
  ipBinding: true,     // Token bound to originating IP
  userAgentBinding: false, // Too strict, causes issues
}
```

---

## 5. Workflow State Machine

### 5.1 Workflow Steps

```
Step 1: EMAIL_CAPTURE
├─ Fields: email
├─ Validation: Email format, disposable email check
├─ Actions: Generate token, create session
└─ Next: PROFILE_TYPE

Step 2: PROFILE_TYPE
├─ Fields: profileType (RESIDENTIAL | COMMERCIAL)
├─ Validation: Enum validation
├─ Actions: Update session
└─ Next: PROFILE_DETAILS

Step 3: PROFILE_DETAILS
├─ Fields (RESIDENTIAL): firstName, lastName, phone, address
├─ Fields (COMMERCIAL): businessName, contactName, businessPhone, address
├─ Validation: Name format, phone format, address format
├─ Actions: Update customer data
└─ Next: SERVICE_CATEGORY

Step 4: SERVICE_CATEGORY
├─ Fields: category, subcategory
├─ Validation: Valid category from service catalog
├─ Actions: Update quote data
└─ Next: SERVICE_DETAILS

Step 5: SERVICE_DETAILS
├─ Fields: serviceType, urgency, preferredDate, description
├─ Validation: Description length, date validation
├─ Actions: Update quote data
└─ Next: ADDITIONAL_INFO

Step 6: ADDITIONAL_INFO
├─ Fields: estimatedBudget, propertyType, accessInstructions, notes
├─ Validation: Optional fields
├─ Actions: Update quote data
└─ Next: REVIEW

Step 7: REVIEW
├─ Fields: privacyPolicyAccepted, termsAccepted, marketingConsent
├─ Validation: Required consent checkboxes
├─ Actions: Final validation
└─ Next: SUBMIT

Step 8: SUBMIT
├─ Fields: (none, all data already collected)
├─ Validation: Complete data validation
├─ Actions: Convert to Customer + Quote, invalidate token
└─ Next: COMPLETED
```

### 5.2 State Transitions

```typescript
type WorkflowStep =
  | 'EMAIL_CAPTURE'
  | 'PROFILE_TYPE'
  | 'PROFILE_DETAILS'
  | 'SERVICE_CATEGORY'
  | 'SERVICE_DETAILS'
  | 'ADDITIONAL_INFO'
  | 'REVIEW'
  | 'SUBMIT'
  | 'COMPLETED'

type SessionStatus =
  | 'ACTIVE'        // Session in progress
  | 'COMPLETED'     // Successfully submitted and converted
  | 'EXPIRED'       // Exceeded time limit
  | 'ABANDONED'     // User stopped midway (24h+ inactivity)
  | 'BLOCKED'       // Flagged as malicious

const VALID_TRANSITIONS: Record<WorkflowStep, WorkflowStep[]> = {
  EMAIL_CAPTURE: ['PROFILE_TYPE'],
  PROFILE_TYPE: ['PROFILE_DETAILS', 'EMAIL_CAPTURE'], // Allow back
  PROFILE_DETAILS: ['SERVICE_CATEGORY', 'PROFILE_TYPE'],
  SERVICE_CATEGORY: ['SERVICE_DETAILS', 'PROFILE_DETAILS'],
  SERVICE_DETAILS: ['ADDITIONAL_INFO', 'SERVICE_CATEGORY'],
  ADDITIONAL_INFO: ['REVIEW', 'SERVICE_DETAILS'],
  REVIEW: ['SUBMIT', 'ADDITIONAL_INFO'],
  SUBMIT: ['COMPLETED'],
  COMPLETED: [], // Terminal state
}
```

---

## 6. API Contract

### 6.1 Base URL
```
POST /api/v1/public/intake/*
```

### 6.2 Endpoints

#### 6.2.1 Initialize Session
```http
POST /api/v1/public/intake/initialize
Content-Type: application/json
X-Client-Type: web

Request:
{
  "email": "customer@example.com",
  "honeypot_field_name": "", // Must be empty
  "timestamp": 1234567890 // Client timestamp
}

Response: 201 Created
{
  "success": true,
  "token": "A7xK9mPqR3tY8wZnL5cH4vF2jB1dS6eG0iU3oW7kN9pM4rT8yX5",
  "sessionId": "cuid_abc123",
  "expiresAt": "2025-10-02T12:00:00Z",
  "currentStep": "PROFILE_TYPE",
  "message": "Session initialized. Please store this token securely."
}
```

#### 6.2.2 Update Step
```http
POST /api/v1/public/intake/step
Content-Type: application/json
X-Intake-Token: A7xK9mPqR3tY8wZnL5cH4vF2jB1dS6eG0iU3oW7kN9pM4rT8yX5
X-Client-Type: web

Request:
{
  "step": "PROFILE_DETAILS",
  "data": {
    "profileType": "RESIDENTIAL",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+1-416-555-0123",
    "addressLine1": "123 Main St",
    "city": "Toronto",
    "province": "ON",
    "postalCode": "M5V 3A8",
    "country": "CA"
  },
  "honeypot_field_name": "",
  "clientTimestamp": 1234567890
}

Response: 200 OK
{
  "success": true,
  "currentStep": "SERVICE_CATEGORY",
  "nextStep": "SERVICE_CATEGORY",
  "completionPercentage": 50,
  "completedSteps": ["EMAIL_CAPTURE", "PROFILE_TYPE", "PROFILE_DETAILS"]
}
```

#### 6.2.3 Get Session Status
```http
GET /api/v1/public/intake/status
X-Intake-Token: A7xK9mPqR3tY8wZnL5cH4vF2jB1dS6eG0iU3oW7kN9pM4rT8yX5

Response: 200 OK
{
  "success": true,
  "sessionId": "cuid_abc123",
  "status": "ACTIVE",
  "currentStep": "SERVICE_CATEGORY",
  "completedSteps": ["EMAIL_CAPTURE", "PROFILE_TYPE", "PROFILE_DETAILS"],
  "completionPercentage": 50,
  "expiresAt": "2025-10-02T12:00:00Z",
  "customerData": {
    "email": "customer@example.com",
    "firstName": "John",
    "lastName": "Doe",
    // ... other non-sensitive fields
  },
  "quoteData": {
    // ... quote fields if any
  }
}
```

#### 6.2.4 Submit Final
```http
POST /api/v1/public/intake/submit
Content-Type: application/json
X-Intake-Token: A7xK9mPqR3tY8wZnL5cH4vF2jB1dS6eG0iU3oW7kN9pM4rT8yX5
X-Client-Type: web

Request:
{
  "privacyPolicyAccepted": true,
  "termsAccepted": true,
  "marketingConsent": false
}

Response: 200 OK
{
  "success": true,
  "message": "Your information has been submitted successfully.",
  "referenceNumber": "INTAKE-2025-001234",
  "estimatedResponseTime": "24 hours",
  "nextSteps": [
    "We'll review your request within 24 hours",
    "You'll receive an email confirmation shortly",
    "A team member will contact you to schedule a consultation"
  ]
}
```

### 6.3 Error Responses

```typescript
// Rate Limit Exceeded
Status: 429 Too Many Requests
{
  "success": false,
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Please try again later.",
  "retryAfter": 60 // seconds
}

// Invalid Token
Status: 401 Unauthorized
{
  "success": false,
  "error": "INVALID_TOKEN",
  "message": "Invalid or expired session token."
}

// Bot Detection
Status: 403 Forbidden
{
  "success": false,
  "error": "SUSPICIOUS_ACTIVITY",
  "message": "Your request has been flagged for suspicious activity."
}

// Validation Error
Status: 400 Bad Request
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Invalid input data.",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

---

## 7. Rate Limiting Strategy

### 7.1 Multi-Tier Rate Limiting

```typescript
interface RateLimitConfig {
  // Tier 1: IP-based limits (most aggressive)
  ip: {
    initialize: { limit: 5, window: '1h' },      // 5 new sessions per hour
    step: { limit: 10, window: '1m' },           // 10 step updates per minute
    status: { limit: 30, window: '1m' },         // 30 status checks per minute
    submit: { limit: 2, window: '1h' },          // 2 submissions per hour
    total: { limit: 100, window: '1h' },         // 100 total requests per hour
  },

  // Tier 2: Token-based limits
  token: {
    step: { limit: 50, window: 'lifetime' },     // 50 updates per token lifetime
    status: { limit: 200, window: 'lifetime' },  // 200 status checks per token
    submit: { limit: 1, window: 'lifetime' },    // 1 submission per token
  },

  // Tier 3: Global limits (DDoS protection)
  global: {
    concurrent: { limit: 1000, window: 'instant' }, // 1000 concurrent requests
    newSessions: { limit: 100, window: '1m' },      // 100 new sessions per minute globally
  }
}
```

### 7.2 Rate Limit Headers

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1633024800
X-RateLimit-Type: ip:step:1m
Retry-After: 60
```

---

## 8. Bot Detection & Prevention

### 8.1 Detection Techniques

#### 8.1.1 Honeypot Fields
```typescript
// Server-side validation
if (req.body.honeypot_field_name !== '') {
  // Bot filled honeypot field
  flagAsSuspicious('HONEYPOT_TRIGGERED', HIGH)
}

// Client-side (CSS hidden)
<input
  type="text"
  name="honeypot_field_name"
  style="position: absolute; left: -9999px;"
  tabIndex={-1}
  autoComplete="off"
/>
```

#### 8.1.2 Timing Analysis
```typescript
interface TimingAnalysis {
  // Form must take at least N seconds to complete
  minFormCompletionTime: 3, // 3 seconds minimum

  // Form shouldn't take more than N minutes per step
  maxFormCompletionTime: 600, // 10 minutes maximum

  // Time between steps must be reasonable
  minStepInterval: 1, // 1 second between steps
  maxStepInterval: 300, // 5 minutes between steps
}

function validateTiming(session: IntakeSession, step: string): boolean {
  const stepStartTime = session.stepTimings[step]?.startTime
  const now = Date.now()
  const elapsed = now - stepStartTime

  if (elapsed < minFormCompletionTime * 1000) {
    flagAsSuspicious('TIMING_TOO_FAST', MEDIUM)
    return false
  }

  if (elapsed > maxFormCompletionTime * 1000) {
    flagAsSuspicious('TIMING_TOO_SLOW', LOW)
  }

  return true
}
```

#### 8.1.3 User Agent Validation
```typescript
const BOT_USER_AGENTS = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /scraper/i,
  /curl/i,
  /wget/i,
  /python/i,
  /java/i,
]

function validateUserAgent(userAgent: string): boolean {
  if (!userAgent) {
    flagAsSuspicious('MISSING_USER_AGENT', HIGH)
    return false
  }

  for (const pattern of BOT_USER_AGENTS) {
    if (pattern.test(userAgent)) {
      flagAsSuspicious('BOT_USER_AGENT', HIGH)
      return false
    }
  }

  return true
}
```

#### 8.1.4 Behavioral Analysis
```typescript
interface BehaviorPattern {
  // Request patterns
  averageRequestInterval: number,
  requestVariability: number,

  // Data patterns
  fieldCompletionOrder: string[],
  errorRate: number,
  correctionRate: number,

  // Navigation patterns
  backButtonUsage: number,
  tabSwitches: number,
}

function analyzeBehavior(session: IntakeSession): number {
  let suspicionScore = 0

  // Bots tend to have very consistent timing
  if (session.requestVariability < 0.1) {
    suspicionScore += 20
  }

  // Humans make mistakes and corrections
  if (session.correctionRate === 0 && session.steps > 3) {
    suspicionScore += 15
  }

  // Bots fill forms in perfect order
  if (isSequential(session.fieldCompletionOrder)) {
    suspicionScore += 10
  }

  return suspicionScore
}
```

### 8.2 Suspicion Scoring

```typescript
type SuspicionLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

const SUSPICION_THRESHOLDS = {
  LOW: 25,      // 0-25: Normal behavior
  MEDIUM: 50,   // 26-50: Slightly suspicious
  HIGH: 75,     // 51-75: Very suspicious
  CRITICAL: 100 // 76-100: Almost certainly a bot
}

function getSuspicionLevel(score: number): SuspicionLevel {
  if (score >= SUSPICION_THRESHOLDS.CRITICAL) return 'CRITICAL'
  if (score >= SUSPICION_THRESHOLDS.HIGH) return 'HIGH'
  if (score >= SUSPICION_THRESHOLDS.MEDIUM) return 'MEDIUM'
  return 'LOW'
}

function handleSuspiciousActivity(
  session: IntakeSession,
  level: SuspicionLevel
): void {
  switch (level) {
    case 'LOW':
      // Log but allow
      logSecurityEvent(session, 'LOW_SUSPICION', 'LOGGED')
      break

    case 'MEDIUM':
      // Increase rate limits, add delay
      increaseRateLimits(session.ipAddress, 0.5) // 50% reduction
      addArtificialDelay(1000) // 1 second delay
      logSecurityEvent(session, 'MEDIUM_SUSPICION', 'RATE_LIMITED')
      break

    case 'HIGH':
      // Require CAPTCHA, severe rate limiting
      requireCaptcha(session)
      increaseRateLimits(session.ipAddress, 0.2) // 80% reduction
      addArtificialDelay(3000) // 3 second delay
      logSecurityEvent(session, 'HIGH_SUSPICION', 'CHALLENGED')
      break

    case 'CRITICAL':
      // Block session, blacklist IP temporarily
      blockSession(session)
      temporaryIpBan(session.ipAddress, '1h')
      logSecurityEvent(session, 'CRITICAL_SUSPICION', 'BLOCKED')
      alertAdministrators(session)
      break
  }
}
```

---

## 9. Data Validation & Sanitization

### 9.1 Input Validation (Zod Schemas)

```typescript
import { z } from 'zod'

// Email validation
const emailSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .min(5, 'Email too short')
    .max(255, 'Email too long')
    .refine(
      (email) => !DISPOSABLE_EMAIL_DOMAINS.includes(email.split('@')[1]),
      'Disposable email addresses are not allowed'
    ),
  honeypot_field_name: z.string().length(0, 'Invalid field'),
  timestamp: z.number().positive()
})

// Profile details (residential)
const residentialProfileSchema = z.object({
  profileType: z.literal('RESIDENTIAL'),
  firstName: z.string()
    .min(1, 'First name required')
    .max(50, 'First name too long')
    .regex(/^[a-zA-Z\s'-]+$/, 'Invalid characters in first name'),
  lastName: z.string()
    .min(1, 'Last name required')
    .max(50, 'Last name too long')
    .regex(/^[a-zA-Z\s'-]+$/, 'Invalid characters in last name'),
  phone: z.string()
    .regex(/^\+?1?[-.\s]?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})$/, 'Invalid phone format'),
  addressLine1: z.string().min(5).max(100),
  city: z.string().min(2).max(50),
  province: z.string().length(2, 'Invalid province code'),
  postalCode: z.string()
    .regex(/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/, 'Invalid postal code format'),
  country: z.string().length(2).default('CA')
})

// Service details
const serviceDetailsSchema = z.object({
  category: z.enum(['HVAC', 'PLUMBING', 'ELECTRICAL', 'GENERAL']),
  serviceType: z.enum(['REPAIR', 'INSTALLATION', 'MAINTENANCE', 'CONSULTATION']),
  urgency: z.enum(['EMERGENCY', 'URGENT', 'ROUTINE', 'SCHEDULED']),
  description: z.string()
    .min(10, 'Please provide more detail')
    .max(2000, 'Description too long'),
  preferredDate: z.string().datetime().optional()
})
```

### 9.2 Sanitization

```typescript
import sanitizeHtml from 'sanitize-html'

function sanitizeInput(input: string): string {
  // Remove HTML tags
  let sanitized = sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {}
  })

  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '')

  // Normalize whitespace
  sanitized = sanitized.trim().replace(/\s+/g, ' ')

  return sanitized
}

function sanitizePhone(phone: string): string {
  // Remove all non-digit characters except + at start
  return phone.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '')
}

function sanitizeEmail(email: string): string {
  // Lowercase and trim
  return email.toLowerCase().trim()
}
```

---

## 10. Conversion to Authenticated Records

### 10.1 Conversion Process

```typescript
async function convertIntakeToCustomerAndQuote(
  sessionId: string
): Promise<{ customerId: string; quoteId: string }> {

  // 1. Validate session is complete
  const session = await validateSessionForConversion(sessionId)

  // 2. Get target organization (configured default or master org)
  const organization = await getTargetOrganization()

  // 3. Start transaction
  return await prisma.$transaction(async (tx) => {

    // 4. Create Person or Business record
    let personId: string | null = null
    let businessId: string | null = null

    if (session.customerData.profileType === 'RESIDENTIAL') {
      const person = await tx.person.create({
        data: {
          organizationId: organization.id,
          firstName: session.customerData.firstName!,
          lastName: session.customerData.lastName!,
          email: session.customerData.email, // Already encrypted
          phone: session.customerData.phone, // Already encrypted
        }
      })
      personId = person.id
    } else {
      const business = await tx.business.create({
        data: {
          organizationId: organization.id,
          legalName: session.customerData.businessName!,
          email: session.customerData.email,
          phone: session.customerData.businessPhone,
          businessType: 'CORPORATION'
        }
      })
      businessId = business.id
    }

    // 5. Create Customer record
    const customer = await tx.customer.create({
      data: {
        organizationId: organization.id,
        customerNumber: await generateCustomerNumber(organization.id),
        personId,
        businessId,
        tier: 'PERSONAL',
        status: 'PROSPECT', // New from intake
        notes: `Created from public intake. Reference: ${sessionId}`
      }
    })

    // 6. Create Address record
    if (session.customerData.addressLine1) {
      const address = await tx.address.create({
        data: {
          organizationId: organization.id,
          line1: session.customerData.addressLine1,
          line2: session.customerData.addressLine2,
          city: session.customerData.city!,
          stateProvinceId: await getStateProvinceId(
            session.customerData.province!
          ),
          postalCode: session.customerData.postalCode!,
          countryId: await getCountryId(session.customerData.country!)
        }
      })

      await tx.customerAddress.create({
        data: {
          customerId: customer.id,
          addressId: address.id,
          addressType: 'BILLING',
          isPrimary: true
        }
      })
    }

    // 7. Create Quote record
    const quote = await tx.quote.create({
      data: {
        organizationId: organization.id,
        customerId: customer.id,
        createdById: await getSystemUserId(organization.id),
        quoteNumber: await generateQuoteNumber(organization.id),
        description: session.quoteData.description || 'Customer intake request',
        status: 'DRAFT',
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        notes: buildQuoteNotes(session),
        subtotal: 0, // To be filled by staff
        taxAmount: 0,
        total: 0
      }
    })

    // 8. Create audit log entries
    await auditService.logCreate('Customer', customer.id, customer, {
      organizationId: organization.id,
      userId: 'system-intake',
      metadata: { intakeSessionId: sessionId }
    })

    await auditService.logCreate('Quote', quote.id, quote, {
      organizationId: organization.id,
      userId: 'system-intake',
      metadata: { intakeSessionId: sessionId }
    })

    // 9. Update intake session
    await tx.intakeSession.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        convertedAt: new Date(),
        convertedToCustomerId: customer.id,
        convertedToQuoteId: quote.id
      }
    })

    // 10. Send notification email
    await sendCustomerNotification(session.customerData.email, {
      customerNumber: customer.customerNumber,
      quoteNumber: quote.quoteNumber,
      referenceNumber: sessionId
    })

    return {
      customerId: customer.id,
      quoteId: quote.id
    }
  })
}

function buildQuoteNotes(session: IntakeSession): string {
  return `
PUBLIC INTAKE SUBMISSION
========================

Category: ${session.quoteData.category}
Service Type: ${session.quoteData.serviceType}
Urgency: ${session.quoteData.urgency}
Preferred Date: ${session.quoteData.preferredDate || 'Not specified'}

Customer Description:
${session.quoteData.description}

Property Type: ${session.quoteData.propertyType}
Estimated Budget: ${session.quoteData.estimatedBudget}

Intake Session: ${session.id}
Submitted: ${session.convertedAt}
  `.trim()
}
```

---

## 11. Threat Model & Mitigations

### 11.1 Threat Matrix

| Threat | Likelihood | Impact | Mitigation |
|--------|-----------|--------|------------|
| **DDoS Attack** | High | High | Rate limiting, Cloudflare, IP blocking |
| **Bot Spam** | High | Medium | Honeypots, timing analysis, CAPTCHA |
| **SQL Injection** | Medium | Critical | Parameterized queries, input validation |
| **XSS Attacks** | Medium | Medium | Input sanitization, CSP headers |
| **CSRF** | Medium | Medium | Custom headers, origin validation |
| **Data Scraping** | High | Low | Rate limiting, bot detection |
| **Email Harvesting** | Medium | Low | Disposable email blocking, email verification |
| **Fake Submissions** | High | Medium | Multi-layer validation, manual review queue |
| **Session Hijacking** | Low | High | Token hashing, IP binding, HTTPS only |
| **Data Breach** | Low | Critical | Encryption at rest, access controls |

### 11.2 Mitigation Strategies

#### Strategy 1: Defense in Depth
- Multiple independent security layers
- Failure of one layer doesn't compromise entire system
- Each layer provides telemetry for monitoring

#### Strategy 2: Rate Limiting Cascade
```
Layer 1: Global rate limits (infrastructure)
Layer 2: IP-based rate limits (application)
Layer 3: Token-based rate limits (session)
Layer 4: Action-specific rate limits (submission)
```

#### Strategy 3: Progressive Trust
```
New Request (Trust Level 0)
├─ Pass basic validation → Trust Level 1
├─ Complete first step → Trust Level 2
├─ Pass timing analysis → Trust Level 3
├─ Complete multiple steps → Trust Level 4
└─ Final submission → Trust Level 5 (human verified)
```

#### Strategy 4: Abuse Response Escalation
```
First Violation: Warning logged
Second Violation: Rate limit reduced
Third Violation: CAPTCHA required
Fourth Violation: Session blocked
Fifth Violation: IP temporarily banned
Persistent Violations: IP permanently banned
```

---

## 12. Best Practices Research

### 12.1 Industry Analysis

#### Public Form APIs (Typeform, Google Forms, JotForm)

**Common Patterns:**
1. Progressive disclosure (multi-step forms)
2. Session persistence via tokens/cookies
3. Save and resume functionality
4. Real-time validation feedback
5. Mobile-first design

**Security Measures:**
1. Aggressive rate limiting
2. CAPTCHA on suspicious activity
3. Honeypot fields
4. Browser fingerprinting
5. IP reputation checking

**Best Practices Adopted:**
- Multi-step workflow with save/resume
- Cryptographic session tokens
- Progressive data validation
- Mobile-responsive consideration

#### E-commerce Checkout Flows (Shopify, Stripe)

**Common Patterns:**
1. Guest checkout (no account required)
2. Address autocomplete
3. Real-time validation
4. Progress indicators
5. Data persistence

**Security Measures:**
1. PCI compliance (for payments)
2. 3D Secure authentication
3. Fraud detection scoring
4. Device fingerprinting
5. Velocity checking

**Best Practices Adopted:**
- Guest workflow (no authentication)
- Real-time validation
- Fraud scoring (suspicion score)
- Session expiration policies

#### SaaS Onboarding (Slack, Stripe, HubSpot)

**Common Patterns:**
1. Email-first capture
2. Progressive profiling
3. Contextual help
4. Clear value proposition at each step
5. Abandonment recovery emails

**Best Practices Adopted:**
- Email capture as first step
- Progressive data collection
- Clear step indicators
- Abandonment tracking for follow-up

### 12.2 GDPR Compliance Considerations

```typescript
interface GDPRCompliance {
  // Right to Access
  dataExport: 'Provide all collected data in machine-readable format',

  // Right to Erasure
  dataeDeletion: 'Delete all session data on request',
  deletionTimeline: '30 days from request',

  // Right to Rectification
  dataCorrection: 'Allow correction of submitted data before completion',

  // Data Retention
  completedSessions: '7 days retention for completed sessions',
  abandonedSessions: '90 days retention for abandoned sessions',
  expiredSessions: 'Delete immediately after expiration',

  // Consent Management
  explicitConsent: 'Checkboxes for privacy policy and terms',
  marketingConsent: 'Separate opt-in for marketing',
  consentWithdrawal: 'Easy withdrawal mechanism',

  // Data Minimization
  principle: 'Only collect data necessary for quote generation',

  // Security
  encryption: 'Encrypt all PII at rest and in transit',
  accessControl: 'Limit access to intake data to authorized personnel',

  // Breach Notification
  timeline: '72 hours notification if breach affects intake data'
}
```

---

## 13. Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Database schema implementation
- [ ] Token generation and validation system
- [ ] Basic session management service
- [ ] Core security middleware (rate limiting, token validation)

### Phase 2: Workflow Engine (Week 2)
- [ ] Step validation logic
- [ ] State machine implementation
- [ ] Data persistence services
- [ ] Progress tracking

### Phase 3: Security Hardening (Week 3)
- [ ] Bot detection implementation
- [ ] Honeypot fields
- [ ] Timing analysis
- [ ] Suspicion scoring
- [ ] IP blocking system

### Phase 4: Conversion Logic (Week 4)
- [ ] Customer creation from intake
- [ ] Quote creation from intake
- [ ] Address linking
- [ ] Notification system
- [ ] Audit logging integration

### Phase 5: Testing & Optimization (Week 5)
- [ ] Unit tests (80% coverage)
- [ ] Integration tests
- [ ] Load testing
- [ ] Security testing
- [ ] Performance optimization

### Phase 6: Monitoring & Documentation (Week 6)
- [ ] Monitoring dashboards
- [ ] Alert configuration
- [ ] Admin review queue
- [ ] API documentation
- [ ] Integration guide for frontend

---

## Conclusion

This design provides a comprehensive, production-ready solution for a public customer and quote intake workflow. The multi-layered security approach ensures protection against common attack vectors while maintaining a smooth user experience for legitimate customers.

Key innovations:
1. **Progressive workflow** reduces abandonment
2. **Token-based sessions** enable stateless scaling
3. **Multi-tier rate limiting** prevents abuse without impacting legitimate users
4. **Behavioral analysis** provides sophisticated bot detection
5. **Clean conversion** to authenticated records preserves data integrity

The implementation prioritizes security without sacrificing usability, making it suitable for high-traffic public deployments.