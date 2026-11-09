# CLAYWHEEL — Virtual Pottery Studio

CLAYWHEEL is a free, browser-based 3D pottery studio for shaping and exploring a hollow clay vessel on a spinning wheel.

## Features

- Model the vessel with eight tools:
  - **Throw** combines radial shaping and vertical pulling in one gesture.
  - **Diameter** expands or contracts a local cross-section; **Preserve Clay** optionally compensates nearby radii to keep volume approximately constant.
  - **Deform** pulls or compresses a local section vertically.
  - **Height** stretches or compresses the vessel as a whole.
  - **Groove** cuts circular recessed rings; **Ridge** forms raised rings.
  - **Sharpen** defines a rounded profile transition; **Smooth** blends local profile irregularities.
- Adjust **Pressure**, **Influence**, total **Height**, **Height lock**, **Wall thickness**, and wheel speed. Choose clay colors, tune surface imperfections and mesh resolution, and adjust studio lighting. Pause or resume the wheel at any time.
- Orbit and zoom around the 3D vessel, or use Observe mode and Immersive mode.
- Work in English or Spanish. English is the default; the selected language is remembered in the browser.
- Undo and redo edits, save and load portable project files in JSON, and export models as STL, OBJ, or GLB. Capture a transparent PNG of the vessel.
- Use the responsive interface on desktop, tablet, and mobile browsers.

## Run locally

Requirements: Node.js 22 and npm.

```sh
npm ci
npm run dev
```

Open [http://localhost:5188](http://localhost:5188) in your browser.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `1`–`8` | Select Throw, Diameter, Deform, Height, Groove, Ridge, Sharpen, or Smooth |
| `Space` | Pause or resume the wheel |
| `H` | Toggle Immersive mode |
| `Z` or `Cmd/Ctrl+Z` | Undo |
| `Shift+Z` or `Cmd/Ctrl+Shift+Z` | Redo |
| Hold `Shift` and drag | Temporarily use Smooth while modeling |

Shortcuts are ignored while a form control or editable field is focused. Open the `?` button in the studio for the bilingual Help & Shortcuts guide.

## Tests and production build

Run all nine automated checks and build the production site with:

```sh
npm run test:pull
npm run test:diameter
npm run test:throw
npm run test:smooth
npm run test:sharpen
npm run test:shortcuts
npm run test:groove-ridge
npm run test:stl
npm run test:exports
npm run build
```

## GitHub Pages

Vite is configured for the repository path `/claywheel/`. GitHub Actions runs the automated checks and build, then deploys `dist` to [https://visual3mad.github.io/claywheel/](https://visual3mad.github.io/claywheel/).

Created by [@artetuyo](https://x.com/artetuyo).
