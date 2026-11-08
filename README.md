# CLAYWHEEL

CLAYWHEEL is a free, browser-based 3D pottery studio for shaping and exploring virtual clay on a spinning wheel.

## Features

- Shape clay with soft, bilateral, and stretch tools.
- Adjust piece height, wall thickness, pressure, influence, and surface imperfections.
- Explore the piece with orbit and zoom controls.
- Work with six starter silhouettes and undo or redo edits.
- Save projects as JSON and export STL, OBJ, GLB, or PNG.

## Run locally

Requirements: Node.js 22 and npm.

```sh
npm ci
npm run dev
```

Open [http://localhost:5188](http://localhost:5188) in your browser.

To run the geometry and export checks and create a production build:

```sh
npm run test:exports
npm run test:stl
npm run build
```

## GitHub Pages

The app is configured for the repository path `/claywheel/`. GitHub Actions builds and deploys the site from `main` to [https://visual3mad.github.io/claywheel/](https://visual3mad.github.io/claywheel/).
