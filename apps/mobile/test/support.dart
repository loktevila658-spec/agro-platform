import 'package:agroplatform_mobile/persistence.dart';

class MemorySecrets implements SecretStore {
  final values = <String, String>{};
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async {
    values[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    values.remove(key);
  }
}

OfflineGrant testGrant(WorkspaceIdentity identity, {DateTime? expiresAt}) =>
    OfflineGrant(
      id: 'signed-fixture',
      tenantId: identity.tenantId,
      userId: identity.userId,
      scopeVersion: 1,
      issuedAt: DateTime.utc(2020),
      expiresAt: expiresAt ?? DateTime.utc(2100),
      allowedCommands: {'RecordFixture'},
      allowedOwners: {'Fixture:entity'},
      risk: 'O1',
      signedEnvelope: 'server-signed-fixture',
    );

CommandDraft fixtureDraft({String value = 'sensitive-offline-value'}) =>
    CommandDraft.create(
      aggregateType: 'Fixture',
      aggregateId: 'entity',
      commandType: 'RecordFixture',
      expectedVersion: 7,
      observedAt: DateTime.utc(2026, 10, 1),
      payload: {'value': value},
    );
