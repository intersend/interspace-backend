#!/bin/bash

# iOS App API Test using curl
# This shows exactly what requests your iOS app should make

API_URL="http://127.0.0.1:3000"
EMAIL="test@example.com"

echo "🔍 iOS App API Test - Add App to Profile"
echo "========================================"
echo ""
echo "API URL: $API_URL"
echo ""

# Step 1: Authenticate (using guest for simplicity)
echo "1. Authenticating as guest..."
echo "Request:"
echo "POST $API_URL/api/v1/auth/authenticate"
echo ""

AUTH_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/auth/authenticate" \
  -H "Content-Type: application/json" \
  -d '{
    "authToken": "guest-'$(date +%s)'",
    "authStrategy": "guest"
  }')

echo "Response:"
echo "$AUTH_RESPONSE" | jq '.' || echo "$AUTH_RESPONSE"
echo ""

# Extract access token
ACCESS_TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.data.accessToken' 2>/dev/null)
USER_ID=$(echo "$AUTH_RESPONSE" | jq -r '.data.user.id' 2>/dev/null)

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
  echo "❌ Failed to get access token"
  exit 1
fi

echo "✅ Got access token: ${ACCESS_TOKEN:0:30}..."
echo "✅ User ID: $USER_ID"
echo ""

# Step 2: Get or create profile
echo "2. Getting user profiles..."
echo "Request:"
echo "GET $API_URL/api/v1/profiles"
echo "Authorization: Bearer ${ACCESS_TOKEN:0:30}..."
echo ""

PROFILES_RESPONSE=$(curl -s -X GET "$API_URL/api/v1/profiles" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json")

echo "Response:"
echo "$PROFILES_RESPONSE" | jq '.' || echo "$PROFILES_RESPONSE"
echo ""

# Check if we have profiles
PROFILE_COUNT=$(echo "$PROFILES_RESPONSE" | jq '.data | length' 2>/dev/null || echo "0")

if [ "$PROFILE_COUNT" = "0" ]; then
  echo "No profiles found, creating one..."
  
  CREATE_PROFILE_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/profiles" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "iOS Test Profile",
      "clientShare": {
        "type": "test",
        "data": "mock-client-share-for-testing"
      }
    }')
  
  echo "Create profile response:"
  echo "$CREATE_PROFILE_RESPONSE" | jq '.' || echo "$CREATE_PROFILE_RESPONSE"
  
  PROFILE_ID=$(echo "$CREATE_PROFILE_RESPONSE" | jq -r '.data.id' 2>/dev/null)
else
  PROFILE_ID=$(echo "$PROFILES_RESPONSE" | jq -r '.data[0].id' 2>/dev/null)
  echo "Using existing profile"
fi

echo "✅ Profile ID: $PROFILE_ID"
echo ""

# Step 3: Add app to profile
echo "3. Adding app to profile..."
echo "Request:"
echo "POST $API_URL/api/v1/profiles/$PROFILE_ID/apps"
echo "Authorization: Bearer ${ACCESS_TOKEN:0:30}..."
echo "Body:"
echo '{
  "name": "GitHub",
  "url": "https://github.com",
  "iconUrl": "https://github.githubassets.com/favicons/favicon.png"
}'
echo ""

ADD_APP_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/profiles/$PROFILE_ID/apps" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GitHub",
    "url": "https://github.com",
    "iconUrl": "https://github.githubassets.com/favicons/favicon.png"
  }')

echo "Response:"
echo "$ADD_APP_RESPONSE" | jq '.' || echo "$ADD_APP_RESPONSE"
echo ""

# Check if successful
APP_ID=$(echo "$ADD_APP_RESPONSE" | jq -r '.data.id' 2>/dev/null)
if [ -n "$APP_ID" ] && [ "$APP_ID" != "null" ]; then
  echo "✅ App added successfully! ID: $APP_ID"
else
  echo "❌ Failed to add app"
  exit 1
fi

echo ""
echo "4. Verifying app in profile..."
VERIFY_RESPONSE=$(curl -s -X GET "$API_URL/api/v1/profiles/$PROFILE_ID/apps" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json")

APP_COUNT=$(echo "$VERIFY_RESPONSE" | jq '.data | length' 2>/dev/null || echo "0")
echo "✅ Profile has $APP_COUNT app(s)"
echo ""

echo "========================================="
echo "✅ Test completed successfully!"
echo ""
echo "📱 iOS Swift Code Example:"
echo ""
cat << 'EOF'
// Add app to profile
func addAppToProfile(profileId: String, accessToken: String) async throws {
    let url = URL(string: "http://127.0.0.1:3000/api/v1/profiles/\(profileId)/apps")!
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let body: [String: Any] = [
        "name": "GitHub",
        "url": "https://github.com",
        "iconUrl": "https://github.githubassets.com/favicons/favicon.png"
    ]
    
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    
    let (data, response) = try await URLSession.shared.data(for: request)
    
    // Check response
    guard let httpResponse = response as? HTTPURLResponse,
          httpResponse.statusCode == 201 else {
        throw AppError.requestFailed
    }
    
    // Parse response
    let result = try JSONDecoder().decode(ApiResponse<App>.self, from: data)
    print("App added: \(result.data)")
}
EOF