const macDocker = '/Applications/Docker.app/Contents/Resources/bin/docker';
const macStandaloneCompose =
  '/Applications/Docker.app/Contents/Resources/cli-plugins/docker-compose';

function uniqueCandidates(candidates) {
  const seen = new Set();
  return candidates.filter(({ command, prefixArgs }) => {
    if (!command) return false;
    const key = `${command}\0${prefixArgs.join('\0')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildComposeCandidates(
  environment = process.env,
  platform = process.platform,
) {
  const dockerCommands = [environment.DOCKER_BIN, 'docker'];
  const standaloneCommands = [
    environment.DOCKER_COMPOSE_BIN,
    'docker-compose',
  ];

  if (platform === 'darwin') {
    dockerCommands.push(macDocker);
    standaloneCommands.push(macStandaloneCompose);
  }

  return uniqueCandidates([
    ...dockerCommands.map((command) => ({
      command,
      prefixArgs: ['compose'],
    })),
    ...standaloneCommands.map((command) => ({
      command,
      prefixArgs: [],
    })),
  ]);
}

export function composeArguments(candidate, args) {
  return [...candidate.prefixArgs, ...args];
}

export function selectComposeCli(candidates, probe) {
  for (const candidate of candidates) {
    const result = probe(
      candidate.command,
      composeArguments(candidate, ['version']),
    );
    if (result?.status === 0) return candidate;
  }
  return undefined;
}
