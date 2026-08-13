/**
 * Ratchet — on web there is exactly ONE add-network wizard.
 *
 * `AddTokenPanel` reached `/add-token` and the Send screen's token sheet, and
 * it called `checkNetworkCompatibility` (AddTokenPanel.tsx:87) and
 * `saveCustomNetwork` (:103) itself. It has no `.web` fork, so on web those ran
 * beside the `network_admin` core that the Settings wizard and the EIP-681 scan
 * path already went through: a second implementation of "may this chain enter
 * the wallet", with its own dedup, its own candidate assembly and no shared
 * ledger. A chain the core would have refused could be added here.
 *
 * The tab's logic now lives in the `use-add-network-tab` pair — TypeScript on
 * native (Hermes has no wasm, FR-202), the core on web. This test is what keeps
 * a future edit from quietly putting a writer back into the component: a
 * component that has no platform fork must not name the TypeScript checker or
 * the TypeScript network saver at all.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '../..');
const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8');

/** Strip block and line comments, so prose about the old path does not match. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('one add-network implementation per platform', () => {
  test('the shared panel calls neither the TypeScript checker nor the saver', () => {
    const panel = code(read('components/ui/AddTokenPanel.tsx'));
    expect(panel).not.toMatch(/checkNetworkCompatibility/);
    expect(panel).not.toMatch(/saveCustomNetwork/);
    expect(panel).not.toMatch(/services\/network-checker/);
    // Its only source of network-tab state is the controller pair.
    expect(panel).toMatch(/useAddNetworkTab/);
  });

  test('the web controller reaches the core, never the TypeScript services', () => {
    const web = code(read('hooks/use-add-network-tab.ts'));
    expect(web).toMatch(/network-admin-resident/);
    expect(web).not.toMatch(/services\/network-checker/);
    expect(web).not.toMatch(/services\/chain-registry/);
    // The registry read and the persist are the executor's, behind the core.
    expect(web).not.toMatch(/saveCustomNetwork|fetchChainInfo|searchChains/);
  });

  test('nothing outside the controller and its own module writes custom networks', () => {
    // `services/add-network.ts` is the scan path; `storage.ts` defines the writer.
    // Both the controller and the scan path used to be on this list; both ask
    // the core now, which the sibling test above pins. `storage.ts` is the only
    // module left that writes a custom network, which is the whole point.
    const writers = ['services/storage.ts'];
    for (const file of writers) expect(code(read(file))).toMatch(/saveCustomNetwork/);
  });
});
