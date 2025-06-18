//@ts-nocheck
import { verifyRegistrationResponse, verifyAuthenticationResponse, GenerateRegistrationOptionsOpts, GenerateAuthenticationOptionsOpts } from '@simplewebauthn/server';
import { prisma } from '@/utils/database';

interface StoredCredential {
  credentialID: string;
  publicKey: string;
  username: string;
  counter: number;
}

class PasskeyService {

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
      credentialID: registrationInfo.credential.id.toString('base64url'),
      publicKey: registrationInfo.credential.publicKey.toString('base64url'),
      username: response.username,
      counter: registrationInfo.credential.counter,
    };
    await prisma.passkeyCredential.upsert({
      where: { credentialId: cred.credentialID },
      update: {
        publicKey: cred.publicKey,
        username: cred.username,
        counter: cred.counter,
      },
      create: {
        credentialId: cred.credentialID,
        publicKey: cred.publicKey,
        username: cred.username,
        counter: cred.counter,
      },
    });
    return cred;
  }

  async verifyAuthentication(assertionJSON: string): Promise<{ credentialId: string; username: string }> {
    const assertion = JSON.parse(assertionJSON);
    const cred = await prisma.passkeyCredential.findUnique({
      where: { credentialId: assertion.id },
    });
    if (!cred) throw new Error('Unknown credential');
    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: assertion.challenge,
      expectedOrigin: assertion.origin,
      expectedRPID: assertion.rpId,
      credential: {
        id: Buffer.from(cred.credentialId, 'base64url'),
        publicKey: Buffer.from(cred.publicKey, 'base64url'),
        counter: cred.counter,
        transports: ['internal'],
      },
    });
    if (!verified || !authenticationInfo) throw new Error('Invalid passkey assertion');
    await prisma.passkeyCredential.update({
      where: { credentialId: cred.credentialId },
      data: { counter: authenticationInfo.newCounter },
    });
    return { credentialId: cred.credentialId, username: cred.username };
  }
}

export const passkeyService = new PasskeyService();
