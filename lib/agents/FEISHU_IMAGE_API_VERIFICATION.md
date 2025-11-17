# Feishu Image API Verification Guide

## Current Implementation

The image upload function uses:
```typescript
client.im.v1.image.create({
  data: {
    image_type: "message" | "card",
    image: Buffer,
  },
})
```

## ⚠️ Action Required: Verify API Path

The exact API path needs to be verified. Check one of:

### Option 1: Check SDK Documentation
```bash
# Look for image upload methods
grep -r "image" node_modules/@larksuiteoapi/node-sdk/types/index.d.ts
```

### Option 2: Check Feishu OpenAPI Docs
Visit: https://open.feishu.cn/api-explorer
- Search for "image" or "upload image"
- Look for endpoint: `/open-apis/im/v1/images`

### Option 3: Test Different API Paths

Try these variations:

```typescript
// Option A
client.im.v1.image.create({ ... })

// Option B  
client.im.image.create({ ... })

// Option C
client.file.image.create({ ... })

// Option D
client.im.v1.images.create({ ... })
```

## Expected Response Format

```typescript
{
  success: true,
  data: {
    image_key: "img_xxxxx" // Use this in messages/cards
  }
}
```

## Alternative: Direct HTTP Request

If SDK doesn't have the method, use direct HTTP:

```typescript
import FormData from 'form-data';
import axios from 'axios';

async function uploadImageDirect(imageBuffer: Buffer) {
  // Get tenant access token
  const tokenResp = await axios.post(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal/',
    {
      app_id: process.env.FEISHU_APP_ID,
      app_secret: process.env.FEISHU_APP_SECRET,
    }
  );
  
  const token = tokenResp.data.tenant_access_token;
  
  // Upload image
  const form = new FormData();
  form.append('image_type', 'message');
  form.append('image', imageBuffer, { filename: 'heatmap.png' });
  
  const uploadResp = await axios.post(
    'https://open.feishu.cn/open-apis/im/v1/images',
    form,
    {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${token}`,
      },
    }
  );
  
  return uploadResp.data.data.image_key;
}
```

## Verification Steps

1. **Check SDK Types**: Look at `node_modules/@larksuiteoapi/node-sdk/types/index.d.ts`
2. **Search for "image"**: Find image-related methods
3. **Test API**: Try the method and check response
4. **Update Code**: Fix `lib/feishu-image-utils.ts` with correct API path

## Once Verified

Update `lib/feishu-image-utils.ts` with the correct API path and remove the `(client as any)` cast.

