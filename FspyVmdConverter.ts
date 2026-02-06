import { Euler, Matrix4, type PerspectiveCamera, Quaternion, Vector3 } from "three";
import {
  FSPY_VMD_CONVERTER_ERROR_CODE,
  type ApplyFSpyToCameraOptions,
  type CameraFrame,
  type ExportVmdOptions,
  type FspyData,
  type FspyVmdConverterErrorCode,
  type FspyVmdConverterOptions,
} from "./types";

/**
 * fSpy → Three.js適用 / Three.js → VMD変換 を1つにまとめたユーティリティクラス
 *
 * 役割:
 * 1. fSpy JSONのカメラパラメータをThree.jsのPerspectiveCameraに適用する
 * 2. Three.jsカメラ状態をMMD用のVMDカメラデータへ変換する
 */

/** 度への変換係数（180度 = πラジアン） */
const DEGREES_PER_HALF_TURN = 180;
/** 4x4行列の行数・列数 */
const MATRIX_SIZE = 4;
/** 4x4行列の要素数 */
const MATRIX_ELEMENT_COUNT = 16;
/** デフォルトのnearクリッピング面 */
const DEFAULT_NEAR = 0.01;
/** デフォルトのfarクリッピング面 */
const DEFAULT_FAR = 2000;

/**
 * MMDカメラ補間曲線の制御点
 *
 * 20と107は線形補間を表すデフォルト値（0-127の範囲）。
 * 1軸あたり開始/終了の2値を持ち、全6軸分で12ペアを使う。
 */
const CAMERA_CURVE_START = 20;
const CAMERA_CURVE_END = 107;
const CAMERA_CURVE_PAIR_COUNT = 12;

/**
 * VMDファイルフォーマットの構造定数
 *
 * VMD構造:
 * - ヘッダー (30バイト): "Vocaloid Motion Data 0002"
 * - モデル名 (20バイト): Shift-JIS
 * - ボーン/モーフ/カメラ/ライト/シャドウ/IK の各セクション
 */
const VMD_HEADER_SIZE = 30;
const VMD_MODEL_NAME_SIZE = 20;
const VMD_UINT32_SIZE = 4;
/**
 * カメラフレーム1つあたりのサイズ (61バイト):
 * - frameTime: 4バイト (uint32)
 * - distance: 4バイト (float32)
 * - position: 12バイト (float32 × 3)
 * - rotation: 12バイト (float32 × 3)
 * - curve: 24バイト (uint8 × 24)
 * - viewAngle: 4バイト (uint32)
 * - orthographic: 1バイト (uint8)
 */
const VMD_CAMERA_FRAME_SIZE = 61;
/** ASCIIマスク: 文字コードの下位7ビットのみを使用（ASCII範囲に制限） */
const ASCII_MASK = 0x7f;
/** VMDカウントフィールド数（bone, morph, camera, light, shadow, ik） */
const VMD_COUNT_FIELDS = 6;

/** 3D座標・回転のインデックス */
const AXIS_INDEX_X = 0;
const AXIS_INDEX_Y = 1;
const AXIS_INDEX_Z = 2;

/** VMD出力時の基準距離倍率 */
const DISTANCE_BASE_MULTIPLIER = 5;
/** デフォルトのフレーム番号（30fps基準） */
const DEFAULT_FRAME_TIME = 0;
/** 透視投影モードを表す値 (0=透視投影, 1=平行投影) */
const DEFAULT_ORTHOGRAPHIC = 0;

/**
 * "カメラ・照明" のShift-JISエンコード済みバイト列
 *
 * VMDのモデル名フィールドはShift-JIS必須のため、事前エンコード済み値を利用する。
 *
 * バイト列の内訳:
 * 0x83, 0x4a = カ
 * 0x83, 0x81 = メ
 * 0x83, 0x89 = ラ
 * 0x81, 0x45 = ・
 * 0x8f, 0xc6 = 照
 * 0x96, 0xbe = 明
 */
// eslint-disable-next-line @typescript-eslint/no-magic-numbers
const CAMERA_MODEL_NAME_SJIS = new Uint8Array([0x83, 0x4a, 0x83, 0x81, 0x83, 0x89, 0x81, 0x45, 0x8f, 0xc6, 0x96, 0xbe]);

/**
 * FspyVmdConverter専用エラー
 *
 * messageに加えてcodeを持たせ、利用側で機械的にハンドリングできるようにする。
 */
export class FspyVmdConverterError extends Error {
  public readonly code: FspyVmdConverterErrorCode;

  public constructor(code: FspyVmdConverterErrorCode, message: string) {
    super(message);
    this.name = "FspyVmdConverterError";
    this.code = code;
  }
}

export class FspyVmdConverter {
  /** 変換対象のThree.jsカメラ（コンストラクタで受け取り保持） */
  private readonly camera: PerspectiveCamera;
  /** 現在保持しているfSpyデータ（未設定の場合はnull） */
  private fspyData: FspyData | null;
  /** 変換ロジックのクラス設定 */
  private readonly converterOptions: Required<FspyVmdConverterOptions>;

  /**
   * コンストラクタ
   *
   * 副作用を避けるため、ここでは保持だけ行う。
   * fSpyデータの適用は `applyFSpyToCamera` を明示的に呼び出す。
   */
  public constructor(camera: PerspectiveCamera, options?: FspyVmdConverterOptions) {
    this.camera = camera;
    this.fspyData = null;
    this.converterOptions = {
      distanceBaseMultiplier:
        options?.distanceBaseMultiplier ?? DISTANCE_BASE_MULTIPLIER,
    };
  }

  /** 内部保持しているThree.jsカメラを取得 */
  public getCamera(): PerspectiveCamera {
    return this.camera;
  }

  /** 内部保持しているfSpyデータを取得 */
  public getFspyData(): Readonly<FspyData> | null {
    if (this.fspyData === null) {
      return null;
    }
    return this.cloneFspyData(this.fspyData);
  }

  /** クラス設定を取得（外部変更を防ぐためコピーを返す） */
  public getOptions(): Readonly<FspyVmdConverterOptions> {
    return {
      distanceBaseMultiplier: this.converterOptions.distanceBaseMultiplier,
    };
  }

  /**
   * fSpyのカメラデータをThree.jsのPerspectiveCameraに適用
   *
   * 処理の流れ:
   * 1. fSpyの垂直視野角（ラジアン）を度へ変換してfovに設定
   * 2. 画像アスペクト比とnear/farを反映
   * 3. fSpy行列（row-major）をThree.js行列（column-major）へ変換して適用
   *
   * matrixAutoUpdateをfalseにする理由:
   * 行列を直接適用するため、position/rotation/scaleからの自動再計算を止める必要がある。
   */
  public applyFSpyToCamera(
    fspy: FspyData,
    opts?: ApplyFSpyToCameraOptions,
  ): void {
    this.fspyData = this.cloneFspyData(fspy);
    const camera = this.camera;
    // fSpyの垂直視野角はラジアンで出力されるため度に変換
    camera.fov = this.radToDeg(fspy.verticalFieldOfView);
    camera.aspect = fspy.imageWidth / fspy.imageHeight;
    camera.near = opts?.near ?? DEFAULT_NEAR;
    camera.far = opts?.far ?? DEFAULT_FAR;
    // 投影行列を再計算（fov, aspect, near, farの変更を反映）
    camera.updateProjectionMatrix();

    // fSpyのカメラ変換行列をThree.js形式に変換
    const camWorld = this.matrixFromFSpyRows(fspy.cameraTransform.rows);

    // 手動で行列を設定するため自動更新を無効化
    camera.matrixAutoUpdate = false;
    camera.matrixWorld.copy(camWorld);
    // matrixWorldからposition, quaternion, scaleを逆算して同期
    camera.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale);
    // ローカル行列とワールド行列を更新
    camera.updateMatrix();
    camera.updateMatrixWorld(true);
  }

  /**
   * Three.jsカメラからVMDカメラモーションのArrayBufferを生成
   */
  public exportVmd(options: ExportVmdOptions = {}): ArrayBuffer {
    if (this.fspyData === null) {
      throw new FspyVmdConverterError(
        FSPY_VMD_CONVERTER_ERROR_CODE.FSPY_DATA_NOT_SET,
        "fSpy data is not set. Call applyFSpyToCamera before exportVmd.",
      );
    }

    const camera = this.camera;
    const targetPosition = options.target ?? [0, 0, 0];
    const target = new Vector3(
      targetPosition[AXIS_INDEX_X],
      targetPosition[AXIS_INDEX_Y],
      targetPosition[AXIS_INDEX_Z],
    );
    const camPos = camera.getWorldPosition(new Vector3());
    const distanceMultiplier = options.distanceMultiplier ?? 1;
    const distance =
      -camPos.distanceTo(target) *
      distanceMultiplier *
      this.converterOptions.distanceBaseMultiplier;

    // MMDはYXZ順のEulerを使用
    const camQuat = camera.getWorldQuaternion(new Quaternion());
    const euler = new Euler().setFromQuaternion(camQuat, "YXZ");

    // MMDは左手系のため、Z軸回転のみ反転
    const cameraFrame: CameraFrame = {
      frameTime: options.frameTime ?? DEFAULT_FRAME_TIME,
      distance: distance,
      position: [target.x, target.y, target.z],
      rotation: [euler.x, euler.y, -euler.z],
      curve: this.createDefaultCameraCurve(),
      viewAngle: Math.round(camera.fov),
      orthographic: DEFAULT_ORTHOGRAPHIC,
    };

    return this.writeCameraVmd([cameraFrame]);
  }

  /**
   * MMDカメラ補間曲線のデフォルト値（線形補間）を生成
   *
   * 24個の値を生成: [20, 107, 20, 107, ...] (12ペア)
   */
  public createDefaultCameraCurve(): CameraFrame["curve"] {
    const curve: number[] = [];
    for (let i = 0; i < CAMERA_CURVE_PAIR_COUNT; i++) {
      curve.push(CAMERA_CURVE_START, CAMERA_CURVE_END);
    }
    return curve as CameraFrame["curve"];
  }

  /**
   * CameraFrame配列からVMDバイナリを生成
   *
   * VMDはリトルエンディアン形式のため、DataViewにtrue指定で書き込む。
   */
  public writeCameraVmd(cameraFrames: CameraFrame[]): ArrayBuffer {
    // ヘッダー + モデル名 + 各セクションカウント(6個) + カメラフレームデータ
    const totalSize =
      VMD_HEADER_SIZE +
      VMD_MODEL_NAME_SIZE +
      VMD_UINT32_SIZE * VMD_COUNT_FIELDS +
      cameraFrames.length * VMD_CAMERA_FRAME_SIZE;

    const buffer = new ArrayBuffer(totalSize);
    // DataView: 型付きバイナリ操作用（エンディアン指定可能）
    const view = new DataView(buffer);
    // Uint8Array: 生バイト操作用（文字列書き込みなど）
    const uint8 = new Uint8Array(buffer);
    let offset = 0;

    /** 指定長にパディングしてバイト列を書き込む（不足分は0埋め） */
    const writeBytes = (bytes: Uint8Array, length: number) => {
      const padded = new Uint8Array(length);
      padded.set(bytes.slice(0, length));
      uint8.set(padded, offset);
      offset += length;
    };

    /** ASCII文字列を指定長で書き込む（不足分は0埋め） */
    const writeAscii = (str: string, length: number) => {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < Math.min(str.length, length); i++) {
        // 0x7Fでマスクして7bit ASCII範囲に制限
        bytes[i] = str.charCodeAt(i) & ASCII_MASK;
      }
      uint8.set(bytes, offset);
      offset += length;
    };

    /** 32ビット符号なし整数をリトルエンディアンで書き込む */
    const writeUint32 = (value: number) => {
      view.setUint32(offset, value, true); // true = リトルエンディアン
      offset += VMD_UINT32_SIZE;
    };

    /** 32ビット浮動小数点数をリトルエンディアンで書き込む */
    const writeFloat32 = (value: number) => {
      view.setFloat32(offset, value, true); // true = リトルエンディアン
      offset += VMD_UINT32_SIZE;
    };

    /** 8ビット符号なし整数を書き込む */
    const writeUint8 = (value: number) => {
      view.setUint8(offset, value);
      offset += 1;
    };

    // === VMDヘッダー部分 ===
    // VMDファイル識別子（30バイト）
    writeAscii("Vocaloid Motion Data 0002", VMD_HEADER_SIZE);
    // モデル名（20バイト、Shift-JIS）- カメラモーションの場合は "カメラ・照明"
    writeBytes(CAMERA_MODEL_NAME_SJIS, VMD_MODEL_NAME_SIZE);

    // === データセクション ===
    // ボーンフレーム数 (カメラモーションなので0)
    writeUint32(0);
    // モーフフレーム数 (カメラモーションなので0)
    writeUint32(0);

    // カメラフレーム数とデータ
    writeUint32(cameraFrames.length);
    for (const frame of cameraFrames) {
      // フレーム番号（30fps基準）
      writeUint32(frame.frameTime);
      // カメラと注視点の距離（負の値で前方）
      writeFloat32(frame.distance);
      // 注視点の座標 (X, Y, Z)
      writeFloat32(frame.position[AXIS_INDEX_X]);
      writeFloat32(frame.position[AXIS_INDEX_Y]);
      writeFloat32(frame.position[AXIS_INDEX_Z]);
      // カメラの回転（ラジアン、X, Y, Z）
      writeFloat32(frame.rotation[AXIS_INDEX_X]);
      writeFloat32(frame.rotation[AXIS_INDEX_Y]);
      writeFloat32(frame.rotation[AXIS_INDEX_Z]);
      // 補間曲線パラメータ（24バイト）
      for (const c of frame.curve) {
        writeUint8(c);
      }
      // 視野角（度）
      writeUint32(frame.viewAngle);
      // 0=透視投影, 1=平行投影
      writeUint8(frame.orthographic);
    }

    // 残りのセクション（カメラモーションでは使用しないので0）
    writeUint32(0);
    writeUint32(0);
    writeUint32(0);

    return buffer;
  }

  /** ラジアンを度に変換 */
  private radToDeg(radian: number): number {
    return (radian * DEGREES_PER_HALF_TURN) / Math.PI;
  }

  /**
   * fSpyの行優先(row-major)行列をThree.jsの列優先(column-major)行列に変換
   *
   * fSpy:
   *   [[m00, m01, m02, m03],
   *    [m10, m11, m12, m13],
   *    [m20, m21, m22, m23],
   *    [m30, m31, m32, m33]]
   *
   * Three.js Matrix4:
   *   [m00, m10, m20, m30, m01, m11, m21, m31, m02, m12, m22, m32, m03, m13, m23, m33]
   */
  private matrixFromFSpyRows(rows: number[][]): Matrix4 {
    if (
      rows.length !== MATRIX_SIZE ||
      rows.some((row) => row.length !== MATRIX_SIZE)
    ) {
      throw new FspyVmdConverterError(
        FSPY_VMD_CONVERTER_ERROR_CODE.INVALID_CAMERA_TRANSFORM_ROWS_SIZE,
        "cameraTransform.rows must be 4x4",
      );
    }

    const arr = new Array<number>(MATRIX_ELEMENT_COUNT);
    for (let rowIndex = 0; rowIndex < MATRIX_SIZE; rowIndex++) {
      for (let colIndex = 0; colIndex < MATRIX_SIZE; colIndex++) {
        const row = rows[rowIndex];
        const value = row?.[colIndex];
        if (value === undefined) {
          throw new FspyVmdConverterError(
            FSPY_VMD_CONVERTER_ERROR_CODE.INVALID_CAMERA_TRANSFORM_VALUE,
            "Invalid cameraTransform.rows access",
          );
        }
        // 転置: 行優先 → 列優先 (arr[列*4+行] = rows[行][列])
        arr[colIndex * MATRIX_SIZE + rowIndex] = value;
      }
    }

    const matrix = new Matrix4();
    matrix.fromArray(arr);
    return matrix;
  }

  /** fSpyデータを防御的にコピー */
  private cloneFspyData(fspy: FspyData): FspyData {
    if (typeof globalThis.structuredClone === "function") {
      return globalThis.structuredClone(fspy);
    }

    return JSON.parse(JSON.stringify(fspy)) as FspyData;
  }
}
