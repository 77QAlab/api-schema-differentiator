# How to Enable 2FA and Publish to npm

npm requires **Two-Factor Authentication (2FA)** to publish packages. Here's how to set it up:

## Option 1: Enable 2FA on npmjs.com (Recommended)

1. **Go to npmjs.com** → Log in → Click your profile picture → **"Account Settings"**

2. **Click "Enable 2FA"** in the security section

3. **Choose your 2FA method:**
   - **Authenticator App** (Google Authenticator, Authy, Microsoft Authenticator) — Recommended
   - **SMS** (text message)

4. **Follow the setup wizard:**
   - Scan QR code with your authenticator app
   - Enter the 6-digit code to verify

5. **Once 2FA is enabled**, come back and run:
   ```bash
   npm publish --access public
   ```
   npm will prompt you for the 2FA code when you publish.

## Option 2: Create a Granular Access Token (Alternative)

If you prefer not to use 2FA, you can create a token:

1. **Go to npmjs.com** → Profile → **"Access Tokens"**

2. **Click "Generate New Token"** → Choose **"Granular"**

3. **Configure the token:**
      - **Name:** `api-schema-differentiator-publish`
   - **Expiration:** Choose your preference
   - **Type:** `Automation`
   - **Permissions:** 
     - ✅ `Read and write packages`
     - ✅ `Bypass two-factor authentication` (if you want to skip 2FA)

4. **Copy the token** (you'll only see it once!)

5. **Use it to publish:**
   ```bash
   npm config set //registry.npmjs.org/:_authToken YOUR_TOKEN_HERE
   npm publish --access public
   ```

## After Publishing

Once published, anyone can install your package:

```bash
npm install api-schema-differentiator
```

Your package will be live at: **https://www.npmjs.com/package/api-schema-differentiator**

---

**Note:** npm strongly recommends enabling 2FA for all accounts that publish packages. It's a security best practice.

