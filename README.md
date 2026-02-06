# fspy2vmd

`FspyVmdConverter` は、以下を 1 つで扱うユーティリティです。

- fSpy データを `PerspectiveCamera` に適用
- `PerspectiveCamera` から VMD カメラモーション (`ArrayBuffer`) を生成

## インストール

`three` は peer dependency です。

```bash
npm install fspy2vmd three
yarn add fspy2vmd three
pnpm add fspy2vmd three
```

## 基本的な使い方

```ts
import * as THREE from "three";
import { FspyVmdConverter, type FspyData } from "fspy2vmd";

const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 2000);
const fspy: FspyData = /* your fSpy JSON */;

const converter = new FspyVmdConverter(camera, {
  distanceBaseMultiplier: 5,
});

// fSpy をカメラへ適用（constructor では自動適用されない）
converter.applyFSpyToCamera(fspy);

// VMD を生成
const vmdBuffer = converter.exportVmd({
  distanceMultiplier: 1,
  target: [0, 0, 0],
  frameTime: 0,
});
```

## API

### `new FspyVmdConverter(camera, options?)`

- `camera: PerspectiveCamera`  
  変換対象カメラ
- `options?: FspyVmdConverterOptions`
  - `distanceBaseMultiplier?: number`  
    距離計算の基準倍率（デフォルト: `5`）

### `applyFSpyToCamera(fspy, opts?)`

内部カメラに fSpy パラメータを適用します。

- `fspy: FspyData`
- `opts?: ApplyFSpyToCameraOptions`
  - `near?: number`（デフォルト: `0.01`）
  - `far?: number`（デフォルト: `2000`）

### `exportVmd(options?)`

内部カメラ状態を VMD バイナリに変換して返します。
`applyFSpyToCamera` 未実行時は `FSPY_DATA_NOT_SET` エラーを投げます。

- 戻り値: `ArrayBuffer`
- `options?: ExportVmdOptions`
  - `distanceMultiplier?: number`（デフォルト: `1`）
  - `target?: [number, number, number]`（デフォルト: `[0, 0, 0]`）
  - `frameTime?: number`（デフォルト: `0`）

### `writeCameraVmd(cameraFrames)`

`CameraFrame[]` を直接 VMD バイナリ化します。  
モデル名は固定で `"カメラ・照明"` (Shift-JIS) が書き込まれます。

### `createDefaultCameraCurve()`

線形補間用カーブ（24 要素）を返します。

### `getCamera()`

内部保持している `PerspectiveCamera` を返します。

### `getFspyData()`

内部保持している fSpy データを返します。  
戻り値は防御的コピーです。

### `getOptions()`

コンバータ設定を返します（読み取り用）。

## エラー

`matrixFromFSpyRows` で不正な行列が検出された場合、`FspyVmdConverterError` が投げられます。

- `FSPY_VMD_CONVERTER_ERROR_CODE.INVALID_CAMERA_TRANSFORM_ROWS_SIZE`
- `FSPY_VMD_CONVERTER_ERROR_CODE.INVALID_CAMERA_TRANSFORM_VALUE`
- `FSPY_VMD_CONVERTER_ERROR_CODE.FSPY_DATA_NOT_SET`

```ts
import {
  FSPY_VMD_CONVERTER_ERROR_CODE,
  FspyVmdConverterError,
} from "fspy2vmd";

try {
  converter.applyFSpyToCamera(fspy);
} catch (e) {
  if (
    e instanceof FspyVmdConverterError &&
    e.code === FSPY_VMD_CONVERTER_ERROR_CODE.INVALID_CAMERA_TRANSFORM_ROWS_SIZE
  ) {
    // handle invalid matrix size
  }
}
```
