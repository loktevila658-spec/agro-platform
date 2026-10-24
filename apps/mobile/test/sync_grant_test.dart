import 'dart:convert';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/sync.dart';
import 'package:agroplatform_mobile/persistence.dart';

void main() {
  test('Ed25519 authority grant binds identity, device, permissions, scope, limits and TTL', () async {
    final pair = await Ed25519().newKeyPairFromSeed(
      List.generate(32, (i) => i),
    );
    final public = await pair.extractPublicKey();
    final value = {
      'id': 'grant',
      'tenant': 'tenant',
      'user': 'user',
      'deviceId': 'device',
      'scopeVersion': 1,
      'issuedAt': '2026-10-01T00:00:00.000Z',
      'expiresAt': '2026-10-08T00:00:00.000Z',
      'commands': ['RecordFixture'],
      'owners': ['Fixture:entity'],
      'risk': 'O1',
    };
    final body = base64Url
        .encode(utf8.encode(jsonEncode(value)))
        .replaceAll('=', '');
    final sig = await Ed25519().sign(utf8.encode(body), keyPair: pair);
    final envelope = '$body.${base64Url.encode(sig.bytes).replaceAll('=', '')}';
    OfflineGrant grant(String tenant) => OfflineGrant(
      id: 'grant',
      tenantId: tenant,
      userId: 'user',
      scopeVersion: 1,
      issuedAt: DateTime.utc(2026, 10, 1),
      expiresAt: DateTime.utc(2026, 10, 8),
      allowedCommands: {'RecordFixture'},
      allowedOwners: {'Fixture:entity'},
      risk: 'O1',
      signedEnvelope: envelope,
    );
    final verifier = AuthorityGrantVerifier(public.bytes, 'device');
    expect(await verifier.verify(grant('tenant')), true);
    expect(await verifier.verify(grant('other')), false);
    expect(
      await AuthorityGrantVerifier(
        public.bytes,
        'other-device',
      ).verify(grant('tenant')),
      false,
    );
    expect(
      await AuthorityGrantVerifier(
        List.filled(32, 0),
        'device',
      ).verify(grant('tenant')),
      false,
    );
  });
}
