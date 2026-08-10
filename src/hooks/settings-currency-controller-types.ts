/**
 * The shape the Settings screen's display-currency row reads on every platform.
 *
 * A standalone module for the same reason `network-admin-controller-types.ts`
 * is one: a platform pair (`use-settings-currency.ts` / `.web.ts`) must never
 * import its own base file — on web Metro resolves that specifier back to the
 * `.web.ts` variant itself.
 */
export interface SettingsCurrencyController {
  /** The preference as the row and the picker's checkmark show it. */
  code: string;
  /** The user picked a currency in the sheet. */
  pick(code: string): void;
}
