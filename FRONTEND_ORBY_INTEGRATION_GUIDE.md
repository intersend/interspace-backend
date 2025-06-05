# Interspace Frontend Guide: Orby Chain Abstraction Integration

## Executive Summary

Orby is the magic that makes Interspace truly user-friendly. It allows users to:
- **Send any token from any chain** without thinking about bridges
- **Pay gas fees with any token** (no more "insufficient ETH for gas"!)
- **Make transactions in one click** without token approvals
- **See all their assets in one place** across all chains

This document explains how to integrate these features into our React Native app to create the seamless Web3 experience users dream of.

---

## What is Orby? (In Simple Terms)

Imagine a user has:
- 500 USDC on Ethereum (in MetaMask)
- 300 USDC on Polygon (in Coinbase Wallet)
- 0.01 ETH on Ethereum
- 0 MATIC on Polygon

**Without Orby:** User can't send USDC from Polygon because they have no MATIC for gas. They need to bridge ETH to Polygon, swap it for MATIC, then finally send USDC. 😫

**With Orby:** User just says "Send 100 USDC to Bob". Orby automatically uses USDC to pay for gas. Done! 🎉

---

## Core User Journeys

### 1. Viewing Unified Balance
**User Story:** "I want to see all my money in one place"

```
User opens Wallet tab
    ↓
App calls GET /profiles/:id/balance
    ↓
User sees: "Total: $1,250.50"
    USDC: $800 (across Ethereum & Polygon)
    ETH: $450.50
    MATIC: $0
```

### 2. Sending Tokens (The Magic Moment)
**User Story:** "I want to send 100 USDC to my friend"

```
User enters: Amount (100 USDC) + Friend's address
    ↓
User taps "Send"
    ↓
App shows: "Gas will be paid in USDC" ✨
    ↓
User approves with FaceID/PIN
    ↓
Transaction sent! No ETH needed! 🎉
```

### 3. Swapping Tokens Across Chains
**User Story:** "I want to swap my Polygon USDC for ETH on Ethereum"

```
User selects: 300 USDC (Polygon) → ETH (Ethereum)
    ↓
App shows: "You'll receive ~0.12 ETH on Ethereum"
    ↓
User taps "Swap"
    ↓
Magic happens (no bridge UI, no multiple transactions)
    ↓
ETH appears in their Ethereum wallet! 🌈
```

---

## API Integration Guide

### 1. Get Unified Balance

**When to use:** Wallet tab, home screen, before any transaction

```typescript
// API Call
GET /api/v1/profiles/:profileId/balance

// Response Structure
{
  unifiedBalance: {
    totalUsdValue: "1250.50",
    tokens: [{
      symbol: "USDC",
      name: "USD Coin", 
      totalAmount: "800000000", // 800 USDC (6 decimals)
      totalUsdValue: "800.00",
      decimals: 6,
      balancesPerChain: [{
        chainId: 1,
        chainName: "Ethereum",
        amount: "500000000",
        tokenAddress: "0xA0b8..."
      }, {
        chainId: 137,
        chainName: "Polygon", 
        amount: "300000000",
        tokenAddress: "0x2791..."
      }]
    }]
  },
  gasAnalysis: {
    suggestedGasToken: {
      symbol: "USDC",
      score: 85 // How good this token is for gas
    },
    nativeGasAvailable: [{
      chainId: 1,
      amount: "10000000000000000", // 0.01 ETH
      symbol: "ETH"
    }]
  }
}
```

**Frontend Implementation:**
```typescript
// Show unified balance
const totalUsd = response.unifiedBalance.totalUsdValue;
const usdcBalance = response.unifiedBalance.tokens.find(t => t.symbol === 'USDC');

// Show gas warning if needed
if (!response.gasAnalysis.nativeGasAvailable.length) {
  showGasHelper("No worries! We'll use USDC for gas fees 🎉");
}
```

### 2. Create Transaction Intent

**When to use:** User wants to send tokens or swap

```typescript
// API Call for Transfer
POST /api/v1/profiles/:profileId/intent
{
  type: "transfer",
  from: {
    token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC on Ethereum
    chainId: 1,
    amount: "100000000" // 100 USDC
  },
  to: {
    address: "0x742d35Cc6634C0532925a3b844Bc9e7595f8fA5e" // recipient
  }
  // gasToken is optional - backend auto-selects the best one!
}

// Response
{
  intentId: "int_abc123",
  operationSetId: "op_xyz789",
  estimatedTimeMs: 30000, // 30 seconds
  unsignedOperations: { /* For signing */ },
  summary: {
    from: { token: "USDC", amount: "100", chainName: "Ethereum" },
    to: { address: "0x742d..." },
    gasToken: "USDC" // Look! Gas paid in USDC!
  }
}
```

**Frontend Flow:**
```typescript
// Step 1: Create intent
const intent = await createTransactionIntent({
  type: 'transfer',
  from: selectedToken,
  to: { address: recipientAddress }
});

// Step 2: Show user what will happen
showConfirmation({
  sending: `${amount} ${token.symbol}`,
  to: recipientName || shortenAddress(recipientAddress),
  gasWillBePaidIn: intent.summary.gasToken, // "USDC" 
  estimatedTime: intent.estimatedTimeMs / 1000 // seconds
});

// Step 3: Sign with Thirdweb session wallet
const signatures = await sessionWallet.signOperations(
  intent.unsignedOperations
);

// Step 4: Submit
await submitSignedOperations(intent.operationSetId, signatures);

// Step 5: Show progress
trackTransactionStatus(intent.operationSetId);
```

### 3. Submit Signed Operations

**When to use:** After user approves and signs

```typescript
// API Call
POST /api/v1/operations/:operationSetId/submit
{
  signedOperations: [{
    index: 0,
    signature: "0x...",
    signedData: "0x..." // if typed data
  }]
}
```

### 4. Track Transaction Status

**When to use:** After submitting, show real-time progress

```typescript
// API Call
GET /api/v1/operations/:operationSetId/status

// Response
{
  status: "pending", // -> "successful" or "failed"
  transactions: [{
    chainId: 1,
    hash: "0x...",
    status: "confirmed"
  }]
}

// Frontend: Poll or use WebSocket
const checkStatus = async () => {
  const status = await getOperationStatus(operationSetId);
  
  if (status === 'pending') {
    showProgress("Transaction in progress...");
    setTimeout(checkStatus, 2000); // Check every 2s
  } else if (status === 'successful') {
    showSuccess("Transaction complete! 🎉");
    refreshBalance();
  }
};
```

---

## UI/UX Best Practices

### 1. Hide the Complexity
**Bad:** "Select source chain, bridge USDC, approve token, pay gas in ETH..."
**Good:** "Send 100 USDC to Bob"

### 2. Smart Defaults
- Auto-select the best gas token
- Pre-fill common amounts
- Remember recent recipients

### 3. Clear Feedback
```typescript
// Show what's happening behind the scenes (but simply!)
"Finding the best route for your transaction..."
"Using USDC for gas fees (saving you ETH!)"
"Sending across Polygon → Ethereum"
"Transaction complete! Bob received 100 USDC"
```

### 4. Error Handling
```typescript
// User-friendly error messages
if (error.code === 'INSUFFICIENT_BALANCE') {
  show("You need at least 100 USDC (you have 95)");
} else if (error.code === 'NO_GAS_TOKENS') {
  show("Unable to pay gas fees. Try a smaller amount.");
}
```

---

## Key Features to Highlight

### 1. One-Click Transactions
```typescript
// Traditional Web3
1. Approve USDC spend
2. Wait for approval
3. Send USDC
4. Pay gas in ETH

// With Interspace + Orby
1. Send USDC (that's it!)
```

### 2. Universal Gas Payment
```typescript
// Show available gas tokens
const gasOptions = await getGasTokens(profileId);
showGasSelector(gasOptions.availableTokens);

// But also show: "Recommended: USDC (best option)"
```

### 3. Cross-Chain Magic
```typescript
// Make it feel like one wallet
showBalance({
  total: "$1,250",
  breakdown: "Hidden by default", // Expandable
  message: "Available everywhere" // Key message!
});
```

---

## Implementation Checklist

### Phase 1: Basic Integration (Week 1)
- [ ] Unified balance display
- [ ] Simple token transfers (same chain)
- [ ] Transaction status tracking

### Phase 2: Gas Abstraction (Week 2)
- [ ] Show gas token options
- [ ] Implement gas-less transactions
- [ ] Smart gas token selection

### Phase 3: Cross-Chain (Week 3)
- [ ] Cross-chain transfers
- [ ] Cross-chain swaps
- [ ] Unified transaction history

### Phase 4: Polish (Week 4)
- [ ] Animations and transitions
- [ ] Error recovery flows
- [ ] Performance optimization

---

## Technical Requirements

### 1. Session Wallet Integration
```typescript
// The session wallet signs everything
import { useSessionWallet } from '@thirdweb/react-native';

const sessionWallet = useSessionWallet(profileId);
const signatures = await sessionWallet.signOperations(operations);
```

### 2. Real-time Updates
```typescript
// WebSocket for transaction updates
socket.on('operation_update', (data) => {
  updateTransactionStatus(data);
  if (data.status === 'successful') {
    refreshBalance();
    showConfetti(); // Celebrate! 🎉
  }
});
```

### 3. State Management
```typescript
// Suggested state structure
interface WalletState {
  unifiedBalance: UnifiedBalance;
  pendingOperations: Operation[];
  gasPreference: GasToken;
  isLoading: boolean;
}
```

---

## Common Pitfalls to Avoid

1. **Don't show chain selection** - Orby figures it out
2. **Don't mention "approvals"** - They don't exist anymore
3. **Don't show multiple transactions** - It's all one operation
4. **Don't require ETH for gas** - Any token works

---

## Example User Flows

### Send Money Flow
```
1. User taps "Send" 
2. Enter amount: "100 USDC"
3. Enter recipient: "alice.eth"
4. Show summary:
   - Sending: 100 USDC
   - To: Alice
   - Gas: ~$0.50 (paid in USDC) ✨
   - Time: ~30 seconds
5. User taps "Confirm"
6. FaceID/PIN
7. Show progress: "Sending..."
8. Success! With confetti 🎉
```

### Swap Flow
```
1. User taps "Swap"
2. Select: USDC (Polygon) → ETH (Ethereum)
3. Enter: 300 USDC
4. Show: "You'll get ~0.12 ETH"
5. Show gas: "Gas included (paid in USDC)"
6. Confirm → Sign → Success!
```

---

## Support & Resources

- **Backend Team:** For API questions
- **Orby Docs:** [Coming soon]
- **Test Environment:** Use testnet endpoints first

Remember: The goal is to make Web3 feel like Web2. Every additional step or choice is a barrier. Keep it simple, make it magical! 🚀

---

## Summary

Orby integration enables us to build the wallet everyone wishes they had:
- **See everything in one place** (unified balance)
- **Send anything to anyone** (one-click transactions)
- **Never worry about gas** (pay with any token)
- **Move assets freely** (chain abstraction)

Let's build the future of Web3 UX! 🌟
