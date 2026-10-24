import 'dart:convert';

import 'package:cryptography/cryptography.dart';

import '../persistence/models.dart';
import 'protocol.dart';

/// Public key must be pinned by authority provisioning, never trusted from the
/// same unsigned response as the grant. Ed25519 binds every offline grant field.
class AuthorityGrantVerifier {
  AuthorityGrantVerifier(this.publicKey, this.deviceId);
  final List<int> publicKey;
  final String deviceId;
  Future<bool> verify(OfflineGrant grant) async {
    try {
      final parts = grant.signedEnvelope.split('.');
      if (parts.length != 2 || publicKey.length != 32) return false;
      final valid = await Ed25519().verify(
        utf8.encode(parts[0]),
        signature: Signature(
          base64Url.decode(base64Url.normalize(parts[1])),
          publicKey: SimplePublicKey(publicKey, type: KeyPairType.ed25519),
        ),
      );
      if (!valid) return false;
      final data = jsonDecode(
        utf8.decode(base64Url.decode(base64Url.normalize(parts[0]))),
      ) as Map<String, dynamic>;
      final supplied = jsonDecode(grant.json) as Map<String, dynamic>
        ..remove('signedEnvelope');
      final signed = Map<String, dynamic>.from(data)..remove('deviceId');
      return data['deviceId'] == deviceId &&
          canonicalJson(signed) == canonicalJson(supplied);
    } catch (_) {
      return false;
    }
  }

  OfflineGrant parse(SyncGrant grant) => OfflineGrant(
    id: grant.id,
    tenantId: grant.tenant,
    userId: grant.user,
    scopeVersion: grant.scopeVersion,
    issuedAt: DateTime.parse(grant.issuedAt),
    expiresAt: DateTime.parse(grant.expiresAt),
    allowedCommands: grant.commands.toSet(),
    allowedOwners: grant.owners.toSet(),
    risk: grant.risk,
    signedEnvelope: grant.signedEnvelope,
  );
}
