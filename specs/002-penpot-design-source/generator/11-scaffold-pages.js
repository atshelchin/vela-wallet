// 11-scaffold-pages.js — ensure the 11 numbered pages exist (data-model §1). Idempotent.
if (!storage.lib) throw new Error('run 10-lib.js first');
const lib = storage.lib;

// Adopt the default "Page 1" as "00 Start Here" instead of leaving an orphan page.
const legacy = penpotUtils.getPageByName('Page 1');
if (legacy && !penpotUtils.getPageByName('00 Start Here')) legacy.name = '00 Start Here';

const created = [];
for (const name of lib.PAGES) {
  if (!penpotUtils.getPageByName(name)) { lib.ensurePage(name); created.push(name); }
}
return lib.done('11-scaffold-pages', { created: created.length, createdNames: created, totalPages: penpotUtils.getPages().length });
