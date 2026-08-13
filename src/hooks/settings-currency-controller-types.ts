/**
 * The shape the Settings screen's display-currency row reads on every platform.
 *
 * A standalone module from the days this controller was a platform pair:
 * the pair could not import its own base file (Metro resolved it back to
 * the `.web.ts` half and recursed at module init), so both halves imported
 * from here. The pair is gone; the module stays as the one place the
 * contract the screens compile against is declared.
 */
export interface SettingsCurrencyController {
  /** The preference as the row and the picker's checkmark show it. */
  code: string;
  /** The user picked a currency in the sheet. */
  pick(code: string): void;
}
