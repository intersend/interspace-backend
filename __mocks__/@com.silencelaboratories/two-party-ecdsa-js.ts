export const P1Keygen = { init: async () => ({ genMsg1: async () => 'm1', processMsg2: async () => [{ publicKey: '0x' + '1'.repeat(40) }, 'm3'], publicKey: '0x' + '1'.repeat(40) }) } as any;
export const P2Keygen = { init: async () => ({ processMsg1: async () => 'm1', processMsg3: async () => 'share2' }) } as any;
export const P1Signer = { init: async () => ({ genMsg1: async () => 'sm1', processMsg2: async () => ({ sign: '0x1' }) }) } as any;
export const P2Signer = { init: async () => ({ processMsg1: async () => 'sm2', processMsg3: async () => '0x1' }) } as any;
export const generateSessionId = async () => 'session';
