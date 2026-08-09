# i18n contract: `contacts.*` additions & updates (018-contacts-ui)

All edits land in `rust/crates/vela-core/i18n/locales/<lng>/contacts.json`
for **all 15 locales** (en, zh, zh-TW, zh-HK, ja, ko, vi, id, tr, es-MX,
pt-BR, fr, de, ru, it), then regenerate via `npm run gen:i18n` (bump the
PATHS/leaf pins with a ledger comment) → `npm run lint:i18n` →
`npm run verify:i18n` → `cargo test -p vela-core --features i18n-all`.

**Russian budget rule (research.md D3)**: ru's value blob has ~922 bytes
of u16 headroom (64,614 / 65,536). Keep ru values terse; if the
gen-script capacity check trips, shorten ru copy — do not widen the
offset type in this feature.

## Value updates (2)

| Key | zh (new) | en (new) |
|---|---|---|
| `contacts.searchPlaceholder` | 搜索名字、ENS 或地址 | Search name, ENS, or address |
| `contacts.emptyHint` | 添加常用地址，转账时不再反复粘贴。也可以从文件导入现有通讯录。 | Save the addresses you use often — no more re-pasting when you send. You can also import an existing address book from a file. |

## New keys (21)

| Key | zh | en |
|---|---|---|
| `contacts.manage` | 管理 | Manage |
| `contacts.sectionContacts` | 联系人 | Contacts |
| `contacts.countPeople` | {{count}} 位 | {{count}} |
| `contacts.membersCount` | {{count}} 位成员 | {{count}} members |
| `contacts.allContacts` | 全部联系人 | All contacts |
| `contacts.addMember` | 添加成员 | Add member |
| `contacts.batchSend` | 群发转账 | Send to group |
| `contacts.batchSendHint` | 向本组 {{count}} 人转账，金额可分别设置。 | Send to all {{count}} members — amounts can be set individually. |
| `contacts.batchSendHintTitled` | 群发转账：向本组 {{count}} 人转账，金额可分别设置。 | Send to group: pay all {{count}} members — amounts can be set individually. |
| `contacts.importFile` | 从文件导入 | Import from file |
| `contacts.importAll` | 导入通讯录 | Import contacts |
| `contacts.exportAll` | 导出全部通讯录 | Export all contacts |
| `contacts.importGroup` | 导入到本组 | Import into this group |
| `contacts.exportGroup` | 导出本组 | Export this group |
| `contacts.groupRename` | 重命名分组 | Rename group |
| `contacts.moveGroup` | 移入分组 | Move to group |
| `contacts.recentActivity` | 最近往来 | Recent activity |
| `contacts.viewAllActivity` | 查看全部往来 | View all activity |
| `contacts.deleteContact` | 删除联系人 | Delete contact |
| `contacts.actionQr` | 二维码 | QR code |
| `contacts.edit` | 编辑 | Edit |

Remaining 13 locales: translate at implementation time following the
existing `contacts.json` register per locale (zh-HK stays written-form
consistent with the rest of that file — spec i18n memory: no
spoken-Cantonese drift). `{{count}}`/`{{query}}`/`{{name}}` placeholders
keep i18next syntax; no new plural-suffix keys are introduced.

## Reused keys (no corpus change — the normative map)

| UI element | Key |
|---|---|
| 通讯录 page/tab title | `contacts.title` / `componentsUi.mainNav.contacts` |
| 分组 section label | `contacts.sectionGroups` |
| N 人 group count | `contacts.groupMembers` |
| 新建分组 / 编辑分组 / 删除分组 | `contacts.groupNew` / `contacts.groupEdit` / `contacts.groupDelete` |
| 新建联系人 / 添加联系人 | `contacts.addTitle` / `contacts.addContact` |
| 还没有联系人 | `contacts.empty` |
| 导出通讯录 (C5 row) | `contacts.exportTitle` |
| 删除联系人？/ {{name}} 将从通讯录中移除。/ 删除 / 取消 | `contacts.deleteTitle` / `contacts.deleteBody` / `contacts.delete` / `contacts.cancel` |
| 地址 label | `contacts.addressLabel` |
| 搜索无结果 | `contacts.noResults` |
| 转账 / 收款 | `componentsUi.dock.send` / `componentsUi.dock.receive` |
| 已发送 / 已收到 | `history.labelSent` / `history.labelReceived` |
| 全部 › | `history.filterAll` |
| 复制地址 | `componentsUi.identiconViewer.copyAddress` |
| Sidebar shell (networks, ⌘K search) | same keys as spec 015 |
