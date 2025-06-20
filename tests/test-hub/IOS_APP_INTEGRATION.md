# iOS App Integration Guide - Adding Apps to Profiles

## Quick Test

To test if the "add app to profile" functionality is working:

```bash
# 1. Start the server (in one terminal)
NODE_ENV=test npm run dev

# 2. Run the debug script (in another terminal)
npm run test:hub:debug-app
```

This will test the complete flow and provide detailed debugging information.

## API Endpoint Details

### Add App to Profile

**Endpoint:** `POST /api/v1/profiles/{profileId}/apps`

**Headers:**
```
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "GitHub",              // Required: App display name
  "url": "https://github.com",   // Required: Valid URL
  "iconUrl": "https://...",      // Optional: Icon URL
  "folderId": null,              // Optional: null for root, or folder ID
  "position": 0                  // Optional: Auto-calculated if not provided
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "clxyz123...",
    "name": "GitHub",
    "url": "https://github.com",
    "iconUrl": "https://github.com/favicon.ico",
    "position": 0,
    "folderId": null,
    "profileId": "clxyz456...",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  },
  "message": "App bookmarked successfully"
}
```

## Common Issues and Solutions

### 1. 401 Unauthorized
- **Cause:** Missing or invalid access token
- **Solution:** Ensure `Authorization: Bearer {token}` header is present

### 2. 403 Forbidden
- **Cause:** User doesn't own the profile
- **Solution:** Verify profileId belongs to authenticated user

### 3. 400 Bad Request
- **Cause:** Validation error
- **Common issues:**
  - Missing `name` field
  - Missing `url` field
  - Invalid URL format (must start with http:// or https://)
  - Name too long (max 255 chars)

### 4. 404 Not Found
- **Cause:** Profile doesn't exist
- **Solution:** Verify profileId is valid

## iOS Swift Example

```swift
func addAppToProfile(profileId: String, appData: AppData) async throws -> BookmarkedApp {
    let url = URL(string: "\(API_BASE_URL)/api/v1/profiles/\(profileId)/apps")!
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let body = [
        "name": appData.name,
        "url": appData.url,
        "iconUrl": appData.iconUrl
    ]
    
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    
    let (data, response) = try await URLSession.shared.data(for: request)
    
    guard let httpResponse = response as? HTTPURLResponse else {
        throw AppError.invalidResponse
    }
    
    switch httpResponse.statusCode {
    case 201:
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let apiResponse = try decoder.decode(ApiResponse<BookmarkedApp>.self, from: data)
        return apiResponse.data
    case 400:
        throw AppError.validationError
    case 401:
        throw AppError.unauthorized
    case 403:
        throw AppError.forbidden
    default:
        throw AppError.serverError
    }
}
```

## Testing Checklist

Run the comprehensive test suite to verify all functionality:

```bash
# Run all app management tests
npm run test:hub:apps

# Run specific test for iOS simulation
npm run test:hub -- --suites "App Management" --grep "iOS"
```

## Debugging Tips

1. **Enable verbose logging:**
   ```bash
   DEBUG=* npm run test:hub:debug-app
   ```

2. **Check server logs** for detailed error messages

3. **Use the debug script** to get step-by-step execution details

4. **Common validation rules:**
   - Name: 1-255 characters, required
   - URL: Valid URI format, required, max 2048 chars
   - IconURL: Valid URI format, optional, max 2048 chars

5. **Test with curl:**
   ```bash
   curl -X POST http://localhost:3001/api/v1/profiles/{profileId}/apps \
     -H "Authorization: Bearer {token}" \
     -H "Content-Type: application/json" \
     -d '{"name":"Test App","url":"https://test.com"}'
   ```

## Full Test Results

After running `npm run test:hub:apps`, you should see:
- ✅ Basic app creation
- ✅ App creation with folders
- ✅ Validation testing
- ✅ Authorization checks
- ✅ Update/Delete operations
- ✅ Reordering functionality
- ✅ Search capability
- ✅ Performance with many apps
- ✅ iOS user journey simulation

All tests must pass before considering the integration complete.