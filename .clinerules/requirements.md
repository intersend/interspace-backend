we are working on this new project and im hsaring details below:


Interspace MVP Wallet Project Description

Project Overview:
Interspace is a mobile-first crypto wallet built with React Native, designed to simplify Web3 app interactions and streamline the user experience through a structured approach with smartprofiles, app management, and intuitive wallet interactions.

its like a wallet wrapper. you bring your existing accounts, we wrap them with a 'session' wallet, and abstract token, gas, and chain as you use the apps.

Tech Stack:
	•	Frontend: React Native (fully custom UI)
	•	Backend / Wallet Infra: Thirdweb (fully headless; React Hooks only, no built-in UI components)
	•	Authentication & Wallet Management: Thirdweb headless provider for EVM
	•	Wallet Proxy Standard: ERC-7702 proxy accounts for delegation and transaction handling.

⸻

Key Components & Navigation

The app includes three primary navigation tabs at the bottom:

1. Profiles

2. Apps

3. Wallet

⸻

1. Profiles

Profiles allow users to group their existing crypto accounts and wallets into distinct contexts or “smartprofiles,” such as Trading, Gaming, Payments, etc.

Smartprofiles:
	•	Each smartprofile has its own Session Wallet (ERC-7702 Proxy):
	•	Automatically created upon profile creation.
	•	Provides both an EVM-compatible address.
	•	Acts as the primary signer and delegate for transactions initiated from the profile.
	•	Users never directly deposit funds into the Session Wallet.
	•	Linked Accounts:
	•	Users link existing accounts such as MetaMask, Coinbase, or other EOAs.
	•	Users explicitly grant ERC-20 token allowances to the Session Wallet, enabling seamless and permissionless transactions initiated by the Session Wallet without repeated signing prompts.




2. Apps

The Apps screen functions like and mimics an iPhone-style home screen grid, displaying bookmarked apps as tappable icons.

for this react native app, i want ot have apple-native thigns like an home screen in the app with all the apps that are bookmarked, like iphone home screen, and i want people to be able to create folders, move the apps, delete, in the same way as apple.


UI & Navigation:
	•	Grid-based Layout:
Apps are displayed as icons in a grid, similar to iOS’s Home screen.
	•	Folders and Drag & Drop:
Users can enter edit mode (long press), create folders, drag-and-drop apps into folders, rearrange app positions, and delete bookmarks.
	•	Launching Apps:
Tapping an app icon opens it in the in-app browser. The active smartprofile’s Session Wallet is injected as the wallet provider.

In-app Browser (WebView):
	•	Custom Browser Bar:
Users can enter URLs manually, similar to a traditional browser. this bar will be siplayed when you click on apps. so it wil be like home screen of the 'browser', and you can type link to visit an app.
	•	Wallet Injection:
Injects the currently selected smartprofile’s Session Wallet address and web3 provider into web apps upon loading.
	•	Transaction Confirmation:
Uses custom UI to show users transaction details clearly, including:
	•	From: Active Session Wallet
	•	Gas/network fees
	•	Routing summary (e.g., Linked EOA → Session Wallet → dApp)


3. Wallet

The Wallet tab provides insights into the user’s total crypto holdings and transaction management.

Wallet Screen:
	•	Unified Balance View:
Shows aggregated balances from all linked accounts in the active smartprofile.
	•	Asset List:
Displays a detailed breakdown of individual tokens, NFTs, and assets across EVM and Solana chains.
	•	Transaction History:
View and manage past transactions initiated through the Session Wallet.
	•	Send/Receive Functionality:
Users can easily send crypto assets from linked accounts via the Session Wallet and access their wallet address (QR/share link) to receive assets.


Transaction & Delegation Flow (Detailed)

Example User Scenario:
	•	User creates a Gaming smartprofile.
	•	User links MetaMask account and approves unlimited USDC allowance to the profile’s Session Wallet.
	•	User opens an app (e.g., Uniswap) via Interspace’s Apps screen.
	•	User initiates a USDC transaction in-app.


Session Wallet (Profile-specific proxy) 
   ↓ executes `ERC20.transferFrom(userEOA, appAddress, amount)`
ERC-20 Contract (USDC)
   ↓ transfers tokens
Target App Contract


The Session Wallet directly calls ERC20.transferFrom to pull allowed USDC from MetaMask (user’s EOA) without explicit per-transaction approvals.
	•	No deposits to Session Wallet; it is purely an on-chain proxy delegate.



Thirdweb Integration (Fully Headless):
	•	Authentication and wallet management are powered by Thirdweb’s fully headless APIs.
	•	We use React Hooks from Thirdweb for all wallet-related operations:
	•	Connect/disconnect wallets.
	•	Create, read, update, delete smartprofiles (via backend).
	•	Initiate and sign transactions using the Session Wallet (EVM & Solana compatible).
	•	No Thirdweb UI components used: Fully custom UI built in React Native.


-----


sharing some additional product docs. requreiments etc:

### In-App Browser

| ***User Story*** | ***Acceptance Criteria*** |
| --- | --- |
| Open web3 apps in the built-in browser | WebView renders dApp correctly |
| Active Profile Account automatically injected on page load | dApp detects wallet, can request transactions |

### Apps Management

| ***User Story*** | ***Acceptance Criteria*** |
| --- | --- |
| Bookmark web3 apps for quick access | App saved with name, URL, icon |
| View all bookmarked apps in Apps page list view | Scrollable list with app cards |
| Rename bookmarked apps | Name updates in UI and database |
| Reorder apps in the list | CRUD operations: add, remove, reorder |
| Remove bookmarked apps | Confirmation dialog, app deleted |
| Tap app card to open in browser with active profile | Browser opens with active profile injected |

### Folders & Organization

| ***User Story*** | ***Acceptance Criteria*** |
| --- | --- |
| Create folders to organize bookmarked apps | Folder created, apps can be nested inside |
| Rename folders | Name updates throughout app |
| Move folders and rearrange order | Visual feedback during move |
| Nest apps within folders | Apps display inside folder view |
| Make a folder public to get shareable link | Generate unique public URL |
| Share public folder links | Integration with native share sheet |
| All folders are private by default | Public toggle explicitly required |

# Epic: Smartprofiles

### Profile Management

| ***User Story*** | ***Acceptance Criteria*** |
| --- | --- |
| Create a new smartprofile with a custom name | Profile created with auto-generated Profile Account (ERC-7702) address |
| Rename existing smartprofiles | Name updated in database and UI |
| Delete a smartprofile | Show warnings, handle constraints for linked accounts |
| View the Profile Account address for each smartprofile | Address displayed as "session wallet" in profile details |
| Copy the Profile Account address to clipboard | Show confirmation on successful copy |
| Switch between different smartprofiles | Active profile updates, browser injects new profile |

### Account Management

| ***User Story*** | ***Acceptance Criteria*** |
| --- | --- |
| Link external EOAs and smart wallets to any smartprofile | Support MetaMask, Coinbase Wallet, Ledger, L2s, Safe, WalletConnect |
| Disconnect linked accounts from a smartprofile | Account removed from profile, update UI |
| Set preferred account for transaction routing | When profile active, tx flows: user EOA → Profile Account → dApp |
| Set one linked account as primary | Primary badge shown, routing logic updated |
| View which account is currently set as primary | Visual indicator on primary account |
| Copy any linked account address to clipboard | Show confirmation on successful copy |
| Assign custom names to linked accounts | Names persist in database, display in UI |
| View appropriate wallet logo/icon for each linked account | Correct logos shown based on wallet type |

### Social Integration

| ***User Story*** | ***Acceptance Criteria*** |
| --- | --- |
| Link Farcaster handle to a smartprofile | OAuth flow completes, handle linked (dependent on provider OAuth scope) |
| Link Telegram handle to a smartprofile | OAuth flow completes, handle linked (dependent on provider OAuth scope) |
| Disconnect linked social accounts | Account unlinked, UI updated |

# Epic: Wallet Features

### Balance & Assets

| ***User Story*** | ***Acceptance Criteria*** |
| --- | --- |
| View unified balance across all linked accounts in active profile | Sum of all account balances displayed |
| View breakdown of assets across all linked accounts | List shows balance per account |
| View individual token balances | ERC-20 tokens listed with amounts |
| View Smartprofile MPC Account Address | Display Profile Account address clearly |

### Transactions

| ***User Story*** | ***Acceptance Criteria*** |
| --- | --- |
| Receive tokens to any linked account or Profile Account | QR code and address display |
| Send tokens from any linked account | Transaction routes through Profile Account with relay/sponsor handling |
| Swap tokens using integrated swap functionality | Swap UI with rate quotes, routing |
| See custom transaction confirmation sheet | Replaces provider UI, shows: from account, gas/network, route summary |
| Approve/reject transactions with routing visibility | Shows path: EOA → Profile Account → dApp |


-----

- Principles
    
    We are mobile-1st, favor dark mode, and aim for minimal. 1Password, Apple and Telegram are our north stars.  
    
    | **Principle** | **Description** | **Example** |
    | --- | --- | --- |
    | Space-themed design | Use deep, rich backgrounds with bright accents to guide focus. Optimize empty space for clarity. Apply soft glows and smooth gradients on key actions. | **Apple App Store (dark mode):** Dark mode uses rich blacks with vibrant highlights. App cards float with subtle shadows, and empty space frames key content. |
    | **Exploration** | Let users navigate freely across networks and platforms, both on-chain and off-chain. | **Apple Safari (iOS)**: Users swipe between open tabs like a carousel, with smooth transitions and easy cross-device access. **Apple Spotlight Search**: Search across all apps, documents, and web results instantly without needing to open each app individually.  |
    | **Control Over Privacy** | Be clear about accounts, security, and permissions. Provide easy-to-access data controls. | **1Password**: Clear dashboard to manage accounts and items with easy to edit fields. The browser extension auto detects and auto fills on desktop and mobile.   |
    | **Delightful** | Add small, unexpected touches to increase engagement and satisfaction. | **Telegram:** In-chat features like smooth reply threads, message forwarding with context, and quick reactions that make conversations feel more dynamic and interactive without being intrusive. |
    | **Speed with Simplicity** | Keep the platform fast, simple, and intuitive. Focus on essential actions with a clean design. | **Sign in with Apple (iOS)**: One-click sign-in with a clear, minimal interface and fast autofill for existing users. |
    | **Unified Experience** | Ensure a consistent design across desktop and mobile, with unified features and access. | **Apple App Store (Mobile & Desktop):** Identical app presentation, search structure, and purchase flows across all devices.  |


------


this repo is the backlend repo. we are starting from scratch. you will implement all required endpoints. eremember that i want to use best standards in terms of secruity. we also ahve multiple devices we'd like to support so the foudnation is important.


thirdweb client id: 3dcca06b137a0ab48f1da145c27e4636
secret key: HBxHyrdO03XxU0mwT9l4nyIFF_9jxTYpVB5mzfOBJfmhYVBAjzCadE8olXCzGRdx6tVCjizpbNEq2JWCSs8Xww



Thirdweb SDK Requirements for Interspace MVP - Team Breakdown
Based on the documentation and your project requirements, here's a detailed breakdown of what each team needs from Thirdweb SDK:

Frontend Team Requirements (React Native)
1. Core SDK Setup & Providers
typescriptCopy// Essential Setup
import { createThirdwebClient, ThirdwebProvider } from "thirdweb/react";

// Required for app initialization
const client = createThirdwebClient({ clientId: "YOUR_CLIENT_ID" });

// Wrap your app
<ThirdwebProvider>
  <App />
</ThirdwebProvider>
Implementation Priority: CRITICAL

Set up client configuration with environment variables
Configure ThirdwebProvider at app root
Handle client initialization errors

2. Wallet Connection & Management Hooks
typescriptCopy// Core wallet hooks
import {
  useActiveWallet,
  useActiveAccount,
  useConnect,
  useDisconnect,
  useConnectedWallets,
  useSetActiveWallet,
  useSwitchActiveWalletChain,
  useActiveWalletConnectionStatus,
  useAutoConnect
} from "thirdweb/react";

// Profile management for smartprofiles
import {
  useProfiles,
  useLinkProfile,
  useUnlinkProfile
} from "thirdweb/react";
Key Implementation Areas:

Smartprofile Switching: Use useSetActiveWallet to switch between session wallets
Account Linking: useLinkProfile for connecting MetaMask, Coinbase to profiles
Auto-connection: useAutoConnect for seamless reconnection
Multi-wallet Support: useConnectedWallets to manage multiple linked accounts

3. Transaction Management
typescriptCopy// Transaction hooks
import {
  useSendTransaction,
  useSendAndConfirmTransaction,
  useWaitForReceipt,
  useEstimateGas,
  useEstimateGasCost
} from "thirdweb/react";

// EIP-5792 for batch transactions
import {
  useSendCalls,
  useSendAndConfirmCalls,
  useCapabilities
} from "thirdweb/react";
Critical for Session Wallet Flow:

useSendCalls for batching transactions through session wallets
Custom transaction confirmation UI using transaction data
Gas estimation for transparent fee display
Transaction routing visualization (EOA → Session → dApp)

4. Contract Interactions
typescriptCopy// Contract reading and writing
import {
  useReadContract,
  useContractEvents,
  prepareContractCall
} from "thirdweb/react";

// Smart contract utilities
import {
  getContract,
  prepareTransaction
} from "thirdweb";
For Session Wallet Management:

Read ERC-20 allowances for token delegation
Monitor contract events for transaction updates
Prepare calls for ERC-20 transferFrom operations

5. WebView Integration (CRITICAL for Apps Feature)
typescriptCopy// EIP-1193 provider for WebView injection
import { EIP1193 } from "thirdweb/wallets";

// Create provider from Thirdweb wallet
const provider = EIP1193.toProvider({
  wallet: activeSessionWallet,
  chain: currentChain,
  client: thirdwebClient,
});

// Inject into WebView
webView.postMessage({
  type: 'THIRDWEB_PROVIDER_INJECTION',
  provider: provider
});
Implementation Requirements:

Inject session wallet as Web3 provider into WebView
Handle provider requests from dApps
Custom transaction confirmation overlay
Browser history and bookmark management

6. Balance & Asset Management
typescriptCopy// Wallet balance hooks
import {
  useWalletBalance,
  useSocialProfiles
} from "thirdweb/react";
For Unified Wallet View:

Aggregate balances across all linked accounts
Display assets by account breakdown
Real-time balance updates
Multi-chain asset support

7. Authentication & Security
typescriptCopyimport {
  useAuthToken
} from "thirdweb/react";

// Get JWT for API calls
const authToken = useAuthToken();
Security Implementation:

Secure storage of session tokens
Biometric authentication integration
JWT management for API communication


Backend Team Requirements
1. Smart Contract Development (ERC-7702 Session Wallets)
typescriptCopy// Contract deployment utilities
import {
  deployContract,
  prepareDirectDeployTransaction,
  computePublishedContractAddress
} from "thirdweb/deploys";

// Core contract functions
import {
  getContract,
  prepareContractCall,
  sendTransaction
} from "thirdweb";
ERC-7702 Proxy Implementation:
solidityCopy// Session wallet contract functions needed
contract SessionWallet {
    function executeTransaction(address target, bytes data, uint256 value) external;
    function transferFromAllowance(address token, address from, address to, uint256 amount) external;
    function batchExecute(Call[] calls) external;
    
    // Delegation and permission management
    function grantPermission(address delegate, bytes4 selector) external;
    function revokePermission(address delegate, bytes4 selector) external;
}
Implementation Priority:

Develop secure proxy contracts with proper access controls
Implement batch transaction capabilities
Add gas optimization and fee delegation
Smart contract testing and auditing

2. API Infrastructure & Database Models
typescriptCopy// Database schema for smartprofiles
interface SmartProfile {
  id: string;
  name: string;
  sessionWalletAddress: string; // ERC-7702 proxy address
  linkedAccounts: LinkedAccount[];
  createdAt: Date;
  updatedAt: Date;
}

interface LinkedAccount {
  address: string;
  walletType: 'metamask' | 'coinbase' | 'walletconnect';
  isPrimary: boolean;
  allowances: TokenAllowance[];
  customName?: string;
}

interface BookmarkedApp {
  id: string;
  name: string;
  url: string;
  iconUrl: string;
  profileId: string;
  folderId?: string;
  position: number;
}

interface Folder {
  id: string;
  name: string;
  profileId: string;
  apps: BookmarkedApp[];
  isPublic: boolean;
  shareableLink?: string;
  position: number;
}
API Endpoints Needed:
typescriptCopy// Profile Management
POST /api/v1/profiles
GET /api/v1/profiles
PUT /api/v1/profiles/:id
DELETE /api/v1/profiles/:id

// Account Linking
POST /api/v1/profiles/:id/accounts
DELETE /api/v1/profiles/:id/accounts/:address
PUT /api/v1/profiles/:id/accounts/:address/primary

// App Management
POST /api/v1/profiles/:id/apps
GET /api/v1/profiles/:id/apps
PUT /api/v1/apps/:id
DELETE /api/v1/apps/:id

// Folder Management
POST /api/v1/profiles/:id/folders
PUT /api/v1/folders/:id
DELETE /api/v1/folders/:id
POST /api/v1/folders/:id/share
3. Authentication & Session Management
typescriptCopy// Multi-device authentication
import {
  createAuth,
  generatePayload,
  login,
  logout
} from "thirdweb/auth";

// Profile linking backend
interface AuthService {
  linkSocialProfile(profileId: string, provider: string, oauthToken: string): Promise<void>;
  linkWalletProfile(profileId: string, walletAddress: string, signature: string): Promise<void>;
  unlinkProfile(profileId: string, linkedProfileId: string): Promise<void>;
  getLinkedProfiles(profileId: string): Promise<Profile[]>;
}
Security Requirements:

JWT-based authentication with refresh tokens
Device registration and management
Session timeout and security policies
End-to-end encryption for sensitive data

4. Blockchain Integration Services
typescriptCopy// Session wallet creation service
class SessionWalletService {
  async createSessionWallet(profileId: string): Promise<string> {
    // Deploy ERC-7702 proxy contract
    const walletAddress = await deployContract({
      client,
      chain,
      account: deployerAccount,
      bytecode: SESSION_WALLET_BYTECODE,
      abi: SESSION_WALLET_ABI,
      constructorParams: { owner: profileOwner }
    });
    
    return walletAddress;
  }
  
  async executeTransaction(
    sessionWallet: string,
    target: string,
    data: string,
    value: bigint
  ): Promise<string> {
    // Route transaction through session wallet
    const tx = prepareContractCall({
      contract: getContract({ address: sessionWallet, client, chain }),
      method: "executeTransaction",
      params: [target, data, value]
    });
    
    return sendTransaction({ transaction: tx, account });
  }
}
Blockchain Services:

Session wallet factory for profile creation
Transaction routing and execution
Gas estimation and optimization
Multi-chain support infrastructure
Token allowance management

5. Cross-Device Synchronization
typescriptCopy// Real-time sync service
interface SyncService {
  // Profile changes
  onProfileUpdate(profileId: string, changes: Partial<SmartProfile>): void;
  syncProfileAcrossDevices(profileId: string): Promise<void>;
  
  // App/folder changes
  onAppBookmarkUpdate(profileId: string, appData: BookmarkedApp): void;
  onFolderUpdate(profileId: string, folderData: Folder): void;
  
  // Conflict resolution
  resolveConflicts(local: any, remote: any): any;
}

// WebSocket/SSE implementation for real-time updates
interface RealtimeUpdate {
  type: 'profile_update' | 'app_update' | 'folder_update';
  profileId: string;
  data: any;
  timestamp: Date;
  deviceId: string;
}
6. Security Implementation
typescriptCopy// Security service
class SecurityService {
  // Smart contract security
  async validateTransactionSecurity(
    sessionWallet: string,
    transaction: any
  ): Promise<boolean> {
    // Validate transaction parameters
    // Check allowances and permissions
    // Verify signature authenticity
    return true;
  }
  
  // API security
  async validateApiAccess(
    jwt: string,
    profileId: string,
    action: string
  ): Promise<boolean> {
    // Verify JWT
    // Check user permissions
    // Rate limiting
    return true;
  }
  
  // Multi-device security
  async registerDevice(
    profileId: string,
    deviceInfo: DeviceInfo
  ): Promise<string> {
    // Generate device token
    // Store device fingerprint
    // Enable/disable biometric auth
    return deviceToken;
  }
}