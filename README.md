# warpgrad

**Warp** your **grad**ients into something beautiful.

A CLI tool for generating mesh gradient backgrounds with noise-based distortion effects. Perfect for album covers, wallpapers, social media graphics, or anywhere you need a quick stylish background.

## What's this?

- **CLI generator** — pipe gradients directly to files or other tools
- **Browser UI** — play around until you find a style you like, then copy the CLI command
- **Reproducible** — pass `--seed` to get the exact same result, or tweak it for slight variations

## Try it

**[warpgrad.samsonov.io](https://warpgrad.samsonov.io)** — experiment with the UI in your browser

## Quick Start

```bash
# Install
npm install -g warpgrad

# Generate a gradient
warpgrad -W 1920 -H 1080 --colors 'ff6b6b;4ecdc4;45b7d1' -o wallpaper.jpg

# Try a different seed for variation
warpgrad -W 1920 -H 1080 --colors 'ff6b6b;4ecdc4;45b7d1' --seed 42 -o wallpaper.jpg
```

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `-W, --width` | Image width in pixels | required |
| `-H, --height` | Image height in pixels | required |
| `-c, --colors` | Semicolon-separated hex colors | required |
| `-w, --warp` | Warp distortion amount (0-100) | 50 |
| `-s, --warp-size` | Warp scale/smoothness | 200 |
| `-t, --warp-type` | Warp shape: simplex, circular, fbm, worley, voronoi, waves, etc. | simplex |
| `-p, --centers` | Color center positioning: random, grid, centered, edges | grid |
| `-n, --noise` | Grain/texture amount (0-100) | 0 |
| `-b, --blur` | Blur radius (0-50) | 0 |
| `--seed` | Random seed for reproducibility | random |
| `--no-sharp` | Use smooth color transitions | false |
| `-f, --format` | Output format: jpeg or png | jpeg |
| `-q, --quality` | JPEG quality (0-100) | 90 |
| `-o, --output` | Output file (defaults to stdout) | stdout |

### Color Center Positioning

The CLI doesn't allow setting exact color center positions directly — only the method used to generate them:

- **grid** — colors arranged in a regular grid pattern
- **random** — colors placed at random positions
- **centered** — colors clustered near the center
- **edges** — colors positioned along the edges

To get different random arrangements, change the `--seed` value. The seed controls all randomness, so the same seed always produces the same positioning.

## Examples

```bash
# Warm sunset vibes
warpgrad -W 800 -H 600 --colors 'ff9a56;ff6b6b;c44569' -t circular -o sunset.jpg

# Cool ocean gradient with voronoi pattern
warpgrad -W 1200 -H 800 --colors '2193b0;6dd5ed;ffffff' -t voronoi -w 30 -o ocean.jpg

# Minimal with grain
warpgrad -W 1920 -H 1080 --colors 'f5f5f5;e0e0e0' -w 10 -n 15 -o minimal.jpg

# Pipe to other tools
warpgrad -W 500 -H 500 --colors 'ee0979;ff6a00' | convert - -resize 50% thumb.jpg
```

## Note

Mostly vibecoded and provided as-is. Works, it's fun, but don't expect enterprise-grade anything. Have fun with it!

## License

MIT
