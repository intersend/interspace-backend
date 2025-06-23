import Foundation

// MARK: - Authentication API Service (V2 Only)

final class AuthAPI {
    static let shared = AuthAPI()
    private let apiService = APIService.shared
    
    private init() {}
    
    // MARK: - V2 Authentication Methods
    
    /// POST /api/v2/auth/authenticate
    /// Unified authentication endpoint supporting multiple strategies
    func authenticate(request: AuthenticationRequest) async throws -> AuthResponse {
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/authenticate",
            method: .POST,
            body: try JSONEncoder().encode(request),
            responseType: AuthResponse.self,
            requiresAuth: false
        )
    }
    
    /// Convenience method for email authentication
    func authenticateWithEmail(email: String, verificationCode: String) async throws -> AuthResponse {
        let request = AuthenticationRequest(
            strategy: .email,
            email: email,
            verificationCode: verificationCode,
            deviceId: DeviceInfo.deviceId,
            deviceName: DeviceInfo.deviceName,
            deviceType: .ios
        )
        return try await authenticate(request: request)
    }
    
    /// Convenience method for wallet authentication
    func authenticateWithWallet(address: String, message: String, signature: String, walletType: String = "metamask") async throws -> AuthResponse {
        let request = AuthenticationRequest(
            strategy: .wallet,
            walletAddress: address,
            message: message,
            signature: signature,
            walletType: walletType,
            deviceId: DeviceInfo.deviceId,
            deviceName: DeviceInfo.deviceName,
            deviceType: .ios
        )
        return try await authenticate(request: request)
    }
    
    /// Convenience method for social authentication
    func authenticateWithSocial(provider: AuthStrategy, idToken: String) async throws -> AuthResponse {
        let request = AuthenticationRequest(
            strategy: provider,
            idToken: idToken,
            deviceId: DeviceInfo.deviceId,
            deviceName: DeviceInfo.deviceName,
            deviceType: .ios
        )
        return try await authenticate(request: request)
    }
    
    // MARK: - Email Verification
    
    /// POST /api/v2/auth/send-email-code
    func sendEmailCode(email: String) async throws -> EmailCodeResponse {
        let request = SendEmailCodeRequest(email: email)
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/send-email-code",
            method: .POST,
            body: try JSONEncoder().encode(request),
            responseType: EmailCodeResponse.self,
            requiresAuth: false
        )
    }
    
    /// POST /api/v2/auth/resend-email-code
    func resendEmailCode(email: String) async throws -> EmailCodeResponse {
        let request = SendEmailCodeRequest(email: email)
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/resend-email-code",
            method: .POST,
            body: try JSONEncoder().encode(request),
            responseType: EmailCodeResponse.self,
            requiresAuth: false
        )
    }
    
    /// POST /api/v2/auth/verify-email-code
    func verifyEmailCode(email: String, code: String) async throws -> VerifyEmailResponse {
        let request = VerifyEmailCodeRequest(email: email, code: code)
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/verify-email-code",
            method: .POST,
            body: try JSONEncoder().encode(request),
            responseType: VerifyEmailResponse.self,
            requiresAuth: false
        )
    }
    
    // MARK: - SIWE Support
    
    /// GET /api/v2/siwe/nonce
    func getSIWENonce() async throws -> SIWENonceResponse {
        return try await apiService.performRequest(
            endpoint: "/api/v2/siwe/nonce",
            method: .GET,
            responseType: SIWENonceResponse.self,
            requiresAuth: false
        )
    }
    
    // MARK: - Token Management
    
    /// POST /api/v2/auth/refresh
    func refreshToken(refreshToken: String) async throws -> AuthResponse {
        let request = RefreshTokenRequest(refreshToken: refreshToken)
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/refresh",
            method: .POST,
            body: try JSONEncoder().encode(request),
            responseType: AuthResponse.self,
            requiresAuth: false
        )
    }
    
    /// POST /api/v2/auth/revoke-token
    func revokeToken(token: String? = nil, tokenType: TokenType? = nil) async throws -> SuccessResponse {
        let request = RevokeTokenRequest(token: token, tokenType: tokenType)
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/revoke-token",
            method: .POST,
            body: try JSONEncoder().encode(request),
            responseType: SuccessResponse.self
        )
    }
    
    // MARK: - Account Management
    
    /// GET /api/v2/auth/me
    func getCurrentAccount() async throws -> AccountInfo {
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/me",
            method: .GET,
            responseType: AccountInfo.self
        )
    }
    
    /// POST /api/v2/auth/logout
    func logout() async throws -> LogoutResponse {
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/logout",
            method: .POST,
            responseType: LogoutResponse.self
        )
    }
    
    /// POST /api/v2/auth/logout-all
    func logoutAllDevices() async throws -> LogoutResponse {
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/logout-all",
            method: .POST,
            responseType: LogoutResponse.self
        )
    }
    
    // MARK: - Identity Management
    
    /// POST /api/v2/auth/link-accounts
    func linkAccount(request: LinkAccountRequest) async throws -> LinkAccountResponse {
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/link-accounts",
            method: .POST,
            body: try JSONEncoder().encode(request),
            responseType: LinkAccountResponse.self
        )
    }
    
    /// PUT /api/v2/auth/link-privacy
    func updateLinkPrivacy(targetAccountId: String, privacyMode: PrivacyMode) async throws -> SuccessResponse {
        let request = UpdatePrivacyRequest(targetAccountId: targetAccountId, privacyMode: privacyMode)
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/link-privacy",
            method: .PUT,
            body: try JSONEncoder().encode(request),
            responseType: SuccessResponse.self
        )
    }
    
    /// DELETE /api/v2/auth/unlink-account/:accountId
    func unlinkAccount(accountId: String) async throws -> SuccessResponse {
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/unlink-account/\(accountId)",
            method: .DELETE,
            responseType: SuccessResponse.self
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
    
    // MARK: - Profile Management
    
    /// POST /api/v2/auth/switch-profile/:profileId
    func switchProfile(profileId: String) async throws -> AuthResponse {
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/switch-profile/\(profileId)",
            method: .POST,
            responseType: AuthResponse.self
        )
    }
    
    // MARK: - Device Management
    
    /// GET /api/v2/auth/devices
    func getDevices() async throws -> DevicesResponse {
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/devices",
            method: .GET,
            responseType: DevicesResponse.self
        )
    }
    
    /// DELETE /api/v2/auth/devices/:deviceId
    func deactivateDevice(deviceId: String) async throws -> SuccessResponse {
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/devices/\(deviceId)",
            method: .DELETE,
            responseType: SuccessResponse.self
        )
    }
    
    // MARK: - Session Management
    
    /// GET /api/v2/auth/sessions
    func getActiveSessions() async throws -> SessionsResponse {
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/sessions",
            method: .GET,
            responseType: SessionsResponse.self
        )
    }
    
    /// DELETE /api/v2/auth/sessions/:sessionId
    func terminateSession(sessionId: String) async throws -> SuccessResponse {
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/sessions/\(sessionId)",
            method: .DELETE,
            responseType: SuccessResponse.self
        )
    }
    
    // MARK: - Security
    
    /// GET /api/v2/auth/security-log
    func getSecurityLog() async throws -> SecurityLogResponse {
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/security-log",
            method: .GET,
            responseType: SecurityLogResponse.self
        )
    }
    
    // MARK: - Development Only
    
    #if DEBUG
    /// GET /api/v2/auth/dev/last-email-code
    func getLastEmailCodeForDev(email: String) async throws -> DevEmailCodeResponse {
        return try await apiService.performRequest(
            endpoint: "/api/v2/auth/dev/last-email-code?email=\(email)",
            method: .GET,
            responseType: DevEmailCodeResponse.self,
            requiresAuth: false
        )
    }
    #endif
}

// MARK: - Request Models

enum AuthStrategy: String, Codable {
    case email
    case wallet
    case google
    case apple
    case passkey
    case guest
}

enum DeviceType: String, Codable {
    case ios
    case android
    case web
}

enum PrivacyMode: String, Codable {
    case linked
    case partial
    case isolated
}

enum TokenType: String, Codable {
    case access
    case refresh
}

struct AuthenticationRequest: Codable {
    let strategy: AuthStrategy
    
    // Email strategy
    let email: String?
    let verificationCode: String?
    
    // Wallet strategy
    let walletAddress: String?
    let signature: String?
    let message: String?
    let walletType: String?
    
    // Social strategy
    let idToken: String?
    
    // Common fields
    let privacyMode: PrivacyMode?
    let deviceId: String?
    let deviceName: String?
    let deviceType: DeviceType?
    
    init(
        strategy: AuthStrategy,
        email: String? = nil,
        verificationCode: String? = nil,
        walletAddress: String? = nil,
        signature: String? = nil,
        message: String? = nil,
        walletType: String? = nil,
        idToken: String? = nil,
        privacyMode: PrivacyMode? = .linked,
        deviceId: String? = nil,
        deviceName: String? = nil,
        deviceType: DeviceType? = nil
    ) {
        self.strategy = strategy
        self.email = email
        self.verificationCode = verificationCode
        self.walletAddress = walletAddress
        self.signature = signature
        self.message = message
        self.walletType = walletType
        self.idToken = idToken
        self.privacyMode = privacyMode
        self.deviceId = deviceId
        self.deviceName = deviceName
        self.deviceType = deviceType
    }
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

struct RevokeTokenRequest: Codable {
    let token: String?
    let tokenType: TokenType?
}

struct LinkAccountRequest: Codable {
    let targetType: String // "email", "wallet", "social"
    let targetIdentifier: String
    let targetProvider: String?
    let linkType: String? // "direct", "inferred"
    let privacyMode: PrivacyMode?
}

struct UpdatePrivacyRequest: Codable {
    let targetAccountId: String
    let privacyMode: PrivacyMode
}

// MARK: - Response Models

struct AuthResponse: Codable {
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
    let createdAt: String
}

struct Profile: Codable {
    let id: String
    let name: String
    let walletAddress: String?
    let smartAccountAddress: String?
    let isDevelopmentWallet: Bool?
}

struct EmailCodeResponse: Codable {
    let success: Bool
    let message: String
}

struct VerifyEmailResponse: Codable {
    let success: Bool
    let verified: Bool
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

struct AccountInfo: Codable {
    let success: Bool
    let account: Account
    let profiles: [Profile]
    let activeProfile: Profile?
    let linkedAccounts: [Account]
}

struct LogoutResponse: Codable {
    let success: Bool
    let message: String
}

struct LinkAccountResponse: Codable {
    let success: Bool
    let account: Account
    let linkedAccounts: [Account]
    let message: String
}

struct IdentityGraphResponse: Codable {
    let success: Bool
    let data: IdentityGraph
}

struct IdentityGraph: Codable {
    let primaryAccount: Account
    let linkedAccounts: [Account]
    let profiles: [Profile]
    let connections: [AccountConnection]
}

struct AccountConnection: Codable {
    let from: String
    let to: String
    let linkType: String
    let privacyMode: PrivacyMode
}

struct DevicesResponse: Codable {
    let success: Bool
    let data: [Device]
}

struct Device: Codable, Identifiable {
    let id: String
    let deviceId: String
    let name: String
    let type: String?
    let lastActiveAt: String
    let isCurrentDevice: Bool
}

struct SessionsResponse: Codable {
    let success: Bool
    let data: [Session]
}

struct Session: Codable, Identifiable {
    let id: String
    let sessionToken: String
    let deviceInfo: Device?
    let createdAt: String
    let lastActiveAt: String
    let expiresAt: String
}

struct SecurityLogResponse: Codable {
    let success: Bool
    let data: [SecurityEvent]
}

struct SecurityEvent: Codable, Identifiable {
    let id: String
    let type: String
    let action: String
    let details: [String: String]?
    let ipAddress: String?
    let userAgent: String?
    let createdAt: String
}

struct SuccessResponse: Codable {
    let success: Bool
    let message: String?
}

#if DEBUG
struct DevEmailCodeResponse: Codable {
    let success: Bool
    let code: String
}
#endif

// MARK: - Device Info Helper
struct DeviceInfo {
    static var deviceId: String {
        return UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
    }
    
    static var deviceName: String {
        return UIDevice.current.name
    }
}