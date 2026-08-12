#!/usr/bin/env bash
# Render every app icon in the repository from the canonical vector source in
# design/icon/. Run it after editing those SVGs, and commit the result:
#
#     ./scripts/gen-app-icons.sh
#
# Covers the Expo app (iOS/Android/web), the two native projects, and the
# marketing site. Desktop icons (Linux hicolor, Windows .ico, macOS .iconset)
# come from the same SVGs via
# app-desktop/vela-wallet/scripts/generate-desktop-icons.sh.
#
# Platform rules that drive the shapes below. Each one fails quietly - the icon
# just looks wrong on a device nobody happened to test:
#
#   iOS       Full-bleed SQUARE, NO alpha. iOS applies its own corner mask, so
#             pre-rounded corners stay baked in underneath it, and an alpha
#             channel is an App Store rejection. The dark and tinted variants
#             are the opposite: transparent, because the system draws its own
#             backdrop behind them.
#   Android   An adaptive icon is TWO layers, and only the inner 66.7% circle is
#             guaranteed visible. The foreground must be transparent apart from
#             the mark, or it hides the background layer and launcher parallax
#             drags a visible edge around.
#   macOS     Not handled here. The mark is inset inside a ~80% squircle per
#             Apple's icon grid - see the desktop script.
#   Web       Favicons are drawn as-is, so they keep the rounded tile.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
icon_src="$repo_root/design/icon"
images="$repo_root/assets/images"
ios_iconset="$repo_root/app-ios/VelaWallet/VelaWallet/Assets.xcassets/AppIcon.appiconset"
android_res="$repo_root/app-android/vela-wallet/app/src/main/res"
site_static="$repo_root/app-web/getvela.app/static"

tile_color="#f46d50"   # must match the <rect> fill in design/icon/app-icon.svg
svg_px=68              # the SVGs' intrinsic size, for the density calculation

# How much of an Android adaptive foreground the mark may occupy.
#
# NOT a matter of taste. Rendering the mark at the scale the tile design uses
# puts its furthest point at 184px on a 512 canvas, while Android only
# guarantees the inner 170.7px radius - so the sail tips and the hull get
# clipped on any circular launcher. 0.68 reproduces the proportion the mark has
# inside its tile (furthest point at ~73% of the icon's half-width) within the
# guaranteed circle instead of within the full canvas.
android_fg_scale=0.68

die() { echo "error: $*" >&2; exit 1; }
step() { echo "==> $*"; }

if command -v magick >/dev/null 2>&1; then im=(magick)
elif command -v convert >/dev/null 2>&1; then im=(convert)
else
  die "ImageMagick is required.
       Fedora: sudo dnf install ImageMagick
       Debian: sudo apt install imagemagick
       macOS:  brew install imagemagick"
fi

for f in app-icon app-mark app-mark-mono; do
  [[ -f "$icon_src/$f.svg" ]] || die "missing canonical source: $icon_src/$f.svg"
done

# ImageMagick rasterizes an SVG at its intrinsic size and then upscales unless
# the render density is raised to match the target; without this every icon
# above 68px is visibly soft.
density_for() { awk -v s="$1" -v n="$svg_px" 'BEGIN { printf "%.4f", 96 * s / n }'; }

# render <svg> <size> <out> - transparent, 8-bit RGBA, no date chunks.
# png:color-type=6 forces RGBA; without it a silhouette is written as
# greyscale+alpha, which is valid PNG but a surprise for anything downstream.
render() {
  "${im[@]}" -background none -density "$(density_for "$2")" "$icon_src/$1.svg" \
    -resize "${2}x${2}" -depth 8 -strip -define png:color-type=6 "$3"
}

# render_inset <svg> <size> <scale> <out> - the mark shrunk by <scale> and
# re-centred on a full-size transparent canvas. This is what keeps Android's
# foreground inside the guaranteed circle.
render_inset() {
  local inner
  inner="$(awk -v s="$2" -v f="$3" 'BEGIN { printf "%d", s * f }')"
  "${im[@]}" -background none -density "$(density_for "$inner")" "$icon_src/$1.svg" \
    -resize "${inner}x${inner}" \
    -gravity center -background none -extent "${2}x${2}" \
    -depth 8 -strip -define png:color-type=6 "$4"
}

# solid <size> <colour> <out> - flat opaque square, no alpha channel left in the
# file (`-alpha off` alone only hides it).
solid() {
  "${im[@]}" -size "${1}x${1}" "xc:$2" -alpha remove -alpha off \
    -depth 8 -strip -define png:color-type=2 "$3"
}

# flat_square <size> <out> - the mark over an opaque full-bleed tile. Used
# wherever the platform masks corners itself and rejects alpha.
flat_square() {
  "${im[@]}" -size "${1}x${1}" "xc:$tile_color" \
    \( -background none -density "$(density_for "$1")" "$icon_src/app-mark.svg" \
       -resize "${1}x${1}" \) \
    -composite -alpha remove -alpha off -depth 8 -strip -define png:color-type=2 "$2"
}

# ------------------------------------------------------------------ Expo app --

step "Expo: iOS icon (full-bleed square, alpha stripped)"
flat_square 1024 "$images/icon.png"
cp "$images/icon.png" "$repo_root/assets/expo.icon/Assets/icon.png"

step "Expo: Android adaptive layers"
render_inset app-mark 512 "$android_fg_scale" "$images/android-icon-foreground.png"
solid 512 "$tile_color" "$images/android-icon-background.png"
render_inset app-mark-mono 512 "$android_fg_scale" "$images/android-icon-monochrome.png"

step "Expo: web favicon"
render app-icon 48 "$images/favicon.png"

# ------------------------------------------------------- native iOS project --

step "app-ios: AppIcon.appiconset (default / dark / tinted)"
mkdir -p "$ios_iconset"
flat_square 1024 "$ios_iconset/icon-1024.png"
# Dark and tinted variants are transparent on purpose: iOS composites them onto
# its own dark backdrop, and tinted is desaturated because the system applies
# the user's tint to luminance.
render app-mark 1024 "$ios_iconset/icon-1024-dark.png"
"${im[@]}" -background none -density "$(density_for 1024)" "$icon_src/app-mark-mono.svg" \
  -resize 1024x1024 -depth 8 -strip -define png:color-type=6 \
  "$ios_iconset/icon-1024-tinted.png"

cat > "$ios_iconset/Contents.json" <<'JSON'
{
  "images" : [
    {
      "filename" : "icon-1024.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    },
    {
      "appearances" : [
        {
          "appearance" : "luminosity",
          "value" : "dark"
        }
      ],
      "filename" : "icon-1024-dark.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    },
    {
      "appearances" : [
        {
          "appearance" : "luminosity",
          "value" : "tinted"
        }
      ],
      "filename" : "icon-1024-tinted.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
JSON

# --------------------------------------------------- native Android project --

step "app-android: legacy mipmap rasters"
# API 26+ uses the vector adaptive icon in drawable/; these rasters are the
# pre-26 fallback, which is why they bake the tile in rather than layering.
declare -A dpi=( [mdpi]=48 [hdpi]=72 [xhdpi]=96 [xxhdpi]=144 [xxxhdpi]=192 )
for d in "${!dpi[@]}"; do
  size="${dpi[$d]}"
  mkdir -p "$android_res/mipmap-$d"
  flat_square "$size" "$android_res/mipmap-$d/ic_launcher.png"
  "${im[@]}" "$android_res/mipmap-$d/ic_launcher.png" \
    \( +clone -alpha extract -fill black -colorize 100 \
       -fill white -draw "circle $((size/2)),$((size/2)) $((size/2)),0" \) \
    -alpha off -compose copy_opacity -composite \
    -depth 8 -strip -define png:color-type=6 \
    "$android_res/mipmap-$d/ic_launcher_round.png"
  # The project stores these as .webp; convert and drop the intermediate PNGs.
  for n in ic_launcher ic_launcher_round; do
    "${im[@]}" "$android_res/mipmap-$d/$n.png" -define webp:lossless=true \
      "$android_res/mipmap-$d/$n.webp"
    rm -f "$android_res/mipmap-$d/$n.png"
  done
done

# -------------------------------------------------------------- getvela.app --

step "getvela.app: favicons, manifest icons and header logo"
render app-icon 96  "$site_static/favicon-96x96.png"
render app-icon 512 "$site_static/web-app-manifest-512x512.png"
render app-icon 192 "$site_static/web-app-manifest-192x192.png"
render app-icon 1254 "$site_static/icon.png"
render app-icon 1254 "$site_static/vela-logo.png"
# favicon-32 and apple-touch-icon are opaque: Safari draws the touch icon on a
# white sheet if it has alpha, which haloes the rounded corners.
"${im[@]}" -background "$tile_color" -density "$(density_for 32)" "$icon_src/app-icon.svg" \
  -resize 32x32 -alpha remove -alpha off -depth 8 -strip "$site_static/favicon-32.png"
flat_square 180 "$site_static/apple-touch-icon.png"
cp "$icon_src/app-icon.svg" "$site_static/favicon.svg"
"${im[@]}" -background none -density "$(density_for 256)" "$icon_src/app-icon.svg" \
  -resize 256x256 -define icon:auto-resize=48,32,16 "$site_static/favicon.ico"

# ---------------------------------------------------------------- summary --

echo
echo "Wrote:"
while IFS= read -r f; do
  [[ -f "$f" ]] || continue
  printf '  %-58s %s\n' "${f#"$repo_root"/}" \
    "$("${im[@]}" identify -format '%wx%h %[channels]' "${f}[0]" 2>/dev/null)"
done <<EOF
$images/icon.png
$repo_root/assets/expo.icon/Assets/icon.png
$images/android-icon-foreground.png
$images/android-icon-background.png
$images/android-icon-monochrome.png
$images/favicon.png
$ios_iconset/icon-1024.png
$ios_iconset/icon-1024-dark.png
$ios_iconset/icon-1024-tinted.png
$android_res/mipmap-xxxhdpi/ic_launcher.webp
$site_static/favicon-96x96.png
$site_static/apple-touch-icon.png
$site_static/web-app-manifest-512x512.png
$site_static/vela-logo.png
EOF

# Guard the two mistakes that are invisible until a store submission or a
# circular launcher, long after the commit that caused them.
[[ "$("${im[@]}" identify -format '%[channels]' "$images/icon.png")" == *a* ]] &&
  die "the iOS icon has an alpha channel; App Store submission will reject it"

python3 - "$images/android-icon-foreground.png" <<'PY'
import sys, math
try:
    from PIL import Image
except ModuleNotFoundError:
    sys.exit(0)          # optional check; do not fail the build over it
im = Image.open(sys.argv[1]).convert("RGBA")
w, h = im.size
cx, cy = w / 2, h / 2
a = im.getchannel("A").load()
worst = max((math.hypot(x - cx, y - cy)
             for y in range(h) for x in range(w) if a[x, y] > 8), default=0)
allowed = w * 0.6667 / 2
if worst > allowed:
    sys.exit(f"error: the Android foreground reaches {worst:.0f}px but only "
             f"{allowed:.0f}px is guaranteed visible; lower android_fg_scale")
print(f"\nAndroid foreground reaches {worst:.0f}px of the {allowed:.0f}px "
      f"guaranteed radius ({worst / allowed * 100:.0f}%).")
PY

echo "iOS icon has no alpha channel."
