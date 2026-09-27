import 'package:flutter/material.dart';

void main() => runApp(const AgroPlatformShell());

class AgroPlatformShell extends StatelessWidget {
  const AgroPlatformShell({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(home: Scaffold(body: Text('AgroPlatform mobile shell')));
  }
}
