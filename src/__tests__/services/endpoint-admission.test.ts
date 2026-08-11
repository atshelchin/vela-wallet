// The transport rule for service endpoints, and its drift gate against the core.
//
// The passkey index endpoint decides where passkey public keys are uploaded and
// where sign-in on a device with no local account looks one up. `login.rs`
// takes the record the index returns and hands `public_key_hex` straight to
// `address_from_public_key_hex` — whatever key comes back IS the wallet the
// user lands in. An attacker who can choose that endpoint, or who sits on a
// plain-`http://` hop to it, chooses the address.
//
// The rule exists twice: `network_admin.rs::is_localhost_http` (what the core
// applies on the Settings path) and `endpoint-admission.ts` (what onboarding
// and iOS/Android apply). Neither copy can go — onboarding predates any wallet
// and Hermes has no wasm — so the assertion below reads BOTH, in the same
// spirit as `core-table-parity.test.ts`: the Rust file as text, the values
// compared, never the formatting.
//
// A red test here means one screen would persist a URL the other refuses.

import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  isAdmissibleEndpoint,
  isLocalhostHttp,
  LOCALHOST_HTTP,
} from '@/services/endpoint-admission';

const REPO = resolve(__dirname, '../../..');
const NETWORK_ADMIN_RS = readFileSync(
  resolve(REPO, 'rust/crates/vela-core/src/app/network_admin.rs'),
  'utf8',
);

describe('the loopback carve-out matches the core', () => {
  test('the pattern documented on `is_localhost_http` is this pattern', () => {
    // The doc line: /// The HTTPS exception: `<the JS literal>`
    const match = /The HTTPS exception:\s*`([^`]+)`/.exec(NETWORK_ADMIN_RS);
    expect(match).not.toBeNull();
    expect(match![1]).toBe(`/${LOCALHOST_HTTP.source}/`);
  });

  test('the core still implements exactly two loopback hosts', () => {
    // The Rust side is a hand-written parser rather than a regex, so the doc
    // comment alone could rot. Pin the host list it actually matches on.
    const body = /fn is_localhost_http\(url: &str\) -> bool \{([\s\S]*?)\n\}/.exec(NETWORK_ADMIN_RS);
    expect(body).not.toBeNull();
    const hosts = [...body![1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
    expect(hosts).toEqual(['http://', 'localhost', '127.0.0.1']);
  });
});

describe('isLocalhostHttp', () => {
  test('accepts loopback, with or without a port and a path', () => {
    expect(isLocalhostHttp('http://localhost')).toBe(true);
    expect(isLocalhostHttp('http://localhost/')).toBe(true);
    expect(isLocalhostHttp('http://localhost:8787')).toBe(true);
    expect(isLocalhostHttp('http://127.0.0.1:3000/api')).toBe(true);
  });

  test('is anchored on the FULL host label — a lookalike prefix is a remote host', () => {
    // The whole reason the core's comment calls the anchoring out.
    expect(isLocalhostHttp('http://127.0.0.1.evil.com')).toBe(false);
    expect(isLocalhostHttp('http://localhost.evil.com')).toBe(false);
    expect(isLocalhostHttp('http://localhost:notaport')).toBe(false);
    expect(isLocalhostHttp('http://evil.com/http://localhost')).toBe(false);
    // https loopback is admissible for the ordinary reason, not this one.
    expect(isLocalhostHttp('https://localhost')).toBe(false);
  });
});

describe('isAdmissibleEndpoint — what may be written to storage', () => {
  test('https is admissible', () => {
    expect(isAdmissibleEndpoint('https://p256-index-rs.getvela.app')).toBe(true);
    expect(isAdmissibleEndpoint('https://my-own-index.example.com/base')).toBe(true);
  });

  test('a self-hosted index on loopback stays reachable — the gate is not a wall', () => {
    expect(isAdmissibleEndpoint('http://localhost:8787')).toBe(true);
  });

  test('plain http to anywhere else is refused', () => {
    expect(isAdmissibleEndpoint('http://attacker.example')).toBe(false);
    expect(isAdmissibleEndpoint('http://127.0.0.1.evil.com')).toBe(false);
  });

  test('a scheme-less or exotic-scheme value is refused', () => {
    expect(isAdmissibleEndpoint('p256-index-rs.getvela.app')).toBe(false);
    expect(isAdmissibleEndpoint('//p256-index-rs.getvela.app')).toBe(false);
    expect(isAdmissibleEndpoint('javascript:alert(1)')).toBe(false);
    expect(isAdmissibleEndpoint('data:text/plain,x')).toBe(false);
    expect(isAdmissibleEndpoint('file:///etc/hosts')).toBe(false);
  });

  test('empty is refused — "" is not a way to ask for the default', () => {
    expect(isAdmissibleEndpoint('')).toBe(false);
  });

  test('the shipped default is admissible, so "reset" is always a way out', () => {
    // The recovery path a refused save leans on: whatever the user typed, the
    // known-good value is one tap away and passes the same gate.
    const rust = /pub const DEFAULT_PASSKEY_INDEX_URL: &str = "([^"]+)";/.exec(NETWORK_ADMIN_RS);
    expect(rust).not.toBeNull();
    expect(isAdmissibleEndpoint(rust![1])).toBe(true);
  });
});
