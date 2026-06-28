# Firestore Schema

This document defines the initial Cloud Firestore model for the Grocery Delivery System.

## Import Flow

CSV price imports are handled by the Firebase Storage trigger in `src/index.ts`. Each valid row is normalized in `src/productRow.ts` and written by `src/importProductCsv.ts`.

The importer currently writes:

- Catalog data to `products/{productId}`
- Category lookup data to `categories/{categoryId}`
- Imported prices to `PriceLists/{productId}`

Firestore document IDs stay stable business keys for upsert behavior. Each imported table document also stores an auto-increment integer `id` field allocated from the `counters` collection.

## Collections

### `products/{productId}`

Master product catalog.

Fields:

- `productId`: string, document id and product identifier from CSV `ProductId`
- `id`: number, auto-increment product id
- `productDesc`: string, product description from CSV `product desc`
- `categoryId`: string, category id from CSV `categoryId`
- `weightable`: boolean, whether product is sold by weight
- `active`: boolean
- `updatedAt`: Firestore server timestamp

### `categories/{categoryId}`

Category lookup table. The category key is stored as the Firestore document id, not as a field on the document.

Fields:

- `id`: number, auto-increment category id
- `categoryDesc`: string
- `active`: boolean
- `updatedAt`: Firestore server timestamp

### `PriceLists/{productId}`

Imported product price table. The importer upserts one document per product price.

Fields:

- `id`: number, auto-increment import price id
- `productId`: string
- `productDescSnapshot`: string
- `categoryId`: string
- `categoryDescSnapshot`: string
- `price`: number
- `weightable`: boolean
- `source`: string
- `updatedAt`: Firestore server timestamp

### `counters/{counterName}`

Technical counter documents for allocating numeric ids.

Fields:

- `nextId`: number
- `updatedAt`: Firestore server timestamp

### `orders/{orderId}`

Customer order header.

Fields:

- `orderId`: string
- `customerId`: string
- `status`: `draft`, `placed`, `paid`, `picking`, `ready_for_delivery`, `out_for_delivery`, `delivered`, `cancelled`
- `priceListId`: string or null
- `subtotal`: number
- `deliveryFee`: number
- `discountTotal`: number
- `total`: number
- `deliveryAddress`: map
- `requestedDeliveryWindow`: map with `from` and `to`
- `createdAt`: Firestore server timestamp
- `updatedAt`: Firestore server timestamp

### `orders/{orderId}/items/{orderItemId}`

Order line item snapshot.

Fields:

- `productId`: string
- `productDescSnapshot`: string
- `categoryId`: string
- `quantity`: number
- `unitPrice`: number
- `lineTotal`: number
- `weightable`: boolean
- `actualWeight`: number or null
- `status`: `pending`, `picked`, `substituted`, `unavailable`, `cancelled`

Order items intentionally store product and price snapshots so historical orders remain correct after product or price updates.

### `deliveryData/{deliveryId}`

Delivery execution data for an order.

Fields:

- `deliveryId`: string
- `orderId`: string
- `driverId`: string or null
- `status`: `pending_assignment`, `assigned`, `picked_up`, `delivered`, `failed`, `cancelled`
- `address`: map
- `deliveryWindow`: map with `from` and `to`
- `assignedAt`: Firestore timestamp or null
- `pickedUpAt`: Firestore timestamp or null
- `deliveredAt`: Firestore timestamp or null
- `failedReason`: string or null
- `updatedAt`: Firestore server timestamp

### `customers/{customerId}`

Customer profile.

Fields:

- `customerId`: string
- `displayName`: string
- `phone`: string
- `email`: string or null
- `defaultAddress`: map or null
- `createdAt`: Firestore server timestamp
- `updatedAt`: Firestore server timestamp

### `drivers/{driverId}`

Driver profile and availability.

Fields:

- `driverId`: string
- `displayName`: string
- `phone`: string
- `active`: boolean
- `currentStatus`: `available`, `busy`, `offline`
- `updatedAt`: Firestore server timestamp

### `importAttempts/{attemptId}` and `importLogs/{importLogId}`

Technical collections used by the importer for retry tracking and operational logs.

## Query Patterns

- Products by category: query `products` where `categoryId == value` and `active == true`
- Current price for product: read `PriceLists/{productId}`
- Customer orders: query `orders` by `customerId` and `createdAt`
- Active orders: query `orders` by `status`
- Driver deliveries: query `deliveryData` by `driverId` and `status`
