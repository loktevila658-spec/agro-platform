import 'dart:convert';

import 'package:crypto/crypto.dart';

class QrIdentity {
  QrIdentity(this.entityId) {
    if (!uuid.hasMatch(entityId)) throw const FormatException('QR_INVALID_ID');
  }
  static final uuid = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
  );
  final String entityId;
  String get checksum =>
      sha256.convert(utf8.encode('v1/Material/$entityId')).toString();
  String get payload => 'agro://v1/Material/$entityId?c=$checksum';
  static QrIdentity decode(String value) {
    if (value.isEmpty || utf8.encode(value).length > 512)
      throw const FormatException('QR_INVALID_PAYLOAD');
    Object? version, type, id, checksum;
    if (value.startsWith('{')) {
      dynamic data;
      try {
        data = jsonDecode(value);
      } catch (_) {
        throw const FormatException('QR_INVALID_PAYLOAD');
      }
      if (data is! Map<String, dynamic> ||
          data.length != 4 ||
          !{'v', 't', 'id', 'c'}.every(data.containsKey) ||
          RegExp(r'"(?:v|t|id|c)"\s*:').allMatches(value).length != 4)
        throw const FormatException('QR_INVALID_PAYLOAD');
      version = data['v'];
      type = data['t'];
      id = data['id'];
      checksum = data['c'];
    } else {
      final m = RegExp(
        r'^agro://v([0-9]+)/([A-Za-z_]+)/([0-9a-f-]+)\?c=([0-9a-f]{64})$',
      ).firstMatch(value);
      if (m == null) throw const FormatException('QR_INVALID_PAYLOAD');
      version = m[1] == '1' ? 1 : 0;
      type = m[2];
      id = m[3];
      checksum = m[4];
    }
    if (version is! int || version != 1)
      throw const FormatException('QR_VERSION_UNSUPPORTED');
    if (type != 'Material') throw const FormatException('QR_TYPE_UNSUPPORTED');
    if (id is! String) throw const FormatException('QR_INVALID_ID');
    final identity = QrIdentity(id);
    if (checksum != identity.checksum)
      throw const FormatException('QR_CHECKSUM_INVALID');
    return identity;
  }
}
