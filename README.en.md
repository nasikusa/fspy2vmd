# fspy2vmd

Japanese README: [README.md](./README.md)

`fspy2vmd` is a library that applies fSpy camera data to a `three` `PerspectiveCamera`,
then exports a VMD camera motion for MMD from that camera state.

## Features

- Apply fSpy JSON values to a `PerspectiveCamera`
- Generate VMD camera motion (`ArrayBuffer`) from a `PerspectiveCamera`
- Type definitions included (TypeScript-ready)

## Installation

`three` is a peer dependency.

```bash
npm install fspy2vmd three
yarn add fspy2vmd three
pnpm add fspy2vmd three
```

## Quick Start

```ts
import * as THREE from "three";
import { FspyVmdConverter, type FspyData } from "fspy2vmd";

const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 2000);

// You can pass fSpy JSON data as-is
const fspy: FspyData = /* your fSpy JSON */;

const converter = new FspyVmdConverter(camera, {
  distanceBaseMultiplier: 5,
});

// 1) Apply fSpy to the camera
converter.applyFSpyToCamera(fspy);

// 2) Export VMD (returns an ArrayBuffer)
const vmdBuffer = converter.exportVmd({
  distanceMultiplier: 1,
  target: [0, 0, 0],
  frameTime: 0,
});
```

## Main API

### `new FspyVmdConverter(camera, options?)`

- `camera: PerspectiveCamera` target camera to convert
- `options?: FspyVmdConverterOptions`
- `distanceBaseMultiplier?: number` base multiplier for distance calculation (default: `5`)

### `applyFSpyToCamera(fspy, opts?)`

Applies fSpy data to the internal camera.

- `fspy: FspyData`
- `opts?: ApplyFSpyToCameraOptions`
- `near?: number` (default: `0.01`)
- `far?: number` (default: `2000`)

### `exportVmd(options?)`

Converts the internal camera state to VMD binary and returns it.

- Return value: `ArrayBuffer`
- `options?: ExportVmdOptions`
- `distanceMultiplier?: number` (default: `1`)
- `target?: [number, number, number]` (default: `[0, 0, 0]`)
- `frameTime?: number` (default: `0`)

### `writeCameraVmd(cameraFrames)`

Converts `CameraFrame[]` directly into VMD binary.
The model name written to VMD is fixed to the camera/light name encoded in Shift-JIS.

### Helper Methods

- `createDefaultCameraCurve()` returns a 24-element curve for linear interpolation
- `getCamera()` returns the internally stored `PerspectiveCamera`
- `getFspyData()` returns the internally stored fSpy data (defensive copy)
- `getOptions()` returns converter options (read-only)

## Errors

`FspyVmdConverterError` is thrown for invalid input or invalid usage order.

- `FSPY_VMD_CONVERTER_ERROR_CODE.FSPY_DATA_NOT_SET`
- `FSPY_VMD_CONVERTER_ERROR_CODE.INVALID_CAMERA_TRANSFORM_ROWS_SIZE`
- `FSPY_VMD_CONVERTER_ERROR_CODE.INVALID_CAMERA_TRANSFORM_VALUE`

```ts
import {
  FSPY_VMD_CONVERTER_ERROR_CODE,
  FspyVmdConverterError,
} from "fspy2vmd";

try {
  converter.applyFSpyToCamera(fspy);
  const vmd = converter.exportVmd();
} catch (error) {
  if (
    error instanceof FspyVmdConverterError &&
    error.code === FSPY_VMD_CONVERTER_ERROR_CODE.INVALID_CAMERA_TRANSFORM_ROWS_SIZE
  ) {
    // cameraTransform.rows is not a 4x4 matrix
  }
}
```

## Notes

- Call `applyFSpyToCamera()` before `exportVmd()`
- Output is VMD camera motion binary (`ArrayBuffer`)
- This library does not save files; implement file saving on the application side
