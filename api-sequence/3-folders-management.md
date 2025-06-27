# Folders Management

## Table of Contents
1. [Overview](#overview)
2. [Create Folder](#create-folder)
3. [Get All Profile Folders](#get-all-profile-folders)
4. [Get Folder by ID](#get-folder-by-id)
5. [Update Folder](#update-folder)
6. [Delete Folder](#delete-folder)
7. [Reorder Folders](#reorder-folders)
8. [Share Folder](#share-folder)
9. [Unshare Folder](#unshare-folder)
10. [Get Shared Folder](#get-shared-folder)
11. [Get Folder Contents](#get-folder-contents)

---

## Overview

The Folders Management API allows users to create, organize, and share folders within their profiles. Folders can contain bookmarked apps and can be shared publicly via unique URLs.

### Authentication
- Most endpoints require authentication using `authenticateAccount` middleware
- Public shared folder access uses `optionalAuthenticate` middleware
- All authenticated endpoints include user rate limiting

### Base URL
```
/api/v2
```

---

## Create Folder

Creates a new folder within a profile.

### Request
```
POST /api/v2/profiles/:profileId/folders
Authorization: Bearer <access_token>
Content-Type: application/json
```

#### Path Parameters
- `profileId` (string, required): The ID of the profile to add the folder to

#### Request Body
```json
{
  "name": "Development Tools",
  "position": 1,  // optional - auto-calculated if not provided
  "color": "#3B82F6"  // optional - hex color code
}
```

#### Validation Rules
- `name`: Required, string (must be unique within the profile)
- `position`: Optional, number (if not provided, placed at the end)
- `color`: Optional, string (hex color code)

### Response

#### Success (201 Created)
```json
{
  "success": true,
  "data": {
    "id": "folder123",
    "name": "Development Tools",
    "position": 1,
    "isPublic": false,
    "shareableId": null,
    "color": "#3B82F6",
    "appsCount": 0,
    "apps": [],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "message": "Folder created successfully"
}
```

#### Error Responses
- **400 Bad Request**: Missing required fields
- **403 Forbidden**: No access to the specified profile
- **404 Not Found**: Profile not found
- **409 Conflict**: Folder with this name already exists

### Sequence
```
Client                          Backend                         Database
  |                               |                                |
  |-- POST /api/v2/profiles/      |                                |
  |   :profileId/folders -------->|                                |
  |                               |-- Verify profile ownership --->|
  |                               |-- Check name uniqueness ------>|
  |                               |-- Calculate position --------->|
  |                               |-- Create Folder -------------->|
  |                               |-- Create AuditLog ------------>|
  |<-- 201 Created ---------------|                                |
```

---

## Get All Profile Folders

Retrieves all folders for a profile with their app counts.

### Request
```
GET /api/v2/profiles/:profileId/folders
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
      "id": "folder123",
      "name": "Development Tools",
      "position": 1,
      "isPublic": false,
      "shareableId": null,
      "color": "#3B82F6",
      "appsCount": 5,
      "apps": [
        {
          "id": "app123",
          "name": "GitHub",
          "url": "https://github.com",
          "iconUrl": "https://github.com/favicon.ico",
          "position": 1,
          "folderId": "folder123",
          "createdAt": "2024-01-01T00:00:00.000Z",
          "updatedAt": "2024-01-01T00:00:00.000Z"
        }
      ],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### Notes
- Returns empty array for non-existent profiles (graceful handling for new users)
- Folders are sorted by position (ascending)
- Apps within folders are also sorted by position

---

## Get Folder by ID

Retrieves a specific folder with its contents.

### Request
```
GET /api/v2/profiles/:profileId/folders/:folderId
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
  "data": {
    "id": "folder123",
    "name": "Development Tools",
    "position": 1,
    "isPublic": false,
    "shareableId": null,
    "color": "#3B82F6",
    "appsCount": 5,
    "apps": [...],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Error Responses
- **403 Forbidden**: No access to the specified profile
- **404 Not Found**: Folder not found or doesn't belong to the profile

---

## Update Folder

Updates a folder's properties.

### Request
```
PUT /api/v2/folders/:folderId
Authorization: Bearer <access_token>
Content-Type: application/json
```

#### Path Parameters
- `folderId` (string, required): The ID of the folder to update

#### Request Body
```json
{
  "name": "Dev Tools & Resources",  // optional
  "color": "#10B981"  // optional
}
```

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "id": "folder123",
    "name": "Dev Tools & Resources",
    "position": 1,
    "isPublic": false,
    "shareableId": null,
    "color": "#10B981",
    "appsCount": 5,
    "apps": [...],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T01:00:00.000Z"
  },
  "message": "Folder updated successfully"
}
```

#### Error Responses
- **404 Not Found**: Folder not found or user doesn't have access
- **409 Conflict**: Another folder with this name already exists

---

## Delete Folder

Deletes a folder. Apps within the folder are moved to root level.

### Request
```
DELETE /api/v2/folders/:folderId
Authorization: Bearer <access_token>
```

#### Path Parameters
- `folderId` (string, required): The ID of the folder to delete

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "message": "Folder deleted successfully"
}
```

#### Error Responses
- **404 Not Found**: Folder not found or user doesn't have access

#### Important Notes
- When a folder is deleted, all apps within it are automatically moved to the root level (folderId set to null)
- This ensures no apps are lost when a folder is deleted

---

## Reorder Folders

Reorders folders within a profile.

### Request
```
POST /api/v2/profiles/:profileId/folders/reorder
Authorization: Bearer <access_token>
Content-Type: application/json
```

#### Path Parameters
- `profileId` (string, required): The ID of the profile

#### Request Body
```json
{
  "folderOrders": ["folder123", "folder456", "folder789"]  // Array of folder IDs in desired order
}
```

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "message": "Folders reordered successfully"
}
```

#### Error Responses
- **403 Forbidden**: No access to the specified profile
- **404 Not Found**: Some folders not found or not accessible

#### Notes
- All folders in the array must belong to the specified profile
- Folders will be assigned positions 1, 2, 3, etc. based on their order in the array

---

## Share Folder

Makes a folder publicly accessible via a unique shareable URL.

### Request
```
POST /api/v2/folders/:folderId/share
Authorization: Bearer <access_token>
```

#### Path Parameters
- `folderId` (string, required): The ID of the folder to share

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "shareableId": "a1b2c3d4e5f6",
    "shareableUrl": "https://app.interspace.com/shared/folders/a1b2c3d4e5f6"
  },
  "message": "Folder shared successfully"
}
```

#### Error Responses
- **404 Not Found**: Folder not found or user doesn't have access

#### Notes
- A unique shareable ID is generated if the folder wasn't already shared
- The shareable URL can be accessed without authentication
- Folder is marked as `isPublic: true`

---

## Unshare Folder

Makes a shared folder private again.

### Request
```
DELETE /api/v2/folders/:folderId/share
Authorization: Bearer <access_token>
```

#### Path Parameters
- `folderId` (string, required): The ID of the folder to unshare

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "message": "Folder unshared successfully"
}
```

#### Error Responses
- **404 Not Found**: Folder not found or user doesn't have access

#### Notes
- Folder is marked as `isPublic: false`
- The shareable ID remains but the public URL no longer works

---

## Get Shared Folder

Retrieves a publicly shared folder by its shareable ID. No authentication required.

### Request
```
GET /api/v2/shared/:shareableId
```

#### Path Parameters
- `shareableId` (string, required): The unique shareable ID of the folder

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "id": "folder123",
    "name": "Development Tools",
    "position": 1,
    "isPublic": true,
    "shareableId": "a1b2c3d4e5f6",
    "color": "#3B82F6",
    "appsCount": 5,
    "apps": [
      {
        "id": "app123",
        "name": "GitHub",
        "url": "https://github.com",
        "iconUrl": "https://github.com/favicon.ico",
        "position": 1,
        "folderId": "folder123",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Error Responses
- **404 Not Found**: Shared folder not found or is private

---

## Get Folder Contents

Retrieves folder contents with pagination support.

### Request
```
GET /api/v2/folders/:folderId/contents?page=1&limit=20
Authorization: Bearer <access_token>
```

#### Path Parameters
- `folderId` (string, required): The ID of the folder

#### Query Parameters
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Items per page (default: 20)

### Response

#### Success (200 OK)
```json
{
  "success": true,
  "data": {
    "apps": [
      {
        "id": "app123",
        "name": "GitHub",
        "url": "https://github.com",
        "iconUrl": "https://github.com/favicon.ico",
        "position": 1,
        "folderId": "folder123",
        "folderName": "Development Tools",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

#### Error Responses
- **404 Not Found**: Folder not found or user doesn't have access

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

1. **Authentication**: All endpoints except shared folder access require valid access token
2. **Profile Access**: Users can only access folders in profiles they own
3. **Folder Ownership**: Update/delete operations require folder ownership
4. **Public Access**: Only folders marked as public with valid shareable IDs can be accessed without authentication
5. **Audit Logging**: Folder creation is logged in the audit trail

---

## Rate Limiting

All authenticated endpoints use the standard user rate limit configuration:
- Authenticated users: Standard rate limits based on user tier
- Public endpoints: May have stricter rate limits to prevent abuse