import 'dart:io';

import 'package:flutter/services.dart';

import '../../generated/contracts.dart';
import '../../persistence.dart';

class ScoutingCapture {
  const ScoutingCapture();
  static const channel = MethodChannel('agroplatform/scouting');
  Future<ScoutingLocation?> location() async {
    final value = await channel.invokeMapMethod<String, Object?>('location');
    return value == null ? null : ScoutingLocation.fromJson(value);
  }

  Future<Map<String, Object?>?> media(String kind) =>
      channel.invokeMapMethod<String, Object?>('media', {'kind': kind});
  Future<void> discard(String path) =>
      channel.invokeMethod<void>('discard', {'path': path});
  Future<String> stage(
    Workspace w,
    Map<String, Object?> media,
    String fieldSeasonId,
  ) async {
    final path = media['path'] as String;
    // The existing queue encrypts, chunks and hashes the source before linking it.
    final id = await w.attachments.stage(
      File(path),
      ownerRef: 'ScoutingCapture:$fieldSeasonId',
      evidenceType: media['kind'] == 'PHOTO' ? 'PHOTO' : 'VOICE',
      mime: media['mime'] as String,
      requiredEvidence: false,
    );
    await discard(path);
    return id;
  }
}
