# Favicon Generation Instructions

To create proper PNG/ICO favicons that won't distort:

## Option 1: Using Online Tool (Recommended)

1. Go to https://realfavicongenerator.net/
2. Upload `app/favicon.svg`
3. Configure settings:
   - iOS: 180x180px
   - Android: 192x192px
   - Desktop: 32x32px, 16x16px
4. Download the generated files
5. Place these files in the `app/` directory:
   - `favicon.ico` (multi-size ICO file)
   - `icon.png` (32x32px)
   - `apple-icon.png` (180x180px)

## Option 2: Using ImageMagick (Command Line)

```bash
# Install ImageMagick first: brew install imagemagick (Mac) or apt-get install imagemagick (Linux)

# Create PNG files from SVG
convert -background none -resize 32x32 app/favicon.svg app/icon.png
convert -background none -resize 180x180 app/favicon.svg app/apple-icon.png

# Create ICO file (multi-size)
convert app/favicon.svg -define icon:auto-resize=16,32,48 app/favicon.ico
```

## Option 3: Manual Creation

1. Open `app/favicon.svg` in a vector graphics editor (Inkscape, Illustrator, etc.)
2. Export as PNG at these sizes:
   - 32x32px → `app/icon.png`
   - 180x180px → `app/apple-icon.png`
3. Create a multi-size ICO file using an online converter or tool

After creating the files, Next.js will automatically detect and use them.






