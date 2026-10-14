import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';

const apiBase = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:3000');

String deviceUuid() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((value) => value.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

Future<Map<String, Object?>> apiRequest(String path, {String method = 'GET', Map<String, Object?>? body, String? accessToken}) async {
  final client = HttpClient();
  try {
    final request = await client.openUrl(method, Uri.parse('$apiBase$path'));
    request.headers.contentType = ContentType.json;
    if (accessToken != null) request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $accessToken');
    if (body != null) request.write(jsonEncode(body));
    final response = await request.close();
    final payload = jsonDecode(await response.transform(utf8.decoder).join());
    if (response.statusCode < 200 || response.statusCode >= 300 || payload is! Map<String, Object?>) {
      throw const HttpException('Authentication request failed');
    }
    return payload;
  } finally { client.close(force: true); }
}

void main() => runApp(const AgroPlatformShell());

class AgroPlatformShell extends StatefulWidget {
  const AgroPlatformShell({super.key});
  @override
  State<AgroPlatformShell> createState() => _AgroPlatformShellState();
}

class _AgroPlatformShellState extends State<AgroPlatformShell> {
  final login = TextEditingController();
  final password = TextEditingController();
  final code = TextEditingController();
  final deviceId = deviceUuid();
  String? challenge;
  String? accessToken;
  String? refreshToken;
  List<Map<String, Object?>> sessions = [];
  String? error;
  bool busy = false;

  @override
  void dispose() { login.dispose(); password.dispose(); code.dispose(); super.dispose(); }

  Future<void> signIn() async {
    setState(() { busy = true; error = null; });
    try {
      final result = await apiRequest('/v1/auth/login', method: 'POST', body: {'login': login.text, 'password': password.text, 'deviceId': deviceId});
      password.clear();
      if (result['mfaRequired'] == true) {
        setState(() => challenge = result['challengeToken'] as String?);
      } else {
        setState(() { accessToken = result['accessToken'] as String?; refreshToken = result['refreshToken'] as String?; });
        await loadSessions();
      }
    } catch (_) { setState(() => error = 'Authentication failed'); password.clear(); }
    finally { if (mounted) setState(() => busy = false); }
  }

  Future<void> verifyMfa() async {
    setState(() { busy = true; error = null; });
    try {
      final result = await apiRequest('/v1/auth/mfa/verify', method: 'POST', body: {'challengeToken': challenge, 'code': code.text});
      code.clear();
      setState(() { accessToken = result['accessToken'] as String?; refreshToken = result['refreshToken'] as String?; challenge = null; });
      await loadSessions();
    } catch (_) { setState(() => error = 'Authentication failed'); code.clear(); }
    finally { if (mounted) setState(() => busy = false); }
  }

  Future<void> loadSessions() async {
    final token = accessToken;
    if (token == null) return;
    try {
      final result = await apiRequest('/v1/me/sessions', accessToken: token);
      final values = result['sessions'];
      if (values is List) setState(() => sessions = values.whereType<Map<String, Object?>>().toList());
    } catch (_) { setState(() => error = 'Could not load sessions'); }
  }

  Future<void> revokeSession(String sessionId) async {
    final token = accessToken;
    if (token == null) return;
    try {
      await apiRequest('/v1/me/sessions/$sessionId/commands/revoke', method: 'POST', body: {}, accessToken: token);
      await loadSessions();
    } catch (_) { setState(() => error = 'Could not revoke session'); }
  }

  Future<void> logout() async {
    final token = accessToken;
    if (token != null) { try { await apiRequest('/v1/auth/logout', method: 'POST', body: {}, accessToken: token); } catch (_) {} }
    setState(() { accessToken = null; refreshToken = null; challenge = null; sessions = []; code.clear(); password.clear(); error = null; });
  }

  @override
  Widget build(BuildContext context) {
    final signedIn = accessToken != null;
    return MaterialApp(home: Scaffold(appBar: AppBar(title: const Text('AgroPlatform')),
      body: Padding(padding: const EdgeInsets.all(24), child: signedIn
        ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Signed in'),
            Row(children: [TextButton(onPressed: loadSessions, child: const Text('Refresh sessions')), TextButton(onPressed: logout, child: const Text('Log out'))]),
            Expanded(child: ListView(children: sessions.map((session) => ListTile(title: Text('${session['deviceLabel'] ?? 'Device'}'), subtitle: Text('${session['authStrength'] ?? ''}${session['revoked'] == true ? ' · revoked' : ''}'), trailing: session['current'] == true ? const Text('Current') : session['revoked'] == true ? null : TextButton(onPressed: () => revokeSession(session['sessionId'] as String), child: const Text('Revoke')))).toList())),
          ])
        : challenge != null
          ? Column(mainAxisSize: MainAxisSize.min, children: [TextField(controller: code, keyboardType: TextInputType.number, autofillHints: const [AutofillHints.oneTimeCode], decoration: const InputDecoration(labelText: 'Authenticator code')), ElevatedButton(onPressed: busy ? null : verifyMfa, child: const Text('Verify'))])
          : Column(mainAxisSize: MainAxisSize.min, children: [TextField(controller: login, autofillHints: const [AutofillHints.username], decoration: const InputDecoration(labelText: 'Login')), TextField(controller: password, obscureText: true, autofillHints: const [AutofillHints.password], decoration: const InputDecoration(labelText: 'Password')), ElevatedButton(onPressed: busy ? null : signIn, child: const Text('Sign in'))]),
      ), bottomNavigationBar: error == null ? null : Padding(padding: const EdgeInsets.all(12), child: Text(error!, textAlign: TextAlign.center))));
  }
}
