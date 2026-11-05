# Paraşüt API v4 — Reference for an e-Fatura / e-Arşiv integration

Compiled 2026-10-30.

## How to read this document: source tags

| Tag | Meaning |
|---|---|
| **[SPEC]** | The official OpenAPI 2.0 spec (`swagger.json`, info.version `4.0.0`, title "Paraşüt - API V4"). The copy saved locally is byte-identical to `https://apidocs.parasut.com/swagger.json`, which was re-downloaded and compared with `cmp` on 2026-10-30. Definition names (for example `SalesInvoiceAttributes`) and path names are cited. |
| **[SPEC-INTRO]** | The long Turkish markdown in `info.description` of the spec: the "GİRİŞ", "Authentication" and "SIK KULLANILAN İŞLEMLER" sections. |
| **[PARASUT-KB]** | Official parasut.com help or blog pages. Each one is linked. |
| **[COMMUNITY]** | Third-party client libraries or integrators. They are unofficial and should be verified. Each one is linked. |
| **[INFERRED]** | My reading of the spec where the spec does not say it outright. It is marked so you can verify it. |

Global facts **[SPEC]**:
- host `api.parasut.com`, basePath `/v4`, scheme `https`.
- `consumes` and `produces` are both `application/vnd.api+json`. [SPEC-INTRO] says `Content-Type: application/json` or `application/vnd.api+json` is accepted.
- Every company-scoped path is `/v4/{company_id}/...`. `company_id` is a path param of type `integer` and is described as "Firma ID". `/v4/me` is the only path that is not company-scoped.
- All `{id}` path params are `integer`. In payloads, JSON:API `id` fields are `string` (maxLength 255).
- Security: `parasut_auth` is oauth2 with `flow: accessCode`, `authorizationUrl https://api.parasut.com/oauth/authorize`, `tokenUrl https://api.parasut.com/oauth/token`, and `scopes: {}`. **There are no scopes.** A token grants whatever the user's role allows.
- The spec contains **no `example` payloads** (0 occurrences). All JSON examples below are built from the schemas.

---

## 1. Authentication

### 1.1 Getting credentials **[SPEC-INTRO]**
- `CLIENT_ID`, `CLIENT_SECRET` and `REDIRECT_URL` are obtained **by emailing destek@parasut.com**. There is no self-service developer portal in the spec.
- The default `REDIRECT_URL` is `urn:ietf:wg:oauth:2.0:oob`. A custom redirect URL must be **registered by contacting Paraşüt**: "Size özel bir REDIRECT_URL tanımlamak isterseniz destek@parasut.com adresine mail atabilirsiniz."
- [COMMUNITY] Integrators say the request should be sent from the email address registered on the Paraşüt account. Example: [theposeidonas/laravel-parasut-api](https://packagist.org/packages/theposeidonas/laravel-parasut-api), [northlab/parasut-laravel](https://packagist.org/packages/northlab/parasut-laravel).

### 1.2 grant_type=authorization_code (the right flow for "each tenant connects its own account") **[SPEC-INTRO]**
1. Redirect the user to
   `https://api.parasut.com/oauth/authorize?client_id=CLIENT_ID&redirect_uri=REDIRECT_URL&response_type=code`
2. The user logs in and approves, then lands on `REDIRECT_URL?code=xxxxxxx`.
3. Exchange the code. The spec shows a form-encoded body (`curl -F`).
```bash
curl -F grant_type=authorization_code -F client_id=CLIENT_ID -F client_secret=CLIENT_SECRET \
     -F code=RETURNED_CODE -F redirect_uri=REDIRECT_URL -X POST https://api.parasut.com/oauth/token
```
- **The spec does not mention a `state` parameter or PKCE.** It is standard OAuth2, so `state` will probably be echoed back, but this is not documented. Verify it.
- The spec does not mention `scope`, consent revocation or a token introspection endpoint.

### 1.3 grant_type=password **[SPEC-INTRO]**
```bash
curl -F grant_type=password -F client_id=CLIENT_ID -F client_secret=CLIENT_SECRET \
     -F username=YOUREMAIL -F password=YOURPASSWORD \
     -F redirect_uri=urn:ietf:wg:oauth:2.0:oob -X POST https://api.parasut.com/oauth/token
```
For a multi-tenant SaaS this would mean storing each tenant's Paraşüt password. Most community libraries use this flow anyway, because it is the "integrator for my own company" use case. Examples: [parasut-api-v4 npm `api.ts`](https://cdn.jsdelivr.net/npm/parasut-api-v4@0.3.0/src/api.ts), [leventcz/parasut-php](https://github.com/leventcz/parasut-php).

### 1.4 Token response and lifetime **[SPEC-INTRO]**
```json
{ "access_token": "XYZXYZXYZ", "token_type": "bearer", "expires_in": 7200, "refresh_token": "ABCABCABC" }
```
- The access token is valid for **2 hours** (`expires_in: 7200`). Send it as `Authorization: Bearer <token>`.
- The spec does **not** state the refresh-token lifetime.

### 1.5 Refresh: rotation **[SPEC-INTRO]**
```bash
curl -F grant_type=refresh_token -F client_id=CLIENT_ID -F client_secret=CLIENT_SECRET \
     -F refresh_token=REFRESH_TOKEN -X POST https://api.parasut.com/oauth/token
```
- "refresh_token ile yeni bir access_token alırken aynı zamanda yeni bir refresh_token da almaktasınız… size dönen yeni refresh_token'ı kullanmalısınız." **Refresh tokens rotate.** Persist the new refresh token atomically.
- [INFERRED] Two concurrent refreshes for the same tenant will probably invalidate one of them. Serialize refreshes per tenant, for example with a DB row lock or an advisory lock.
- [COMMUNITY] The [mcp-parasut](https://github.com/yigitkonur/mcp-parasut) SDK refreshes when it gets a `401` and then retries.

### 1.6 `/me`: discovering which companies a user can access **[SPEC]** `GET /v4/me` (operationId `showMe`)
- Query `include`: available values are `user_roles, companies, profile`.
- Response: `data` is `Me` (`type: "users"`). `included[]` items have `type` in `user_roles | companies | profiles`.
- `MeAttributes` (all read-only): `name`, `email` (format email), `is_confirmed` (bool).
- `Me.relationships`: `user_roles.data[] {id, type:"user_roles"}`, `companies.data[] {id, type:"companies"}`, `profile.data {id, type:"profiles"}`.
- **A user can belong to several companies.** `companies` is an array, and each `UserRole` links one `user` to one `company`.
- `UserRole.relationships`: `company {type:"companies"}`, `user {type:"users"}`, `managed_employee {type:"employees"}`.
- `UserRoleAttributes` are all read-only, and each is an enum `rw | ro | na`: `sales_invoices`, `expenditures`, `own_expenditures`, `employees`, `accounts`, `settings`. Use these to check that the connected user can write sales invoices (`sales_invoices == "rw"`) and accounts.
- `CompanyAttributes` (read-only) that matter here:
  - `name`, `legal_name`, `tax_number`, `tax_office`, `mersis_no`, `city`, `district`
  - `is_active`, `accessible`, `has_active_subscription`, `subscription_status`, `valid_until` (date), `is_in_trial_period`, `trial_expiration_at`, `is_in_grace_period`, `end_of_grace_period_at`, `subscription_plan_name`
  - **`e_invoicing_activated_at`** (date-time): when the company switched to e-Fatura/e-Arşiv
  - **`inventory_enabled`** (bool)
  - `app_url`
- `Company.relationships`: `default_warehouse`, `owner` (users), `address` (addresses).
- Request: `GET https://api.parasut.com/v4/me?include=companies,user_roles`
- [SPEC-INTRO] says a document's issue date must be after the company's e-invoicing activation date (see §7). `e_invoicing_activated_at` is the field to check.
- [COMMUNITY] mcp-parasut auto-picks the **first** company from `/me` when none is configured, and warns that you should set it explicitly for multi-company users.

---

## 2. Rate limits, pagination, filtering, include, sort

- **Rate limit [SPEC-INTRO]:** "10 saniyede 10 adet istek gönderebilirsiniz" (10 requests per 10 seconds).
  - The spec does **not** say whether this is per token, per user, per company or per client_id.
  - **No `429` response is documented.** Every operation documents only `200/201/202/204` plus `400, 401, 403, 404, 422`.
  - No rate-limit headers are documented.
  - [COMMUNITY] mcp-parasut implements a token bucket of 10 per 10 s with exponential backoff.
  - [INFERRED] One "create invoice + formalize + poll + PDF" cycle is at least 5 to 10 calls, so throttle per tenant.
- **Pagination [SPEC]:** `page[number]` (integer, default 1) and `page[size]` (integer, **default 15, maximum 25**).
  - The 25 maximum is the same on all 16 list endpoints that define it. `GET /sales_offers` defines only `page[number]`.
  - List responses carry `meta` = `ListMeta {current_page, total_pages, total_count}` (integers).
  - No `links` object is defined.
- **Filters [SPEC]:** plain `filter[<field>]` query params. Each endpoint defines its own list (see the sections below).
  - The value format for date filters (`filter[issue_date]`, `filter[due_date]`, `filter[date]`) is **not specified** in the spec. They are typed `string` with no description. Whether ranges are supported is not stated. Test this.
- **Sort [SPEC]:** `sort=<field>`, prefix `-` for descending. The available fields are listed per endpoint (for example sales_invoices: `id, issue_date, due_date, remaining, remaining_in_trl, description, net_total`, default `id`).
- **Include [SPEC]:** `include=a,b,c.d`. Sideloaded resources come back in the top-level `included[]` array (standard JSON:API compound document).

---

## 3. Contacts (müşteri/tedarikçi) **[SPEC]**

Endpoints:
- `GET /{company_id}/contacts` (listContacts)
- `POST /{company_id}/contacts` (createContact), returns 201
- `GET|PUT|DELETE /{company_id}/contacts/{id}`. DELETE returns 204.
- `POST /{company_id}/contacts/{id}/contact_debit_transactions` (collectFromContact, "Tahsilat"): an account-level collection that is not tied to a single invoice.
- `POST /{company_id}/contacts/{id}/contact_credit_transactions` (payToContact, "Ödeme")
- `include`: `category, contact_portal, contact_people`

List filters:
- `filter[name]`, `filter[email]`, **`filter[tax_number]`**, `filter[tax_office]`, `filter[city]`, `filter[account_type]` (`customer|supplier`)
- `sort`: `id, balance, name, email`, default `-balance`

**Finding an existing contact by tax number:**
```
GET /v4/{company_id}/contacts?filter[tax_number]=1234567890&filter[account_type]=customer
```
- [INFERRED] The spec does not say whether matching is exact or partial. Paraşüt does not enforce unique tax numbers in the spec, so duplicates are possible. Handle zero, one or many results.

`ContactAttributes` (required: **`name`, `account_type`**):

| field | type / enum | notes |
|---|---|---|
| name | string, **required** | "Müşteri/tedarikçi ismi" |
| short_name | string | |
| contact_type | enum `person`, `company` | "Tip" |
| account_type | enum `customer`, `supplier`, **required** | |
| tax_number | string | "**Vergi numarası/TC kimlik no**". This one field holds both the VKN (10 digits) and the TCKN (11 digits). |
| tax_office | string | Vergi dairesi |
| email | string (email) | |
| phone, fax | string | |
| address | string | |
| district | string | İlçe |
| city | string | İl |
| postal_code | string | |
| country | string | |
| is_abroad | bool | yurt dışı |
| iban | string | |
| archived | bool | |
| untrackable | bool | "Listelenmemiş müşteri sonradan listelenebilir hale getirilemez" (an unlisted contact cannot be made listed later) |
| invoicing_preferences.e_document_accounts | integer[] | No further description. Probably the e-document email recipients / accounts [INFERRED]. |
| balance, trl_balance, usd_balance, eur_balance, gbp_balance | number, read-only | |
| created_at, updated_at | date, read-only | |

- `Contact.relationships`: `category` (item_categories), `contact_portal`, and `contact_people[]`. In a create, `contact_people[]` items can carry inline `attributes: ContactPersonAttributes {name, email, phone, notes}`.

Example create:
```json
POST /v4/123456/contacts
{ "data": { "type": "contacts",
  "attributes": {
    "name": "Ahmet Yılmaz", "contact_type": "person", "account_type": "customer",
    "tax_number": "12345678901", "tax_office": "", "email": "ahmet@example.com", "phone": "05551112233",
    "address": "Atatürk Cad. No:1", "district": "Kadıköy", "city": "İstanbul", "country": "Türkiye", "is_abroad": false } } }
```

TCKN vs VKN:
- The spec makes no distinction. Both go in `tax_number`.
- [COMMUNITY] The [WiseCP Paraşüt addon](https://docs.wisecp.com/en/parasut-e-invoice-addon.md) blocks issuance when a Turkish company tax number is not 10 digits (11 for a sole proprietorship).
- [INFERRED / GİB practice, not in spec] For an e-Arşiv to a consumer with no known TCKN, GİB practice is `11111111111`. Confirm with Paraşüt how they handle an empty `tax_number`.

---

## 4. Products **[SPEC]**

Endpoints:
- `GET|POST /{company_id}/products`
- `GET|PUT|DELETE /{company_id}/products/{id}`
- `GET /{company_id}/product/{product_id}/inventory_levels`. **Note the singular `product`** in this path.
- List filters: `filter[name]`, `filter[code]`. `sort`: `id, name`.
- `include`: `inventory_levels, category`.

`ProductAttributes` (required: **`name`**):

| field | type | notes |
|---|---|---|
| code | string | Ürün/hizmet kodu |
| name | string, **required** | |
| vat_rate | number | KDV oranı |
| unit | string | Birim. No enum. |
| list_price | number | Satış fiyatı |
| currency | string | Satış döviz. No enum on the product. |
| buying_price, buying_currency | number / string | |
| sales_excise_duty, sales_excise_duty_type | number / string | Satış ÖTV |
| purchase_excise_duty, purchase_excise_duty_type | number / string | |
| communications_tax_rate | number | ÖİV |
| inventory_tracking | bool | stok takibi |
| initial_stock_count | number | For multiple warehouses, send it per warehouse through `inventory_levels` |
| gtip | string | GTİP code |
| barcode | string | |
| archived | bool | |
| read-only | | `stock_count`, `list_price_in_trl`, `buying_price_in_trl`, `sales_invoice_details_count`, `purchase_invoice_details_count`, `sales_excise_duty_code`, `created_at`, `updated_at` |

**Does an invoice line REQUIRE a product?**
- `SalesInvoiceDetail` has relationships `product` and `warehouse`. Neither is marked required. The only required detail attributes are `quantity`, `unit_price` and `vat_rate`.
- [SPEC-INTRO], however, describes the flow as needing "bir veya birden fazla ürün (product) id'si" and says "Bu listenin her elemanının ilişkili olduğu bir ürün vardır."
- **Conclusion: the schema permits a line without a product, but the guide assumes one. Test a free-text line (product omitted, `description` set) in a real account before relying on it.**
- [INFERRED] e-Fatura UBL needs an item name for each line. Without a product, Paraşüt would have to use `description`. This is unverified.
- `excise_duty_codes[].product` in the e-document form is keyed by **product ID** (see §8). ÖTV lines therefore effectively need products.

**Stock effects [SPEC]:**
- `GET /stock_movements` description: "irsaliyeli satış faturası veya irsaliyeli alış faturası oluşturulduğunda stok takibi yapılan bir ürün içeren her fatura kalemine karşılık otomatik olarak bir stok hareketi oluşur."
- In other words, a stock movement is created when **`shipment_included: true`** (irsaliyeli fatura) **and** the product has `inventory_tracking: true`.
- The detail's `warehouse` relationship picks the warehouse.
- `convert_to_invoice` description: "Ürünlerinizin stok hareketleri varsayılan deponuz üzerinden oluşturulacaktır."
- [INFERRED] With `shipment_included: false` and/or products with `inventory_tracking: false`, invoices should not touch Paraşüt stock. Verify this in a test account, because the company-level `inventory_enabled` may also matter.

---

## 5. Sales invoices **[SPEC]**

### 5.1 Endpoints

| Method + path | operationId | Notes |
|---|---|---|
| `GET /{cid}/sales_invoices` | listSalesInvoices | see filters below |
| `POST /{cid}/sales_invoices` | createSalesInvoice | 201 |
| `GET /{cid}/sales_invoices/{id}` | showSalesInvoice | |
| `PUT /{cid}/sales_invoices/{id}` | updateSalesInvoice | 200 |
| `DELETE /{cid}/sales_invoices/{id}` | deleteSalesInvoice | 204 |
| `POST /{cid}/sales_invoices/{id}/payments` | paySalesInvoice | 201, see §6 |
| `DELETE /{cid}/sales_invoices/{id}/cancel` | cancelSalesInvoice | **HTTP DELETE**, returns 200 + invoice |
| `PATCH /{cid}/sales_invoices/{id}/recover` | recoverSalesInvoice | 200 |
| `PATCH /{cid}/sales_invoices/{id}/archive` / `unarchive` | | 200 |
| `PATCH /{cid}/sales_invoices/{id}/convert_to_invoice` | convertEstimateToInvoice | Turns an estimate (proforma) into an invoice. The body is a full invoice. |

- `include` (all of them): `category, contact, details, details.product, details.warehouse, payments, payments.transaction, tags, sharings, recurrence_plan, active_e_document`.
- List filters:
  - `filter[issue_date]`, `filter[due_date]`
  - `filter[contact_id]` (int)
  - **`filter[invoice_id]`** (int), **`filter[invoice_series]`** (string)
  - `filter[item_type]`: default `'invoice, refund, estimate'`, available `invoice, refund, estimate, export`
  - `filter[print_status]`: `printed, not_printed, invoices_not_sent, e_invoice_sent, e_archive_sent, e_smm_sent`
  - `filter[payment_status]`: `overdue, not_due, unscheduled, paid`
- `order_no` and `description` are **not** filterable.

### 5.2 Create payload: attributes

Schema: `SalesInvoiceCreateUpdateAttributes` = `allOf[SalesInvoiceAttributes, {payment_account_id, payment_date, payment_description}]`.

Required, as stated in `SalesInvoiceAttributes`: **`item_type`, `issue_date`**.

| field | type / enum | description (spec) |
|---|---|---|
| item_type | enum `invoice, export, estimate, cancelled, recurring_invoice, recurring_estimate, recurring_export, refund`, **required** | Fatura türü. Use `invoice` for a normal sale. |
| issue_date | date `YYYY-MM-DD`, **required** | Düzenleme tarihi |
| due_date | date | Son tahsilat tarihi |
| description | string | Fatura açıklaması |
| invoice_series | string | Fatura seri |
| invoice_id | integer | Fatura sıra |
| currency | enum `TRL, USD, EUR, GBP` | **TL is `TRL`, not `TRY`** |
| exchange_rate | number | |
| withholding_rate | number | Stopaj oranı |
| invoice_discount_type | enum `percentage, amount` | invoice-level discount |
| invoice_discount | number | |
| billing_address | string | "Gönderim adresi" |
| billing_postal_code, billing_phone, billing_fax | string | |
| tax_office | string | Müşteri vergi dairesi |
| tax_number | string | Müşteri vergi numarası |
| country, city, district | string | |
| is_abroad | bool | |
| order_no | string | "resmileştirmek için order_date dolu ise bu alan zorunludur" (required for formalization when order_date is set) |
| order_date | date | "resmileştirmek için order_no dolu ise bu alan zorunludur". **Send both or neither.** |
| shipment_addres | string | **[sic] the spelling is `shipment_addres`** |
| shipment_included | bool | İrsaliyeli fatura. See the stock effects in §4. |
| cash_sale | bool | Peşin satış |
| payment_account_id | number | "Peşin faturalar için ödeme oluşturma / güncellemede kullanılır" (used with cash_sale) |
| payment_date | string | same |
| payment_description | string | |
| payer_tax_numbers | string[] | no description |
| invoice_note | string | Fatura notu |
| append_contact_balance | bool | "Müşteri bakiyeniz faturaya eklenecektir." |
| e_document_accounts | array of "Number" | no description |

Read-only (response only):
- `invoice_no`, `net_total` ("Genel Toplam"), `gross_total` ("Ara toplam"), `before_taxes_total` ("Vergiler Hariç Toplam")
- `total_vat`, `total_vat_withholding`, `total_discount`, `total_invoice_discount`, `total_excise_duty`, `total_communications_tax`, `withholding`
- `remaining`, `remaining_in_trl`
- `payment_status` enum `paid, overdue, unpaid, partially_paid`
- `archived`, `created_at`, `updated_at`

### 5.3 Detail line attributes (`SalesInvoiceDetailAttributes`)

Required: **`quantity`, `unit_price`, `vat_rate`**.

| field | type / enum | description |
|---|---|---|
| quantity | number, required | Miktar |
| unit_price | number, required | "Birim fiyatı" |
| vat_rate | number, required | KDV oranı (percentage, e.g. `20`) |
| vat_withholding_rate | number | Tevkifat oranı |
| discount_type | enum `percentage, amount` | line discount |
| discount_value | number | |
| excise_duty_type | enum `percentage, amount` | ÖTV tipi |
| excise_duty_value | number | |
| communications_tax_rate | number | ÖİV |
| description | string | Açıklama |
| delivery_method | enum `CFR, CIF, CIP, CPT, DAF, DAP, DPU, DDP, DDU, DEQ, DES, EXW, FAS, FCA, FOB` | export (Incoterms) |
| shipping_method | enum `Denizyolu, Demiryolu, Karayolu, Havayolu, Posta, Çok araçlı, Sabit taşıma tesisleri, İç su taşımacılığı` | export |
| read-only | | `net_total`, `vat_withholding`, `created_at`, `updated_at` |

- **There is no `unit` attribute on the invoice line.** The unit comes from the related product (`ProductAttributes.unit`).
- **There is no `excise_duty` field named exactly that.** It is `excise_duty_type` + `excise_duty_value`.

**VAT-included vs VAT-excluded `unit_price`:**
- The spec only says "Birim fiyatı". There is no `vat_included` / `price_includes_vat` flag anywhere in the spec (searched for "dahil"/"hariç").
- The only related field is the read-only `before_taxes_total` ("Vergiler Hariç Toplam").
- [COMMUNITY] The [mkiyak/parasut-api-v4](https://packagist.org/packages/mkiyak/parasut-api-v4) README comments `"unit_price" => 100, //birim fiyatı (kdv'siz fiyatı)`.
- **Conclusion: `unit_price` is VAT-exclusive.** With VAT-inclusive shelf prices you must back-compute the net price, which introduces rounding (see §14).

### 5.4 Relationships (create/update body)
- `contact`: `{data:{id, type:"contacts"}}`. Required in practice, since [SPEC-INTRO] says it must be filled. It is not marked required in the schema.
- `details`: `{data:[{type:"sales_invoice_details", attributes:{…}, relationships:{product:{data:{id,type:"products"}}, warehouse:{data:{id,type:"warehouses"}}}}]}`
- `category`: `{data:{id, type:"item_categories"}}`. A category with `category_type: SalesInvoice`.
- `tags`: `{data:[{id, type:"tags"}]}`
- `sales_offer`: `{data:{id, type:"sales_offers"}}`. Links the invoice to the quote it came from.
- Response-only relationships: `payments[]`, `sharings[]`, `recurrence_plan`, and **`active_e_document`** (`type` ∈ `e_archives | e_invoices`).

[SPEC-INTRO] For a new record, `data.id` must be empty or omitted, and so must the `details[].id` values. Only referenced records (`contact`, `product`) carry ids.

### 5.5 Example create (built from schema)
```json
POST /v4/123456/sales_invoices?include=active_e_document
{ "data": {
    "type": "sales_invoices",
    "attributes": {
      "item_type": "invoice",
      "issue_date": "2026-10-30",
      "due_date": "2026-10-30",
      "description": "Sipariş #A-1042 — 4 adet lastik + montaj",
      "currency": "TRL",
      "invoice_series": "UST",
      "invoice_id": 1042,
      "tax_number": "12345678901",
      "tax_office": "",
      "billing_address": "Atatürk Cad. No:1",
      "city": "İstanbul",
      "district": "Kadıköy",
      "country": "Türkiye",
      "is_abroad": false,
      "order_no": "A-1042",
      "order_date": "2026-10-30",
      "shipment_included": false,
      "cash_sale": true,
      "payment_account_id": 98765,
      "payment_date": "2026-10-30",
      "payment_description": "Nakit tahsilat"
    },
    "relationships": {
      "contact": { "data": { "id": "555", "type": "contacts" } },
      "details": { "data": [
        { "type": "sales_invoice_details",
          "attributes": { "quantity": 4, "unit_price": 2500.0, "vat_rate": 20,
                          "discount_type": "percentage", "discount_value": 5,
                          "description": "205/55 R16 Yaz Lastiği" },
          "relationships": { "product": { "data": { "id": "777", "type": "products" } } } },
        { "type": "sales_invoice_details",
          "attributes": { "quantity": 1, "unit_price": 400.0, "vat_rate": 20, "description": "Montaj + balans" },
          "relationships": { "product": { "data": { "id": "778", "type": "products" } } } }
      ] }
    } } }
```

### 5.6 Update / delete / cancel / recover / archive semantics
- **PUT** replaces attributes and relationships. [INFERRED from JSON:API conventions] Existing detail lines are updated by sending their `id`. The spec does not document how detail lines are removed (for example, whether omitting a line deletes it). Test this.
- **DELETE /sales_invoices/{id}** returns 204 and hard-deletes. Payments must probably be removed first: [SPEC-INTRO] describes deleting a payment by deleting its `transaction`.
- **DELETE /sales_invoices/{id}/cancel** returns 200 with the invoice.
  - [INFERRED] It sets `item_type` to `cancelled`, which is an enum value of `item_type`.
  - **PATCH /recover** reverses the cancel.
  - The spec gives **no description** of either endpoint.
- **archive / unarchive** toggles the read-only `archived` flag. This only affects visibility.
- **After formalization:**
  - The spec has no rule.
  - [PARASUT-KB] "Resmileştirdiğiniz elektronik faturalarda değişiklik yapılamaz" ([kullanım kılavuzu, iptal-iade](https://www.parasut.com/kullanim-kilavuzu/elektronik-faturada-iptal-iade-islemleri)). Expect PUT/DELETE to fail with 422 once `active_e_document` exists.
  - Whether `/cancel` on a formalized e-Arşiv also cancels it at GİB is **not documented**; see §10.

---

## 6. Payments (tahsilat) and accounts (kasa/banka) **[SPEC]**

### 6.1 `POST /{cid}/sales_invoices/{id}/payments` (paySalesInvoice)
- `include`: `payable, transaction`.
- Body `data.type = "payments"`. `attributes` = `PaymentFormAttributes`. **No field is marked required.**

| field | type | description |
|---|---|---|
| account_id | integer | "Kasa veya Banka. Bu parametre ayrıca ödemenin/tahsilatın hangi döviz kuru ile yapılacağını belirler." |
| date | date | Ödeme/Tahsilat tarihi |
| amount | number | Ödeme/Tahsilat tutarı |
| exchange_rate | number | If the payment uses a different exchange rate from the invoice, give the TL value. Otherwise "1.0" or empty. |
| description | string | Açıklama |

```json
POST /v4/123456/sales_invoices/111/payments?include=transaction
{ "data": { "type": "payments",
  "attributes": { "account_id": 98765, "date": "2026-10-30", "amount": 12400.0,
                  "exchange_rate": 1.0, "description": "Kredi kartı tahsilatı — sipariş A-1042" } } }
```
- Response: 201 `Payment`.
  - `PaymentAttributes`: `date`, `amount`, `currency`, `notes`, `created_at`, `updated_at`. **`currency` is typed `number` in the spec**, which is a spec bug.
  - `relationships`: `payable` (sales_invoices / purchase_bills / taxes / bank_fees / salaries / checks) and `transaction` (transactions).
- **Deleting a payment** [SPEC-INTRO]:
  1. `GET /sales_invoices/{id}?include=payments.transaction`
  2. `DELETE /{cid}/transactions/{transaction_id}`, which returns 204
- Alternative: on create, set `cash_sale: true` with `payment_account_id` + `payment_date`. This creates the payment together with the invoice (§5.2).
- Contact-level collection that is not tied to one invoice: `POST /contacts/{id}/contact_debit_transactions`. Attributes = `PaymentFormAttributes` + `payable_ids: integer[]` ("Tahsilatınızın öncelikli olarak eşleşmesini istediğiniz faturalar", the invoices to match first). `data.type` is `transactions`.

### 6.2 Accounts
- `GET /{cid}/accounts` (listAccounts)
  - Filters: `filter[name]`, `filter[currency]`, `filter[bank_name]`, `filter[bank_branch]`, `filter[account_type]`, `filter[iban]`
  - `sort`: `id, balance, balance_in_trl`, default `-id`
- `POST /accounts`, and `GET|PUT|DELETE /accounts/{id}`
- `GET /accounts/{id}/transactions` (filter[date])
- `POST /accounts/{id}/debit_transactions` and `/credit_transactions`

`AccountAttributes` (required `name`):

| field | type / enum | notes |
|---|---|---|
| name | string, required | |
| currency | enum `TRL, USD, EUR, GBP` | |
| account_type | enum **`cash`, `bank`, `sys`** | |
| bank_name, bank_branch, bank_account_no, iban | string | |
| archived | bool | |
| read-only | | `balance`, `used_for`, `last_used_at`, `last_adjustment_date`, `bank_integration_type`, `associate_email` |

Mapping our kasalar: list with `filter[account_type]=cash` and `filter[account_type]=bank`, store the Paraşüt `id` per local kasa, and use it as `account_id` / `payment_account_id`.
- [COMMUNITY] The WiseCP addon notes: "If Cash Account ID is empty, the first account in Paraşüt receives the collection" ([docs](https://docs.wisecp.com/en/parasut-e-invoice-addon.md)).

---

## 7. e-Invoice inbox lookup (mükellef sorgulama) **[SPEC]**

`GET /{cid}/e_invoice_inboxes?filter[vkn]=<vkn>` (listEInvoiceInboxes)
- `filter[vkn]` is typed **integer**. TCKN holders (şahıs şirketi) are also e-Fatura users, and an 11-digit TCKN fits in an integer.
- The list is paginated (page[size] max 25) and returns `data[]` of `EInvoiceInbox` (`type: "e_invoice_inboxes"`).
- Example: `GET /v4/123456/e_invoice_inboxes?filter[vkn]=1234567890`

`EInvoiceInboxAttributes` (all read-only):

| field | type |
|---|---|
| vkn | string |
| e_invoice_address | string. The GİB alias (etiket), e.g. `urn:mail:defaultpk@firma.com.tr` |
| name | string (title) |
| inbox_type | string. **No enum is given.** |
| address_registered_at | date-time |
| registered_at | date-time |
| created_at, updated_at | date |

Rules [SPEC-INTRO]:
- If the inbox query returns an inbox, the customer is an e-Fatura user, so create an **e-Fatura**. Otherwise create an **e-Arşiv**.
- **Export invoices must always be e-Fatura.**
- The issue date of any e-Fatura, e-Arşiv or e-SMM must be **after the date your company activated e-Fatura/e-SMM** (`CompanyAttributes.e_invoicing_activated_at`).
- An e-Fatura's issue date **cannot be before the date the recipient started using the alias** ("alıcının etiketi kullanmaya başladığı tarihten de önce olamaz"). The recipient's alias start date is visible in the inbox response.
  - [INFERRED] That is `address_registered_at` (alias-level), as opposed to `registered_at` (VKN registration).
- **Multiple inboxes per VKN:**
  - The response is an array, and one VKN can have several aliases (for example several `urn:mail:...pk@` addresses).
  - The spec gives no rule for choosing one. `EInvoiceFormAttributes.to` takes one alias string.
  - [INFERRED] Use the `invoicing_preferences` / customer-supplied alias when there are several. Otherwise use the first or only one. Ask Paraşüt which they choose in their UI.
- [COMMUNITY] The [laravel-parasut-api](https://packagist.org/packages/theposeidonas/laravel-parasut-api) changelog: "v1.2.0'dan önce Inbox içerisinde vkn ile gelen parametre kodu değiştirildi". The filter param name changed at some point.

---

## 8. Formalization: `e_invoices` and `e_archives` **[SPEC]**

### 8.1 Endpoints

| Method + path | Body / relationship | Response |
|---|---|---|
| `POST /{cid}/e_archives` (createEArchive) | `data.type:"e_archives"`, attributes `EArchiveFormAttributes`, **relationship `sales_invoice`** | **201 TrackableJob** |
| `GET /{cid}/e_archives/{id}` (showEArchive) | include `sales_invoice` | `EArchive` |
| `GET /{cid}/e_archives/{id}/pdf` (showEArchivePdf) | | `EDocumentPdf` (see §9) |
| `POST /{cid}/e_invoices` (createEInvoice) | `data.type:"e_invoices"`, attributes `EInvoiceFormAttributes`, **relationship `invoice`** (NOT `sales_invoice`) | **201 TrackableJob** |
| `GET /{cid}/e_invoices/{id}` (showEInvoice) | include `invoice` | `EInvoice` |
| `GET /{cid}/e_invoices/{id}/pdf` (showEInvoicePdf) | | `EDocumentPdf` |
| `POST /{cid}/e_smms` (createESmm) | relationship `sales_invoice`, attributes `ESmmCommonFormAttributes` | 201 `ESmm` (the spec says the e-SMM, not a job; the intro says a job) |
| `GET /{cid}/e_smms/{id}` and `GET /{cid}/e_smms/{id}.pdf` | | note the **`.pdf` suffix**, unlike the others |
| `GET /{cid}/trackable_jobs/{id}` (showTrackableJob) | | `TrackableJob` |

- **There are no list (index) endpoints** for e_archives or e_invoices.
- **There is no cancel endpoint** for e_archives or e_invoices.
- To find the document: `GET /sales_invoices/{id}?include=active_e_document`.

### 8.2 Common form attributes: `EDocumentCommonFormAttributes` (shared by both e_archives and e_invoices)

| field | type | description |
|---|---|---|
| vat_withholding_params | array of `{detail_id: integer, vat_withholding_code: string}` | Tevkifat code per invoice line (`detail_id` = sales_invoice_detail id). Codes are in GİB's [UBLTR_1.2.1_Kilavuzlar.zip](https://ebelge.gib.gov.tr/dosyalar/kilavuzlar/UBLTR_1.2.1_Kilavuzlar.zip). |
| vat_exemption_reason_code | string | KDV muafiyet code for 0% VAT lines (same GİB file) |
| vat_exemption_reason | string | Free-text reason, required if the code is 250 or 350 |
| excise_duty_codes | array of `{product: integer (Product ID), sales_excise_duty_code: enum 57,59,60,61,62,63,9077}` | ÖTV code per product. The enum values are numbers but the type is declared `string`. |

### 8.3 e-Arşiv extra attributes: `EArchiveFormAttributes` = common + the fields below

`internet_sale` (object). "İnternet üzerinden bir satış yapıyorsanız doldurmak zorunlu" (required for online sales).

| field | type |
|---|---|
| url | string |
| payment_type | enum `KREDIKARTI/BANKAKARTI`, `EFT/HAVALE`, `KAPIDAODEME`, `ODEMEARACISI` |
| payment_platform | string, e.g. iyzico, payu |
| payment_date | date `YYYY-MM-DD` |

`shipment` (object). Required when goods are shipped by cargo or courier; not required for in-person service.

| field | type |
|---|---|
| title | cargo company name |
| vkn | cargo company VKN |
| name | courier name |
| tckn | courier TCKN |
| date | string |

**No `scenario` or `to` for e-Arşiv.**

```json
POST /v4/123456/e_archives
{ "data": { "type": "e_archives",
  "attributes": { "vat_exemption_reason_code": null, "excise_duty_codes": [], "vat_withholding_params": [] },
  "relationships": { "sales_invoice": { "data": { "id": "111", "type": "sales_invoices" } } } } }
```

### 8.4 e-Fatura extra attributes: `EInvoiceFormAttributes` = common + the fields below

| field | type / enum | description |
|---|---|---|
| scenario | enum `basic`, `commercial` | "Gönderim senaryosu". `basic` = **TEMELFATURA**, `commercial` = **TİCARİFATURA**. |
| to | string | Recipient's alias (`e_invoice_address` from §7) |
| custom_requirement_params | object `{integration:{data:{}}}` (+ `products[]` for Amazon) | Special buyers (SGK, Amazon). See [SPEC-INTRO] "Belirli Firmalar İçin Özel Gereksinimler". Not relevant to a tire shop unless it invoices SGK or Amazon. |

What the scenarios mean (GİB rules, not from the spec):
- **basic (TEMEL):** The recipient cannot accept or reject the invoice in the system.
- **commercial (TİCARİ):** The recipient can accept or reject it within 8 days [PARASUT-KB [blog](https://www.parasut.com/blog/e-fatura-nasil-iptal-edilir)]. The [kılavuz](https://www.parasut.com/kullanim-kilavuzu/elektronik-faturada-iptal-iade-islemleri) says "7 gün". The Paraşüt pages are inconsistent; the TTK figure is 8 days.

```json
POST /v4/123456/e_invoices
{ "data": { "type": "e_invoices",
  "attributes": { "scenario": "commercial", "to": "urn:mail:defaultpk@musteri.com.tr" },
  "relationships": { "invoice": { "data": { "id": "111", "type": "sales_invoices" } } } } }
```

### 8.5 Trackable job (async)

The response to the create calls:
```json
{ "data": { "id": "c0ffee...", "type": "trackable_jobs", "attributes": { "status": "running", "errors": [] } } }
```
- `TrackableJobAttributes.status` has enum `running, done, error` in the schema.
  - [SPEC-INTRO] also lists **`pending`** (queued, not started): "pending / running / error / done". Handle all four.
- `errors`: `string[]`, a list of human-readable messages (Turkish).
- **The job id is valid for 15 minutes after creation** [SPEC-INTRO]: "id'nin kullanım süresi oluşturulduktan sonra 15 dakikadır". Poll `GET /trackable_jobs/{id}` at intervals within that window.
- After `done`: `GET /sales_invoices/{id}?include=active_e_document` gives the e_archive or e_invoice `id` (§8.6 attributes) [SPEC-INTRO step 3].
- [INFERRED] If the 15 minutes pass without a result, `active_e_document` on the invoice is the source of truth for whether formalization happened.

### 8.6 E-document resources

**`EArchiveAttributes`** (read-only):

| field | type / enum |
|---|---|
| uuid | string (ETTN) |
| vkn | string |
| invoice_number | string (GİB invoice no, e.g. ABC2026000000001) |
| note | string |
| is_printed | bool |
| **status** | enum `bounced`, `sent`, `printed`, `legalized` |
| printed_at | date-time |
| **cancellable_until** | date-time |
| is_signed | bool |
| created_at, updated_at | date |

`relationships.sales_invoice`.
- The status meanings are not documented. [INFERRED] `bounced` = email delivery to the buyer failed, `sent` = emailed, `printed` = printed (kağıt), `legalized` = reported/finalized.

**`EInvoiceAttributes`** (read-only):

| field | type / enum |
|---|---|
| external_id | string |
| uuid | string (ETTN) |
| env_uuid | string (envelope UUID) |
| from_address, from_vkn | string |
| to_address, to_vkn | string |
| direction | enum `inbound`, `outbound` |
| note | string |
| **response_type** | enum `accepted`, `rejected`, `refunded` (the buyer's response under the commercial scenario) |
| contact_name | string |
| scenario | enum `basic`, `commercial` |
| **status** | enum `waiting`, `failed`, `successful` |
| gtb_ref_no, gtb_registration_no, gtb_export_date, response_note | export (e-İhracat) only |
| issue_date | date |
| is_expired, is_answerable | bool (the response window) |
| net_total | number |
| currency | enum `TRL, USD, EUR, GBP` |
| item_type | enum `refund`, `invoice` |
| created_at, updated_at | date |

`relationships.invoice` (sales_invoices | purchase_bills).
- **No push notification exists**, so `response_type` and `status` must be polled (§12).

**`ESmmAttributes`:** `uuid`, `vkn`, `invoice_number` (number), `is_printed`, `printed_at`, `pdf_url`, `created_at`, `updated_at`. e-SMM (serbest meslek makbuzu) does not apply to a tire shop.

---

## 9. PDF endpoints **[SPEC] + [SPEC-INTRO]**

- Endpoints:
  - `GET /{cid}/e_archives/{id}/pdf`
  - `GET /{cid}/e_invoices/{id}/pdf`
  - `GET /{cid}/e_smms/{id}.pdf`
  - The `{id}` is the **e-document id**, not the sales invoice id. [COMMUNITY] mkiyak's README: `$e_archive_id = 123456; //invoice_id değildir.`
- Response 200: `EDocumentPdf` = `{id, type:"e_document_pdfs", attributes:{url: string, expires_at: date-time}}`.
- **204 = the PDF is not ready yet.** [SPEC-INTRO]: "Bu endpoint PDF henüz yoksa boş bir yanıt ile birlikte 204 döner. Yani 204 almayana kadar belirli aralıklarla bu endpoint'e istek yapmanız gerekmektedir." The 204 is **not** listed in the per-operation responses of the spec; it is only in the intro text.
- **The URL is valid for 1 hour**, and `expires_at` tells you when. "Bu linki direk olarak müşterinizle paylaşmamalısınız. İndirip müşterinize kendiniz göndermelisiniz." Download the file and store or forward it yourself.
- Sales offers (quotes) differ: `POST /sales_offers/{id}/pdf` returns **202** plus a trackable job, and the URL is in the job's `data.attributes.url`. That `url` attribute is not in the `TrackableJobAttributes` schema.

---

## 10. Cancellation and returns (iptal / iade)

What the **API** offers [SPEC]:
- `DELETE /sales_invoices/{id}/cancel` and `PATCH /sales_invoices/{id}/recover`, with no description.
- `EArchiveAttributes.cancellable_until` (date-time).
- `item_type: refund` exists for sales invoices, purchase bills and e-invoices.
- `EInvoiceAttributes.response_type` = `accepted | rejected | refunded`.
- **There is no e-document cancel endpoint and no "reject"/"respond" endpoint** for incoming e-invoices in the spec.

Paraşüt product rules [PARASUT-KB [iptal-iade kılavuzu](https://www.parasut.com/kullanim-kilavuzu/elektronik-faturada-iptal-iade-islemleri)]:
- **e-Arşiv:**
  - Can be cancelled **within 7 days of formalization** (UI: invoice view, then DÜZENLE, then İPTAL ET).
  - "Resmileştirilmesinin üzerinden 7 günden fazla bir süre geçtiyse e-arşiv faturayı iptal etmemelisiniz."
  - After 7 days a return is handled with an iade faturası. For a non-company customer, who cannot issue a refund invoice, you create a **Gider Pusulası**.
  - The `cancellable_until` attribute is the API-visible form of this window [INFERRED].
- **e-Fatura TİCARİ (`commercial`):** Only the **buyer** can reject, within the window (7 days per the kılavuz, 8 days per the blog). The seller then issues a new invoice, and the rejected one shows as cancelled. Our app learns about it by polling `response_type == "rejected"`.
- **e-Fatura TEMEL (`basic`):** The seller cannot cancel it.
  - The buyer issues a refund (iade) e-invoice back. It arrives in Paraşüt as a purchase bill with `item_type: refund` (GİDERLER).
  - Alternatively, cancellation goes through the **GİB İptal Portalı** with mutual approval, within 8 days ([blog](https://www.parasut.com/blog/e-fatura-nasil-iptal-edilir)).
- Returns *from* a customer:
  - If the customer is an e-Fatura user, their iade faturası lands in Giderler (purchase bills).
  - If it is on paper, record it with "İADE OLUŞTUR" on the sales invoice (UI).
- An iade faturası *to* a supplier is a sales invoice with `item_type: "refund"`, formalized like any other.

**Not documented, and must be confirmed with Paraşüt:**
- Does `DELETE /sales_invoices/{id}/cancel` on an invoice whose `active_e_document` is an e-Arşiv inside `cancellable_until` cancel the e-Arşiv at GİB, which is what the UI's İPTAL ET does?
  - [COMMUNITY] The WiseCP addon says "Refunding or cancelling a sent invoice deletes its collection and cancels the sales invoice in Paraşüt… Paraşüt may refuse to cancel a document issued to a registered e-Invoice taxpayer… you must finish the refund in the Paraşüt panel" ([docs](https://docs.wisecp.com/en/parasut-e-invoice-addon.md)). This suggests `/cancel` works for e-Arşiv and is refused for e-Fatura.
- What our app must handle, per the above:
  - Track `cancellable_until`.
  - Poll e-Fatura `response_type`.
  - Treat e-Fatura cancellation and returns as a manual or Paraşüt-panel process.
  - Model returns as new refund documents rather than edits.

---

## 11. Errors, HTTP codes, idempotency

- `Error` definition [SPEC]: `{ "title": string, "detail": string }`.
- Every error response is `{ "errors": [ Error, ... ] }`. This is documented identically for `400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 422 Unprocessable Entity` on all operations.
- Success codes:
  - `200` (show/update/cancel/recover/archive)
  - `201` (create, payments, and the e-doc create returning a TrackableJob)
  - `202` (sales_offers pdf)
  - `204` (deletes, plus the e-doc PDF "not ready" case)
- Not documented: `429` and `5xx`.
- [COMMUNITY] The npm typings guess at optional `code`, `source.pointer` and `meta` fields. These are unverified and **not in the spec**. Rely only on `title` and `detail`.
- Async (e-document) errors come as `TrackableJobAttributes.errors: string[]`, not as HTTP errors.
- **Idempotency: there is no idempotency key, header or client-reference field in the spec** (searched for "idempot", "X-" and headers: none). Mechanisms available to detect a duplicate before retrying:
  - `GET /sales_invoices?filter[invoice_series]=X&filter[invoice_id]=N`. `invoice_series` + `invoice_id` are client-settable and filterable. Whether Paraşüt enforces uniqueness on them is not stated.
  - `filter[contact_id]` + `filter[issue_date]`, then compare `description` or `order_no` client-side. Those two fields are not filterable.
  - For formalization, first check `GET /sales_invoices/{id}?include=active_e_document`. If an e-document already exists, do not POST `/e_archives` or `/e_invoices` again. This matters most after a timeout or an expired (15-minute) job id.
  - [COMMUNITY] The WiseCP addon's Retry "reuses the document Paraşüt already issued and only completes missing steps, such as the collection or PDF. It doesn't issue a duplicate." It also suggests an "Invoice ID Prefix" to avoid collisions when several systems write to the same Paraşüt account.

---

## 12. Webhooks / push

- **The official spec has no webhooks.** There are no `webhook` paths, no tag and no callback objects. The live `https://apidocs.parasut.com/swagger.json` was re-downloaded on 2026-10-30, is byte-identical, and contains 0 occurrences of "webhook".
- [COMMUNITY] Some libraries contain a `Webhooks` module: [parasut-api-v4 npm 0.3.0 `src/module/webhooks.ts`](https://cdn.jsdelivr.net/npm/parasut-api-v4@0.3.0/src/module/webhooks.ts) calls `/{firmaNo}/webhooks` with attributes `name, url, events[], is_active`. [laravel-parasut-api](https://packagist.org/packages/theposeidonas/laravel-parasut-api) links `apidocs.parasut.com/#tag/Webhooks`.
  - That tag does **not exist** in the current spec.
  - The npm package's typings for other resources (for example inboxes and trackable jobs) do not match the official schema, so they look hand-written or guessed.
  - **Treat a webhooks endpoint as unconfirmed.** Ask Paraşüt.
- With what is documented, everything is **polling**: trackable jobs, PDF readiness (204), e-Fatura `status` / `response_type`, and e-Arşiv `status`.

---

## 13. Other resources: are they useful for a tire shop?

| Resource | Endpoints | Usefulness |
|---|---|---|
| **e_smms** | `POST /e_smms`, `GET /e_smms/{id}`, `GET /e_smms/{id}.pdf` | Serbest meslek makbuzu, for freelancers. **Not applicable.** |
| **shipment_documents** (İrsaliye) | `GET/POST /shipment_documents`, `GET/PUT/DELETE /{id}` | See the notes below. |
| **stock_movements / stock_updates / warehouses / inventory_levels** | | Only relevant if we sync stock into Paraşüt. A tire shop app is the stock master, so this is probably not needed; keep `shipment_included:false`. |
| **tags** | `GET/POST /tags`, `GET/PUT/DELETE /tags/{id}` (attr `name` required) | Useful for marking API-created invoices (e.g. "UstaLas"), so the accountant can filter. |
| **item_categories** | `GET/POST /item_categories` | Attrs: `name` (required), `category_type` (required, enum `Product, Contact, Employee, SalesInvoice, Expenditure`), `bg_color`, `text_color`, `parent_id`. Filters `filter[name]`, `filter[category_type]`. A `SalesInvoice` category could group our invoices. Optional. |
| **sales_offers** (Teklif) | `GET/POST /sales_offers`, `GET/PUT/DELETE /{id}`, `POST /{id}/pdf` (202 + job), `PATCH /{id}/archive`, `/unarchive`, `GET /{id}/details`, `PATCH /{id}/update_status` (status enum `accepted, rejected, waiting`) | See the notes below. |
| **sharings** | `POST /sharings` (type `sharing_forms`; email `addresses/subject/body`; portal flags; shareable = sales_offers) | Emails a quote through Paraşüt. Optional. |
| **purchase_bills** | full CRUD + `cancel/recover/archive/payments`; `item_type` `purchase_bill, cancelled, recurring_purchase_bill, refund` | Where customer iade e-invoices land (§10). Read-only interest. |
| **transactions** | `GET/DELETE /transactions/{id}` | Needed to delete a payment (§6.1). |

Notes on **shipment_documents** (İrsaliye):
- Attrs: `issue_date` (required), `inflow` (bool, the type), `description`, `city`, `district`, `address`, `shipment_date` (date-time), `procurement_number`.
- Relationships: `contact`, `stock_movements[]` (each with `quantity` + `product`), `tags`.
- **This is a paper/internal irsaliye record. There is no e-İrsaliye formalization endpoint** in the spec (no `e_despatch` or similar).
- Not needed for a service shop.

Notes on **sales_offers** (Teklif):
- [SPEC-INTRO] To convert a quote: GET the offer, POST a sales invoice with `relationships.sales_offer = {id, type:"sales_offers"}`.
- Our app already has its own quote module, so this is optional.
- `GET /sales_offers` has no `page[size]` param in the spec.

---

## 14. Gotchas

From the spec:
1. **Relationship name mismatch:** `POST /e_invoices` uses `relationships.invoice`, but `POST /e_archives` and `/e_smms` use `relationships.sales_invoice` [SPEC].
2. **e-SMM PDF path is `/e_smms/{id}.pdf`**, while the others are `/{id}/pdf` [SPEC].
3. **`currency` uses `TRL`**, not ISO `TRY` [SPEC enums].
4. **Typo field `shipment_addres`** (single s) [SPEC `SalesInvoiceAttributes`].
5. **`order_no` and `order_date` are all-or-nothing for formalization** [SPEC field descriptions].
6. **`unit_price` is VAT-exclusive.** There is no VAT-included flag [SPEC, COMMUNITY]. To reproduce a VAT-inclusive consumer price, back-compute the net price; Paraşüt recomputes the totals.
   - [INFERRED] Expect ±0.01 differences between our gross and Paraşüt's `net_total` unless you choose a net unit price that rounds back exactly. Read Paraşüt's returned totals and reconcile.
   - The spec says nothing about decimal precision or the rounding mode.
7. **Numbers are typed `number`** in the schema, and date-only fields are `format: date` (`YYYY-MM-DD`). [INFERRED / unverified] Rails-backed JSON:API APIs often serialize decimals as strings (e.g. `"118.0"`). Parse defensively (accept number or string) and never use JS floats for money.
8. **`TrackableJob.status` enum omits `pending`**, but the intro says it can occur [SPEC vs SPEC-INTRO].
9. **Job ids expire after 15 minutes** [SPEC-INTRO]. **PDF URLs expire after 1 hour** (`expires_at`), and the PDF endpoint returns **204 until ready**. That 204 is not in the per-operation response list.
10. **Rate limit: 10 requests per 10 seconds** [SPEC-INTRO]. Scope and headers are unknown, and no 429 is documented. Polling jobs and PDFs eats into this budget.
11. **`page[size]` maximum is 25** [SPEC]. Syncing large contact or product lists is slow; with the rate limit, about 25 records per request at 1 request/s.
12. **No `example` payloads** in the spec; everything is schema-only.
13. **`id`s are strings in JSON bodies but integers in paths.** Some form fields are integers too (`account_id`, `payment_account_id` (number), `detail_id`, `excise_duty_codes[].product`).
14. **No scopes in OAuth**, so the token can do anything the user's role allows. Check `user_roles` (rw/ro/na) after connecting.
15. **The `excise_duty_codes[].sales_excise_duty_code` enum holds numbers in a `string`-typed field** [SPEC].
16. `PaymentAttributes.currency` is typed `number` (spec bug).
17. **The spec has no e-Arşiv or e-Fatura cancel endpoint and no list endpoint**. Discovery goes through `sales_invoices?include=active_e_document` [SPEC].
18. **Recipient alias date rule:** an e-Fatura issue date must not be before the recipient's alias registration date, nor before our own `e_invoicing_activated_at` [SPEC-INTRO]. Back-dated orders can fail formalization.
19. **Free-text invoice lines** (no product) are allowed by the schema but contradicted by the guide prose (§4). Test them.
20. **Stock side-effect:** inventory-tracked products on an *irsaliyeli* invoice (`shipment_included: true`) create Paraşüt stock movements [SPEC stock_movements description].
21. Turkish characters: the spec itself contains UTF-8 Turkish enum values, for example `shipping_method` "Çok araçlı", "İç su taşımacılığı" [SPEC]. Send UTF-8 JSON. Nothing in the spec suggests ASCII folding is needed.

From community sources:
22. [COMMUNITY] The npm `parasut-api-v4` token-age check mixes seconds and milliseconds (`created_at.getTime()` without /1000) ([api.ts](https://cdn.jsdelivr.net/npm/parasut-api-v4@0.3.0/src/api.ts)). It is an example of why you should rely on `expires_in` plus 401-driven refresh. Its webhooks, inbox and trackable-job typings do not match the official schema.
23. [COMMUNITY] `laravel-parasut-api` notes "Gerekenden farklı bir parametre gönderemezsiniz": unexpected query params are rejected ([packagist](https://packagist.org/packages/theposeidonas/laravel-parasut-api)).
24. [COMMUNITY] WiseCP addon:
    - Sandbox ("Test Mode") requires **separate sandbox credentials from Paraşüt support**.
    - The default VAT exemption code it uses for 0% lines is `302`.
    - Invoice line notes are capped at **120 characters** (their limit; the source is unclear).
    - ([docs](https://docs.wisecp.com/en/parasut-e-invoice-addon.md))
25. [COMMUNITY] `parasut-python` (PyPI) mentions a sandbox flag pointing at a Paraşüt staging host on a `heroku-staging` domain. **This is unverified**, so ask Paraşüt for the official sandbox URL.

---

## 15. Open questions only Paraşüt support (destek@parasut.com) can answer

1. **API access and pricing:**
   - Which Paraşüt subscription plans include API access?
   - Is there an extra fee, or a separate "API" or partner tier?
   - Are e-kontör (credits) consumed per e-document via the API exactly as in the UI? (No official API pricing was found. [PARASUT-KB] pages list e-kontör packs, e.g. [on-muhasebe-fiyatlari](https://www.parasut.com/on-muhasebe-fiyatlari), with no API mention.)
2. **Partner / ISV program:** Can we get **one** `client_id`/`client_secret` for our SaaS that **many independent Paraşüt customers** authorize via `authorization_code`? Or does each tenant need its own app credentials?
3. **Redirect URL registration:**
   - Register `https://<our-domain>/api/integrations/parasut/callback`, plus staging and dev URLs.
   - Are multiple redirect URIs per client allowed?
   - Is `state` echoed back?
   - Is PKCE supported?
4. **Refresh-token lifetime** and revocation:
   - Does a refresh token expire if unused?
   - Is there a revoke endpoint for "disconnect"?
   - What happens when the user changes their password?
5. **Rate limit scope:** Is 10 per 10 s per access token, per user, per company or per client_id? What status code and headers are returned when it is exceeded?
6. **Sandbox:** Official sandbox base URL, how to obtain sandbox credentials, and whether e-documents in the sandbox go to the GİB test environment.
7. **Multi-company access:** When a user's `/me` lists several companies, can one token act on all of them (by changing `company_id` in the path)? Is consent per company?
8. **Webhooks:** Do `/{company_id}/webhooks` endpoints exist (they are referenced by community libraries but absent from the spec)? If so, which events (e-document status, e-Fatura response, payment)?
9. **e-Arşiv cancel via API:**
   - Does `DELETE /sales_invoices/{id}/cancel` cancel a formalized e-Arşiv within `cancellable_until`?
   - What happens for an e-Fatura?
10. **Free-text invoice lines** without a `product` relationship: are they supported for formalization (UBL item name)?
11. **Uniqueness of `invoice_series` + `invoice_id`.** Will a duplicate POST be rejected with 422? Is there any idempotency mechanism?
12. **Multiple e-invoice aliases per VKN:** which alias to use for `to`. Does Paraşüt default it if `to` is omitted?
13. **`unit_price` semantics confirmation** (VAT-exclusive), and the rounding rules for totals.
14. **Date-filter syntax** for `filter[issue_date]` (single date vs range).
15. **e-Arşiv delivery:** Does Paraşüt email the e-Arşiv to `contact.email` automatically (the `bounced`/`sent` statuses suggest so)? Can this be suppressed if we send the PDF ourselves?
16. Whether `invoicing_preferences.e_document_accounts` / `e_document_accounts` on the invoice control the e-document email recipients.

---

### Sources (non-spec)
- Paraşüt kılavuz, iptal/iade: https://www.parasut.com/kullanim-kilavuzu/elektronik-faturada-iptal-iade-islemleri
- Paraşüt blog, e-fatura iptal: https://www.parasut.com/blog/e-fatura-nasil-iptal-edilir
- Paraşüt e-fatura pricing page: https://www.parasut.com/on-muhasebe-fiyatlari
- GİB UBL-TR kılavuzları (code lists, linked from the spec): https://ebelge.gib.gov.tr/dosyalar/kilavuzlar/UBLTR_1.2.1_Kilavuzlar.zip
- mkiyak/parasut-api-v4 (PHP): https://packagist.org/packages/mkiyak/parasut-api-v4
- leventcz/parasut-php: https://github.com/leventcz/parasut-php
- theposeidonas/laravel-parasut-api: https://packagist.org/packages/theposeidonas/laravel-parasut-api
- parasut-api-v4 (npm, Sergeant61): https://cdn.jsdelivr.net/npm/parasut-api-v4@0.3.0/src/
- yigitkonur/mcp-parasut: https://github.com/yigitkonur/mcp-parasut
- WiseCP Paraşüt e-Invoice addon docs: https://docs.wisecp.com/en/parasut-e-invoice-addon.md
- parasut-python (PyPI): https://pypi.org/project/parasut-python
