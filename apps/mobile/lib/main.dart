import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';

import 'persistence.dart';
import 'sync.dart';
import 'widgets/queue_status.dart';

const apiBase = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:3000',
);

String deviceUuid() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes
      .map((value) => value.toRadixString(16).padLeft(2, '0'))
      .join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

Future<Map<String, Object?>> apiRequest(
  String path, {
  String method = 'GET',
  Map<String, Object?>? body,
  String? accessToken,
}) async {
  final client = HttpClient();
  try {
    final request = await client.openUrl(method, Uri.parse('$apiBase$path'));
    if (body != null) request.headers.contentType = ContentType.json;
    if (accessToken != null) {
      request.headers.set(
        HttpHeaders.authorizationHeader,
        'Bearer $accessToken',
      );
    }
    if (body != null) request.write(jsonEncode(body));
    final response = await request.close();
    final payload = jsonDecode(await response.transform(utf8.decoder).join());
    if (response.statusCode < 200 ||
        response.statusCode >= 300 ||
        payload is! Map<String, Object?>) {
      throw const HttpException('Authentication request failed');
    }
    return payload;
  } finally {
    client.close(force: true);
  }
}

void main() => runApp(const AgroPlatformShell());

class AgroPlatformShell extends StatefulWidget {
  const AgroPlatformShell({super.key});
  @override
  State<AgroPlatformShell> createState() => _AgroPlatformShellState();
}

class _AgroPlatformShellState extends State<AgroPlatformShell>
    with WidgetsBindingObserver {
  final login = TextEditingController();
  final password = TextEditingController();
  final code = TextEditingController();
  String? deviceId;
  Workspace? workspace;
  WorkspaceIdentity? workspaceIdentity;
  AuthorityHttpTransport? syncTransport;
  SyncEngine? syncEngine;
  AttachmentWorker? mediaWorker;
  bool syncForeground = true;
  Timer? syncTimer;
  Future<void>? syncTask, mediaTask;
  QueueCounts queueCounts = const QueueCounts(0, 0, 0, 0);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(initializeDevice());
  }

  Future<void> initializeDevice() async {
    try {
      const storage = OsSecretStore();
      var id = await storage.read('agro.installation.device');
      if (id == null) {
        id = deviceUuid();
        await storage.write('agro.installation.device', id);
      }
      if (mounted) setState(() => deviceId = id);
    } catch (_) {
      if (mounted) setState(() => error = 'Secure device storage unavailable');
    }
  }

  Future<void> openAuthenticatedWorkspace() async {
    final token = accessToken;
    if (token == null) return;
    // Identity hints come only from the current successful authority login.
    // They select an isolated encrypted cache; they grant no offline permission.
    final claims = jsonDecode(
      utf8.decode(base64Url.decode(base64Url.normalize(token.split('.')[1]))),
    ) as Map<String, dynamic>;
    final identity = WorkspaceIdentity(
      claims['tid'] as String,
      claims['sub'] as String,
      apiBase,
    );
    workspaceIdentity = identity;
    final opened = await Workspace.open(
      identity,
      authenticatedDeviceId: deviceId,
      authorityUri: Uri.parse(apiBase),
    );
    if (!mounted) {
      await opened.close();
      return;
    }
    workspace = opened;
    final transport = AuthorityHttpTransport(
      authority: Uri.parse(apiBase),
      accessToken: () async {
        final value = accessToken;
        if (value == null) {
          throw const SyncFailure('AUTHENTICATION_REQUIRED', status: 401);
        }
        return value;
      },
    );
    syncTransport = transport;
    const publicKey = String.fromEnvironment(
      'SYNC_AUTHORITY_ED25519_PUBLIC_KEY',
    );
    final verifier = publicKey.isEmpty
        ? null
        : AuthorityGrantVerifier(base64.decode(publicKey), deviceId!);
    syncEngine = SyncEngine(
      opened,
      opened.commands(verify: verifier?.verify ?? (_) async => false),
      transport,
      grantVerifier: verifier,
    );
    mediaWorker = AttachmentWorker(opened.attachments, transport);
    startSync(connectivityRestored: true);
    final counts = await opened.commands(verify: (_) async => false).counts();
    if (mounted) setState(() => queueCounts = counts);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    syncForeground = state == AppLifecycleState.resumed;
    if (state == AppLifecycleState.resumed) {
      startSync(connectivityRestored: true);
    } else {
      syncTimer?.cancel();
    }
  }

  void startSync({bool connectivityRestored = false}) {
    final engine = syncEngine, opened = workspace;
    if (engine == null || opened == null || syncTask != null) return;
    syncTimer?.cancel();
    syncTask =
        (() async {
          try {
            await engine.run(
              connectivityRestored: connectivityRestored,
              maxBatches: 20,
            );
          } catch (_) {
            /* queue remains durable; authentication/authority is never bypassed */
          }
          if (!identical(syncEngine, engine)) return;
          final counts = await opened
              .commands(verify: (_) async => false)
              .counts();
          if (mounted) setState(() => queueCounts = counts);
        })().catchError((Object _) {}).whenComplete(() {
          syncTask = null;
          if (mounted && syncForeground && identical(syncEngine, engine)) {
            syncTimer = Timer(
              Duration(seconds: queueCounts.pending > 0 ? 5 : 30),
              startSync,
            );
          }
        });
    final worker = mediaWorker;
    if (worker != null && mediaTask == null) {
      // Conservatively treat unknown network type as mobile data. Wi-Fi-only
      // evidence remains queued until an owner/platform network policy permits it.
      mediaTask = worker
          .run(isWifi: false)
          .whenComplete(() => mediaTask = null);
    }
  }

  Future<void> stopSync() async {
    syncTimer?.cancel();
    syncEngine = null;
    mediaWorker = null;
    syncTransport?.close();
    syncTransport = null;
    final pending = [syncTask, mediaTask].whereType<Future<void>>().toList();
    for (final task in pending) {
      try {
        await task;
      } catch (_) {}
    }
  }

  String? challenge;
  String? accessToken;
  String? refreshToken;
  List<Map<String, Object?>> sessions = [];
  String? error;
  bool busy = false;

  @override
  void dispose() {
    login.dispose();
    password.dispose();
    code.dispose();
    WidgetsBinding.instance.removeObserver(this);
    unawaited(stopSync().then((_) => workspace?.close()));
    super.dispose();
  }

  Future<void> signIn() async {
    if (deviceId == null || workspace != null) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result = await apiRequest(
        '/v1/auth/login',
        method: 'POST',
        body: {
          'login': login.text,
          'password': password.text,
          'deviceId': deviceId,
        },
      );
      password.clear();
      if (result['mfaRequired'] == true) {
        setState(() => challenge = result['challengeToken'] as String?);
      } else {
        setState(() {
          accessToken = result['accessToken'] as String?;
          refreshToken = result['refreshToken'] as String?;
        });
        await openAuthenticatedWorkspace();
        await loadSessions();
      }
    } catch (_) {
      setState(
        () => error = accessToken == null
            ? 'Authentication failed'
            : 'Local storage unavailable',
      );
      password.clear();
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> verifyMfa() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result = await apiRequest(
        '/v1/auth/mfa/verify',
        method: 'POST',
        body: {'challengeToken': challenge, 'code': code.text},
      );
      code.clear();
      setState(() {
        accessToken = result['accessToken'] as String?;
        refreshToken = result['refreshToken'] as String?;
        challenge = null;
      });
      await openAuthenticatedWorkspace();
      await loadSessions();
    } catch (_) {
      setState(
        () => error = accessToken == null
            ? 'Authentication failed'
            : 'Local storage unavailable',
      );
      code.clear();
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> loadSessions() async {
    final token = accessToken;
    if (token == null) return;
    try {
      final result = await apiRequest('/v1/me/sessions', accessToken: token);
      final values = result['sessions'];
      if (values is List) {
        setState(
          () => sessions = values.whereType<Map<String, Object?>>().toList(),
        );
      }
    } catch (_) {
      setState(() => error = 'Could not load sessions');
    }
  }

  Future<void> revokeSession(String sessionId) async {
    final token = accessToken;
    if (token == null) return;
    try {
      await apiRequest(
        '/v1/me/sessions/$sessionId/commands/revoke',
        method: 'POST',
        accessToken: token,
      );
      await loadSessions();
    } catch (_) {
      setState(() => error = 'Could not revoke session');
    }
  }

  Future<void> logout() async {
    await stopSync();
    final token = accessToken;
    if (token != null) {
      try {
        await apiRequest('/v1/auth/logout', method: 'POST', accessToken: token);
      } catch (_) {}
    }
    try {
      if (const bool.fromEnvironment('SHARED_DEVICE', defaultValue: true)) {
        if (workspace != null) {
          await workspace!.wipeShared();
        } else if (workspaceIdentity != null) {
          await Workspace.wipeSharedIdentity(workspaceIdentity!);
        }
      } else {
        await workspace?.close();
      }
      workspace = null;
      workspaceIdentity = null;
      queueCounts = const QueueCounts(0, 0, 0, 0);
    } catch (_) {
      if (mounted) {
        setState(() => error = 'Workspace cleanup failed; sign-in blocked');
      }
      return;
    }
    if (!mounted) return;
    setState(() {
      accessToken = null;
      refreshToken = null;
      challenge = null;
      sessions = [];
      code.clear();
      password.clear();
      error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final signedIn = accessToken != null;
    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(title: const Text('AgroPlatform')),
        body: Padding(
          padding: const EdgeInsets.all(24),
          child: signedIn
              ? Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Signed in'),
                    if (workspace != null) QueueStatus(counts: queueCounts),
                    Row(
                      children: [
                        TextButton(
                          onPressed: loadSessions,
                          child: const Text('Refresh sessions'),
                        ),
                        TextButton(
                          onPressed: logout,
                          child: const Text('Log out'),
                        ),
                      ],
                    ),
                    Expanded(
                      child: ListView(
                        children: sessions
                            .map(
                              (session) => ListTile(
                                title: Text(
                                  '${session['deviceLabel'] ?? 'Device'}',
                                ),
                                subtitle: Text(
                                  '${session['authStrength'] ?? ''}${session['revoked'] == true ? ' · revoked' : ''}',
                                ),
                                trailing: session['current'] == true
                                    ? const Text('Current')
                                    : session['revoked'] == true
                                    ? null
                                    : TextButton(
                                        onPressed: () => revokeSession(
                                          session['sessionId'] as String,
                                        ),
                                        child: const Text('Revoke'),
                                      ),
                              ),
                            )
                            .toList(),
                      ),
                    ),
                  ],
                )
              : challenge != null
              ? Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: code,
                      keyboardType: TextInputType.number,
                      autofillHints: const [AutofillHints.oneTimeCode],
                      decoration: const InputDecoration(
                        labelText: 'Authenticator code',
                      ),
                    ),
                    ElevatedButton(
                      onPressed: busy ? null : verifyMfa,
                      child: const Text('Verify'),
                    ),
                  ],
                )
              : Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    TextField(
                      controller: login,
                      autofillHints: const [AutofillHints.username],
                      decoration: const InputDecoration(labelText: 'Login'),
                    ),
                    TextField(
                      controller: password,
                      obscureText: true,
                      autofillHints: const [AutofillHints.password],
                      decoration: const InputDecoration(labelText: 'Password'),
                    ),
                    ElevatedButton(
                      onPressed: busy || deviceId == null ? null : signIn,
                      child: const Text('Sign in'),
                    ),
                  ],
                ),
        ),
        bottomNavigationBar: error == null
            ? null
            : Padding(
                padding: const EdgeInsets.all(12),
                child: Text(error!, textAlign: TextAlign.center),
              ),
      ),
    );
  }
}
