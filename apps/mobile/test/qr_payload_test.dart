import 'package:flutter_test/flutter_test.dart';
import 'package:agroplatform_mobile/features/qr/qr_payload.dart';

void main() {
  const id = '019a7430-0000-7000-8000-000000000001';
  test('v1 identity round trip and strict unsafe input rejection', () {
    final payload = QrIdentity(id).payload;
    expect(
      payload,
      'agro://v1/Material/$id?c=4ff26dc185287ab31a30089ca98400274e8845632e3c066554dc3858d391c1ec',
    );
    expect(QrIdentity.decode(payload).entityId, id);
    expect(QrIdentity.decode(payload).payload, payload);
    for (final input in [
      '',
      'x' * 513,
      payload.replaceFirst('v1', 'v2'),
      payload.replaceFirst('Material', 'Field'),
      '$payload&token=secret',
      payload.replaceFirst(id, '${id.substring(0, 35)}2'),
    ]) {
      expect(() => QrIdentity.decode(input), throwsFormatException);
    }
  });
}
