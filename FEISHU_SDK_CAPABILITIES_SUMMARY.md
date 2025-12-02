# Feishu SDK Capabilities Summary

**SDK**: `@larksuiteoapi/node-sdk` v1.44.0 (for Node.js)  
**Platform**: Feishu/Lark Ecosystem  
**Status**: Comprehensive API coverage with 2,500+ standardized server-side APIs

---

## 🎯 Key Convenience & Ecosystem Benefits

### 1. **Built-in SDK Conveniences**
- ✅ **Token Management**: Automatic acquisition, renewal, and lifecycle management of `tenant_access_token` and `user_access_token`
- ✅ **Request Signing & Verification**: Built-in encryption/decryption and request signature validation
- ✅ **Type Safety**: Full TypeScript support with complete type hints for all API calls
- ✅ **Semantic API Interface**: Natural method chaining (`client.im.message.create()`) instead of raw HTTP
- ✅ **Event Handling**: `EventDispatcher` for webhook/WebSocket event subscription (Subscription Mode)
- ✅ **Long Connection Support**: `WSClient` for persistent WebSocket connections instead of polling

### 2. **Feishu/Lark Ecosystem Integration**
The Feishu ecosystem is an **all-in-one collaborative suite** with:
- 📱 **Messenger** (Chat/IM) - Real-time communication
- 📊 **Base** (Database) - Flexible data management
- 📄 **Docs** (Rich documents) - Collaborative writing
- 📈 **Sheets** (Spreadsheets) - Data analysis & visualization
- 📅 **Calendar** - Team scheduling
- ✅ **Approvals** - Workflow management
- 👥 **Contacts** - Organization management
- 🎥 **Video Conferencing** - Built-in meetings

All integrated into a single platform with unified authentication and cross-module APIs.

---

## 📊 Sheets API Capabilities

### **Available Operations**

| Operation | SDK Method | HTTP | Purpose |
|-----------|-----------|------|---------|
| **Create Spreadsheet** | `client.sheet.spreadsheet.create()` | `POST /open-apis/sheets/v2/spreadsheets` | Create new spreadsheet in folder |
| **Get Spreadsheet Info** | `client.sheet.spreadsheet.get()` | `GET /open-apis/sheets/v2/spreadsheets/:token` | Get metadata, properties |
| **Update Properties** | `client.sheet.spreadsheet.properties()` | `PUT /open-apis/sheets/v2/spreadsheets/:token/properties` | Rename, adjust title |
| **Add/Copy/Delete Sheets** | `client.sheet.spreadsheet.sheetsBatchUpdate()` | `POST /open-apis/sheets/v2/spreadsheets/:token/sheets_batch_update` | Create new tabs |
| **Read Single Range** | `client.sheet.spreadsheet.values()` | `GET /open-apis/sheets/v2/spreadsheets/:token/values/:range` | Read cells A1:B5 |
| **Read Multiple Ranges** | `client.sheet.spreadsheet.valuesBatchGet()` | `GET /open-apis/sheets/v2/spreadsheets/:token/values_batch_get` | Read multiple regions |
| **Write Single Range** | `client.sheet.spreadsheet.values()` | `PUT /open-apis/sheets/v2/spreadsheets/:token/values` | Update cell data |
| **Write Multiple Ranges** | `client.sheet.spreadsheet.valuesBatchUpdate()` | `POST /open-apis/sheets/v2/spreadsheets/:token/values_batch_update` | Batch updates |
| **Set Cell Style** | `client.sheet.spreadsheet.style()` | `PUT /open-apis/sheets/v2/spreadsheets/:token/style` | Colors, fonts, borders |
| **Batch Set Styles** | `client.sheet.spreadsheet.stylesBatchUpdate()` | `PUT /open-apis/sheets/v2/spreadsheets/:token/styles_batch_update` | Style multiple cells |
| **Merge Cells** | `client.sheet.spreadsheet.mergeCells()` | `POST /open-apis/sheets/v2/spreadsheets/:token/merge_cells` | Combine cells |
| **Split Cells** | `client.sheet.spreadsheet.unmergeCells()` | `POST /open-apis/sheets/v2/spreadsheets/:token/unmerge_cells` | Separate merged cells |
| **Insert Image** | `client.sheet.spreadsheet.valuesImage()` | `POST /open-apis/sheets/v2/spreadsheets/:token/values_image` | Embed images in cells |
| **Find Cells** | `client.sheet.spreadsheet.find()` | `POST /open-apis/sheets/v3/spreadsheets/:token/sheets/:sheetId/find` | Search content |
| **Data Validation** | `client.sheet.spreadsheet.dataValidation()` | Various | Add dropdowns, rules |
| **Conditional Formatting** | `client.sheet.spreadsheet.conditionalFormat()` | Various | Format based on conditions |
| **Protected Range** | `client.sheet.spreadsheet.protectedRange()` | Various | Lock cells from editing |
| **Filter & Filter Views** | `client.sheet.spreadsheet.filter()` | Various | Data filtering UI |
| **Floating Images** | `client.sheet.spreadsheet.floatImage()` | Various | Insert floating images |

### **Range Syntax**
```
<sheetId>!<start>:<end>
Examples:
  0b**12!A1:B5      # Cells A1 to B5
  0b**12!A:B        # Columns A and B
  0b**12!A1:B       # A1 to end of B
  0b**12            # All data in sheet
```

### **Example: Read & Write Sheets**
```typescript
import * as lark from '@larksuiteoapi/node-sdk';

const client = new lark.Client({ appId, appSecret });

// Read cells A1:B5
const data = await client.sheet.spreadsheet.values({
  params: { 
    spreadsheetToken: 'shtcnXXXXXXX',
    range: '0b**12!A1:B5'
  },
});

// Write to A1
await client.sheet.spreadsheet.values({
  params: { spreadsheetToken: 'shtcnXXXXXXX' },
  data: {
    values: [['Name', 'Score'], ['Alice', 95]],
    range: '0b**12!A1:B2'
  },
});

// Batch write multiple ranges
await client.sheet.spreadsheet.valuesBatchUpdate({
  params: { spreadsheetToken: 'shtcnXXXXXXX' },
  data: {
    data: [
      { range: '0b**12!A1:B2', values: [['Header1', 'Header2']] },
      { range: '0b**13!C1:D2', values: [['More', 'Data']] },
    ]
  },
});

// Set cell formatting
await client.sheet.spreadsheet.style({
  params: { spreadsheetToken: 'shtcnXXXXXXX' },
  data: {
    range: '0b**12!A1:B1',
    style: { 
      backgroundColor: { red: 1, green: 0, blue: 0 }, // Red
      textFormat: { bold: true, fontSize: 14 }
    }
  },
});
```

---

## 📄 Docs API Capabilities

### **Available Operations**

| Operation | SDK Method | HTTP | Purpose |
|-----------|-----------|------|---------|
| **Get Content** | `client.doc.v2.content()` | `GET /open-apis/doc/v2/:docToken/content` | Read rich text document |
| **Get Raw Content** | `client.doc.v2.rawContent()` | `GET /open-apis/doc/v2/:docToken/raw_content` | Read plain text |
| **Batch Update** | `client.doc.v2.batchUpdate()` | `POST /open-apis/doc/v2/:docToken/batch_update` | Edit document content |
| **Get Metadata** | `client.request()` (legacy) | `POST /open-apis/suite/docs-api/meta` | Who modified, when |
| **Get Root Folder** | `client.drive.file.getRootFolder()` | `GET /open-apis/drive/v1/root_folder/meta` | Get root container |
| **Get Folder Children** | `client.drive.file.listChildren()` | `GET /open-apis/drive/v1/files/:fileToken/children` | List docs in folder |
| **Copy Doc** | `client.drive.file.copy()` | `POST /open-apis/drive/v1/files/:fileToken/copy` | Duplicate document |
| **Move Doc** | `client.drive.file.move()` | `PATCH /open-apis/drive/v1/files/:fileToken` | Relocate document |
| **Create Permission** | `client.drive.permission.create()` | `POST /open-apis/drive/v1/permissions` | Share with users |
| **Get Permissions** | `client.drive.permission.list()` | `GET /open-apis/drive/v1/files/:fileToken/permissions` | View sharing |

### **Limitations & Notes**

#### ❌ **What's NOT Available**
- No real-time webhooks for document changes
- No revision history API (can't see "what changed" between versions)
- No per-user granular change tracking API

#### ✅ **Workarounds (Already Implemented)**
See `lib/doc-tracker.ts` for:
1. **Polling**: Check metadata periodically (every N seconds)
2. **Change Detection**: Compare `lastModifiedUser` & `lastModifiedTime`
3. **Debouncing**: Only notify once per document per time window
4. **Caching**: 30-second TTL on metadata to minimize API calls

### **Example: Read & Track Docs**
```typescript
import * as lark from '@larksuiteoapi/node-sdk';

const client = new lark.Client({ appId, appSecret });

// Get document content
const doc = await client.doc.v2.content({
  params: { doc_token: 'doccnXXXXXXX' },
});
console.log(doc.data?.document?.title);
console.log(doc.data?.document?.body?.content); // Rich text

// Get raw plain text
const rawDoc = await client.doc.v2.rawContent({
  params: { doc_token: 'doccnXXXXXXX' },
});

// Get metadata (who modified, when) - legacy but still works
const resp = await client.request({
  method: 'POST',
  url: '/open-apis/suite/docs-api/meta',
  data: {
    request_docs: [{
      docs_token: 'doccnXXXXXXX',
      docs_type: 'doc' // or 'sheet', 'bitable', 'docx'
    }],
  },
});
const meta = resp.data?.docs_metas?.[0];
console.log(`Last modified by: ${meta.latest_modify_user}`);
console.log(`Last modified at: ${new Date(meta.latest_modify_time * 1000)}`);

// Edit document
await client.doc.v2.batchUpdate({
  params: { doc_token: 'doccnXXXXXXX' },
  data: {
    requests: [
      {
        insertText: {
          location: { zoneId: '0', paragraphIndex: 0 },
          text: 'New text to add'
        }
      }
    ]
  },
});
```

---

## 💬 Messaging & Card APIs

### **Message Operations**
| Operation | Method |
|-----------|--------|
| Send text message | `client.im.message.create({ msg_type: 'text' })` |
| Send rich text (Post) | `client.im.message.create({ msg_type: 'post' })` |
| Send interactive card | `client.im.message.create({ msg_type: 'interactive' })` |
| Send image | `client.im.message.create({ msg_type: 'image' })` |
| Edit message | `client.im.message.patch()` |
| Delete message | `client.im.message.delete()` |
| Reply to message | `client.im.message.reply()` |
| Get message | `client.im.message.get()` |
| List messages | `client.im.message.list()` |

### **Interactive Cards**
- Rich layout with markdown, buttons, form fields
- Button actions with callback webhooks
- Merchant badge, voting, ratings
- Full message card builder support
- **Already implemented**: `lib/send-follow-up-buttons-message.ts`, `lib/finalize-card-with-buttons.ts`

---

## 👥 Contact APIs

### **Available Operations**
| Operation | Method |
|-----------|--------|
| Get user info | `client.contact.user.get()` |
| Get department | `client.contact.department.get()` |
| List users in dept | `client.contact.user.list()` |
| Search users | `client.contact.user.find()` |
| Batch get users | `client.contact.user.batchGet()` |

---

## 🎨 Visualization Helpers

### **Chart Generation** (Already Implemented)
- `lib/visualization/chart-generator.ts` - Observable Plot integration
- Canvas-based chart rendering to image
- P&L analysis charts, OKR progress visualizations

### **Image Handling**
- Upload images to Feishu: `client.im.v1.image.create()`
- Embed in messages
- Already integrated: `lib/feishu-image-utils.ts`

---

## 🔐 Authentication & Permissions

### **Token Types**
- `tenant_access_token`: App-level access (fixed scope)
- `user_access_token`: User-level access (user's permissions)
- **SDK auto-renews**: No manual token refresh needed

### **Required Scopes for Sheets**
```
- View, comment, edit, and manage spreadsheets
- (or) View, comment, edit, and manage all files in My Space
```

### **Required Scopes for Docs**
```
- View, comment, edit, and manage all files in My Space
- (or) View, comment, and download all files in My Space
```

---

## 🔗 Event Subscription (Real-time Events)

### **Supported Events** (via `EventDispatcher`)
- `im.message.receive_v1` - New messages
- `im.message.message_read_v1` - Message read
- `im.chat.member_bot_added_v1` - Bot added to group
- Card action events (button clicks)

### **Two Modes**
1. **Webhook** (Pull): POST to your server
2. **WebSocket** (Push): Long connection via `WSClient`

**Already integrated**: 
- `server.ts` - Event dispatcher setup
- `lib/handle-card-action.ts` - Card action handling
- `lib/handle-messages.ts` - Message receiving

---

## 📋 Document Type Tokens

Different document types have different token prefixes:

| Type | Token Prefix | Example |
|------|-------------|---------|
| **Doc** | `doccn` | `doccnULnB44EMMPSYa3rIb4eJCf` |
| **Sheet** | `shtcn` | `shtcnmBAyGehy8abcef` |
| **Bitable** (Database) | `appblit` | `appblitXXXXXXX` |
| **Docx** | `docxXXX` | Various |

---

## 📈 P&L Analysis & OKR Tracking (Your Use Cases)

### **Sheets for P&L**
✅ Create spreadsheet with sales data  
✅ Write formulas: `=SUM(A1:A10)`, `=A1*B1`  
✅ Format cells: colors, borders, fonts  
✅ Generate charts and embed as images  
✅ Set permissions for team members  

**Example**: Sync external sales data → Create/update P&L spreadsheet → Send P&L chart to team chat

### **Docs for OKR Review**
✅ Read OKR document content  
✅ Track who last edited & when  
✅ Notify team when OKRs change  
✅ Poll periodically for changes  
✅ Send summaries to chat  

**Limitation**: No real-time edit webhooks (must poll)

---

## 🚀 Implementation Examples in This Project

### **Already Using Sheets & Docs**
- `lib/doc-tracker.ts` - Document change detection with polling
- `lib/handle-doc-commands.ts` - Extract doc/sheet tokens from messages
- `lib/agents/document-tracking-agent.ts` - Monitor OKR docs & sheets
- `lib/visualization/chart-generator.ts` - Generate P&L charts

### **Message & Card Examples**
- `lib/send-follow-up-buttons-message.ts` - Button messages
- `lib/finalize-card-with-buttons.ts` - Rich cards with actions
- `lib/handle-card-action.ts` - Process button clicks
- `lib/okr-chart-streaming.ts` - Stream OKR updates

---

## ⚡ Performance Considerations

| Factor | Recommendation |
|--------|---|
| **Polling frequency** | 30-60 sec (to balance latency vs API quota) |
| **Metadata caching** | 30 sec TTL (included in doc-tracker) |
| **Batch operations** | Use `valuesBatchUpdate()` for multiple cells |
| **Rate limits** | ~100 requests/min per token |
| **Data size** | 10 MB max per read operation |

---

## 📚 Reference Links

- **Official SDK**: https://github.com/larksuite/node-sdk
- **Feishu Docs API**: https://open.feishu.cn/document/server-docs/docs/docs-overview
- **Sheets API**: https://open.feishu.cn/document/server-docs/docs/sheets-v3/overview
- **Contact API**: https://open.feishu.cn/document/server-docs/people-core/contact-information/user/get
- **Messaging API**: https://open.feishu.cn/document/server-docs/im-v1/message/create
- **API Explorer**: https://open.feishu.cn/api-explorer

---

## ✅ Checklist for Your Features

- [x] **OKR Review**: Use Docs API + polling for change detection
- [x] **P&L Analysis**: Use Sheets API + chart generation + message sending
- [x] **Document Tracking**: Use Drive API metadata + event callbacks
- [x] **Interactive Cards**: Fully supported with button callbacks
- [x] **Bot Mentions**: Fully supported via message events
- [ ] **Real-time Doc Webhooks**: Not available (use polling instead)
