/**
 * fSpyの2D座標点（主点、消失点）
 */
export interface FspyPoint {
  x: number;
  y: number;
}

/**
 * fSpyの4x4変換行列
 */
export interface FspyTransformMatrix {
  rows: number[][];
}

/**
 * 消失点に対応する軸方向
 */
export type VanishingPointAxis =
  | "xPositive"
  | "xNegative"
  | "yPositive"
  | "yNegative"
  | "zPositive"
  | "zNegative";

/**
 * fSpyファイルのデータ型
 *
 * `src/schema/fspy.ts` の `FspyData` 相当。
 */
export interface FspyData {
  principalPoint: FspyPoint;
  viewTransform: FspyTransformMatrix;
  cameraTransform: FspyTransformMatrix;
  horizontalFieldOfView: number;
  verticalFieldOfView: number;
  vanishingPoints: FspyPoint[];
  vanishingPointAxes: VanishingPointAxis[];
  relativeFocalLength: number;
  imageWidth: number;
  imageHeight: number;
}

export interface ApplyFSpyToCameraOptions {
  /** nearクリッピング面 */
  near?: number;
  /** farクリッピング面 */
  far?: number;
}

export interface ExportVmdOptions {
  /** 距離スケール倍率 */
  distanceMultiplier?: number;
  /** 注視点座標 [x, y, z] */
  target?: [number, number, number];
  /** フレーム番号（30fps基準） */
  frameTime?: number;
}

/**
 * FspyVmdConverter のクラス設定
 */
export interface FspyVmdConverterOptions {
  /** VMD距離計算の基準倍率（デフォルト: 5） */
  distanceBaseMultiplier?: number;
}

/**
 * VMDカメラフレームのデータ構造
 *
 * VMDファイル内の1フレーム分のカメラ情報を表す（バイナリ構造: 61バイト）。
 */
export interface CameraFrame {
  /** フレーム番号（30fps基準） */
  frameTime: number;
  /** カメラと注視点の距離（負の値で前方） */
  distance: number;
  /** 注視点の座標 [x, y, z] */
  position: [number, number, number];
  /** カメラの回転（ラジアン）[x, y, z] */
  rotation: [number, number, number];
  /** ベジェ補間曲線の制御点（24要素） */
  curve: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  /** 視野角（度） */
  viewAngle: number;
  /** 0=透視投影, 1=平行投影 */
  orthographic: number;
}

/**
 * FspyVmdConverter のエラーコード
 */
export const FSPY_VMD_CONVERTER_ERROR_CODE = {
  FSPY_DATA_NOT_SET: "FSPY_DATA_NOT_SET",
  INVALID_CAMERA_TRANSFORM_ROWS_SIZE: "INVALID_CAMERA_TRANSFORM_ROWS_SIZE",
  INVALID_CAMERA_TRANSFORM_VALUE: "INVALID_CAMERA_TRANSFORM_VALUE",
} as const;

/**
 * FspyVmdConverter のエラーコード型
 */
export type FspyVmdConverterErrorCode =
  (typeof FSPY_VMD_CONVERTER_ERROR_CODE)[keyof typeof FSPY_VMD_CONVERTER_ERROR_CODE];
