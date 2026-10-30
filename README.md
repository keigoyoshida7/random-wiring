# Random Wiring

A continuously reorganizing, monochrome 3D circuit by Keigo Yoshida.

変形する基板の上で、24種類の部品と架空の機構が配置と配線を組み替え続けるWeb作品です。標準は80要素で、32〜112要素に調整できます。すべての要素は基板に接地し、回転・発光する機構も支持脚や端子を通して取り付けられています。

## Public demo / 公開デモ

[Open Random Wiring / 公開サイトを開く](https://keigoyoshida7.github.io/random-wiring/)

## Run locally / ローカルで開く

```sh
python3 -m http.server 8765
```

Open <http://localhost:8765> in a WebGL-capable browser. No package installation, API key or runtime network service is required. All application modules and Three.js are included locally.

WebGL対応ブラウザで上記URLを開きます。パッケージのインストールやAPIキーは不要です。

## The scene

Seeded composition cycles form archipelagos, spirals, radial crowns, branching weaves and scattered fields. Physical electronic packages share the board with imagined resonators, gyroscopic cages, sensor irises, clock lanterns and layered towers. Routing pulses animate mechanisms and gradual white light.

The substrate changes width, taper and outline. Components slide across its surface and receive fresh routes computed against their current footprints and terminal locations. Wiring remains on the board as copper-like traces.

## Controls / 操作

- **Population / 要素数:** 32–112 (default 80), across 24 species.
- **Growth speed / 生成速度:** 0.05–12×; wiring density, lifetime and line weight are adjustable.
- **Motion / 動き:** component travel and board morphing have independent 0–2.5× controls.
- **Inspect / 詳細:** click a 3D component or name label, or select it from the complete component list.
- **View / 視点:** drag to orbit, Shift-drag or plan-mode drag to pan, wheel/pinch to zoom, double-click to reset.
- **Keyboard / キーボード:** Space = pause; R = new circuit; H = parameters; F = fullscreen.
- **Export / 保存:** PNG includes the current scene and visible labels. SVG contains the rendered 3D image plus editable label text.
- **Language / 言語:** EN/JP. Mobile parameters are initially collapsed.

Pause freezes placement, mechanisms, light, routing and rotation. / 一時停止で配置・機構・発光・配線・回転が停止します。

## Files

GitHub Pages publishes the repository root from `main`.

The repository root is a static website: `index.html`, `style.css`, native JavaScript modules, and the bundled Three.js runtime. It can be deployed to any static host. The implementation uses a seeded grid router, bounded reroute queues, instanced component details and a continuously deformed board mesh.

Electrical values are illustrative; imagined mechanisms are artistic constructions.

## Third-party code

Three.js r169 is included under its MIT license in [`vendor/THREE-LICENSE.txt`](vendor/THREE-LICENSE.txt).

## References

- Motion reference: <https://www.instagram.com/p/DfCYizAkwWL/>
- Visual reference: [Latent References](https://keigoyoshida.jp/reference-mapping.html)

Reference media is not embedded or distributed with the site.
