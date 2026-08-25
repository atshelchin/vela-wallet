#!/usr/bin/env bash
#
# Type-check the Windows passkey path from any machine.
#
# The desktop app itself CANNOT be cross-checked: its dependency tree compiles C
# (ThorVG, resvg's helpers, hidapi's vendored backends), so `cargo check
# --target x86_64-pc-windows-gnu` dies in a build script long before it reaches
# any Rust. That is why `vela-passkey-win` is a separate crate with no C in it
# at all — including the mapping into the core's wire types, which would
# otherwise be the one part of the Windows path nobody could check.
#
# What this does NOT do is run anything. Nobody on this project has a Windows
# machine yet; every line here is checked and none of it is confirmed.
set -euo pipefail
cd "$(dirname "$0")/../../vela-passkey-win"

TARGET=x86_64-pc-windows-gnu
# The rust/ workspace pins its toolchain, and `rustup target add` without
# --toolchain adds the target to the DEFAULT one — which is why this fails with
# "can't find crate for core" if the pin is ever bumped without re-adding.
TOOLCHAIN=$(sed -n "s/^channel = \"\(.*\)\"/\\1/p" ../../rust/rust-toolchain.toml)

if ! rustup target list --toolchain "$TOOLCHAIN" --installed | grep -qx "$TARGET"; then
  echo "adding $TARGET to toolchain $TOOLCHAIN"
  rustup target add --toolchain "$TOOLCHAIN" "$TARGET"
fi

echo "checking the Windows passkey path ($TARGET)"
cargo clippy --target "$TARGET" --all-targets -- -D warnings
echo "windows: type-checked (not run — see the crate docs)"
