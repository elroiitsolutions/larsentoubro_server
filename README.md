# Larsen & Toubro Tool Management System — Backend Architecture & API Ownership

This backend serves as the unified REST API backend for both the **Web Application** (`client/`) and the **Mobile App** (`larsentoubro-app/`).

To facilitate maintenance, debugging, and feature development across pair-programming and multi-developer teams, all routes, controllers, and services follow a standardized **Code Ownership Convention**.

---

## 1. Code Ownership Annotation Convention

Every route file, controller, and service contains explicit ownership tags in JSDoc comments:

| Tag | Meaning | Guidelines |
|---|---|---|
| `[SHARED]` | Used by **both** the Web Application and the Mobile App. | Modifications affect both platforms. Avoid changing response contracts or status codes without updating both frontends. |
| `[WEB]` | Used **exclusively** by the Web Application. | Endpoints supporting desktop-only features (e.g., Excel bulk wizards, document downloads, SSE active user tracking). |
| `[APP]` | Used **exclusively** by the Mobile App. | Endpoints catering specifically to mobile workflows (e.g., batch tool QR scans, direct mobile challan cancellations). |
| `[NEEDS VERIFICATION]` | Ownership cannot be definitively verified. | Used temporarily until empirical trace or automated tests confirm active client callers. |

### Comment Format Standard

#### Route Definitions (`src/routes/*.routes.js`)
```javascript
/**
 * [SHARED] POST /api/challans/delivery - Issue tools via Delivery Challan (DC)
 * Consumed by: Web (challans/new.tsx) and Mobile (features/challans/services/challanService.ts)
 */
router.post('/delivery', challanController.createDeliveryChallan);
```

#### Controllers (`src/controllers/*.controller.js`)
```javascript
/**
 * [SHARED] getDashboardStats - Calculate total counts, category distribution, DC/RC status, and alerts
 */
export const getDashboardStats = async (req, res, next) => { ... };
```

#### Services (`src/services/*.service.js`)
```javascript
/**
 * [APP] getToolsByIds - Batch query tools by array of tool ObjectIds
 * Exclusively consumed by Mobile App (larsentoubro-app/src/features/tools/services/toolService.ts).
 */
const getToolsByIds = async (toolIds) => { ... };
```

---

## 2. API Inventory Matrix

### A. Authentication, Users & Sessions (`/api/users`)

| Method | Endpoint | Ownership | Consumed By (Web / Mobile) | Description |
|---|---|---|---|---|
| `POST` | `/api/users/login` | `[SHARED]` | Web `auth.service.ts` / Mobile `authService.ts` | Authenticates username/password & issues 7-day JWT. |
| `POST` | `/api/users/guest-login` | `[SHARED]` | Web `auth.service.ts` / Mobile `authService.ts` | Instant guest token for tool QR scanning & validity lookup. |
| `POST` | `/api/users/logout` | `[WEB]` | Web `auth.service.ts` | Revokes server session and cleans cookies. |
| `GET` | `/api/users/events` | `[WEB]` | Web client SSE listener | Server-Sent Events stream for realtime multi-device login alerts. |
| `GET` | `/api/users/login-request/:requestId` | `[SHARED]` | Web `auth.service.ts` / Mobile `authService.ts` | Polls multi-device approval status. |
| `GET` | `/api/users/login-requests/pending` | `[SHARED]` | Web `auth.service.ts` / Mobile `authService.ts` | Admin list of pending login requests needing approval. |
| `POST` | `/api/users/login-requests/:requestId/approve` | `[SHARED]` | Web `auth.service.ts` / Mobile `authService.ts` | Admin approves pending login request. |
| `POST` | `/api/users/login-requests/:requestId/reject` | `[SHARED]` | Web `auth.service.ts` / Mobile `authService.ts` | Admin rejects pending login request. |
| `GET` | `/api/users/online-users` | `[WEB]` | Web admin dashboard / header | Retrieves list of currently active user sessions. |
| `GET` | `/api/users/me` | `[SHARED]` | Web `auth.service.ts` / Mobile `authService.ts` | Fetches active user profile, assigned stores, and RBAC pages. |
| `GET` | `/api/users/subusers` | `[SHARED]` | Web `user.service.ts` / Mobile `userService.ts` | Lists subusers under the current parent user. |
| `POST` | `/api/users/subusers` | `[SHARED]` | Web `user.service.ts` / Mobile `userService.ts` | Creates a new subuser under parent scope. |
| `PUT` | `/api/users/subusers/:id` | `[SHARED]` | Web `user.service.ts` / Mobile `userService.ts` | Modifies existing subuser permissions. |
| `DELETE` | `/api/users/subusers/:id` | `[SHARED]` | Web `user.service.ts` / Mobile `userService.ts` | Deletes existing subuser. |
| `POST` | `/api/users` | `[SHARED]` | Web `user.service.ts` / Mobile `userService.ts` | System user creation (Admin only). |
| `GET` | `/api/users` | `[SHARED]` | Web `user.service.ts` / Mobile `userService.ts` | System users list with pagination and search. |
| `GET` | `/api/users/:id` | `[SHARED]` | Web `user.service.ts` / Mobile `userService.ts` | User details by ID. |
| `PUT` | `/api/users/:id` | `[SHARED]` | Web `user.service.ts` / Mobile `userService.ts` | Modifies user details, role, or store assignments. |
| `DELETE` | `/api/users/:id` | `[SHARED]` | Web `user.service.ts` / Mobile `userService.ts` | Deletes system user. |

---

### B. Stores & Store Tools (`/api/stores`)

| Method | Endpoint | Ownership | Consumed By (Web / Mobile) | Description |
|---|---|---|---|---|
| `POST` | `/api/stores` | `[SHARED]` | Web `store.service.ts` / Mobile `storeService.ts` | Creates a new store (Admin only). |
| `GET` | `/api/stores` | `[SHARED]` | Web `store.service.ts` / Mobile `storeService.ts` | Lists all stores filtered by project or user assignments. |
| `GET` | `/api/stores/:id` | `[SHARED]` | Web `store.service.ts` / Mobile `storeService.ts` | Store details by ID with assigned tool counts. |
| `PUT` | `/api/stores/:id` | `[SHARED]` | Web `store.service.ts` / Mobile `storeService.ts` | Updates store details (Admin only). |
| `DELETE` | `/api/stores/:id` | `[SHARED]` | Web `store.service.ts` / Mobile `storeService.ts` | Deletes store (Admin only). |
| `GET` | `/api/stores/:storeId/tools` | `[SHARED]` | Web `store.service.ts` / Mobile `storeService.ts` | Main inventory listing with status ribbons, search, and pagination. |
| `POST` | `/api/stores/:storeId/tools` | `[SHARED]` | Web `tool.service.ts` / Mobile `toolService.ts` | Creates single tool item in store. |
| `GET` | `/api/stores/:storeId/tools/:toolId` | `[SHARED]` | Web `tool.service.ts` / Mobile `toolService.ts` | Single tool details within store. |
| `GET` | `/api/stores/:storeId/tools/filter-options` | `[SHARED]` | Web `store.service.ts` / Mobile `toolService.ts` | Category/condition dropdown options. |
| `GET` | `/api/stores/:storeId/tools/export` | `[WEB]` | Web `store.service.ts` | Exports store tool catalog to Excel. |
| `POST` | `/api/stores/:storeId/tools/bulk-edit` | `[SHARED]` | Web `tool.service.ts` / Mobile `toolService.ts` | Bulk updates common attributes across selected tools. |
| `POST` | `/api/stores/:storeId/tools/bulk-delete` | `[SHARED]` | Web `tool.service.ts` / Mobile `toolService.ts` | Bulk moves selected tools to trash. |
| `POST` | `/api/stores/:storeId/tools/transfer` | `[SHARED]` | Web `tool.service.ts` / Mobile `toolService.ts` | Transfers tools from one store to another. |
| `GET` | `/api/stores/:storeId/tools/bulk-import/sample` | `[SHARED]` | Web `store.service.ts` / Mobile `BulkImportModal.tsx` | Downloads sample Excel template for bulk tool import. |
| `POST` | `/api/stores/:storeId/tools/bulk-import/preview` | `[SHARED]` | Web `store.service.ts` / Mobile `BulkImportModal.tsx` | Uploads and validates bulk spreadsheet. |
| `POST` | `/api/stores/:storeId/tools/bulk-import/commit` | `[SHARED]` | Web `store.service.ts` / Mobile `BulkImportModal.tsx` | Commits validated spreadsheet records to background worker. |
| `GET` | `/api/stores/:storeId/tools/bulk-import/jobs/:jobId` | `[WEB]` | Web `store.service.ts` | Import job status polling. |
| `GET` | `/api/stores/:storeId/tools/bulk-import/jobs/:jobId/records` | `[WEB]` | Web `store.service.ts` | Paginated preview records in web import wizard. |
| `GET` | `/api/stores/:storeId/tools/bulk-import/jobs/:jobId/progress` | `[WEB]` | Web `store.service.ts` | SSE real-time import progress bar stream. |
| `GET` | `/api/stores/:storeId/tools/bulk-import/jobs/:jobId/imported-tools` | `[WEB]` | Web `store.service.ts` | Created tool items with QR code URLs. |

---

### C. Tools & QR Inspections (`/api/tools`)

| Method | Endpoint | Ownership | Consumed By (Web / Mobile) | Description |
|---|---|---|---|---|
| `POST` | `/api/tools/batch-get` | `[APP]` | Mobile `toolService.ts` | Batch lookup for multi-selected tool ObjectIds. |
| `GET` | `/api/tools/lookup-validity` | `[SHARED]` | Web `tool.service.ts` / Mobile `toolService.ts` | Fast tool QR code scan & validity lookup. |
| `POST` | `/api/tools/inspect` | `[SHARED]` | Web `tool.service.ts` / Mobile `toolService.ts` | Submits statutory tool inspection result (Pass/Fail). |
| `GET` | `/api/tools/trash` | `[SHARED]` | Web `tool.service.ts` / Mobile `toolService.ts` | Lists soft-deleted tools. |
| `GET` | `/api/tools/scrap` | `[SHARED]` | Web `tool.service.ts` / Mobile `toolService.ts` | Lists scrapped tools register. |
| `POST` | `/api/tools/bulk-scrap` | `[SHARED]` | Web `tool.service.ts` / Mobile `toolService.ts` | Marks multiple tools as scrapped. |
| `POST` | `/api/tools/mark-printed` | `[SHARED]` | Web `tool.service.ts` / Mobile `toolService.ts` | Sets QR sticker printed flag to true. |
| `POST` | `/api/tools/unmark-printed` | `[SHARED]` | Web `tool.service.ts` / Mobile `toolService.ts` | Reverts QR sticker printed flag to false. |
| `POST` | `/api/tools/bulk-delete` | `[SHARED]` | Web `tool.service.ts` / Mobile `toolService.ts` | Moves multiple tools to trash. |
| `POST` | `/api/tools/bulk-restore` | `[SHARED]` | Web `tool.service.ts` / Mobile `toolService.ts` | Restores multiple tools from trash. |
| `POST` | `/api/tools/bulk-permanent-delete` | `[SHARED]` | Web `tool.service.ts` / Mobile `toolService.ts` | Purges multiple tools from database permanently. |
| `POST` | `/api/tools/:toolId/restore` | `[SHARED]` | Web `tool.service.ts` / Mobile `toolService.ts` | Restores single tool from trash. |
| `DELETE` | `/api/tools/:toolId/permanent` | `[SHARED]` | Web `tool.service.ts` / Mobile `toolService.ts` | Purges single tool from database permanently. |
| `GET` | `/api/tools/:toolId` | `[SHARED]` | Web `tool.service.ts` / Mobile `toolService.ts` | Full tool record by ID. |
| `PUT` | `/api/tools/:toolId` | `[SHARED]` | Web `tool.service.ts` / Mobile `toolService.ts` | Modifies tool details. |
| `DELETE` | `/api/tools/:toolId` | `[SHARED]` | Web `tool.service.ts` / Mobile `toolService.ts` | Soft-deletes single tool. |

---

### D. Challans (`/api/challans`)

| Method | Endpoint | Ownership | Consumed By (Web / Mobile) | Description |
|---|---|---|---|---|
| `POST` | `/api/challans/delivery` | `[SHARED]` | Web `challan.service.ts` / Mobile `challanService.ts` | Creates Delivery Challan (DC) and marks tools as Moving. |
| `POST` | `/api/challans/scrap-delivery` | `[SHARED]` | Web `challan.service.ts` / Mobile `challanService.ts` | Creates Scrap Delivery Challan (SDC) for disposal. |
| `POST` | `/api/challans/return` | `[SHARED]` | Web `challan.service.ts` / Mobile `challanService.ts` | Creates Return Challan (RC) and restores returned tools. |
| `GET` | `/api/challans` | `[SHARED]` | Web `challan.service.ts` / Mobile `challanService.ts` | Lists challans with status, search, and type filtering. |
| `GET` | `/api/challans/:id` | `[SHARED]` | Web `challan.service.ts` / Mobile `challanService.ts` | Challan details and tool items by ID. |
| `GET` | `/api/challans/:id/pdf` | `[SHARED]` | Web `challan.service.ts` / Mobile `challanService.ts` | Streams official L&T formatted Challan PDF. |
| `PUT` | `/api/challans/:id` | `[SHARED]` | Web `challan.service.ts` / Mobile `challanService.ts` | Modifies non-finalized challan details. |
| `POST` | `/api/challans/:id/cancel` | `[APP]` | Mobile `challanService.ts` | Cancels active DC and restores tools back to Available. |
| `POST` | `/api/challans/log-pdf-download` | `[SHARED]` | Web `challan.service.ts` / Mobile `challanService.ts` | Records audit entry for PDF downloads. |

---

### E. Reports & Registers (`/api/reports`)

| Method | Endpoint | Ownership | Consumed By (Web / Mobile) | Description |
|---|---|---|---|---|
| `GET` | `/api/reports/tools` | `[SHARED]` | Web `report.service.ts` / Mobile `reportService.ts` | Tools Master Register report data. |
| `GET` | `/api/reports/challans` | `[SHARED]` | Web `report.service.ts` / Mobile `reportService.ts` | Delivery & Return Challans Register report data. |
| `GET` | `/api/reports/missing` | `[SHARED]` | Web `report.service.ts` / Mobile `reportService.ts` | Loss & Missing Tools Register report data. |
| `GET` | `/api/reports/inspections` | `[SHARED]` | Web `report.service.ts` / Mobile `reportService.ts` | Statutory Inspections & Compliance report data. |
| `GET` | `/api/reports/scrap` | `[SHARED]` | Web `report.service.ts` / Mobile `reportService.ts` | Scrap & Asset Disposal Register report data. |
| `GET` | `/api/reports/subcontractors` | `[SHARED]` | Web `report.service.ts` / Mobile `reportService.ts` | Subcontractor Custody Ledger report data. |
| `GET` | `/api/reports/export` | `[SHARED]` | Web `report.service.ts` / Mobile `reportService.ts` | Universal Excel/CSV report file export. |
| `GET` | `/api/reports/logins` | `[SHARED]` | Web `report.service.ts` / Mobile `reportService.ts` | Admin Login Activity & Audit Trail report data. |
| `GET` | `/api/reports/logins/export` | `[SHARED]` | Web `report.service.ts` / Mobile `reportService.ts` | Exports Login Activity Audit Trail to Excel/CSV. |

---

### F. Projects (`/api/projects`)

| Method | Endpoint | Ownership | Consumed By (Web / Mobile) | Description |
|---|---|---|---|---|
| `POST` | `/api/projects` | `[SHARED]` | Web `project.service.ts` / Mobile `projectService.ts` | Creates a new project (Admin only). |
| `GET` | `/api/projects` | `[SHARED]` | Web `project.service.ts` / Mobile `projectService.ts` | Lists projects scoped by user access or vendor assignments. |
| `GET` | `/api/projects/:id` | `[SHARED]` | Web `project.service.ts` / Mobile `projectService.ts` | Project details by ID. |
| `PUT` | `/api/projects/:id` | `[SHARED]` | Web `project.service.ts` / Mobile `projectService.ts` | Modifies existing project (Admin only). |
| `DELETE` | `/api/projects/:id` | `[SHARED]` | Web `project.service.ts` / Mobile `projectService.ts` | Deletes project (Admin only). |

---

### G. Profiles (`/api/profiles`)

| Method | Endpoint | Ownership | Consumed By (Web / Mobile) | Description |
|---|---|---|---|---|
| `GET` | `/api/profiles` | `[SHARED]` | Web `profile.service.ts` / Mobile `profileService.ts` | Lists subcontractor, vendor, and team profiles. |
| `GET` | `/api/profiles/:id` | `[SHARED]` | Web `profile.service.ts` / Mobile `profileService.ts` | Profile details and metrics. |
| `POST` | `/api/profiles` | `[SHARED]` | Web `profile.service.ts` / Mobile `profileService.ts` | Creates new profile. |
| `PUT` | `/api/profiles/:id` | `[SHARED]` | Web `profile.service.ts` / Mobile `profileService.ts` | Updates existing profile. |
| `DELETE` | `/api/profiles/:id` | `[SHARED]` | Web `profile.service.ts` / Mobile `profileService.ts` | Deletes profile. |
| `GET` | `/api/profiles/documents/file/:filename` | `[WEB]` | Web profile manager browser | Serves uploaded document file binaries from disk. |
| `POST` | `/api/profiles/:id/documents` | `[WEB]` | Web `profile.service.ts` | Uploads and attaches documents to profile. |
| `DELETE` | `/api/profiles/:id/documents/:docId` | `[WEB]` | Web `profile.service.ts` | Deletes document attachment from profile. |

---

### H. Vendors (`/api/vendors`)

| Method | Endpoint | Ownership | Consumed By (Web / Mobile) | Description |
|---|---|---|---|---|
| `GET` | `/api/vendors` | `[WEB]` | Web `vendor.service.ts` | Paginated vendor list with metrics. |
| `GET` | `/api/vendors/:id` | `[WEB]` | Web `vendor.service.ts` | Vendor profile details by ID. |
| `POST` | `/api/vendors` | `[WEB]` | Web `vendor.service.ts` | Creates new vendor profile. |
| `PUT` | `/api/vendors/:id` | `[WEB]` | Web `vendor.service.ts` | Updates existing vendor profile. |
| `DELETE` | `/api/vendors/:id` | `[WEB]` | Web `vendor.service.ts` | Deletes vendor profile. |

---

### I. Dynamic Forms (`/api/forms`)

| Method | Endpoint | Ownership | Consumed By (Web / Mobile) | Description |
|---|---|---|---|---|
| `GET` | `/api/forms` | `[SHARED]` | Web `form.service.ts` / Mobile `formService.ts` | Lists active form schemas. |
| `POST` | `/api/forms` | `[SHARED]` | Web `form.service.ts` / Mobile `formService.ts` | Creates/updates dynamic form definition schema. |
| `GET` | `/api/forms/:slug` | `[SHARED]` | Web `form.service.ts` / Mobile `formService.ts` | Fetches form schema and field rules by slug. |
| `POST` | `/api/forms/:slug/submit` | `[SHARED]` | Web `form.service.ts` / Mobile `formService.ts` | Validates data against Zod schema and persists submission. |

---

### J. Dashboard & KPIs (`/api/dashboard`)

| Method | Endpoint | Ownership | Consumed By (Web / Mobile) | Description |
|---|---|---|---|---|
| `GET` | `/api/dashboard/stats` | `[SHARED]` | Web `dashboard.service.ts` / Mobile `dashboardService.ts` | Aggregates summary counts, category distributions, and alerts. |
| `POST` | `/api/dashboard/tools/:toolId/extend-life` | `[SHARED]` | Web `dashboard.service.ts` / Mobile `dashboardService.ts` | Extends validity period by designated years. |

---

## 3. Best Practices for Developers

1. **Check Consumers Before Modifying Route Contracts**:
   - If an endpoint is `[SHARED]`, search both `d:/larsentoubro/client/src` and `d:/larsentoubro/larsentoubro-app/src` before altering any request parameters or response payload structure.
2. **Tag New Endpoints Immediately**:
   - Always place the `[SHARED]`, `[WEB]`, or `[APP]` tag in the route definition JSDoc when adding a new endpoint.
3. **Keep Shared Logic Centralized**:
   - Do not branch or duplicate shared business logic. If a feature diverges slightly between platforms (e.g. mobile batch lookups vs. web pagination), keep the core model operations in the shared service and expose dedicated lightweight controller actions tagged accordingly.
