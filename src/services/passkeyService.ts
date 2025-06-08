import { verifyRegistrationResponse, verifyAuthenticationResponse, GenerateRegistrationOptionsOpts, GenerateAuthenticationOptionsOpts } from '@simplewebauthn/server';

interface StoredCredential {
  credentialID: string;
  publicKey: string;
  username: string;
  counter: number;
}

class PasskeyService {
  private creds: Map<string, StoredCredential> = new Map();

  async verifyRegistration(responseJSON: string): Promise<StoredCredential> {
    const response = JSON.parse(responseJSON);
    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response,
      expectedChallenge: response.challenge,
      expectedOrigin: response.origin,
      expectedRPID: response.rpId,
    });
    if (!verified || !registrationInfo) throw new Error('Invalid passkey registration');
    const cred: StoredCredential = {
      credentialID: registrationInfo.credentialID.toString('base64url'),
      publicKey: registrationInfo.credentialPublicKey.toString('base64url'),
      username: response.username,
      counter: registrationInfo.counter,
    };
    this.creds.set(cred.credentialID, cred);
    return cred;
  }

  async verifyAuthentication(assertionJSON: string): Promise<{ credentialId: string; username: string }> {
    const assertion = JSON.parse(assertionJSON);
    const cred = this.creds.get(assertion.id);
    if (!cred) throw new Error('Unknown credential');
    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: assertion.challenge,
      expectedOrigin: assertion.origin,
      expectedRPID: assertion.rpId,
      authenticator: {
        credentialID: Buffer.from(cred.credentialID, 'base64url'),
        credentialPublicKey: Buffer.from(cred.publicKey, 'base64url'),
        counter: cred.counter,
        transports: ['internal'],
      },
    });
    if (!verified || !authenticationInfo) throw new Error('Invalid passkey assertion');
    cred.counter = authenticationInfo.newCounter;
    return { credentialId: cred.credentialID, username: cred.username };
  }
}

export const passkeyService = new PasskeyService();
