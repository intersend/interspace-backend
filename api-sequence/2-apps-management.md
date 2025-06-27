# Apps Management

## Table of Contents
1. [Overview](#overview)
2. [Create App](#create-app)
3. [Get All Profile Apps](#get-all-profile-apps)
4. [Get Root Apps](#get-root-apps)
5. [Get Folder Apps](#get-folder-apps)
6. [Search Apps](#search-apps)
7. [Update App](#update-app)
8. [Delete App](#delete-app)
9. [Reorder Apps](#reorder-apps)
10. [Move App to Folder](#move-app-to-folder)

---

## Overview

The Apps Management API allows users to bookmark and organize web applications within their profiles. Apps can be organized in folders, reordered, and searched.

### Authentication
All endpoints require authentication using the `authenticateAccount` middleware and include user rate limiting.

### Base URL
```
/api/v2
```

---

## Create App

Bookmarks a new app within a profile.

### Request
```
POST /api/v2/profiles/:profileId/apps
Authorization: Bearer <access_token>
Content-Type: application/json
```

#### Path Parameters
- `profileId` (string, required): The ID of the profile to add the app to

#### Request Body
```json
{
  "name": "GitHub",
  "url": "https://github.com",
  "iconUrl": "https://github.com/favicon.ico",
  "folderId": "folder123",  // optional - null for root level
  "position": 1  // optional - auto-calculated if not provided
}
```

#### Validation Rules
- `name`: Required, string
- `url`: Required, string (valid URL)
- `iconUrl`: Optional, string (valid URL)
- `folderId`: Optional, string (must be valid folder ID in the same profile)
- `position`: Optional, number (if not provided, placed at the end)

### Response

#### Success (201 Created)
```json
{
  "success": true,
  "data": {
    "id": "app123",
    "name": "GitHub",
    "url": "https://github.com",
    "iconUrl": "https://github.com/favicon.ico",
    "position": 1,
    "folderId": "folder123",
    "folderName": "Development Tools",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "message": "App bookmarked successfully"
}
```

#### Error Responses
- **400 Bad Request**: Missing required fields
- **403 Forbidden**: No access to the specified profile
- **404 Not Found**: Profile or folder not found

### Sequence
```
Client                          Backend                         Database
  |                               |                                |
  |-- POST /api/v2/profiles/      |                                |
  |   :profileId/apps ----------->|                                |
  |                               |-- Verify profile ownership --->|
  |                               |-- Verify folder (if provided)->|
  |                               |-- Calculate position --------->|
  |                               |-- Create BookmarkedApp ------->|
  |                               |-- Create AuditLog ------------>|
  |<-- 201 Created ---------------|                                |
```

---

## Get All Profile Apps

Retrieves all bookmarked apps for a profile.

### Request
```
GET /api/v2/profiles/:profileId/apps
Authorization: Bearer <access_token>
```

#### Path Parameters
- `profileId` (string, required): The ID of the profile

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": "app123",
      "name": "GitHub",
      "url": "https://github.com",
      "iconUrl": "https://github.com/favicon.ico",
      "position": 1,
      "folderId": null,
      "folderName": null,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    {
      "id": "app456",
      "name": "Stack Overflow",
      "url": "https://stackoverflow.com",
      "iconUrl": "https://stackoverflow.com/favicon.ico",
      "position": 1,
      "folderId": "folder123",
      "folderName": "Development Tools",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### Notes
- Returns empty array for non-existent profiles (graceful handling for new users)
- Apps are sorted by folderId (ascending) then position (ascending)

---

## Get Root Apps

Retrieves apps that are not in any folder (root level).

### Request
```
GET /api/v2/profiles/:profileId/apps/root
Authorization: Bearer <access_token>
```

#### Path Parameters
- `profileId` (string, required): The ID of the profile

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": "app123",
      "name": "GitHub",
      "url": "https://github.com",
      "iconUrl": "https://github.com/favicon.ico",
      "position": 1,
      "folderId": null,
      "folderName": null,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### Error Responses
- **403 Forbidden**: No access to the specified profile
- **404 Not Found**: Profile not found

---

## Get Folder Apps

Retrieves apps within a specific folder.

### Request
```
GET /api/v2/profiles/:profileId/folders/:folderId/apps
Authorization: Bearer <access_token>
```

#### Path Parameters
- `profileId` (string, required): The ID of the profile
- `folderId` (string, required): The ID of the folder

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": "app456",
      "name": "Stack Overflow",
      "url": "https://stackoverflow.com",
      "iconUrl": "https://stackoverflow.com/favicon.ico",
      "position": 1,
      "folderId": "folder123",
      "folderName": "Development Tools",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### Error Responses
- **403 Forbidden**: No access to the specified profile
- **404 Not Found**: Folder not found or doesn't belong to the profile

---

## Search Apps

Searches for apps by name or URL within a profile.

### Request
```
GET /api/v2/profiles/:profileId/apps/search?query=github
Authorization: Bearer <access_token>
```

#### Path Parameters
- `profileId` (string, required): The ID of the profile

#### Query Parameters
- `query` (string, optional): Search term to match against app name or URL

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": "app123",
      "name": "GitHub",
      "url": "https://github.com",
      "iconUrl": "https://github.com/favicon.ico",
      "position": 1,
      "folderId": null,
      "folderName": null,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### Notes
- Search is case-insensitive
- Searches both name and URL fields
- Results are sorted alphabetically by name

---

## Update App

Updates a bookmarked app's details.

### Request
```
PUT /api/v2/apps/:appId
Authorization: Bearer <access_token>
Content-Type: application/json
```

#### Path Parameters
- `appId` (string, required): The ID of the app to update

#### Request Body
```json
{
  "name": "GitHub - Code Hosting",  // optional
  "url": "https://github.com",      // optional
  "iconUrl": "https://github.com/new-favicon.ico"  // optional
}
```

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "id": "app123",
    "name": "GitHub - Code Hosting",
    "url": "https://github.com",
    "iconUrl": "https://github.com/new-favicon.ico",
    "position": 1,
    "folderId": null,
    "folderName": null,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T01:00:00.000Z"
  },
  "message": "App updated successfully"
}
```

#### Error Responses
- **404 Not Found**: App not found or user doesn't have access

#### Notes
- Only the fields provided in the request body will be updated
- User must own the profile that contains the app

---

## Delete App

Deletes a bookmarked app.

### Request
```
DELETE /api/v2/apps/:appId
Authorization: Bearer <access_token>
```

#### Path Parameters
- `appId` (string, required): The ID of the app to delete

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "message": "App deleted successfully"
}
```

#### Error Responses
- **404 Not Found**: App not found or user doesn't have access

---

## Reorder Apps

Reorders apps within a profile (either at root level or within a folder).

### Request
```
POST /api/v2/profiles/:profileId/apps/reorder
Authorization: Bearer <access_token>
Content-Type: application/json
```

#### Path Parameters
- `profileId` (string, required): The ID of the profile

#### Request Body
```json
{
  "appOrders": ["app123", "app456", "app789"]  // Array of app IDs in desired order
}
```

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "message": "Apps reordered successfully"
}
```

#### Error Responses
- **403 Forbidden**: No access to the specified profile
- **404 Not Found**: Some apps not found or not accessible

#### Notes
- All apps in the array must belong to the same location (either all at root or all in the same folder)
- Apps will be assigned positions 1, 2, 3, etc. based on their order in the array

---

## Move App to Folder

Moves an app to a different folder or to root level.

### Request
```
PUT /api/v2/apps/:appId/move
Authorization: Bearer <access_token>
Content-Type: application/json
```

#### Path Parameters
- `appId` (string, required): The ID of the app to move

#### Request Body
```json
{
  "folderId": "folder456"  // Use null to move to root level
}
```

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "id": "app123",
    "name": "GitHub",
    "url": "https://github.com",
    "iconUrl": "https://github.com/favicon.ico",
    "position": 1,
    "folderId": "folder456",
    "folderName": "New Folder",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T02:00:00.000Z"
  },
  "message": "App moved successfully"
}
```

#### Error Responses
- **404 Not Found**: App or target folder not found

#### Notes
- When moved to a new location, the app is placed at the end (highest position + 1)
- The folder must belong to the same profile as the app

---

## Common Response Structure

### Success Response
All successful responses follow this structure:
```json
{
  "success": true,
  "data": { /* endpoint-specific data */ },
  "message": "Optional success message"
}
```

### Error Response
All error responses follow this structure:
```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

---

## Security & Access Control

1. **Authentication**: All endpoints require a valid access token
2. **Profile Access**: Users can only access apps in profiles they own or have access to
3. **Folder Access**: Folders must belong to the same profile as the apps
4. **Audit Logging**: App creation is logged in the audit trail

---

## Rate Limiting

All endpoints use the standard user rate limit configuration:
- Authenticated users: Standard rate limits based on user tier
- Development mode: Enhanced limits for testing