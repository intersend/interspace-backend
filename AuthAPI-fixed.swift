import Foundation

// MARK: - Authentication API Service

final class AuthAPI {
    static let shared = AuthAPI()
    private let apiService = APIService.shared
    
    private init() {}
    
    // MARK: - V1 Authentication Endpoints (Legacy)
    
    /// POST /api/v1/auth/authenticate
    func authenticate(request: AuthenticationRequest) async throws -> AuthenticationResponse {
        return try await apiService.performRequest(
            endpoint: "/api/v1/auth/authenticate",
            method: .POST,
            body: try JSONEncoder().encode(request),
            responseType: AuthenticationResponse.self,
            requiresAuth: false
        )
    }
    
    /// POST /api/v1/auth/refresh
    func refreshToken(refreshToken: String) async throws -> RefreshTokenResponse {
        let request = RefreshTokenRequest(refreshToken: refreshToken)
        return try await apiService.performRequest(
            endpoint: "/api/v1/auth/refresh",
            method: .POST,
            body: try JSONEncoder().encode(request),
            responseType: RefreshTokenResponse.self,
            requiresAuth: false
        )
    }
    
    /// POST /api/v1/auth/logout
    func logout(refreshToken: String) async throws -> LogoutResponse {
        let request = LogoutRequest(refreshToken: refreshToken)
        return try await apiService.performRequest(
            endpoint: "/api/v1/auth/logout",
            method: .POST,
            body: try JSONEncoder().encode(request),
            responseType: LogoutResponse.self
        )
    }
    
    /// GET /api/v1/auth/me
    func getCurrentUser() async throws -> User {
        let response: UserResponse = try await apiService.performRequest(
            endpoint: "/api/v1/auth/me",
            method: .GET,
            responseType: UserResponse.self
        )
        return response.data
    }
    
    /// POST /api/v1/auth/link-auth
    func linkAuthMethod(provider: String, oauthCode: String) async throws -> LinkAuthResponse {
        let request = LinkAuthRequest(provider: provider, oauthCode: oauthCode)
        return try await apiService.performRequest(
            endpoint: "/api/v1/auth/link-auth",
            method: .POST,
            body: try JSONEncoder().encode(request),
            responseType: LinkAuthResponse.self
        )
    }
    
    /// GET /api/v1/auth/devices
    func getDevices() async throws -> [Device] {
        let response: DevicesResponse = try await apiService.performRequest(
            endpoint: "/api/v1/auth/devices",
            method: .GET,
            responseType: DevicesResponse.self
        )
        return response.data
    }
    
    /// DELETE /api/v1/auth/devices/:deviceId
    func deactivateDevice(deviceId: String) async throws -> DeactivateDeviceResponse {
        return try await apiService.performRequest(
            endpoint: "/api/v1/auth/devices/\(deviceId)",
            method: .DELETE,
            responseType: DeactivateDeviceResponse.self
        )
    }
    
    /// POST /api/v1/auth/email/send-code
    func sendEmailCode(email: String) async throws -> EmailCodeResponse {
        let request = SendEmailCodeRequest(email: email)
        return try await apiService.performRequest(
            endpoint: "/api/v1/auth/email/send-code",
            method: .POST,
            body: try JSONEncoder().encode(request),
            responseType: EmailCodeResponse.self,
            requiresAuth: false
        )
    }
    
    /// POST /api/v1/auth/email/verify-code
    func verifyEmailCode(email: String, code: String) async throws -> EmailVerificationResponse {
        let request = VerifyEmailCodeRequest(email: email, code: code)
        print("📧 AuthAPI: Verifying email code - email: \(email), code: \(code)")
        return try await apiService.performRequest(
            endpoint: "/api/v1/auth/email/verify-code",
            method: .POST,
            body: try JSONEncoder().encode(request),
            responseType: EmailVerificationResponse.self,
            requiresAuth: false
        )
    }
    
    /// POST /api/v1/auth/email/resend-code
    func resendEmailCode(email: String) async throws -> EmailCodeResponse {
        let request = SendEmailCodeRequest(email: email)
        return try await apiService.performRequest(
            endpoint: "/api/v1/auth/email/resend-code",
            method: .POST,
            body: try JSONEncoder().encode(request),
            responseType: EmailCodeResponse.self,
            requiresAuth: false
        )
    }
    
    // MARK: - V1 SIWE Authentication
    
    /// POST /api/v1/siwe/authenticate
    /// Combines SIWE verification with JWT generation
    func authenticateWithSIWE(message: String, signature: String, address: String) async throws -> AuthenticationResponse {
        let request = SIWEAuthenticationRequest(
            message: message,
            signature: signature,
            address: address,
            authStrategy: "wallet",
            deviceId: DeviceInfo.deviceId,
            deviceName: DeviceInfo.deviceName,
            deviceType: "ios"
        )
        
        // Use the new combined endpoint that verifies SIWE and generates JWT
        return try await apiService.performRequest(
            endpoint: "/api/v1/siwe/authenticate",
            method: .POST,
            body: try JSONEncoder().encode(request),
            responseType: AuthenticationResponse.self,
            requiresAuth: false
        )
    }
    
    // MARK: - V2 API Methods (Flat Identity Model)
    
    /// POST /api/v2/auth/authenticate
    func authenticateV2(request: AuthenticationRequestV2) async throws -> AuthResponseV2 {
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/authenticate",
            method: .POST,
            body: try JSONEncoder().encode(request),
            responseType: AuthResponseV2.self,
            requiresAuth: false
        )
    }
    
    /// POST /api/v2/auth/switch-profile/:profileId
    func switchProfileV2(profileId: String) async throws -> AuthResponseV2 {
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/switch-profile/\(profileId)",
            method: .POST,
            responseType: AuthResponseV2.self
        )
    }
    
    /// POST /api/v2/auth/link-accounts
    func linkAccountsV2(request: LinkAccountRequestV2) async throws -> AuthResponseV2 {
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/link-accounts",
            method: .POST,
            body: try JSONEncoder().encode(request),
            responseType: AuthResponseV2.self
        )
    }
    
    /// PUT /api/v2/auth/link-privacy
    func updateLinkPrivacyV2(targetAccountId: String, privacyMode: String) async throws -> SuccessResponse {
        struct UpdatePrivacyRequest: Codable {
            let targetAccountId: String
            let privacyMode: String
        }
        let request = UpdatePrivacyRequest(targetAccountId: targetAccountId, privacyMode: privacyMode)
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/link-privacy",
            method: .PUT,
            body: try JSONEncoder().encode(request),
            responseType: SuccessResponse.self
        )
    }
    
    /// POST /api/v2/auth/refresh
    func refreshTokenV2(refreshToken: String) async throws -> AuthResponseV2 {
        let request = RefreshTokenRequest(refreshToken: refreshToken)
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/refresh",
            method: .POST,
            body: try JSONEncoder().encode(request),
            responseType: AuthResponseV2.self,
            requiresAuth: false
        )
    }
    
    /// POST /api/v2/auth/logout
    func logoutV2() async throws -> LogoutResponse {
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/logout",
            method: .POST,
            responseType: LogoutResponse.self
        )
    }
    
    /// POST /api/v2/auth/send-email-code
    func sendEmailCodeV2(email: String) async throws -> EmailCodeResponse {
        let request = SendEmailCodeRequest(email: email)
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/send-email-code",
            method: .POST,
            body: try JSONEncoder().encode(request),
            responseType: EmailCodeResponse.self,
            requiresAuth: false
        )
    }
    
    /// GET /api/v2/auth/identity-graph
    func getIdentityGraph() async throws -> IdentityGraphResponse {
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/identity-graph",
            method: .GET,
            responseType: IdentityGraphResponse.self
        )
    }
    
    // MARK: - V2 SIWE Methods
    
    /// GET /api/v2/siwe/nonce
    func getSIWENonceV2() async throws -> SIWENonceResponse {
        return try await apiService.performRequest(
            endpoint: "/api/v2/siwe/nonce",
            method: .GET,
            responseType: SIWENonceResponse.self,
            requiresAuth: false
        )
    }
    
    /// For V2 SIWE authentication, use authenticateV2 with strategy: "wallet"
    func authenticateWithSIWEV2(message: String, signature: String, walletAddress: String) async throws -> AuthResponseV2 {
        let request = AuthenticationRequestV2(
            strategy: "wallet",
            walletAddress: walletAddress,
            message: message,
            signature: signature,
            walletType: "metamask",
            deviceId: DeviceInfo.deviceId,
            privacyMode: "linked"
        )
        
        return try await authenticateV2(request: request)
    }
}

// MARK: - Request Models

struct LinkAuthRequest: Codable {
    let provider: String
    let oauthCode: String
}

struct SendEmailCodeRequest: Codable {
    let email: String
}

struct VerifyEmailCodeRequest: Codable {
    let email: String
    let code: String
}

struct RefreshTokenRequest: Codable {
    let refreshToken: String
}

struct LogoutRequest: Codable {
    let refreshToken: String?
}

struct SIWEAuthenticationRequest: Codable {
    let message: String
    let signature: String
    let address: String
    let authStrategy: String
    let deviceId: String?
    let deviceName: String
    let deviceType: String
}

// MARK: - V2 Request Models

struct AuthenticationRequestV2: Codable {
    let strategy: String // "email", "wallet", "google", "apple", "passkey", "guest"
    
    // Email strategy fields
    let email: String?
    let verificationCode: String?
    
    // Wallet strategy fields
    let walletAddress: String?
    let signature: String?
    let message: String?
    let walletType: String?
    
    // Social strategy fields
    let idToken: String?
    
    // Common fields
    let privacyMode: String? // "linked", "partial", "isolated"
    let deviceId: String?
}

struct LinkAccountRequestV2: Codable {
    let targetType: String // "email", "wallet", "social"
    let targetIdentifier: String
    let targetProvider: String?
    let linkType: String? // "direct", "inferred"
    let privacyMode: String? // "linked", "partial", "isolated"
}

// MARK: - Response Models

struct LinkAuthResponse: Codable {
    let success: Bool
    let message: String
}

struct DevicesResponse: Codable {
    let success: Bool
    let data: [Device]
}

struct Device: Codable, Identifiable {
    let id: String
    let name: String
    let lastActive: String
    let deviceType: String?
    let isCurrentDevice: Bool?
}

struct DeactivateDeviceResponse: Codable {
    let success: Bool
    let message: String
}

struct EmailCodeResponse: Codable {
    let success: Bool
    let message: String
}

struct EmailVerificationResponse: Codable {
    let success: Bool
    let message: String
    let email: String
}

struct SIWENonceResponse: Codable {
    let success: Bool
    let data: SIWENonceData
}

struct SIWENonceData: Codable {
    let nonce: String
    let expiresIn: Int
}

struct AuthResponseV2: Codable {
    let success: Bool
    let tokens: TokenPair
    let account: Account
    let profiles: [Profile]
    let activeProfile: Profile?
    let isNewUser: Bool
}

struct TokenPair: Codable {
    let accessToken: String
    let refreshToken: String
}

struct Account: Codable {
    let id: String
    let type: String
    let identifier: String
    let verified: Bool
}

struct Profile: Codable {
    let id: String
    let name: String
    let walletAddress: String?
}

struct IdentityGraphResponse: Codable {
    let success: Bool
    let data: IdentityGraph
}

struct IdentityGraph: Codable {
    let primaryAccount: Account
    let linkedAccounts: [Account]
    let profiles: [Profile]
}

struct SuccessResponse: Codable {
    let success: Bool
    let message: String?
}

struct LogoutResponse: Codable {
    let success: Bool
    let message: String
}

struct UserResponse: Codable {
    let success: Bool
    let data: User
}

struct User: Codable {
    let id: String
    let email: String?
    let walletAddress: String?
    // Add other user fields as needed
}

struct AuthenticationRequest: Codable {
    // Add fields as needed for v1 auth
}

struct AuthenticationResponse: Codable {
    let success: Bool
    let tokens: TokenPair
    let user: User?
}

struct RefreshTokenResponse: Codable {
    let success: Bool
    let tokens: TokenPair
}

// MARK: - Device Info Helper
struct DeviceInfo {
    static var deviceId: String {
        // Implementation to get device ID
        return UIDevice.current.identifierForVendor?.uuidString ?? "unknown"
    }
    
    static var deviceName: String {
        return UIDevice.current.name
    }
}