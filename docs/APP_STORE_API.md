# App Store API Documentation

The App Store API provides endpoints for browsing, searching, and managing applications in the Interspace ecosystem.

## Base URL
All endpoints are prefixed with: `/api/v2/app-store`

## Public Endpoints (No Authentication Required)

### 1. Get All Categories
```
GET /app-store/categories
```

Returns all active app categories.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "name": "DeFi",
      "slug": "defi",
      "description": "Decentralized Finance applications",
      "icon": "💰",
      "position": 1,
      "appsCount": 15,
      "createdAt": "2025-01-09T...",
      "updatedAt": "2025-01-09T..."
    }
  ]
}
```

### 2. Get All Apps
```
GET /app-store/apps
```

Returns paginated list of apps with optional filtering.

**Query Parameters:**
- `q` (string): Search query
- `category` (string): Filter by category slug
- `tags` (string[]): Filter by tags
- `chains` (string[]): Filter by supported chain IDs
- `sortBy` (string): Sort by 'popularity', 'newest', or 'name' (default: 'popularity')
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20, max: 100)

**Example:**
```
GET /app-store/apps?category=defi&chains=1,137&page=1&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "name": "Uniswap",
      "url": "https://app.uniswap.org",
      "iconUrl": "https://app.uniswap.org/favicon.ico",
      "category": {
        "id": "clx...",
        "name": "DeFi",
        "slug": "defi"
      },
      "description": "Trade crypto tokens on the leading decentralized exchange",
      "tags": ["swap", "dex", "liquidity"],
      "popularity": 1000,
      "isNew": false,
      "isFeatured": true,
      "chainSupport": ["1", "137", "42161"],
      "developer": "Uniswap Labs",
      "version": "4.0",
      "lastUpdated": "2025-01-09T..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### 3. Get Featured Apps
```
GET /app-store/featured
```

Returns up to 12 featured apps sorted by popularity.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "name": "Uniswap",
      "isFeatured": true,
      // ... other app fields
    }
  ]
}
```

### 4. Search Apps
```
GET /app-store/search?q=<query>
```

Search apps by name, description, tags, or developer.

**Query Parameters:**
- `q` (string, required): Search query (minimum 2 characters)

**Response:**
```json
{
  "success": true,
  "data": [
    // Array of matching apps (up to 20)
  ]
}
```

### 5. Get App by ID
```
GET /app-store/apps/:id
```

Get detailed information about a specific app.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "clx...",
    "name": "Uniswap",
    "url": "https://app.uniswap.org",
    "iconUrl": "https://app.uniswap.org/favicon.ico",
    "category": { /* category object */ },
    "description": "Trade crypto tokens...",
    "detailedDescription": "Uniswap is a decentralized trading protocol...",
    "tags": ["swap", "dex", "liquidity"],
    "popularity": 1001, // Incremented on view
    "isNew": false,
    "isFeatured": true,
    "chainSupport": ["1", "137", "42161"],
    "screenshots": ["url1", "url2"],
    "developer": "Uniswap Labs",
    "version": "4.0",
    "shareableId": "abc123...",
    "metadata": {
      "rating": 4.5,
      "reviewsCount": 150,
      "installsCount": 10000
    },
    "lastUpdated": "2025-01-09T...",
    "createdAt": "2025-01-01T...",
    "updatedAt": "2025-01-09T..."
  }
}
```

### 6. Get App by Shareable ID
```
GET /app-store/apps/share/:shareableId
```

Get app information using a shareable link ID.

## Admin Endpoints (Authentication Required)

> **Note:** Admin authentication middleware needs to be implemented. Currently, these endpoints are accessible without authentication for development purposes.

### 1. Create App
```
POST /app-store/apps
```

**Request Body:**
```json
{
  "name": "New DeFi App",
  "url": "https://newapp.com",
  "iconUrl": "https://newapp.com/icon.png",
  "categoryId": "clx...",
  "description": "Short description",
  "detailedDescription": "Detailed description...",
  "tags": ["defi", "new"],
  "chainSupport": ["1", "137"],
  "screenshots": ["url1", "url2"],
  "developer": "Developer Name",
  "version": "1.0",
  "isFeatured": false,
  "isNew": true
}
```

**Required Fields:** `name`, `url`, `categoryId`, `description`

### 2. Update App
```
PUT /app-store/apps/:id
```

**Request Body:** Same as create, but all fields are optional

### 3. Delete App
```
DELETE /app-store/apps/:id
```

Soft deletes an app by setting `isActive` to false.

### 4. Create Category
```
POST /app-store/categories
```

**Request Body:**
```json
{
  "name": "New Category",
  "slug": "new-category",
  "description": "Category description",
  "icon": "🆕",
  "position": 7
}
```

**Required Fields:** `name`, `slug`

### 5. Update Category
```
PUT /app-store/categories/:id
```

**Request Body:** Same as create, but all fields are optional

### 6. Delete Category
```
DELETE /app-store/categories/:id
```

Soft deletes a category. Cannot delete if apps exist in the category.

## Database Schema

### AppStoreCategory
- `id` (string): Unique identifier
- `name` (string): Display name
- `slug` (string): URL-friendly identifier
- `description` (string?): Optional description
- `icon` (string?): Icon URL or emoji
- `position` (number): Sort order
- `isActive` (boolean): Soft delete flag
- `createdAt` (datetime)
- `updatedAt` (datetime)

### AppStoreApp
- `id` (string): Unique identifier
- `name` (string): App name
- `url` (string): App URL
- `iconUrl` (string?): Icon URL
- `categoryId` (string): Category reference
- `description` (string): Short description
- `detailedDescription` (string?): Long description
- `tags` (string[]): Array of tags
- `popularity` (number): View/usage count
- `isNew` (boolean): New app flag
- `isFeatured` (boolean): Featured flag
- `chainSupport` (string[]): Supported chain IDs
- `screenshots` (string[]): Screenshot URLs
- `developer` (string?): Developer name
- `version` (string?): App version
- `lastUpdated` (datetime): Last update time
- `isActive` (boolean): Soft delete flag
- `shareableId` (string?): Public share ID
- `metadata` (json?): Additional data (ratings, etc.)
- `createdAt` (datetime)
- `updatedAt` (datetime)

## Running Migrations

1. Apply the migration:
```bash
cd /Users/ardaerturk/Documents/GitHub/interspace-codebase/interspace-backend
npx prisma migrate deploy
```

2. Seed initial data:
```bash
npx tsx scripts/seed-app-store.ts
```

## Caching

The API implements caching for better performance:
- Categories are cached for 1 hour
- Featured apps are cached for 1 hour
- Individual app queries increment popularity count

## Future Enhancements

1. **User Reviews & Ratings**: Store in metadata field
2. **Install/Usage Tracking**: Track app usage per profile
3. **Admin Authentication**: Implement proper admin middleware
4. **App Verification**: Add verified badge for audited apps
5. **Chain-specific Filtering**: Enhanced multi-chain support
6. **Webhooks**: Notify when new apps are added
7. **Analytics**: Track popular searches and app trends