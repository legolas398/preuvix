import { execFileSync } from 'node:child_process';
import { chmodSync, lstatSync } from 'node:fs';

export function protectSigningKey(keyPath) {
  if (!lstatSync(keyPath).isFile()) throw new Error('Expected a regular private key file.');
  if (process.platform !== 'win32') {
    chmodSync(keyPath, 0o600);
    return;
  }
  const identity = execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  const sid = identity.match(/S-1-\d+(?:-\d+)+/)?.[0];
  if (!sid) throw new Error('Cannot determine the private key owner SID.');
  // Native ACL management: no script execution policy changes and no recursive permissions.
  execFileSync(
    'icacls.exe',
    [keyPath, '/inheritance:r', '/grant:r', `*${sid}:(F)`, '*S-1-5-18:(F)', '*S-1-5-32-544:(F)'],
    { windowsHide: true, stdio: 'pipe' },
  );
}
