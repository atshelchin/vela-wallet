/**
 * Adapter between the JSON/WASM core surface and the product-agnostic effect
 * loop.
 *
 * The wasm classes speak strings: `dispatch(json) -> json`. This turns that into
 * the typed `EffectCore` the loop expects, and nothing else — no product
 * knowledge, no error interpretation.
 */

import {
  createEffectLoop,
  type CoreResult,
  type EffectCore,
  type EffectLoop,
  type EffectLoopOptions,
  type EffectWithId,
} from './effect-loop';

/** The shape every generated Crux core class exposes. */
export type JsonWasmCore = {
  dispatch(event: string): string;
  resolve_effect(effectId: bigint, result: string): string;
  view(): string;
  free(): void;
};

export function createJsonWasmShell<View, Event, Effect extends EffectWithId, Result>(
  core: JsonWasmCore,
  options: EffectLoopOptions<View, Effect, Result>,
): EffectLoop<Event> {
  const jsonCore: EffectCore<View, Event, Effect, Result> = {
    view: () => JSON.parse(core.view()) as View,
    dispatch: (event) =>
      JSON.parse(core.dispatch(JSON.stringify(event))) as CoreResult<View, Effect>,
    resolve: (effectId, result) =>
      JSON.parse(
        core.resolve_effect(BigInt(effectId), JSON.stringify(result)),
      ) as CoreResult<View, Effect>,
    dispose: () => core.free(),
  };

  return createEffectLoop(jsonCore, options);
}
