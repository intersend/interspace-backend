let counter = 0;

export const randBytes = jest.fn(async (size: number) => {
  return Buffer.alloc(size, counter++);
});

export class P1KeyGen {
  constructor(public sessionId: string, public x1: any) {}
  
  async init() {}
  
  async processMessage(msg: any) {
    if (!msg) {
      return { msg_to_send: 'p1_msg1' };
    } else if (msg === 'p2_msg2') {
      return { 
        msg_to_send: 'p1_msg3',
        p1_key_share: {
          public_key: '0x' + '0'.repeat(38) + counter.toString().padStart(2, '0'),
          x1: this.x1
        }
      };
    }
    return {};
  }
  
  static getInstanceForKeyRefresh(sessionId: string, keyShare: any) {
    return new P1KeyGen(sessionId, keyShare.x1);
  }
}

export class P2KeyGen {
  constructor(public sessionId: string, public x2: any) {}
  
  async processMessage(msg: any) {
    if (msg === 'p1_msg1') {
      return { msg_to_send: 'p2_msg2' };
    } else if (msg === 'p1_msg3') {
      return { 
        p2_key_share: {
          public_key: '0x04' + 'b'.repeat(128), // Different from P1 to simulate real MPC
          x2: this.x2,
          p2: true
        }
      };
    }
    return {};
  }
  
  static getInstanceForKeyRefresh(sessionId: string, keyShare: any) {
    return new P2KeyGen(sessionId, keyShare.x2);
  }
}

export class P1Signature {
  constructor(public sessionId: string, public messageHash: Uint8Array, public keyShare: any) {}
  
  async processMessage(msg: any) {
    if (!msg) {
      return { msg_to_send: 'p1_sign_msg1' };
    } else if (msg === 'p2_sign_msg2') {
      return { msg_to_send: 'p1_sign_msg3' };
    } else if (msg === 'p2_sign_msg4') {
      return { 
        msg_to_send: 'p1_sign_msg5',
        signature: '0x' + 'a'.repeat(64)
      };
    }
    return {};
  }
}

export class P2Signature {
  constructor(public sessionId: string, public messageHash: Uint8Array, public keyShare: any) {}
  
  async processMessage(msg: any) {
    if (msg === 'p1_sign_msg1') {
      return { msg_to_send: 'p2_sign_msg2' };
    } else if (msg === 'p1_sign_msg3') {
      return { msg_to_send: 'p2_sign_msg4' };
    } else if (msg === 'p1_sign_msg5') {
      return { 
        signature: '0x' + 'a'.repeat(64)
      };
    }
    return {};
  }
}