# fspy2vmd

English README: [README.en.md](./README.en.md)

fSpy のカメラ情報を `three` の `PerspectiveCamera` に反映し、
そのカメラ状態から MMD 用 VMD カメラモーションを出力するライブラリです。

## できること

- fSpy JSON の値を `PerspectiveCamera` に適用
- `PerspectiveCamera` から VMD カメラモーション (`ArrayBuffer`) を生成
- 型定義付きで利用可能（TypeScript 対応）

## インストール

`three` は peer dependency です。

```bash
npm install fspy2vmd three
yarn add fspy2vmd three
pnpm add fspy2vmd three
```

## クイックスタート

```ts
import * as THREE from "three";
import { FspyVmdConverter, type FspyData } from "fspy2vmd";

const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 2000);

// fSpy の JSON データをそのまま渡せます
const fspy: FspyData = /* your fSpy JSON */;

const converter = new FspyVmdConverter(camera, {
  distanceBaseMultiplier: 5,
});

// 1) fSpy をカメラへ適用
converter.applyFSpyToCamera(fspy);

// 2) VMD を生成（戻り値は ArrayBuffer）
const vmdBuffer = converter.exportVmd({
  distanceMultiplier: 1,
  target: [0, 0, 0],
  frameTime: 0,
});
```

## 主要 API

### `new FspyVmdConverter(camera, options?)`

- `camera: PerspectiveCamera` 変換対象カメラ
- `options?: FspyVmdConverterOptions`
- `distanceBaseMultiplier?: number` 距離計算の基準倍率（デフォルト: `5`）

### `applyFSpyToCamera(fspy, opts?)`

fSpy データを内部カメラに適用します。

- `fspy: FspyData`
- `opts?: ApplyFSpyToCameraOptions`
- `near?: number`（デフォルト: `0.01`）
- `far?: number`（デフォルト: `2000`）

### `exportVmd(options?)`

内部カメラ状態を VMD バイナリに変換して返します。

- 戻り値: `ArrayBuffer`
- `options?: ExportVmdOptions`
- `distanceMultiplier?: number`（デフォルト: `1`）
- `target?: [number, number, number]`（デフォルト: `[0, 0, 0]`）
- `frameTime?: number`（デフォルト: `0`）

### `writeCameraVmd(cameraFrames)`

`CameraFrame[]` を直接 VMD バイナリ化します。
モデル名は固定で `"カメラ・照明"`（Shift-JIS）を書き込みます。

### 補助メソッド

- `createDefaultCameraCurve()` 線形補間用カーブ（24 要素）を返す
- `getCamera()` 内部保持している `PerspectiveCamera` を返す
- `getFspyData()` 内部保持している fSpy データ（防御的コピー）を返す
- `getOptions()` コンバータ設定（読み取り用）を返す

## エラー

不正な入力や利用順序エラー時には `FspyVmdConverterError` が投げられます。

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
    // cameraTransform.rows が 4x4 ではない場合
  }
}
```

## 注意点

- `exportVmd()` の前に `applyFSpyToCamera()` を呼んでください
- 出力されるのは VMD カメラモーションのバイナリです（`ArrayBuffer`）
- ライブラリ側はファイル保存を行わないため、保存処理は利用側で実装してください
