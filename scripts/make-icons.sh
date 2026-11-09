#!/bin/sh
# (T)rustyShelf's icons, rendered from the logo's SVGs in renderer/brand (scripts/make-logo.py makes those).
# Needs ImageMagick with librsvg.   sh scripts/make-icons.sh   (from the repo's folder)
set -eu
B=renderer/brand
RES=android-app/android/app/src/main/res
SLATE='#27323e'
svg() { magick -background none -density 384 "$1" -resize "$2x$2" -depth 8 "$3"; }

# the desktop app's icon (window, AppImage, Windows exe, Steam shortcut) and the phone companion's
svg "$B/trustyshelf-icon.svg" 512 renderer/app-icon.png
cp "$B/trustyshelf-icon.svg" renderer/companion/icon.svg

# Android launcher icons: square, round, and the adaptive icon's foreground (the launcher adds the slate and its mask)
for d in mdpi:48:108 hdpi:72:162 xhdpi:96:216 xxhdpi:144:324 xxxhdpi:192:432; do
  name=${d%%:*}; rest=${d#*:}; size=${rest%%:*}; fg=${rest#*:}
  src="$B/trustyshelf-icon.svg"; [ "$size" -le 48 ] && src="$B/trustyshelf-icon-small.svg"
  svg "$src" "$size" "$RES/mipmap-$name/ic_launcher.png"
  svg "$B/trustyshelf-icon-foreground.svg" "$fg" "$RES/mipmap-$name/ic_launcher_foreground.png"
  svg "$B/trustyshelf-icon-foreground.svg" "$((size * 3 / 2))" /tmp/ts-fg.png
  magick -size "${size}x${size}" xc:none -fill "$SLATE" -draw "circle $((size / 2)),$((size / 2)) $((size / 2)),0" \
    \( /tmp/ts-fg.png -background none -gravity center -extent "${size}x${size}" \) -gravity center -composite -depth 8 "$RES/mipmap-$name/ic_launcher_round.png"
done
rm -f /tmp/ts-fg.png

# Android's splash screens: the icon in the middle of a slate screen, at each screen size already there
for f in "$RES"/drawable*/splash.png; do
  wh=$(magick identify -format '%w %h' "$f"); w=${wh% *}; h=${wh#* }
  m=$w; [ "$h" -lt "$m" ] && m=$h; s=$((m * 40 / 100))
  svg "$B/trustyshelf-icon.svg" "$s" /tmp/ts-splash-icon.png
  magick -size "${w}x${h}" "xc:$SLATE" /tmp/ts-splash-icon.png -gravity center -composite -strip -depth 8 "$f"
done
rm -f /tmp/ts-splash-icon.png
echo "icons made"
