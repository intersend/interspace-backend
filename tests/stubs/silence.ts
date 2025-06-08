export const P1Keygen = { init: async () => ({ genMsg1: async () => '', processMsg2: async () => [{ publicKey: '' }, ''] }) };
export const P2Keygen = { init: async () => ({ processMsg1: async () => '', processMsg3: async () => ({}) }) };
export const P1Signer = { init: async () => ({ genMsg1: async () => '', processMsg2: async () => ({ sign: '' }) }) };
export const P2Signer = { init: async () => ({ processMsg1: async () => '', processMsg3: async () => '' }) };
export const generateSessionId = async () => 'stub';
