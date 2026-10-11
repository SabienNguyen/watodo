# App icons

`icon.svg` is the source for every icon. `favicon.svg` is a copy of it. Run these from the repository root to regenerate the PNGs (needs `rsvg-convert` and ImageMagick 7's `magick`):

```sh
# Rounded corners, transparent outside them
rsvg-convert -w 192 -h 192 public/icon.svg | magick png:- \( -size 192x192 xc:black -fill white -draw 'roundrectangle 0,0 191,191 42,42' -alpha off \) -compose CopyOpacity -composite PNG32:public/pwa-192.png
rsvg-convert -w 512 -h 512 public/icon.svg | magick png:- \( -size 512x512 xc:black -fill white -draw 'roundrectangle 0,0 511,511 112,112' -alpha off \) -compose CopyOpacity -composite PNG32:public/pwa-512.png

# Full square background, no transparency (the mark sits inside the central 60%, so it survives maskable cropping)
rsvg-convert -w 512 -h 512 public/icon.svg | magick png:- -alpha off PNG24:public/pwa-maskable-512.png
rsvg-convert -w 180 -h 180 public/icon.svg | magick png:- -alpha off PNG24:public/apple-touch-icon.png

# Favicon: a copy of the source
cp public/icon.svg public/favicon.svg
```
