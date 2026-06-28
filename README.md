# Grocery-ImporterApi

Firebase Cloud Functions importer for Grocery product CSV files.

The function listens for CSV uploads in Firebase Storage, validates each row with Zod, upserts product documents in Cloud Firestore, moves successful files to `History/`, and emails maintainers after three failed attempts.

See [docs/firestore-schema.md](docs/firestore-schema.md) for the Grocery Delivery System Firestore data model.

## CSV Structure

Upload CSV files to the configured import folder, defaulting to `imports/products/`.

Required columns:

```csv
ProductId,product desc,categoryId,category desc,new price,weightable
123,Milk 3%,dairy,Dairy Products,7.50,false
456,Bananas,produce,Produce,4.00,true
```

Supported aliases:

- `ProductId`, `product id`, `productId`
- `product desc`, `product description`, `productDesc`
- `categoryId`, `category id`, `category`
- `category desc`, `category description`, `categoryDesc`
- `new price`, `price`
- `weightable`, `wieghtable`, `weighable`

Each imported row writes:

- Product catalog fields to `products/{ProductId}` without `categoryDesc` or `price`
- Category descriptions to `categories/{categoryId}`
- Imported prices to `PriceLists/{ProductId}`
- Auto-increment integer `id` fields using `counters/{tableName}`

## Environment

Create `.env.local` for local development. Do not commit real secrets.

```bash
IMPORT_STORAGE_BUCKET=online-shop-bf396.firebasestorage.app
IMPORT_FOLDER=imports/products/
HISTORY_FOLDER=History/
IMPORT_FAILURE_EMAIL_TO=admin@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=local-password
SMTP_FROM=no-reply@example.com
```

## Local Development

Install dependencies:

```bash
npm install
```

Log in to Firebase CLI if needed:

```bash
npx firebase login
```

Select or verify the Firebase project:

```bash
npx firebase use online-shop-bf396
```

Start Firebase emulators for Functions, Firestore, and Storage:

```bash
npm run serve
```

The `serve` script automatically uses a locally installed Temurin JDK 21 on Windows if Cursor's terminal has not picked up the updated Java PATH yet.

After the emulators start, open `http://127.0.0.1:4000/storage/online-shop-bf396.firebasestorage.app` and upload [samples/sample-products.csv](samples/sample-products.csv) to `imports/products/sample-products.csv`. The function listens to the `online-shop-bf396.firebasestorage.app` bucket and only processes `.csv` files under `imports/products/`. Confirm the function logs show file filtering, CSV parsing, row validation, Firestore upserts, archive movement, and final status.

Run local checks:

```bash
npm test
npm run build
```

## Deploy

Build before deployment:

```bash
npm install
npm run build
```

Log in and select the Firebase project:

```bash
npx firebase login
npx firebase use online-shop-bf396
```

Configure production values through Firebase environment support or secrets. Use secrets for sensitive values such as `SMTP_PASS`.

Deploy the function:

```bash
npx firebase deploy --only functions
```

Check production logs:

```bash
npx firebase functions:log
```
