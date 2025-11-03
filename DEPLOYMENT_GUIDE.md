# Deployment Guide for GDPR Compliance

This guide walks you through deploying the GDPR compliance features to production.

## Overview

The GDPR implementation includes:
- 3 mandatory webhook handlers
- 1 database migration (GdprRequest table)
- 1 UI compliance dashboard
- Updated app/uninstalled webhook
- GDPR utility functions

## Prerequisites

Before deploying:
- ✅ Code has been pushed to your repository
- ✅ Vercel (or hosting provider) is connected to your repo
- ✅ You have access to your production database
- ✅ Shopify CLI is installed and authenticated
- ✅ You're on the branch: `claude/review-agreement-check-011CUmPWmko1bmk617V1pStn`

---

## Step 1: Run Database Migration

The migration creates the `GdprRequest` table for tracking compliance requests.

### Option A: Automated Migration (Production Database)

If your hosting provider runs migrations automatically:

```bash
# Vercel will run this automatically on deployment:
npm run build
```

The build script includes: `npx prisma generate && prisma migrate deploy`

### Option B: Manual Migration

If you need to run the migration manually:

```bash
# Connect to production database
# Set DATABASE_URL environment variable first
export DATABASE_URL="postgresql://user:password@host:5432/database"

# Run the migration
npx prisma migrate deploy

# Verify the migration
npx prisma db pull
```

### Verify Migration Success

Check that the table was created:

```sql
-- Run this query in your database
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name = 'GdprRequest';

-- Should return: GdprRequest
```

Or check the table structure:

```sql
\d "GdprRequest"

-- Expected columns:
-- id, shop, requestType, ordersRequested, customerId,
-- customerEmail, customerPhone, payload, status,
-- processedAt, createdAt, updatedAt
```

---

## Step 2: Deploy Code to Production

### Vercel Deployment (Automatic)

If using Vercel with GitHub integration:

```bash
# Merge your branch to main (or your production branch)
git checkout main
git merge claude/review-agreement-check-011CUmPWmko1bmk617V1pStn
git push origin main

# Vercel will automatically deploy
# Watch the deployment at: https://vercel.com/[your-account]/always-receptionist
```

### Vercel Deployment (Manual)

If deploying manually:

```bash
# Install Vercel CLI (if not already installed)
npm install -g vercel

# Deploy to production
vercel --prod

# Follow the prompts
```

### Other Hosting Providers

For Railway, Render, Fly.io, etc.:

```bash
# Build the application
npm run build

# Deploy according to your provider's instructions
# Ensure these environment variables are set:
# - DATABASE_URL
# - SHOPIFY_API_KEY
# - SHOPIFY_API_SECRET
# - VAPI_PRIVATE_KEY
```

---

## Step 3: Register Webhooks with Shopify

This step registers the GDPR webhooks in the Shopify Partner Dashboard.

### Using Shopify CLI (Recommended)

```bash
# Navigate to your project directory
cd /path/to/Always-Receptionist

# Ensure you're on the correct branch
git branch
# Should show: * claude/review-agreement-check-011CUmPWmko1bmk617V1pStn

# Deploy the webhook configuration
shopify app deploy

# You'll see output like:
# ✓ Deploying to Shopify...
# ✓ Registered webhooks:
#   - app/uninstalled
#   - app/scopes_update
#   - customers/data_request ✨ NEW
#   - customers/redact ✨ NEW
#   - shop/redact ✨ NEW
```

### Verify Webhook Registration

#### Option A: Shopify CLI

```bash
shopify app config webhook list

# Expected output:
# Webhooks:
#   app/uninstalled → https://always-receptionist.vercel.app/webhooks/app/uninstalled
#   app/scopes_update → https://always-receptionist.vercel.app/webhooks/app/scopes_update
#   customers/data_request → https://always-receptionist.vercel.app/webhooks/customers/data_request
#   customers/redact → https://always-receptionist.vercel.app/webhooks/customers/redact
#   shop/redact → https://always-receptionist.vercel.app/webhooks/shop/redact
```

#### Option B: Shopify Partner Dashboard

1. Go to: https://partners.shopify.com/
2. Navigate to: **Apps** → **[Your App]** → **Configuration**
3. Scroll to: **Webhooks** section
4. Verify you see:
   - ✅ customers/data_request
   - ✅ customers/redact
   - ✅ shop/redact

---

## Step 4: Test the Deployment

### Test 1: Verify App Loads

```bash
# Open your test store
open "https://[your-test-store].myshopify.com/admin/apps/always-receptionist"

# You should see:
# - Home page loads without errors
# - "GDPR Compliance" link in navigation
```

### Test 2: Check Compliance Dashboard

Navigate to: `/app/compliance`

**Expected Result**:
- Page loads successfully
- Shows "No GDPR requests" message (if no requests yet)
- Statistics show all zeros
- Resources section displays correctly

### Test 3: Test Webhooks

Follow the [GDPR Testing Guide](./GDPR_TESTING_GUIDE.md) to test each webhook:

```bash
# Test customers/data_request
shopify webhook trigger --topic customers/data_request

# Test customers/redact
shopify webhook trigger --topic customers/redact

# Test shop/redact
shopify webhook trigger --topic shop/redact
```

### Test 4: Check Production Logs

**Vercel Logs**:
```bash
# View real-time logs
vercel logs --follow

# Or visit: https://vercel.com/[your-account]/always-receptionist/logs
```

Look for:
- ✅ No deployment errors
- ✅ Webhook requests being received
- ✅ GDPR requests being logged
- ✅ No database connection errors

---

## Step 5: Update App Listing (Shopify Partner Dashboard)

### Add Privacy Policy URL

1. Go to: https://partners.shopify.com/
2. Navigate to: **Apps** → **[Your App]** → **App setup**
3. Scroll to: **App information** section
4. Update **Privacy policy URL**:
   ```
   https://always-receptionist.vercel.app/privacy-policy
   ```
   *(Or host PRIVACY_POLICY.md on your own domain)*

### Add Terms of Service URL

5. Update **Terms of Service URL**:
   ```
   https://always-receptionist.vercel.app/terms-of-service
   ```
   *(Or host TERMS_OF_SERVICE.md on your own domain)*

### Update App Description

6. Update **App description** to mention GDPR compliance:
   ```
   ALWAYS Receptionist is a GDPR-compliant AI voice assistant for your Shopify store.

   Features:
   - Answer customer calls 24/7 with AI
   - Automatic product information lookup
   - Order status checking
   - Full GDPR compliance with automatic data deletion
   - Merchant dashboard for compliance tracking
   ```

---

## Step 6: Final Verification

### Pre-Submission Checklist

Before submitting to the Shopify App Store:

#### Technical Requirements
- [ ] All webhooks registered (verify in Partner Dashboard)
- [ ] Database migration completed successfully
- [ ] App deployed to production (Vercel/hosting)
- [ ] No errors in production logs
- [ ] Compliance dashboard loads correctly

#### GDPR Compliance
- [ ] `customers/data_request` webhook tested ✅
- [ ] `customers/redact` webhook tested ✅
- [ ] `shop/redact` webhook tested ✅
- [ ] All webhooks return 200 OK
- [ ] Data deletion verified (no orphaned records)
- [ ] GdprRequest audit trail working

#### Documentation
- [ ] Privacy Policy published
- [ ] Terms of Service published
- [ ] Privacy Policy URL added to app listing
- [ ] Terms of Service URL added to app listing
- [ ] Support email address provided

#### UI/UX
- [ ] Compliance dashboard accessible
- [ ] Navigation menu includes "GDPR Compliance"
- [ ] Request history displays correctly
- [ ] No console errors in browser
- [ ] Mobile-responsive design works

---

## Troubleshooting

### Issue: Migration Fails with "Table already exists"

**Solution**:
```bash
# Mark the migration as applied without running it
npx prisma migrate resolve --applied 20251103205632_add_gdpr_compliance
```

### Issue: Webhooks Not Appearing in Partner Dashboard

**Solution**:
```bash
# Re-deploy webhook configuration
shopify app deploy

# If that doesn't work, try:
shopify app config push
```

### Issue: Webhook Returns 404

**Causes**:
1. Route file not deployed to production
2. URL in shopify.app.toml is incorrect
3. Hosting provider didn't rebuild

**Solution**:
```bash
# Check the deployed routes
vercel ls

# Force a new deployment
git commit --allow-empty -m "Force rebuild"
git push origin main
```

### Issue: Database Connection Errors

**Check**:
1. `DATABASE_URL` environment variable is set in Vercel
2. Database allows connections from Vercel IPs
3. Database user has correct permissions
4. SSL mode is configured correctly

**Solution**:
```bash
# Test database connection
DATABASE_URL="your-connection-string" npx prisma db pull
```

### Issue: "Shop not found" errors

**Cause**: Shop domain mismatch (case-sensitivity)

**Solution**:
```sql
-- Check shop format in database
SELECT DISTINCT shop FROM "Session";

-- Should be: example.myshopify.com (lowercase)
-- NOT: Example.myshopify.com
```

---

## Rollback Procedure

If you need to rollback the deployment:

### Step 1: Revert Code

```bash
# Revert to previous commit
git revert af661b8  # The migration commit
git revert 54b095a  # The GDPR implementation commit
git push origin main
```

### Step 2: Rollback Migration (if necessary)

```bash
# This should only be done if there are issues
# and no production data has been created yet

# Connect to database
export DATABASE_URL="your-connection-string"

# Drop the table
npx prisma migrate reset --skip-seed

# Or manually:
# DROP TABLE "GdprRequest";
```

### Step 3: Re-deploy Previous Version

```bash
# Vercel will automatically deploy the reverted code
# Monitor logs to ensure it works
```

---

## Production Monitoring

### Set Up Monitoring

#### Vercel Alerts

1. Go to: https://vercel.com/[your-account]/always-receptionist/settings/alerts
2. Enable alerts for:
   - Deployment failures
   - High error rates (> 1%)
   - Slow response times (> 5s)

#### Database Monitoring

Create a script to check for stale GDPR requests:

```sql
-- Find requests pending for > 24 hours
SELECT * FROM "GdprRequest"
WHERE status = 'pending'
AND "createdAt" < NOW() - INTERVAL '24 hours';

-- Alert if any rows returned
```

#### Webhook Health Check

Monitor webhook delivery in Shopify Partner Dashboard:
1. Go to: **Apps** → **[Your App]** → **Configuration** → **Webhooks**
2. Check "Delivery success rate" (should be > 99%)

### Regular Maintenance

**Weekly**:
- Check Vercel logs for errors
- Review GDPR request status (all should be "completed")
- Verify webhook success rate

**Monthly**:
- Audit database for orphaned records
- Review compliance dashboard with test data
- Update documentation if needed

---

## Next Steps

After successful deployment:

1. **Test with Real Store**: Install the app on a development store and test end-to-end
2. **Submit to App Store**: Follow Shopify's app review process
3. **Monitor Initial Installs**: Watch for any errors during first installs
4. **Customer Support**: Prepare support team for GDPR-related questions

---

## Support

If you encounter issues during deployment:

**Technical Issues**:
- Check logs: `vercel logs --follow`
- Review database: `npx prisma studio`
- Test webhooks: See [GDPR_TESTING_GUIDE.md](./GDPR_TESTING_GUIDE.md)

**Questions**:
- Email: support@always-receptionist.com
- Documentation: See README.md

---

## Summary

You've successfully deployed:
✅ GDPR-compliant webhook handlers
✅ Database schema for compliance tracking
✅ Merchant-facing compliance dashboard
✅ Privacy Policy and Terms of Service
✅ Comprehensive testing and monitoring

**Your app is now ready for Shopify App Store submission!** 🎉
