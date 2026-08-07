#!/usr/bin/env bash
# Build "Vela Wallet.app" - the macOS bundle - from the release binary.
#
#   ./scripts/build-macos-app.sh              # build + bundle into dist/macos
#   ./scripts/build-macos-app.sh --skip-build # reuse target/release/vela-wallet
#   ./scripts/build-macos-app.sh --zip        # also produce a .zip for transfer
#
# Runs on macOS only: `iconutil` and `codesign` are Apple tools with no Linux
# equivalent, and a bundle assembled without them is not something to hand to
# anyone.
#
# Why a bundle at all, rather than shipping the bare executable: macOS takes the
# Dock icon, the application name and the high-DPI opt-in from Contents/, so an
# unbundled binary appears as a generic executable named "vela-wallet" and
# renders at 1x. There is no per-window API to fix that from inside gpui.
set -euo pipefail

app_name="Vela Wallet"
binary_name="vela-wallet"

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
packaging="$project_root/packaging"
dist_dir="$project_root/dist/macos"

die() { echo "error: $*" >&2; exit 1; }
note() { echo "==> $*"; }

skip_build=0
make_zip=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) skip_build=1; shift ;;
    --zip)        make_zip=1; shift ;;
    -h|--help)    sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//; $d'; exit 0 ;;
    *)            die "unknown option: $1" ;;
  esac
done

[[ "$(uname -s)" == "Darwin" ]] || die "this script only runs on macOS (uname reports $(uname -s)).
       The icon set it consumes, packaging/icons/macos/AppIcon.iconset, is
       generated on any platform by ./scripts/generate-desktop-icons.sh - but
       turning it into an .icns needs Apple's iconutil."

command -v iconutil >/dev/null 2>&1 || die "iconutil not found; install the Xcode command-line tools"

version="$(sed -n '/^\[package\]/,/^\[/ s/^version[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' \
  "$project_root/Cargo.toml" | head -1)"
[[ -n "$version" ]] || die "could not read the package version from Cargo.toml"

release_binary="$project_root/target/release/$binary_name"
if (( ! skip_build )); then
  note "cargo build --release --locked"
  ( cd "$project_root" && cargo build --release --locked )
fi
[[ -f "$release_binary" ]] || die "release binary not found: $release_binary"

app="$dist_dir/$app_name.app"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"

note "assembling $app_name.app ($version)"
install -m755 "$release_binary" "$app/Contents/MacOS/$binary_name"
sed "s|@VERSION@|$version|g" "$packaging/macos/Info.plist.in" > "$app/Contents/Info.plist"

note "AppIcon.icns"
iconset="$packaging/icons/macos/AppIcon.iconset"
[[ -d "$iconset" ]] || die "missing $iconset - run ./scripts/generate-desktop-icons.sh"
iconutil --convert icns "$iconset" --output "$app/Contents/Resources/AppIcon.icns"

# An ad-hoc signature is not a Developer ID signature and does not avoid
# Gatekeeper, but an unsigned bundle is refused outright on Apple silicon, so
# this is the difference between "warns on first launch" and "will not run".
if command -v codesign >/dev/null 2>&1; then
  note "ad-hoc code signature"
  codesign --force --deep --sign - "$app"
  codesign --verify --strict "$app" && echo "  signature verifies"
fi

if (( make_zip )); then
  note "zip"
  # ditto, not zip: it preserves the resource forks and signature metadata that
  # a plain zip silently discards.
  ( cd "$dist_dir" && ditto -c -k --keepParent "$app_name.app" "$app_name-$version.zip" )
fi

echo
note "bundle: ${app#"$project_root"/}"
echo "Run it with: open '$app'"
echo
echo "NOTE: this bundle is ad-hoc signed, not notarized. Gatekeeper will warn on"
echo "first launch until it is signed with a Developer ID certificate and"
echo "notarized - the same open decision as the Windows code-signing certificate."
