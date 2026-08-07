#!/usr/bin/env bash
# Regenerate the committed hicolor PNG icon set from the scalable icon,
# packaging/icons/scalable/app.getvela.VelaWallet.svg.
#
# The results are committed under packaging/icons/ so that building a package
# needs no image tooling - only this script does. Re-run it after editing the
# SVG, and commit the diff.
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(cd "$project_root/../.." && pwd)"

appid="app.getvela.VelaWallet"
out_dir="$project_root/packaging/icons"
source_svg="$out_dir/scalable/$appid.svg"

# hicolor's standard sizes. 128 is the smallest Flathub accepts; the rest cover
# panel, dock and file-manager rendering across GNOME, KDE and XFCE.
sizes=(16 24 32 48 64 96 128 256 512)

# The SVG's intrinsic size, needed to compute the render density below.
svg_px=68

if command -v magick >/dev/null 2>&1; then
  im=(magick)
elif command -v convert >/dev/null 2>&1; then
  im=(convert)
else
  echo "error: ImageMagick is required to regenerate icons." >&2
  echo "       Fedora: sudo dnf install ImageMagick" >&2
  echo "       Debian: sudo apt install imagemagick" >&2
  exit 1
fi

[[ -f "$source_svg" ]] || { echo "error: source icon not found: $source_svg" >&2; exit 1; }

for size in "${sizes[@]}"; do
  dest_dir="$out_dir/${size}x${size}"
  mkdir -p "$dest_dir"

  # -density is what makes this a vector render at the target size. Without it
  # ImageMagick rasterizes at the SVG's intrinsic 68x68 and then upscales, and
  # every icon above 68px comes out visibly blurred. 96 is ImageMagick's
  # default DPI, so scaling it by size/68 renders exactly `size` pixels.
  density="$(awk -v s="$size" -v n="$svg_px" 'BEGIN { printf "%.4f", 96 * s / n }')"

  # -depth 8 is not cosmetic. Rendering an SVG at high density leaves
  # ImageMagick at 16 bits per channel, and it will happily write a 16-bit PNG -
  # twice the bytes, no visible difference, and unlike every other icon on a
  # desktop. -strip drops the date chunks that would otherwise make every
  # regeneration a non-empty diff.
  "${im[@]}" -background none -density "$density" "$source_svg" \
    -resize "${size}x${size}" \
    -depth 8 -strip -define png:color-type=6 \
    "$dest_dir/$appid.png"
  echo "  ${size}x${size}"
done

echo "Icons written to ${out_dir#"$repo_root"/}"
