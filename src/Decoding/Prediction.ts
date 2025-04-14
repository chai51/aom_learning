import {
  Array1D,
  Array2D,
  Array3D,
  Array5D,
  Clip1,
  Clip3,
  Clip3_64,
  clone,
  FloorLog2,
  FloorLog2_64,
  integer,
  left_shift_64,
  Round2,
  Round2_64,
  Round2Signed,
  Round2Signed_64,
} from "../Conventions";
import { AV1Decoder } from "../SyntaxStructures/Obu";

import { assert } from "console";
import {
  Block_Height,
  Block_Width,
  Dr_Intra_Derivative,
  Intra_Filter_Taps,
  Mi_Height_Log2,
  Mi_Width_Log2,
  Mode_To_Angle,
  Num_4x4_Blocks_High,
  Num_4x4_Blocks_Wide,
  Sm_Weights_Tx_16x16,
  Sm_Weights_Tx_32x32,
  Sm_Weights_Tx_4x4,
  Sm_Weights_Tx_64x64,
  Sm_Weights_Tx_8x8,
  Tx_Height,
  Tx_Height_Log2,
  Tx_Width,
  Tx_Width_Log2,
  Wedge_Bits,
} from "../AdditionalTables/ConversionTables";
import {
  ANGLE_STEP,
  BLOCK_SIZES,
  DIV_LUT_BITS,
  DIV_LUT_PREC_BITS,
  FILTER_BITS,
  INTRA_EDGE_TAPS,
  INTRA_FILTER_SCALE_BITS,
  LS_MV_MAX,
  MASK_MASTER_SIZE,
  MAX_FRAME_DISTANCE,
  MAX_SB_SIZE,
  MI_SIZE,
  REF_SCALE_SHIFT,
  SCALE_SUBPEL_BITS,
  SUBPEL_BITS,
  SUBPEL_MASK,
  TRANSLATION,
  WARP_PARAM_REDUCE_BITS,
  WARPEDDIFF_PREC_BITS,
  WARPEDMODEL_NONDIAGAFFINE_CLAMP,
  WARPEDMODEL_PREC_BITS,
  WARPEDMODEL_TRANS_CLAMP,
  WARPEDPIXEL_PREC_SHIFTS,
  WEDGE_TYPES,
} from "../define";
import { COMPOUND_TYPE, INTERINTRA_MODE, INTERPOLATION_FILTER, MOTION_MODE, REF_FRAME, SUB_SIZE, Y_MODE } from "../SyntaxStructures/Semantics";

const WEDGE_HORIZONTAL = 0;
const WEDGE_VERTICAL = 1;
const WEDGE_OBLIQUE27 = 2;
const WEDGE_OBLIQUE63 = 3;
const WEDGE_OBLIQUE117 = 4;
const WEDGE_OBLIQUE153 = 5;

/**
 * 7.11 Prediction processes
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#prediction-processes)
 */
export class Prediction {
  CurrFrame: number[][][];
  private AboveRow: number[];
  private LeftCol: number[];
  private LocalValid: number;
  private LocalWarpParams: number[];
  private InterPostRound: number;
  private FwdWeight: number;
  private BckWeight: number;
  InterRound0: number;
  InterRound1: number;
  private Mask: number[][];
  private WedgeMasks: number[][][][][];

  private init: boolean;
  private decoder: AV1Decoder;

  constructor(d: AV1Decoder) {
    this.init = false;

    this.CurrFrame = [];
    this.AboveRow = [];
    this.LeftCol = [];
    this.LocalValid = undefined as any;
    this.LocalWarpParams = [];
    this.InterPostRound = undefined as any;
    this.FwdWeight = undefined as any;
    this.BckWeight = undefined as any;
    this.InterRound0 = undefined as any;
    this.InterRound1 = undefined as any;
    this.Mask = Array2D(64);
    this.WedgeMasks = Array5D(64, 64, 64, 64);
    this.initialise_wedge_mask_table();

    this.decoder = d;
  }

  initialize() {
    if (this.init) {
      return;
    }
    this.init = true;

    const maxHeight = this.decoder.sequenceHeaderObu.sequenceHeader.max_frame_height_minus_1 + 1;
    const plane = 3;

    this.CurrFrame = Array3D(plane, { startIndex: -64, endIndex: maxHeight });
  }

  /**
   * 7.11.2 Intra prediction process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#general-11)
   */
  predict_intra(
    plane: number,
    x: number,
    y: number,
    haveLeft: number,
    haveAbove: number,
    haveAboveRight: number,
    haveBelowLeft: number,
    mode: Y_MODE,
    log2W: number,
    log2H: number
  ) {
    this.initialize();
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const fimi = tg.filter_intra_mode_info;

    let w = 1 << log2W;
    let h = 1 << log2H;

    let maxX = cis.MiCols * MI_SIZE - 1;
    let maxY = cis.MiRows * MI_SIZE - 1;
    if (plane > 0) {
      maxX = ((cis.MiCols * MI_SIZE) >> cc.subsampling_x) - 1;
      maxY = ((cis.MiRows * MI_SIZE) >> cc.subsampling_y) - 1;
    }
    for (let i = 0; i < w + h; i++) {
      if (haveAbove == 0 && haveLeft == 1) {
        this.AboveRow[i] = this.CurrFrame[plane][y][x - 1];
      } else if (haveAbove == 0 && haveLeft == 0) {
        this.AboveRow[i] = (1 << (cc.BitDepth - 1)) - 1;
      } else {
        let aboveLimit = Math.min(maxX, x + (haveAboveRight ? 2 * w : w) - 1);
        this.AboveRow[i] = this.CurrFrame[plane][y - 1][Math.min(aboveLimit, x + i)];
      }
    }
    for (let i = 0; i < w + h; i++) {
      if (haveLeft == 0 && haveAbove == 1) {
        this.LeftCol[i] = this.CurrFrame[plane][y - 1][x];
      } else if (haveLeft == 0 && haveAbove == 0) {
        this.LeftCol[i] = (1 << (cc.BitDepth - 1)) + 1;
      } else {
        let leftLimit = Math.min(maxY, y + (haveBelowLeft ? 2 * h : h) - 1);
        this.LeftCol[i] = this.CurrFrame[plane][Math.min(leftLimit, y + i)][x - 1];
      }
    }

    if (haveAbove == 1 && haveLeft == 1) {
      this.AboveRow[-1] = this.CurrFrame[plane][y - 1][x - 1];
    } else if (haveAbove == 1) {
      this.AboveRow[-1] = this.CurrFrame[plane][y - 1][x];
    } else if (haveLeft == 1) {
      this.AboveRow[-1] = this.CurrFrame[plane][y][x - 1];
    } else {
      this.AboveRow[-1] = 1 << (cc.BitDepth - 1);
    }
    this.LeftCol[-1] = this.AboveRow[-1];

    let pred: number[][];
    if (plane == 0 && fimi.use_filter_intra) {
      pred = this.recursive_intra_prediction_process(w, h);
    } else if (this.decoder.tileGroupObu.is_directional_mode(mode)) {
      pred = this.directional_intra_prediction_process(plane, x, y, haveLeft, haveAbove, mode, w, h, maxX, maxY);
    } else if (mode == Y_MODE.SMOOTH_PRED || mode == Y_MODE.SMOOTH_V_PRED || mode == Y_MODE.SMOOTH_H_PRED) {
      pred = this.smooth_intra_prediction_process(mode, log2W, log2H, w, h);
    } else if (mode == Y_MODE.DC_PRED) {
      pred = this.dc_intra_prediction_process(haveLeft, haveAbove, log2W, log2H, w, h);
    } else {
      pred = this.basic_intra_prediction_process(w, h);
    }

    /**
     * 解码帧
     */
    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        this.CurrFrame[plane][y + i][x + j] = pred[i][j];
      }
    }
  }

  /**
   * 7.11.2.2 Basic intra prediction process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#basic-intra-prediction-process)
   */
  basic_intra_prediction_process(w: number, h: number) {
    let pred: number[][] = new Array(h).fill(0).map((a) => new Array(w));

    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        let base = this.AboveRow[j] + this.LeftCol[i] - this.AboveRow[-1];
        let pLeft = Math.abs(base - this.LeftCol[i]);
        let pTop = Math.abs(base - this.AboveRow[j]);
        let pTopLeft = Math.abs(base - this.AboveRow[-1]);
        if (pLeft <= pTop && pLeft <= pTopLeft) {
          pred[i][j] = this.LeftCol[i];
        } else if (pTop <= pTopLeft) {
          pred[i][j] = this.AboveRow[j];
        } else {
          pred[i][j] = this.AboveRow[-1];
        }
      }
    }
    return pred;
  }

  /**
   * 7.11.2.3 Recursive intra prediction process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#recursive-intra-prediction-process)
   */
  recursive_intra_prediction_process(w: number, h: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const fimi = tg.filter_intra_mode_info;

    let pred: number[][] = Array2D(h);

    let w4 = w >> 2;
    let h2 = h >> 1;

    for (let i2 = 0; i2 < h2; i2++) {
      for (let j4 = 0; j4 < w4; j4++) {
        let p: number[] = [];
        for (let i = 0; i <= 6; i++) {
          if (i < 5) {
            if (i2 == 0) {
              p[i] = this.AboveRow[(j4 << 2) + i - 1];
            } else if (j4 == 0 && i == 0) {
              p[i] = this.LeftCol[(i2 << 1) - 1];
            } else {
              p[i] = pred[(i2 << 1) - 1][(j4 << 2) + i - 1];
            }
          } else {
            if (j4 == 0) {
              p[i] = this.LeftCol[(i2 << 1) + i - 5];
            } else {
              p[i] = pred[(i2 << 1) + i - 5][(j4 << 2) - 1];
            }
          }
        }
        for (let i1 = 0; i1 <= 1; i1++) {
          for (let j1 = 0; j1 <= 3; j1++) {
            let pr = 0;
            for (let i = 0; i <= 6; i++) {
              pr += Intra_Filter_Taps[fimi.filter_intra_mode][(i1 << 2) + j1][i] * p[i];
            }
            pred[(i2 << 1) + i1][(j4 << 2) + j1] = Clip1(Round2Signed(pr, INTRA_FILTER_SCALE_BITS), cc.BitDepth);
          }
        }
      }
    }
    return pred;
  }

  /**
   * 7.11.2.4 Directional intra prediction process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#directional-intra-prediction-process)
   */
  directional_intra_prediction_process(
    plane: number,
    x: number,
    y: number,
    haveLeft: number,
    haveAbove: number,
    mode: number,
    width: number,
    height: number,
    maxX: number,
    maxY: number
  ) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const iai = tg.intra_angle_info;

    let pred: number[][] = new Array(height).fill(0).map((a) => new Array(width));

    let angleDelta = 0;
    if (plane == 0) {
      angleDelta = iai.AngleDeltaY;
    } else {
      angleDelta = iai.AngleDeltaUV;
    }
    let pAngle = Mode_To_Angle[mode] + angleDelta * ANGLE_STEP;
    let upsampleAbove = 0;
    let upsampleLeft = 0;
    let filterType = 0;
    if (seqHeader.enable_intra_edge_filter == 1) {
      if (pAngle != 90 && pAngle != 180) {
        if (pAngle > 90 && pAngle < 180 && width + height >= 24) {
          let filter = this.filter_corner_process();
          this.LeftCol[-1] = filter;
          this.AboveRow[-1] = filter;
        }
        filterType = this.intra_filter_type_process(plane);
        if (haveAbove == 1) {
          let strength = this.intra_edge_filter_strength_selection_process(width, height, filterType, pAngle - 90);
          let numPx = Math.min(width, maxX - x + 1) + (pAngle < 90 ? height : 0) + 1;
          this.intra_edge_filter_process(numPx, strength, 0);
        }
        if (haveLeft == 1) {
          let strength = this.intra_edge_filter_strength_selection_process(width, height, filterType, pAngle - 180);
          let numPx = Math.min(height, maxY - y + 1) + (pAngle > 180 ? width : 0) + 1;
          this.intra_edge_filter_process(numPx, strength, 1);
        }
      }
      upsampleAbove = this.intra_edge_upsample_selection_process(width, height, filterType, pAngle - 90);
      let numPx = width + (pAngle < 90 ? height : 0);
      if (upsampleAbove == 1) {
        this.intra_edge_upsample_process(numPx, 0);
      }
      upsampleLeft = this.intra_edge_upsample_selection_process(width, height, filterType, pAngle - 180);
      numPx = height + (pAngle > 180 ? width : 0);
      if (upsampleLeft == 1) {
        this.intra_edge_upsample_process(numPx, 1);
      }
    }

    let dx: number;
    if (pAngle < 90) {
      dx = Dr_Intra_Derivative[pAngle];
    } else if (pAngle > 90 && pAngle < 180) {
      dx = Dr_Intra_Derivative[180 - pAngle];
    } else {
      dx = undefined as any;
    }

    let dy: number;
    if (pAngle > 90 && pAngle < 180) {
      dy = Dr_Intra_Derivative[pAngle - 90];
    } else if (pAngle > 180) {
      dy = Dr_Intra_Derivative[270 - pAngle];
    } else {
      dy = undefined as any;
    }

    if (pAngle < 90) {
      for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
          let idx = (i + 1) * dx;
          let base = (idx >>> (6 - upsampleAbove)) + (j << upsampleAbove);
          let shift = ((idx << upsampleAbove) >>> 1) & 0x1f;
          let maxBaseX = (width + height - 1) << upsampleAbove;
          if (base < maxBaseX) {
            pred[i][j] = Round2(this.AboveRow[base] * (32 - shift) + this.AboveRow[base + 1] * shift, 5);
          } else {
            pred[i][j] = this.AboveRow[maxBaseX];
          }
        }
      }
    } else if (pAngle > 90 && pAngle < 180) {
      for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
          let idx = (j << 6) - (i + 1) * dx;
          let base = idx >> (6 - upsampleAbove);
          if (base >= -(1 << upsampleAbove)) {
            let shift = ((idx << upsampleAbove) >>> 1) & 0x1f;
            pred[i][j] = Round2(this.AboveRow[base] * (32 - shift) + this.AboveRow[base + 1] * shift, 5);
          } else {
            let idx = (i << 6) - (j + 1) * dy;
            let base = idx >> (6 - upsampleLeft);
            let shift = ((idx << upsampleLeft) >> 1) & 0x1f;
            pred[i][j] = Round2(this.LeftCol[base] * (32 - shift) + this.LeftCol[base + 1] * shift, 5);
          }
        }
      }
    } else if (pAngle > 180) {
      for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
          let idx = (j + 1) * dy;
          let base = (idx >>> (6 - upsampleLeft)) + (i << upsampleLeft);
          let shift = ((idx << upsampleLeft) >>> 1) & 0x1f;
          pred[i][j] = Round2(this.LeftCol[base] * (32 - shift) + this.LeftCol[base + 1] * shift, 5);
        }
      }
    } else if (pAngle == 90) {
      for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
          pred[i][j] = this.AboveRow[j];
        }
      }
    } else if (pAngle == 180) {
      for (let i = 0; i < height; i++) {
        for (let j = 0; j < width; j++) {
          pred[i][j] = this.LeftCol[i];
        }
      }
    }
    return pred;
  }

  /**
   * 7.11.2.5 DC intra prediction process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#dc-intra-prediction-process)
   */
  dc_intra_prediction_process(haveLeft: number, haveAbove: number, log2W: number, log2H: number, w: number, h: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;

    let pred: number[][] = Array2D(h);

    if (haveLeft == 1 && haveAbove == 1) {
      let sum = 0;
      for (let k = 0; k < h; k++) {
        sum += this.LeftCol[k];
      }
      for (let k = 0; k < w; k++) {
        sum += this.AboveRow[k];
      }

      sum += (w + h) >> 1;

      let avg = integer(sum / (w + h));
      for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
          pred[i][j] = avg;
        }
      }
    } else if (haveLeft == 1 && haveAbove == 0) {
      let sum = 0;
      for (let k = 0; k < h; k++) {
        sum += this.LeftCol[k];
      }
      let leftAvg = Clip1((sum + (h >> 1)) >> log2H, cc.BitDepth);
      for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
          pred[i][j] = leftAvg;
        }
      }
    } else if (haveLeft == 0 && haveAbove == 1) {
      let sum = 0;
      for (let k = 0; k < w; k++) {
        sum += this.AboveRow[k];
      }
      let aboveAvg = Clip1((sum + (w >> 1)) >> log2W, cc.BitDepth);
      for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
          pred[i][j] = aboveAvg;
        }
      }
    } else {
      for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
          pred[i][j] = 1 << (cc.BitDepth - 1);
        }
      }
    }
    return pred;
  }

  /**
   * 7.11.2.6 Smooth intra prediction process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#smooth-intra-prediction-process)
   */
  smooth_intra_prediction_process(mode: number, log2W: number, log2H: number, w: number, h: number) {
    let pred: number[][] = Array2D(h);

    if (mode == Y_MODE.SMOOTH_PRED) {
      let smWeightsX: any;
      switch (log2W) {
        case 2:
          smWeightsX = Sm_Weights_Tx_4x4;
          break;
        case 3:
          smWeightsX = Sm_Weights_Tx_8x8;
          break;
        case 4:
          smWeightsX = Sm_Weights_Tx_16x16;
          break;
        case 5:
          smWeightsX = Sm_Weights_Tx_32x32;
          break;
        case 6:
          smWeightsX = Sm_Weights_Tx_64x64;
          break;
      }
      let smWeightsY: any;
      switch (log2H) {
        case 2:
          smWeightsY = Sm_Weights_Tx_4x4;
          break;
        case 3:
          smWeightsY = Sm_Weights_Tx_8x8;
          break;
        case 4:
          smWeightsY = Sm_Weights_Tx_16x16;
          break;
        case 5:
          smWeightsY = Sm_Weights_Tx_32x32;
          break;
        case 6:
          smWeightsY = Sm_Weights_Tx_64x64;
          break;
      }
      for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
          let smoothPred =
            smWeightsY[i] * this.AboveRow[j] + (256 - smWeightsY[i]) * this.LeftCol[h - 1] + smWeightsX[j] * this.LeftCol[i] + (256 - smWeightsX[j]) * this.AboveRow[w - 1];
          pred[i][j] = Round2(smoothPred, 9);
        }
      }
    } else if (mode == Y_MODE.SMOOTH_V_PRED) {
      let smWeights: any;
      switch (log2H) {
        case 2:
          smWeights = Sm_Weights_Tx_4x4;
          break;
        case 3:
          smWeights = Sm_Weights_Tx_8x8;
          break;
        case 4:
          smWeights = Sm_Weights_Tx_16x16;
          break;
        case 5:
          smWeights = Sm_Weights_Tx_32x32;
          break;
        case 6:
          smWeights = Sm_Weights_Tx_64x64;
          break;
      }
      for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
          let smoothPred = smWeights[i] * this.AboveRow[j] + (256 - smWeights[i]) * this.LeftCol[h - 1];
          pred[i][j] = Round2(smoothPred, 8);
        }
      }
    } else {
      let smWeights: any;
      switch (log2W) {
        case 2:
          smWeights = Sm_Weights_Tx_4x4;
          break;
        case 3:
          smWeights = Sm_Weights_Tx_8x8;
          break;
        case 4:
          smWeights = Sm_Weights_Tx_16x16;
          break;
        case 5:
          smWeights = Sm_Weights_Tx_32x32;
          break;
        case 6:
          smWeights = Sm_Weights_Tx_64x64;
          break;
      }
      for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
          let smoothPred = smWeights[j] * this.LeftCol[i] + (256 - smWeights[j]) * this.AboveRow[w - 1];
          pred[i][j] = Round2(smoothPred, 8);
        }
      }
    }
    return pred;
  }

  /**
   * 7.11.2.7 Filter corner process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#filter-corner-process)
   */
  filter_corner_process() {
    let s = this.LeftCol[0] * 5 + this.AboveRow[-1] * 6 + this.AboveRow[0] * 5;
    return Round2(s, 4);
  }

  /**
   * 7.11.2.8 Intra filter type process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#intra-filter-type-process)
   */
  intra_filter_type_process(plane: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;

    let aboveSmooth = 0;
    let leftSmooth = 0;
    let r: number;
    let c: number;

    if (plane == 0 ? db.AvailU : db.AvailUChroma) {
      r = db.MiRow - 1;
      c = db.MiCol;
      if (plane > 0) {
        if (cc.subsampling_x && !(db.MiCol & 1)) c++;
        if (cc.subsampling_y && db.MiRow & 1) r--;
      }
      aboveSmooth = this.is_smooth(r, c, plane);
    }

    if (plane == 0 ? db.AvailL : db.AvailLChroma) {
      r = db.MiRow;
      c = db.MiCol - 1;
      if (plane > 0) {
        if (cc.subsampling_x && db.MiCol & 1) c--;
        if (cc.subsampling_y && !(db.MiRow & 1)) r++;
      }
      leftSmooth = this.is_smooth(r, c, plane);
    }

    return aboveSmooth || leftSmooth;
  }

  /**
   * 7.11.2.8 Intra filter type process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#intra-filter-type-process)
   */
  private is_smooth(row: number, col: number, plane: number): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;

    let mode: number;
    if (plane == 0) {
      mode = db.YModes[row][col];
    } else {
      if (db.RefFrames[row][col][0] > REF_FRAME.INTRA_FRAME) {
        return 0;
      }
      mode = db.UVModes[row][col];
    }
    return Number(mode == Y_MODE.SMOOTH_PRED || mode == Y_MODE.SMOOTH_V_PRED || mode == Y_MODE.SMOOTH_H_PRED);
  }

  /**
   * 7.11.2.9 Intra edge filter strength selection process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#intra-edge-filter-strength-selection-process)
   */
  intra_edge_filter_strength_selection_process(w: number, h: number, filterType: number, delta: number) {
    const d: number = Math.abs(delta);
    const blkWh: number = w + h;
    let strength: number = 0;

    if (filterType == 0) {
      if (blkWh <= 8) {
        if (d >= 56) strength = 1;
      } else if (blkWh <= 12) {
        if (d >= 40) strength = 1;
      } else if (blkWh <= 16) {
        if (d >= 40) strength = 1;
      } else if (blkWh <= 24) {
        if (d >= 8) strength = 1;
        if (d >= 16) strength = 2;
        if (d >= 32) strength = 3;
      } else if (blkWh <= 32) {
        strength = 1;
        if (d >= 4) strength = 2;
        if (d >= 32) strength = 3;
      } else {
        strength = 3;
      }
    } else {
      if (blkWh <= 8) {
        if (d >= 40) strength = 1;
        if (d >= 64) strength = 2;
      } else if (blkWh <= 16) {
        if (d >= 20) strength = 1;
        if (d >= 48) strength = 2;
      } else if (blkWh <= 24) {
        if (d >= 4) strength = 3;
      } else {
        strength = 3;
      }
    }

    return strength;
  }

  /**
   * 7.11.2.10 Intra edge upsample selection process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#intra-edge-upsample-selection-process)
   */
  intra_edge_upsample_selection_process(w: number, h: number, filterType: number, delta: number) {
    const d: number = Math.abs(delta);
    const blkWh: number = w + h;
    let useUpsample: number;

    if (d <= 0 || d >= 40) {
      useUpsample = 0;
    } else if (filterType == 0) {
      useUpsample = Number(blkWh <= 16);
    } else {
      useUpsample = Number(blkWh <= 8);
    }

    return useUpsample;
  }

  /**
   * 7.11.2.11 Intra edge upsample process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#intra-edge-upsample-process)
   */
  intra_edge_upsample_process(numPx: number, dir: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;

    let buf: number[];

    if (dir === 0) {
      buf = this.AboveRow;
    } else {
      buf = this.LeftCol;
    }

    const dup: number[] = [];
    dup[0] = buf[-1];
    for (let i = -1; i < numPx; i++) {
      dup[i + 2] = buf[i];
    }
    dup[numPx + 2] = buf[numPx - 1];

    buf[-2] = dup[0];
    for (let i = 0; i < numPx; i++) {
      let s: number = -dup[i] + 9 * dup[i + 1] + 9 * dup[i + 2] - dup[i + 3];
      s = Clip1(Round2(s, 4), cc.BitDepth);
      buf[2 * i - 1] = s;
      buf[2 * i] = dup[i + 2];
    }
  }

  /**
   * 7.11.2.12 Intra edge filter process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#intra-edge-filter-process)
   */
  intra_edge_filter_process(sz: number, strength: number, left: number) {
    const Intra_Edge_Kernel: number[][] = [
      [0, 4, 8, 4, 0],
      [0, 5, 6, 5, 0],
      [2, 4, 4, 4, 2],
    ];

    if (strength == 0) return;

    const edge: number[] = [];
    for (let i = 0; i < sz; i++) {
      edge[i] = left ? this.LeftCol[i - 1] : this.AboveRow[i - 1];
    }

    for (let i = 1; i < sz; i++) {
      let s: number = 0;
      for (let j = 0; j < INTRA_EDGE_TAPS; j++) {
        const k: number = Clip3(0, sz - 1, i - 2 + j);
        s += Intra_Edge_Kernel[strength - 1][j] * edge[k];
      }
      if (left == 1) {
        this.LeftCol[i - 1] = (s + 8) >>> 4;
      } else if (left == 0) {
        this.AboveRow[i - 1] = (s + 8) >>> 4;
      }
    }
  }

  /**
   * 7.11.3 Inter prediction process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inter-prediction-process)
   */
  predict_inter(plane: number, x: number, y: number, w: number, h: number, candRow: number, candCol: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const fs = fh.frame_size;
    const fswr = fh.frame_size_with_refs;
    const cis = fh.compute_image_size;
    const gmp = fh.global_motion_params;
    const rf = fh.ref_frames;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;
    const rmm = tg.motion_mode;
    const rii = tg.inter_intra;
    const rct = tg.compound_type;

    let isCompound = Number(db.RefFrames[candRow][candCol][1] > REF_FRAME.INTRA_FRAME);

    // 1.
    this.rounding_variables_derivation(isCompound);

    // 2.
    if (plane == 0 && rmm.motion_mode == MOTION_MODE.LOCALWARP) {
      this.warp_estimation();
    }

    // 3.
    if (plane == 0 && rmm.motion_mode == MOTION_MODE.LOCALWARP && this.LocalValid == 1) {
      let data = this.setup_shear(this.LocalWarpParams);
      this.LocalValid = data.warpValid;
    }

    // 4.
    let refList = 0;

    let preds = Array3D(2, h);
    while (true) {
      // 5.
      let refFrame = db.RefFrames[candRow][candCol][refList];

      // 6.
      let globalValid: number = undefined as any;
      if ((ifmi.YMode == Y_MODE.GLOBALMV || ifmi.YMode == Y_MODE.GLOBAL_GLOBALMV) && gmp.GmType[refFrame] > TRANSLATION) {
        const data = this.setup_shear(gmp.gm_params[refFrame]);
        globalValid = data.warpValid;
      }

      // 7.
      let useWarp = 0;
      if (w < 8 || h < 8) {
        useWarp = 0;
      } else if (fh.force_integer_mv == 1) {
        useWarp = 0;
      } else if (rmm.motion_mode == MOTION_MODE.LOCALWARP && this.LocalValid == 1) {
        useWarp = 1;
      } else if (
        (ifmi.YMode == Y_MODE.GLOBALMV || ifmi.YMode == Y_MODE.GLOBAL_GLOBALMV) &&
        gmp.GmType[refFrame] > TRANSLATION &&
        this.decoder.tileGroupObu.is_scaled(refFrame) == 0 &&
        globalValid == 1
      ) {
        useWarp = 2;
      }

      // 8.
      let mv = clone(db.Mvs[candRow][candCol][refList]);

      // 9.
      let refIdx = -1;
      if (ifmi.use_intrabc == 0) {
        refIdx = fh.ref_frame_idx[refFrame - REF_FRAME.LAST_FRAME];
      } else {
        refIdx = -1;
        rf.RefFrameWidth[-1] = fs.FrameWidth;
        rf.RefFrameHeight[-1] = fs.FrameHeight;
        rf.RefUpscaledWidth[-1] = fswr.UpscaledWidth;
      }

      // 10.
      let { startX, startY, stepX, stepY } = this.motion_vector_scaling(plane, refIdx, x, y, mv);

      // 11.
      if (ifmi.use_intrabc == 1) {
        rf.RefFrameWidth[-1] = cis.MiCols * MI_SIZE;
        rf.RefFrameHeight[-1] = cis.MiRows * MI_SIZE;
        rf.RefUpscaledWidth[-1] = cis.MiCols * MI_SIZE;
      }

      // 12.
      if (useWarp != 0) {
        let pred = Array2D(Math.ceil(h / 8) * 8);
        for (let i8 = 0; i8 <= (h - 1) >> 3; i8++) {
          for (let j8 = 0; j8 <= (w - 1) >> 3; j8++) {
            this.block_warp(useWarp, plane, refList, x, y, i8, j8, w, h, { pred });
          }
        }
        preds[refList] = pred;
      }

      // 13.
      if (useWarp == 0) {
        preds[refList] = this.block_inter_prediction(plane, refIdx, startX, startY, stepX, stepY, w, h, candRow, candCol);
      }

      // 14.
      if (refList == 1) {
        break;
      }
      if (isCompound == 1) {
        refList = 1;
      } else {
        break;
      }
    }

    if (rct.compound_type == COMPOUND_TYPE.COMPOUND_WEDGE && plane == 0) {
      this.wedge_mask(w, h);
    } else if (rct.compound_type == COMPOUND_TYPE.COMPOUND_INTRA) {
      this.intra_mode_variant_mask(w, h);
    } else if (rct.compound_type == COMPOUND_TYPE.COMPOUND_DIFFWTD && plane == 0) {
      this.difference_weight_mask(preds, w, h);
    }

    if (rct.compound_type == COMPOUND_TYPE.COMPOUND_DISTANCE) {
      this.distance_weights(candRow, candCol);
    }

    if (isCompound == 0 && rii.IsInterIntra == 0) {
      for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
          this.CurrFrame[plane][y + i][x + j] = Clip1(preds[0][i][j], cc.BitDepth);
        }
      }
    } else if (rct.compound_type == COMPOUND_TYPE.COMPOUND_AVERAGE) {
      for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
          this.CurrFrame[plane][y + i][x + j] = Clip1(Round2(preds[0][i][j] + preds[1][i][j], 1 + this.InterPostRound), cc.BitDepth);
        }
      }
    } else if (rct.compound_type == COMPOUND_TYPE.COMPOUND_DISTANCE) {
      for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
          this.CurrFrame[plane][y + i][x + j] = Clip1(Round2(this.FwdWeight * preds[0][i][j] + this.BckWeight * preds[1][i][j], 4 + this.InterPostRound), cc.BitDepth);
        }
      }
    } else {
      this.mask_blend(preds, plane, x, y, w, h);
    }

    if (rmm.motion_mode == MOTION_MODE.OBMC) {
      this.overlapped_motion_compensation(plane, w, h);
    }
  }

  /**
   * 7.11.3.2 Rounding variables derivation process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#rounding-variables-derivation-process)
   */
  rounding_variables_derivation(isCompound: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;

    this.InterRound0 = 3;
    this.InterRound1 = isCompound ? 7 : 11;
    if (cc.BitDepth == 12) {
      this.InterRound0 = this.InterRound0 + 2;
    }
    if (cc.BitDepth == 12 && isCompound == 0) {
      this.InterRound1 = this.InterRound1 - 2;
    }
    this.InterPostRound = 2 * FILTER_BITS - (this.InterRound0 + this.InterRound1);
  }

  /**
   * 7.11.3.3 Motion vector scaling process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#motion-vector-scaling-process)
   */
  motion_vector_scaling(plane: number, refIdx: number, x: number, y: number, mv: number[]) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const fs = fh.frame_size;
    const rf = fh.ref_frames;

    assert(2 * fs.FrameWidth >= rf.RefUpscaledWidth[refIdx], "2 * FrameWidth >= RefUpscaledWidth[ refIdx ]");
    assert(2 * fs.FrameHeight >= rf.RefFrameHeight[refIdx], "2 * FrameHeight >= RefFrameHeight[ refIdx ]");
    assert(fs.FrameWidth <= 16 * rf.RefUpscaledWidth[refIdx], "FrameWidth <= 16 * RefUpscaledWidth[ refIdx ]");
    assert(fs.FrameHeight <= 16 * rf.RefFrameHeight[refIdx], "FrameHeight <= 16 * RefFrameHeight[ refIdx ]");

    let xScale = integer(((rf.RefUpscaledWidth[refIdx] << REF_SCALE_SHIFT) + integer(fs.FrameWidth / 2)) / fs.FrameWidth);
    let yScale = integer(((rf.RefFrameHeight[refIdx] << REF_SCALE_SHIFT) + integer(fs.FrameHeight / 2)) / fs.FrameHeight);

    let subX = cc.subsampling_x;
    let subY = cc.subsampling_y;
    if (plane == 0) {
      subX = 0;
      subY = 0;
    }

    let halfSample = 1 << (SUBPEL_BITS - 1);
    let origX = (x << SUBPEL_BITS) + ((2 * mv[1]) >> subX) + halfSample;
    let origY = (y << SUBPEL_BITS) + ((2 * mv[0]) >> subY) + halfSample;
    let baseX = origX * xScale - (halfSample << REF_SCALE_SHIFT);
    let baseY = origY * yScale - (halfSample << REF_SCALE_SHIFT);
    let off = (1 << (SCALE_SUBPEL_BITS - SUBPEL_BITS)) / 2;
    let startX = Round2Signed(baseX, REF_SCALE_SHIFT + SUBPEL_BITS - SCALE_SUBPEL_BITS) + off;
    let startY = Round2Signed(baseY, REF_SCALE_SHIFT + SUBPEL_BITS - SCALE_SUBPEL_BITS) + off;
    let stepX = Round2Signed(xScale, REF_SCALE_SHIFT - SCALE_SUBPEL_BITS);
    let stepY = Round2Signed(yScale, REF_SCALE_SHIFT - SCALE_SUBPEL_BITS);

    return { startX, startY, stepX, stepY };
  }

  /**
   * 7.11.3.4 Block inter prediction process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#block-inter-prediction-process)
   */
  block_inter_prediction(plane: number, refIdx: number, x: number, y: number, xStep: number, yStep: number, w: number, h: number, candRow: number, candCol: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const rf = fh.ref_frames;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const rfu = this.decoder.referenceFrameUpdate;

    let ref;
    if (refIdx == -1) {
      ref = this.CurrFrame;
    } else {
      ref = rfu.FrameStore[refIdx];
    }

    let subX = cc.subsampling_x;
    let subY = cc.subsampling_y;
    if (plane == 0) {
      subX = 0;
      subY = 0;
    }

    let lastX = ((rf.RefUpscaledWidth[refIdx] + subX) >> subX) - 1;
    let lastY = ((rf.RefFrameHeight[refIdx] + subY) >> subY) - 1;
    let intermediateHeight = (((h - 1) * yStep + (1 << SCALE_SUBPEL_BITS) - 1) >> SCALE_SUBPEL_BITS) + 8;

    let interpFilter = db.InterpFilters[candRow][candCol][1];
    if (w <= 4) {
      if (interpFilter == INTERPOLATION_FILTER.EIGHTTAP || interpFilter == INTERPOLATION_FILTER.EIGHTTAP_SHARP) {
        interpFilter = 4;
      } else if (interpFilter == INTERPOLATION_FILTER.EIGHTTAP_SMOOTH) {
        interpFilter = 5;
      }
    }
    let intermediate = Array2D(intermediateHeight);
    for (let r = 0; r < intermediateHeight; r++) {
      for (let c = 0; c < w; c++) {
        let s = 0;
        let p = x + xStep * c;
        for (let t = 0; t < 8; t++) {
          let refY = Clip3(0, lastY, (y >> 10) + r - 3);
          let refX = Clip3(0, lastX, (p >> 10) + t - 3);
          s += Subpel_Filters[interpFilter][(p >> 6) & SUBPEL_MASK][t] * ref[plane][refY][refX];
        }
        intermediate[r][c] = Round2(s, this.InterRound0);
      }
    }

    interpFilter = db.InterpFilters[candRow][candCol][0];
    if (h <= 4) {
      if (interpFilter == INTERPOLATION_FILTER.EIGHTTAP || interpFilter == INTERPOLATION_FILTER.EIGHTTAP_SHARP) {
        interpFilter = 4;
      } else if (interpFilter == INTERPOLATION_FILTER.EIGHTTAP_SMOOTH) {
        interpFilter = 5;
      }
    }
    let pred = Array2D(h);
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        let s = 0;
        let p = (y & 1023) + yStep * r;
        for (let t = 0; t < 8; t++) {
          s += Subpel_Filters[interpFilter][(p >> 6) & SUBPEL_MASK][t] * intermediate[(p >> 10) + t][c];
        }
        pred[r][c] = Round2(s, this.InterRound1);
      }
    }
    return pred;
  }

  /**
   * 7.11.3.5 Block warp process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#block-warp-process)
   */
  block_warp(useWarp: number, plane: number, refList: number, x: number, y: number, i8: number, j8: number, w: number, h: number, { pred }: { pred: number[][] }) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const gmp = fh.global_motion_params;
    const rf = fh.ref_frames;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const rf2 = tg.ref_frames;
    const rfu = this.decoder.referenceFrameUpdate;

    let refIdx = fh.ref_frame_idx[rf2.RefFrame[refList] - REF_FRAME.LAST_FRAME];
    let ref = rfu.FrameStore[refIdx];

    let subX = cc.subsampling_x;
    let subY = cc.subsampling_y;
    if (plane == 0) {
      subX = 0;
      subY = 0;
    }
    let lastX = ((rf.RefUpscaledWidth[refIdx] + subX) >> subX) - 1;
    let lastY = ((rf.RefFrameHeight[refIdx] + subY) >> subY) - 1;
    let srcX = (x + j8 * 8 + 4) << subX;
    let srcY = (y + i8 * 8 + 4) << subY;

    let warpParams;
    if (useWarp == 1) {
      warpParams = this.LocalWarpParams;
    } else {
      warpParams = gmp.gm_params[rf2.RefFrame[refList]];
    }

    let dstX = warpParams[2] * srcX + warpParams[3] * srcY + warpParams[0];
    let dstY = warpParams[4] * srcX + warpParams[5] * srcY + warpParams[1];

    let { warpValid, alpha, beta, gamma, delta } = this.setup_shear(warpParams);
    assert(warpValid == 1, "warpValid will always be equal to 1 at this point.");

    let x4 = dstX >> subX;
    let y4 = dstY >> subY;
    let ix4 = x4 >> WARPEDMODEL_PREC_BITS;
    let sx4 = x4 & ((1 << WARPEDMODEL_PREC_BITS) - 1);
    let iy4 = y4 >> WARPEDMODEL_PREC_BITS;
    let sy4 = y4 & ((1 << WARPEDMODEL_PREC_BITS) - 1);

    let intermediate = Array2D(15);
    for (let i1 = -7; i1 < 8; i1++) {
      for (let i2 = -4; i2 < 4; i2++) {
        let sx = sx4 + alpha * i2 + beta * i1;
        let offs = Round2(sx, WARPEDDIFF_PREC_BITS) + WARPEDPIXEL_PREC_SHIFTS;
        let s = 0;
        for (let i3 = 0; i3 < 8; i3++) {
          let refY = Clip3(0, lastY, iy4 + i1);
          let refX = Clip3(0, lastX, ix4 + i2 - 3 + i3);
          s += Warped_Filters[offs][i3] * ref[plane][refY][refX];
        }
        intermediate[i1 + 7][i2 + 4] = Round2(s, this.InterRound0);
      }
    }

    for (let i1 = -4; i1 < Math.min(4, h - i8 * 8 - 4); i1++) {
      for (let i2 = -4; i2 < Math.min(4, w - j8 * 8 - 4); i2++) {
        let sy = sy4 + gamma * i2 + delta * i1;
        let offs = Round2(sy, WARPEDDIFF_PREC_BITS) + WARPEDPIXEL_PREC_SHIFTS;
        let s = 0;
        for (let i3 = 0; i3 < 8; i3++) {
          s += Warped_Filters[offs][i3] * intermediate[i1 + i3 + 4][i2 + 4];
        }
        pred[i8 * 8 + i1 + 4][j8 * 8 + i2 + 4] = Round2(s, this.InterRound1);
      }
    }
    return pred;
  }

  /**
   * 7.11.3.6 Setup shear process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#setup-shear-process)
   */
  setup_shear(warpParams: number[]) {
    let alpha0 = Clip3(-32768, 32767, warpParams[2] - (1 << WARPEDMODEL_PREC_BITS));
    let beta0 = Clip3(-32768, 32767, warpParams[3]);

    let { divShift, divFactor } = this.resolve_divisor(warpParams[2]);
    let v = left_shift_64(warpParams[4], WARPEDMODEL_PREC_BITS);
    let gamma0 = Clip3(-32768, 32767, Number(Round2Signed_64(v * BigInt(divFactor), divShift)));
    let w = BigInt(warpParams[3]) * BigInt(warpParams[4]);
    let delta0 = Clip3(-32768, 32767, warpParams[5] - Number(Round2Signed_64(w * BigInt(divFactor), divShift)) - (1 << WARPEDMODEL_PREC_BITS));

    let alpha = Round2Signed(alpha0, WARP_PARAM_REDUCE_BITS) << WARP_PARAM_REDUCE_BITS;
    let beta = Round2Signed(beta0, WARP_PARAM_REDUCE_BITS) << WARP_PARAM_REDUCE_BITS;
    let gamma = Round2Signed(gamma0, WARP_PARAM_REDUCE_BITS) << WARP_PARAM_REDUCE_BITS;
    let delta = Round2Signed(delta0, WARP_PARAM_REDUCE_BITS) << WARP_PARAM_REDUCE_BITS;

    let warpValid = 1;
    if (4 * Math.abs(alpha) + 7 * Math.abs(beta) >= 1 << WARPEDMODEL_PREC_BITS) {
      warpValid = 0;
    } else if (4 * Math.abs(gamma) + 4 * Math.abs(delta) >= 1 << WARPEDMODEL_PREC_BITS) {
      warpValid = 0;
    }

    return { warpValid, alpha, beta, gamma, delta };
  }

  /**
   * 7.11.3.7 Resolve divisor process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#resolve-divisor-process)
   */
  resolve_divisor(d: number) {
    let n = FloorLog2(Math.abs(d));
    let e = Math.abs(d) - (1 << n);

    let f: number;
    if (n > DIV_LUT_BITS) {
      f = Round2(e, n - DIV_LUT_BITS);
    } else {
      f = e << (DIV_LUT_BITS - n);
    }

    let divShift = n + DIV_LUT_PREC_BITS;

    let divFactor;
    if (d < 0) {
      divFactor = -Div_Lut[f];
    } else {
      divFactor = Div_Lut[f];
    }
    return { divShift, divFactor };
  }
  resolve_divisor_64(d2: number) {
    let d = BigInt(Math.abs(d2));
    let n = FloorLog2_64(d);
    let e = d - (1n << BigInt(n));

    let f: bigint;
    if (n > DIV_LUT_BITS) {
      f = Round2_64(e, n - DIV_LUT_BITS);
    } else {
      f = left_shift_64(e, DIV_LUT_BITS - n);
    }

    let divShift = Number(n) + DIV_LUT_PREC_BITS;

    let divFactor: number;
    if (d < 0) {
      divFactor = -Div_Lut[Number(f)];
    } else {
      divFactor = Div_Lut[Number(f)];
    }
    return { divShift, divFactor };
  }

  /**
   * 7.11.3.8 Warp estimation process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#warp-estimation-process)
   */
  warp_estimation() {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const m = tg.mv;
    const mvp = this.decoder.motionVectorPrediction;

    let A = Array2D(2, 2, 0);
    let Bx = Array1D(2, 0);
    let By = Array1D(2, 0);

    let w4 = Num_4x4_Blocks_Wide[db.MiSize];
    let h4 = Num_4x4_Blocks_High[db.MiSize];
    let midY = db.MiRow * 4 + h4 * 2 - 1;
    let midX = db.MiCol * 4 + w4 * 2 - 1;
    let suy = midY * 8;
    let sux = midX * 8;
    let duy = suy + m.Mv[0][0];
    let dux = sux + m.Mv[0][1];
    for (let i = 0; i < mvp.NumSamples; i++) {
      let sy = mvp.CandList[i][0] - suy;
      let sx = mvp.CandList[i][1] - sux;
      let dy = mvp.CandList[i][2] - duy;
      let dx = mvp.CandList[i][3] - dux;
      if (Math.abs(sx - dx) < LS_MV_MAX && Math.abs(sy - dy) < LS_MV_MAX) {
        A[0][0] += this.ls_product(sx, sx) + 8;
        A[0][1] += this.ls_product(sx, sy) + 4;
        A[1][1] += this.ls_product(sy, sy) + 8;
        Bx[0] += this.ls_product(sx, dx) + 8;
        Bx[1] += this.ls_product(sy, dx) + 4;
        By[0] += this.ls_product(sx, dy) + 4;
        By[1] += this.ls_product(sy, dy) + 8;
      }
    }

    assert(A[0][0] >= -0x400000 && A[0][0] <= 0x3fffff);
    assert(A[0][1] >= -0x400000 && A[0][1] <= 0x3fffff);
    assert(A[1][1] >= -0x400000 && A[1][1] <= 0x3fffff);
    assert(Bx[0] >= -0x400000 && Bx[0] <= 0x3fffff);
    assert(Bx[1] >= -0x400000 && Bx[1] <= 0x3fffff);
    assert(By[0] >= -0x400000 && By[0] <= 0x3fffff);
    assert(By[1] >= -0x400000 && By[1] <= 0x3fffff);

    let det = A[0][0] * A[1][1] - A[0][1] * A[0][1];
    this.LocalValid = 1;
    if (det == 0) {
      this.LocalValid = 0;
    }
    if (det == 0) {
      return;
    }

    let { divShift, divFactor } = this.resolve_divisor_64(det);

    divShift -= WARPEDMODEL_PREC_BITS;
    if (divShift < 0) {
      divFactor = divFactor << -divShift;
      divShift = 0;
    }
    this.LocalWarpParams[2] = this.diag(A[1][1] * Bx[0] - A[0][1] * Bx[1], divFactor, divShift);
    this.LocalWarpParams[3] = this.nondiag(-A[0][1] * Bx[0] + A[0][0] * Bx[1], divFactor, divShift);
    this.LocalWarpParams[4] = this.nondiag(A[1][1] * By[0] - A[0][1] * By[1], divFactor, divShift);
    this.LocalWarpParams[5] = this.diag(-A[0][1] * By[0] + A[0][0] * By[1], divFactor, divShift);

    let mvx = m.Mv[0][1];
    let mvy = m.Mv[0][0];
    let vx = mvx * (1 << (WARPEDMODEL_PREC_BITS - 3)) - (midX * (this.LocalWarpParams[2] - (1 << WARPEDMODEL_PREC_BITS)) + midY * this.LocalWarpParams[3]);
    let vy = mvy * (1 << (WARPEDMODEL_PREC_BITS - 3)) - (midX * this.LocalWarpParams[4] + midY * (this.LocalWarpParams[5] - (1 << WARPEDMODEL_PREC_BITS)));
    this.LocalWarpParams[0] = Clip3(-WARPEDMODEL_TRANS_CLAMP, WARPEDMODEL_TRANS_CLAMP - 1, vx);
    this.LocalWarpParams[1] = Clip3(-WARPEDMODEL_TRANS_CLAMP, WARPEDMODEL_TRANS_CLAMP - 1, vy);
    // console.info(`${JSON.stringify(this.LocalWarpParams).replace(/\[/g, "{").replace(/\]/g, "}")},`);
  }

  /**
   * 7.11.3.8 Warp estimation process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#warp-estimation-process)
   */
  ls_product(a: number, b: number) {
    return ((a * b) >> 2) + (a + b);
  }

  /**
   * 7.11.3.8 Warp estimation process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#warp-estimation-process)
   */
  nondiag(v: number, divFactor: number, divShift: number) {
    let v2 = BigInt(v) * BigInt(divFactor);
    v2 = Round2Signed_64(v2, divShift);
    let c = Clip3_64(-WARPEDMODEL_NONDIAGAFFINE_CLAMP + 1, WARPEDMODEL_NONDIAGAFFINE_CLAMP - 1, v2);
    return Number(c);
  }

  /**
   * 7.11.3.8 Warp estimation process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#warp-estimation-process)
   */
  diag(v: number, divFactor: number, divShift: number) {
    let v2 = BigInt(v) * BigInt(divFactor);
    v2 = Round2Signed_64(v2, divShift);
    let c = Clip3_64((1 << WARPEDMODEL_PREC_BITS) - WARPEDMODEL_NONDIAGAFFINE_CLAMP + 1, (1 << WARPEDMODEL_PREC_BITS) + WARPEDMODEL_NONDIAGAFFINE_CLAMP - 1, v2);
    return Number(c);
  }

  /**
   * 7.11.3.9 Overlapped motion compensation process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#overlapped-motion-compensation-process)
   */
  overlapped_motion_compensation(plane: number, w: number, h: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;

    let subX = cc.subsampling_x;
    let subY = cc.subsampling_y;
    if (plane == 0) {
      subX = 0;
      subY = 0;
    }

    if (db.AvailU) {
      if (this.decoder.tileGroupObu.get_plane_residual_size(db.MiSize, plane) >= SUB_SIZE.BLOCK_8X8) {
        let pass = 0;
        let w4 = Num_4x4_Blocks_Wide[db.MiSize];
        let x4 = db.MiCol;
        let y4 = db.MiRow;
        let nCount = 0;
        let nLimit = Math.min(4, Mi_Width_Log2[db.MiSize]);
        while (nCount < nLimit && x4 < Math.min(cis.MiCols, db.MiCol + w4)) {
          let candRow = db.MiRow - 1;
          let candCol = x4 | 1;
          let candSz = db.MiSizes[candRow][candCol];
          let step4 = Clip3(2, 16, Num_4x4_Blocks_Wide[candSz]);
          if (db.RefFrames[candRow][candCol][0] > REF_FRAME.INTRA_FRAME) {
            nCount += 1;
            let predW = Math.min(w, (step4 * MI_SIZE) >> subX);
            let predH = Math.min(h >> 1, 32 >> subY);
            let mask = this.get_obmc_mask(predH);
            this.predict_overlap({ candRow, candCol, x4, y4, subX, subY, plane, predW, predH, pass, mask });
          }
          x4 += step4;
        }
      }
    }
    if (db.AvailL) {
      let pass = 1;
      let h4 = Num_4x4_Blocks_High[db.MiSize];
      let x4 = db.MiCol;
      let y4 = db.MiRow;
      let nCount = 0;
      let nLimit = Math.min(4, Mi_Height_Log2[db.MiSize]);
      while (nCount < nLimit && y4 < Math.min(cis.MiRows, db.MiRow + h4)) {
        let candCol = db.MiCol - 1;
        let candRow = y4 | 1;
        let candSz = db.MiSizes[candRow][candCol];
        let step4 = Clip3(2, 16, Num_4x4_Blocks_High[candSz]);
        if (db.RefFrames[candRow][candCol][0] > REF_FRAME.INTRA_FRAME) {
          nCount += 1;
          let predW = Math.min(w >> 1, 32 >> subX);
          let predH = Math.min(h, (step4 * MI_SIZE) >> subY);
          let mask = this.get_obmc_mask(predW);
          this.predict_overlap({ candRow, candCol, x4, y4, subX, subY, plane, predW, predH, pass, mask });
        }
        y4 += step4;
      }
    }
  }

  /**
   * 7.11.3.9 Overlapped motion compensation process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#overlapped-motion-compensation-process)
   */
  predict_overlap({
    candRow,
    candCol,
    x4,
    y4,
    subX,
    subY,
    plane,
    predW,
    predH,
    pass,
    mask,
  }: {
    candRow: number;
    candCol: number;
    x4: number;
    y4: number;
    subX: number;
    subY: number;
    plane: number;
    predW: number;
    predH: number;
    pass: number;
    mask: number[];
  }) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;

    // 1.
    let mv = clone(db.Mvs[candRow][candCol][0]);

    // 2.
    let refIdx = fh.ref_frame_idx[db.RefFrames[candRow][candCol][0] - REF_FRAME.LAST_FRAME];

    // 3.
    let predX = (x4 * 4) >> subX;

    // 4.
    let predY = (y4 * 4) >> subY;

    // 5.
    let { startX, startY, stepX, stepY } = this.motion_vector_scaling(plane, refIdx, predX, predY, mv);

    // 6.
    let obmcPred = this.block_inter_prediction(plane, refIdx, startX, startY, stepX, stepY, predW, predH, candRow, candCol);

    // 7.
    for (let i = 0; i < predH; i++) {
      for (let j = 0; j < predW; j++) {
        obmcPred[i][j] = Clip1(obmcPred[i][j], cc.BitDepth);
      }
    }

    // 8.
    this.overlap_blending(plane, predX, predY, predW, predH, pass, obmcPred, mask);
  }

  /**
   * 7.11.3.9 Overlapped motion compensation process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#overlapped-motion-compensation-process)
   */
  get_obmc_mask(length: number) {
    const Obmc_Mask_2 = [45, 64];
    const Obmc_Mask_4 = [39, 50, 59, 64];
    const Obmc_Mask_8 = [36, 42, 48, 53, 57, 61, 64, 64];
    const Obmc_Mask_16 = [34, 37, 40, 43, 46, 49, 52, 54, 56, 58, 60, 61, 64, 64, 64, 64];
    const Obmc_Mask_32 = [33, 35, 36, 38, 40, 41, 43, 44, 45, 47, 48, 50, 51, 52, 53, 55, 56, 57, 58, 59, 60, 60, 61, 62, 64, 64, 64, 64, 64, 64, 64, 64];

    if (length == 2) {
      return Obmc_Mask_2;
    } else if (length == 4) {
      return Obmc_Mask_4;
    } else if (length == 8) {
      return Obmc_Mask_8;
    } else if (length == 16) {
      return Obmc_Mask_16;
    } else {
      return Obmc_Mask_32;
    }
  }

  /**
   * 7.11.3.10 Overlap blending process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#overlap-blending-process)
   */
  overlap_blending(plane: number, predX: number, predY: number, predW: number, predH: number, pass: number, obmcPred: number[][], mask: number[]) {
    for (let i = 0; i < predH; i++) {
      for (let j = 0; j < predW; j++) {
        // 1.
        let m: number;
        if (pass == 0) {
          m = mask[i];
        } else {
          m = mask[j];
        }

        // 2.
        this.CurrFrame[plane][predY + i][predX + j] = Round2(m * this.CurrFrame[plane][predY + i][predX + j] + (64 - m) * obmcPred[i][j], 6);
      }
    }
  }

  /**
   * 7.11.3.11 Wedge mask process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#wedge-mask-process)
   */
  wedge_mask(w: number, h: number) {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const rii = tg.inter_intra;
    const rct = tg.compound_type;

    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        this.Mask[i][j] = this.WedgeMasks[db.MiSize][rct.wedge_sign][rii.wedge_index][i][j];
      }
    }
  }

  /**
   * 7.11.3.11 Wedge mask process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#wedge-mask-process)
   */
  initialise_wedge_mask_table() {
    const Wedge_Master_Oblique_Odd = [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 6, 18, 37, 53, 60, 63, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
      64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
    ];
    const Wedge_Master_Oblique_Even = [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 4, 11, 27, 46, 58, 62, 63, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
      64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
    ];
    const Wedge_Master_Vertical = [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 7, 21, 43, 57, 62, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
      64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64, 64,
    ];

    let w = MASK_MASTER_SIZE;
    let h = MASK_MASTER_SIZE;
    const MasterMask = Array3D(7, MASK_MASTER_SIZE);
    for (let j = 0; j < w; j++) {
      let shift = MASK_MASTER_SIZE / 4;
      for (let i = 0; i < h; i += 2) {
        MasterMask[WEDGE_OBLIQUE63][i][j] = Wedge_Master_Oblique_Even[Clip3(0, MASK_MASTER_SIZE - 1, j - shift)];
        shift -= 1;
        MasterMask[WEDGE_OBLIQUE63][i + 1][j] = Wedge_Master_Oblique_Odd[Clip3(0, MASK_MASTER_SIZE - 1, j - shift)];
        MasterMask[WEDGE_VERTICAL][i][j] = Wedge_Master_Vertical[j];
        MasterMask[WEDGE_VERTICAL][i + 1][j] = Wedge_Master_Vertical[j];
      }
    }
    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        let msk = MasterMask[WEDGE_OBLIQUE63][i][j];
        MasterMask[WEDGE_OBLIQUE27][j][i] = msk;
        MasterMask[WEDGE_OBLIQUE117][i][w - 1 - j] = 64 - msk;
        MasterMask[WEDGE_OBLIQUE153][w - 1 - j][i] = 64 - msk;
        MasterMask[WEDGE_HORIZONTAL][j][i] = MasterMask[WEDGE_VERTICAL][i][j];
      }
    }
    for (let bsize = SUB_SIZE.BLOCK_8X8; bsize < BLOCK_SIZES; bsize++) {
      if (Wedge_Bits[bsize] > 0) {
        w = Block_Width[bsize];
        h = Block_Height[bsize];
        for (let wedge = 0; wedge < WEDGE_TYPES; wedge++) {
          let dir = Prediction.get_wedge_direction(bsize, wedge);
          let xoff = MASK_MASTER_SIZE / 2 - ((this.get_wedge_xoff(bsize, wedge) * w) >> 3);
          let yoff = MASK_MASTER_SIZE / 2 - ((this.get_wedge_yoff(bsize, wedge) * h) >> 3);
          let sum = 0;
          for (let i = 0; i < w; i++) {
            sum += MasterMask[dir][yoff][xoff + i];
          }
          for (let i = 1; i < h; i++) {
            sum += MasterMask[dir][yoff + i][xoff];
          }
          let avg = integer((sum + integer((w + h - 1) / 2)) / (w + h - 1));
          let flipSign = Number(avg < 32);
          for (let i = 0; i < h; i++) {
            for (let j = 0; j < w; j++) {
              this.WedgeMasks[bsize][flipSign][wedge][i][j] = MasterMask[dir][yoff + i][xoff + j];
              this.WedgeMasks[bsize][Number(!flipSign)][wedge][i][j] = 64 - MasterMask[dir][yoff + i][xoff + j];
            }
          }
        }
      }
    }
  }

  /**
   * 7.11.3.11 Wedge mask process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#wedge-mask-process)
   */
  static block_shape(bsize: number) {
    let w4 = Num_4x4_Blocks_Wide[bsize];
    let h4 = Num_4x4_Blocks_High[bsize];
    if (h4 > w4) {
      return 0;
    } else if (h4 < w4) {
      return 1;
    } else {
      return 2;
    }
  }

  /**
   * 7.11.3.11 Wedge mask process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#wedge-mask-process)
   */
  static get_wedge_direction(bsize: number, index: number) {
    return Wedge_Codebook[Prediction.block_shape(bsize)][index][0];
  }

  /**
   * 7.11.3.11 Wedge mask process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#wedge-mask-process)
   */
  get_wedge_xoff(bsize: number, index: number) {
    return Wedge_Codebook[Prediction.block_shape(bsize)][index][1];
  }

  /**
   * 7.11.3.11 Wedge mask process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#wedge-mask-process)
   */
  get_wedge_yoff(bsize: number, index: number) {
    return Wedge_Codebook[Prediction.block_shape(bsize)][index][2];
  }

  /**
   * 7.11.3.12 Difference weight mask process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#difference-weight-mask-process)
   */
  difference_weight_mask(preds: number[][][], w: number, h: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const rct = tg.compound_type;

    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        let diff = Math.abs(preds[0][i][j] - preds[1][i][j]);
        diff = Round2(diff, cc.BitDepth - 8 + this.InterPostRound);
        let m = Clip3(0, 64, 38 + integer(diff / 16));
        if (rct.mask_type) {
          this.Mask[i][j] = 64 - m;
        } else {
          this.Mask[i][j] = m;
        }
      }
    }
  }

  /**
   * 7.11.3.13 Intra mode variant mask process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#intra-mode-variant-mask-process)
   */
  intra_mode_variant_mask(w: number, h: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const rii = tg.inter_intra;

    const Ii_Weights_1d = [
      60, 58, 56, 54, 52, 50, 48, 47, 45, 44, 42, 41, 39, 38, 37, 35, 34, 33, 32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 22, 21, 20, 19, 19, 18, 18, 17, 16, 16, 15, 15, 14, 14,
      13, 13, 12, 12, 12, 11, 11, 10, 10, 10, 9, 9, 9, 8, 8, 8, 8, 7, 7, 7, 7, 6, 6, 6, 6, 6, 5, 5, 5, 5, 5, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 2, 2,
      2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    ];

    let sizeScale = integer(MAX_SB_SIZE / Math.max(h, w));
    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        if (rii.interintra_mode == INTERINTRA_MODE.II_V_PRED) {
          this.Mask[i][j] = Ii_Weights_1d[i * sizeScale];
        } else if (rii.interintra_mode == INTERINTRA_MODE.II_H_PRED) {
          this.Mask[i][j] = Ii_Weights_1d[j * sizeScale];
        } else if (rii.interintra_mode == INTERINTRA_MODE.II_SMOOTH_PRED) {
          this.Mask[i][j] = Ii_Weights_1d[Math.min(i, j) * sizeScale];
        } else {
          this.Mask[i][j] = 32;
        }
      }
    }
  }

  /**
   * 7.11.3.14 Mask blend process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#mask-blend-process)
   */
  mask_blend(preds: number[][][], plane: number, dstX: number, dstY: number, w: number, h: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const rii = tg.inter_intra;

    let subX = cc.subsampling_x;
    let subY = cc.subsampling_y;
    if (plane == 0) {
      subX = 0;
      subY = 0;
    }

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m: number;
        if ((!subX && !subY) || (rii.interintra && !rii.wedge_interintra)) {
          m = this.Mask[y][x];
        } else if (subX && !subY) {
          m = Round2(this.Mask[y][2 * x] + this.Mask[y][2 * x + 1], 1);
        } else {
          m = Round2(this.Mask[2 * y][2 * x] + this.Mask[2 * y][2 * x + 1] + this.Mask[2 * y + 1][2 * x] + this.Mask[2 * y + 1][2 * x + 1], 2);
        }
        let pred0: number;
        let pred1: number;
        if (rii.interintra) {
          pred0 = Clip1(Round2(preds[0][y][x], this.InterPostRound), cc.BitDepth);
          pred1 = this.CurrFrame[plane][y + dstY][x + dstX];
          this.CurrFrame[plane][y + dstY][x + dstX] = Round2(m * pred1 + (64 - m) * pred0, 6);
        } else {
          pred0 = preds[0][y][x];
          pred1 = preds[1][y][x];
          this.CurrFrame[plane][y + dstY][x + dstX] = Clip1(Round2(m * pred0 + (64 - m) * pred1, 6 + this.InterPostRound), cc.BitDepth);
        }
      }
    }
  }

  /**
   * 7.11.3.15 Distance weights process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#distance-weights-process)
   */
  distance_weights(candRow: number, candCol: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const fho = this.decoder.frameHeaderObu;
    const fh = fho.frameHeader;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;

    const Quant_Dist_Weight = [
      [2, 3],
      [2, 5],
      [2, 7],
      [1, MAX_FRAME_DISTANCE],
    ];
    const Quant_Dist_Lookup = [
      [9, 7],
      [11, 5],
      [12, 4],
      [13, 3],
    ];

    let dist: number[] = [];
    for (let refList = 0; refList < 2; refList++) {
      let h = fh.OrderHints[db.RefFrames[candRow][candCol][refList]];
      dist[refList] = Clip3(0, MAX_FRAME_DISTANCE, Math.abs(fho.get_relative_dist(h, fh.OrderHint)));
    }
    let d0 = dist[1];
    let d1 = dist[0];
    let order = Number(d0 <= d1);
    if (d0 == 0 || d1 == 0) {
      this.FwdWeight = Quant_Dist_Lookup[3][order];
      this.BckWeight = Quant_Dist_Lookup[3][1 - order];
    } else {
      let i: number;
      for (i = 0; i < 3; i++) {
        let c0 = Quant_Dist_Weight[i][order];
        let c1 = Quant_Dist_Weight[i][1 - order];
        if (order) {
          if (d0 * c0 > d1 * c1) {
            break;
          }
        } else {
          if (d0 * c0 < d1 * c1) {
            break;
          }
        }
      }
      this.FwdWeight = Quant_Dist_Lookup[i][order];
      this.BckWeight = Quant_Dist_Lookup[i][1 - order];
    }
  }

  /**
   * 7.11.4 Palette prediction process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#palette-prediction-process)
   */
  predict_palette(plane: number, startX: number, startY: number, x: number, y: number, txSz: number) {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const pmi = tg.palette_mode_info;
    const pt = tg.palette_tokens;

    let w = Tx_Width[txSz];
    let h = Tx_Height[txSz];

    let palette = pmi.palette_colors_v;
    if (plane == 0) {
      palette = pmi.palette_colors_y;
    } else if (plane == 1) {
      palette = pmi.palette_colors_u;
    }

    let map = pt.ColorMapUV;
    if (plane == 0) {
      map = pt.ColorMapY;
    }

    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        this.CurrFrame[plane][startY + i][startX + j] = palette[map[y * 4 + i][x * 4 + j]];
      }
    }

    // if (this.decoder.obu.onPredFrame) {
    //   let pred: number[][] = Array2D(h);
    //   for (let i = 0; i < h; i++) {
    //     for (let j = 0; j < w; j++) {
    //       pred[i][j] = this.CurrFrame[plane][startY + i][startX + j];
    //     }
    //   }
    //   this.decoder.obu.onPredFrame(plane, startX, startY, pred);
    // }
  }

  /**
   * 7.11.5 Predict chroma from luma process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#predict-chroma-from-luma-process)
   */
  predict_chroma_from_luma(plane: number, startX: number, startY: number, txSz: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const tb = tg.transform_block;
    const rca = tg.cfl_alphas;

    let w = Tx_Width[txSz];
    let h = Tx_Height[txSz];
    let subX = cc.subsampling_x;
    let subY = cc.subsampling_y;

    let alpha = rca.CflAlphaV;
    if (plane == 1) {
      alpha = rca.CflAlphaU;
    }

    let lumaAvg = 0;
    let L = Array2D(h);
    for (let i = 0; i < h; i++) {
      let lumaY = (startY + i) << subY;
      lumaY = Math.min(lumaY, tb.MaxLumaH - (1 << subY));
      for (let j = 0; j < w; j++) {
        let lumaX = (startX + j) << subX;
        lumaX = Math.min(lumaX, tb.MaxLumaW - (1 << subX));
        let t = 0;
        for (let dy = 0; dy <= subY; dy += 1)
          for (let dx = 0; dx <= subX; dx += 1) {
            t += this.CurrFrame[0][lumaY + dy][lumaX + dx];
          }
        let v = t << (3 - subX - subY);
        L[i][j] = v;
        lumaAvg += v;
      }
    }
    lumaAvg = Round2(lumaAvg, Tx_Width_Log2[txSz] + Tx_Height_Log2[txSz]);

    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        let dc = this.CurrFrame[plane][startY + i][startX + j];
        let scaledLuma = Round2Signed(alpha * (L[i][j] - lumaAvg), 6);
        this.CurrFrame[plane][startY + i][startX + j] = Clip1(dc + scaledLuma, cc.BitDepth);
      }
    }
  }
}

const Subpel_Filters = [
  [
    [0, 0, 0, 128, 0, 0, 0, 0],
    [0, 2, -6, 126, 8, -2, 0, 0],
    [0, 2, -10, 122, 18, -4, 0, 0],
    [0, 2, -12, 116, 28, -8, 2, 0],
    [0, 2, -14, 110, 38, -10, 2, 0],
    [0, 2, -14, 102, 48, -12, 2, 0],
    [0, 2, -16, 94, 58, -12, 2, 0],
    [0, 2, -14, 84, 66, -12, 2, 0],
    [0, 2, -14, 76, 76, -14, 2, 0],
    [0, 2, -12, 66, 84, -14, 2, 0],
    [0, 2, -12, 58, 94, -16, 2, 0],
    [0, 2, -12, 48, 102, -14, 2, 0],
    [0, 2, -10, 38, 110, -14, 2, 0],
    [0, 2, -8, 28, 116, -12, 2, 0],
    [0, 0, -4, 18, 122, -10, 2, 0],
    [0, 0, -2, 8, 126, -6, 2, 0],
  ],
  [
    [0, 0, 0, 128, 0, 0, 0, 0],
    [0, 2, 28, 62, 34, 2, 0, 0],
    [0, 0, 26, 62, 36, 4, 0, 0],
    [0, 0, 22, 62, 40, 4, 0, 0],
    [0, 0, 20, 60, 42, 6, 0, 0],
    [0, 0, 18, 58, 44, 8, 0, 0],
    [0, 0, 16, 56, 46, 10, 0, 0],
    [0, -2, 16, 54, 48, 12, 0, 0],
    [0, -2, 14, 52, 52, 14, -2, 0],
    [0, 0, 12, 48, 54, 16, -2, 0],
    [0, 0, 10, 46, 56, 16, 0, 0],
    [0, 0, 8, 44, 58, 18, 0, 0],
    [0, 0, 6, 42, 60, 20, 0, 0],
    [0, 0, 4, 40, 62, 22, 0, 0],
    [0, 0, 4, 36, 62, 26, 0, 0],
    [0, 0, 2, 34, 62, 28, 2, 0],
  ],
  [
    [0, 0, 0, 128, 0, 0, 0, 0],
    [-2, 2, -6, 126, 8, -2, 2, 0],
    [-2, 6, -12, 124, 16, -6, 4, -2],
    [-2, 8, -18, 120, 26, -10, 6, -2],
    [-4, 10, -22, 116, 38, -14, 6, -2],
    [-4, 10, -22, 108, 48, -18, 8, -2],
    [-4, 10, -24, 100, 60, -20, 8, -2],
    [-4, 10, -24, 90, 70, -22, 10, -2],
    [-4, 12, -24, 80, 80, -24, 12, -4],
    [-2, 10, -22, 70, 90, -24, 10, -4],
    [-2, 8, -20, 60, 100, -24, 10, -4],
    [-2, 8, -18, 48, 108, -22, 10, -4],
    [-2, 6, -14, 38, 116, -22, 10, -4],
    [-2, 6, -10, 26, 120, -18, 8, -2],
    [-2, 4, -6, 16, 124, -12, 6, -2],
    [0, 2, -2, 8, 126, -6, 2, -2],
  ],
  [
    [0, 0, 0, 128, 0, 0, 0, 0],
    [0, 0, 0, 120, 8, 0, 0, 0],
    [0, 0, 0, 112, 16, 0, 0, 0],
    [0, 0, 0, 104, 24, 0, 0, 0],
    [0, 0, 0, 96, 32, 0, 0, 0],
    [0, 0, 0, 88, 40, 0, 0, 0],
    [0, 0, 0, 80, 48, 0, 0, 0],
    [0, 0, 0, 72, 56, 0, 0, 0],
    [0, 0, 0, 64, 64, 0, 0, 0],
    [0, 0, 0, 56, 72, 0, 0, 0],
    [0, 0, 0, 48, 80, 0, 0, 0],
    [0, 0, 0, 40, 88, 0, 0, 0],
    [0, 0, 0, 32, 96, 0, 0, 0],
    [0, 0, 0, 24, 104, 0, 0, 0],
    [0, 0, 0, 16, 112, 0, 0, 0],
    [0, 0, 0, 8, 120, 0, 0, 0],
  ],
  [
    [0, 0, 0, 128, 0, 0, 0, 0],
    [0, 0, -4, 126, 8, -2, 0, 0],
    [0, 0, -8, 122, 18, -4, 0, 0],
    [0, 0, -10, 116, 28, -6, 0, 0],
    [0, 0, -12, 110, 38, -8, 0, 0],
    [0, 0, -12, 102, 48, -10, 0, 0],
    [0, 0, -14, 94, 58, -10, 0, 0],
    [0, 0, -12, 84, 66, -10, 0, 0],
    [0, 0, -12, 76, 76, -12, 0, 0],
    [0, 0, -10, 66, 84, -12, 0, 0],
    [0, 0, -10, 58, 94, -14, 0, 0],
    [0, 0, -10, 48, 102, -12, 0, 0],
    [0, 0, -8, 38, 110, -12, 0, 0],
    [0, 0, -6, 28, 116, -10, 0, 0],
    [0, 0, -4, 18, 122, -8, 0, 0],
    [0, 0, -2, 8, 126, -4, 0, 0],
  ],
  [
    [0, 0, 0, 128, 0, 0, 0, 0],
    [0, 0, 30, 62, 34, 2, 0, 0],
    [0, 0, 26, 62, 36, 4, 0, 0],
    [0, 0, 22, 62, 40, 4, 0, 0],
    [0, 0, 20, 60, 42, 6, 0, 0],
    [0, 0, 18, 58, 44, 8, 0, 0],
    [0, 0, 16, 56, 46, 10, 0, 0],
    [0, 0, 14, 54, 48, 12, 0, 0],
    [0, 0, 12, 52, 52, 12, 0, 0],
    [0, 0, 12, 48, 54, 14, 0, 0],
    [0, 0, 10, 46, 56, 16, 0, 0],
    [0, 0, 8, 44, 58, 18, 0, 0],
    [0, 0, 6, 42, 60, 20, 0, 0],
    [0, 0, 4, 40, 62, 22, 0, 0],
    [0, 0, 4, 36, 62, 26, 0, 0],
    [0, 0, 2, 34, 62, 30, 0, 0],
  ],
];

const Warped_Filters = [
  [0, 0, 127, 1, 0, 0, 0, 0],
  [0, -1, 127, 2, 0, 0, 0, 0],
  [1, -3, 127, 4, -1, 0, 0, 0],
  [1, -4, 126, 6, -2, 1, 0, 0],
  [1, -5, 126, 8, -3, 1, 0, 0],
  [1, -6, 125, 11, -4, 1, 0, 0],
  [1, -7, 124, 13, -4, 1, 0, 0],
  [2, -8, 123, 15, -5, 1, 0, 0],
  [2, -9, 122, 18, -6, 1, 0, 0],
  [2, -10, 121, 20, -6, 1, 0, 0],
  [2, -11, 120, 22, -7, 2, 0, 0],
  [2, -12, 119, 25, -8, 2, 0, 0],
  [3, -13, 117, 27, -8, 2, 0, 0],
  [3, -13, 116, 29, -9, 2, 0, 0],
  [3, -14, 114, 32, -10, 3, 0, 0],
  [3, -15, 113, 35, -10, 2, 0, 0],
  [3, -15, 111, 37, -11, 3, 0, 0],
  [3, -16, 109, 40, -11, 3, 0, 0],
  [3, -16, 108, 42, -12, 3, 0, 0],
  [4, -17, 106, 45, -13, 3, 0, 0],
  [4, -17, 104, 47, -13, 3, 0, 0],
  [4, -17, 102, 50, -14, 3, 0, 0],
  [4, -17, 100, 52, -14, 3, 0, 0],
  [4, -18, 98, 55, -15, 4, 0, 0],
  [4, -18, 96, 58, -15, 3, 0, 0],
  [4, -18, 94, 60, -16, 4, 0, 0],
  [4, -18, 91, 63, -16, 4, 0, 0],
  [4, -18, 89, 65, -16, 4, 0, 0],
  [4, -18, 87, 68, -17, 4, 0, 0],
  [4, -18, 85, 70, -17, 4, 0, 0],
  [4, -18, 82, 73, -17, 4, 0, 0],
  [4, -18, 80, 75, -17, 4, 0, 0],
  [4, -18, 78, 78, -18, 4, 0, 0],
  [4, -17, 75, 80, -18, 4, 0, 0],
  [4, -17, 73, 82, -18, 4, 0, 0],
  [4, -17, 70, 85, -18, 4, 0, 0],
  [4, -17, 68, 87, -18, 4, 0, 0],
  [4, -16, 65, 89, -18, 4, 0, 0],
  [4, -16, 63, 91, -18, 4, 0, 0],
  [4, -16, 60, 94, -18, 4, 0, 0],
  [3, -15, 58, 96, -18, 4, 0, 0],
  [4, -15, 55, 98, -18, 4, 0, 0],
  [3, -14, 52, 100, -17, 4, 0, 0],
  [3, -14, 50, 102, -17, 4, 0, 0],
  [3, -13, 47, 104, -17, 4, 0, 0],
  [3, -13, 45, 106, -17, 4, 0, 0],
  [3, -12, 42, 108, -16, 3, 0, 0],
  [3, -11, 40, 109, -16, 3, 0, 0],
  [3, -11, 37, 111, -15, 3, 0, 0],
  [2, -10, 35, 113, -15, 3, 0, 0],
  [3, -10, 32, 114, -14, 3, 0, 0],
  [2, -9, 29, 116, -13, 3, 0, 0],
  [2, -8, 27, 117, -13, 3, 0, 0],
  [2, -8, 25, 119, -12, 2, 0, 0],
  [2, -7, 22, 120, -11, 2, 0, 0],
  [1, -6, 20, 121, -10, 2, 0, 0],
  [1, -6, 18, 122, -9, 2, 0, 0],
  [1, -5, 15, 123, -8, 2, 0, 0],
  [1, -4, 13, 124, -7, 1, 0, 0],
  [1, -4, 11, 125, -6, 1, 0, 0],
  [1, -3, 8, 126, -5, 1, 0, 0],
  [1, -2, 6, 126, -4, 1, 0, 0],
  [0, -1, 4, 127, -3, 1, 0, 0],
  [0, 0, 2, 127, -1, 0, 0, 0],

  [0, 0, 0, 127, 1, 0, 0, 0],
  [0, 0, -1, 127, 2, 0, 0, 0],
  [0, 1, -3, 127, 4, -2, 1, 0],
  [0, 1, -5, 127, 6, -2, 1, 0],
  [0, 2, -6, 126, 8, -3, 1, 0],
  [-1, 2, -7, 126, 11, -4, 2, -1],
  [-1, 3, -8, 125, 13, -5, 2, -1],
  [-1, 3, -10, 124, 16, -6, 3, -1],
  [-1, 4, -11, 123, 18, -7, 3, -1],
  [-1, 4, -12, 122, 20, -7, 3, -1],
  [-1, 4, -13, 121, 23, -8, 3, -1],
  [-2, 5, -14, 120, 25, -9, 4, -1],
  [-1, 5, -15, 119, 27, -10, 4, -1],
  [-1, 5, -16, 118, 30, -11, 4, -1],
  [-2, 6, -17, 116, 33, -12, 5, -1],
  [-2, 6, -17, 114, 35, -12, 5, -1],
  [-2, 6, -18, 113, 38, -13, 5, -1],
  [-2, 7, -19, 111, 41, -14, 6, -2],
  [-2, 7, -19, 110, 43, -15, 6, -2],
  [-2, 7, -20, 108, 46, -15, 6, -2],
  [-2, 7, -20, 106, 49, -16, 6, -2],
  [-2, 7, -21, 104, 51, -16, 7, -2],
  [-2, 7, -21, 102, 54, -17, 7, -2],
  [-2, 8, -21, 100, 56, -18, 7, -2],
  [-2, 8, -22, 98, 59, -18, 7, -2],
  [-2, 8, -22, 96, 62, -19, 7, -2],
  [-2, 8, -22, 94, 64, -19, 7, -2],
  [-2, 8, -22, 91, 67, -20, 8, -2],
  [-2, 8, -22, 89, 69, -20, 8, -2],
  [-2, 8, -22, 87, 72, -21, 8, -2],
  [-2, 8, -21, 84, 74, -21, 8, -2],
  [-2, 8, -22, 82, 77, -21, 8, -2],
  [-2, 8, -21, 79, 79, -21, 8, -2],
  [-2, 8, -21, 77, 82, -22, 8, -2],
  [-2, 8, -21, 74, 84, -21, 8, -2],
  [-2, 8, -21, 72, 87, -22, 8, -2],
  [-2, 8, -20, 69, 89, -22, 8, -2],
  [-2, 8, -20, 67, 91, -22, 8, -2],
  [-2, 7, -19, 64, 94, -22, 8, -2],
  [-2, 7, -19, 62, 96, -22, 8, -2],
  [-2, 7, -18, 59, 98, -22, 8, -2],
  [-2, 7, -18, 56, 100, -21, 8, -2],
  [-2, 7, -17, 54, 102, -21, 7, -2],
  [-2, 7, -16, 51, 104, -21, 7, -2],
  [-2, 6, -16, 49, 106, -20, 7, -2],
  [-2, 6, -15, 46, 108, -20, 7, -2],
  [-2, 6, -15, 43, 110, -19, 7, -2],
  [-2, 6, -14, 41, 111, -19, 7, -2],
  [-1, 5, -13, 38, 113, -18, 6, -2],
  [-1, 5, -12, 35, 114, -17, 6, -2],
  [-1, 5, -12, 33, 116, -17, 6, -2],
  [-1, 4, -11, 30, 118, -16, 5, -1],
  [-1, 4, -10, 27, 119, -15, 5, -1],
  [-1, 4, -9, 25, 120, -14, 5, -2],
  [-1, 3, -8, 23, 121, -13, 4, -1],
  [-1, 3, -7, 20, 122, -12, 4, -1],
  [-1, 3, -7, 18, 123, -11, 4, -1],
  [-1, 3, -6, 16, 124, -10, 3, -1],
  [-1, 2, -5, 13, 125, -8, 3, -1],
  [-1, 2, -4, 11, 126, -7, 2, -1],
  [0, 1, -3, 8, 126, -6, 2, 0],
  [0, 1, -2, 6, 127, -5, 1, 0],
  [0, 1, -2, 4, 127, -3, 1, 0],
  [0, 0, 0, 2, 127, -1, 0, 0],

  [0, 0, 0, 1, 127, 0, 0, 0],
  [0, 0, 0, -1, 127, 2, 0, 0],
  [0, 0, 1, -3, 127, 4, -1, 0],
  [0, 0, 1, -4, 126, 6, -2, 1],
  [0, 0, 1, -5, 126, 8, -3, 1],
  [0, 0, 1, -6, 125, 11, -4, 1],
  [0, 0, 1, -7, 124, 13, -4, 1],
  [0, 0, 2, -8, 123, 15, -5, 1],
  [0, 0, 2, -9, 122, 18, -6, 1],
  [0, 0, 2, -10, 121, 20, -6, 1],
  [0, 0, 2, -11, 120, 22, -7, 2],
  [0, 0, 2, -12, 119, 25, -8, 2],
  [0, 0, 3, -13, 117, 27, -8, 2],
  [0, 0, 3, -13, 116, 29, -9, 2],
  [0, 0, 3, -14, 114, 32, -10, 3],
  [0, 0, 3, -15, 113, 35, -10, 2],
  [0, 0, 3, -15, 111, 37, -11, 3],
  [0, 0, 3, -16, 109, 40, -11, 3],
  [0, 0, 3, -16, 108, 42, -12, 3],
  [0, 0, 4, -17, 106, 45, -13, 3],
  [0, 0, 4, -17, 104, 47, -13, 3],
  [0, 0, 4, -17, 102, 50, -14, 3],
  [0, 0, 4, -17, 100, 52, -14, 3],
  [0, 0, 4, -18, 98, 55, -15, 4],
  [0, 0, 4, -18, 96, 58, -15, 3],
  [0, 0, 4, -18, 94, 60, -16, 4],
  [0, 0, 4, -18, 91, 63, -16, 4],
  [0, 0, 4, -18, 89, 65, -16, 4],
  [0, 0, 4, -18, 87, 68, -17, 4],
  [0, 0, 4, -18, 85, 70, -17, 4],
  [0, 0, 4, -18, 82, 73, -17, 4],
  [0, 0, 4, -18, 80, 75, -17, 4],
  [0, 0, 4, -18, 78, 78, -18, 4],
  [0, 0, 4, -17, 75, 80, -18, 4],
  [0, 0, 4, -17, 73, 82, -18, 4],
  [0, 0, 4, -17, 70, 85, -18, 4],
  [0, 0, 4, -17, 68, 87, -18, 4],
  [0, 0, 4, -16, 65, 89, -18, 4],
  [0, 0, 4, -16, 63, 91, -18, 4],
  [0, 0, 4, -16, 60, 94, -18, 4],
  [0, 0, 3, -15, 58, 96, -18, 4],
  [0, 0, 4, -15, 55, 98, -18, 4],
  [0, 0, 3, -14, 52, 100, -17, 4],
  [0, 0, 3, -14, 50, 102, -17, 4],
  [0, 0, 3, -13, 47, 104, -17, 4],
  [0, 0, 3, -13, 45, 106, -17, 4],
  [0, 0, 3, -12, 42, 108, -16, 3],
  [0, 0, 3, -11, 40, 109, -16, 3],
  [0, 0, 3, -11, 37, 111, -15, 3],
  [0, 0, 2, -10, 35, 113, -15, 3],
  [0, 0, 3, -10, 32, 114, -14, 3],
  [0, 0, 2, -9, 29, 116, -13, 3],
  [0, 0, 2, -8, 27, 117, -13, 3],
  [0, 0, 2, -8, 25, 119, -12, 2],
  [0, 0, 2, -7, 22, 120, -11, 2],
  [0, 0, 1, -6, 20, 121, -10, 2],
  [0, 0, 1, -6, 18, 122, -9, 2],
  [0, 0, 1, -5, 15, 123, -8, 2],
  [0, 0, 1, -4, 13, 124, -7, 1],
  [0, 0, 1, -4, 11, 125, -6, 1],
  [0, 0, 1, -3, 8, 126, -5, 1],
  [0, 0, 1, -2, 6, 126, -4, 1],
  [0, 0, 0, -1, 4, 127, -3, 1],
  [0, 0, 0, 0, 2, 127, -1, 0],

  [0, 0, 0, 0, 2, 127, -1, 0],
];

const Div_Lut = [
  16384, 16320, 16257, 16194, 16132, 16070, 16009, 15948, 15888, 15828, 15768, 15709, 15650, 15592, 15534, 15477, 15420, 15364, 15308, 15252, 15197, 15142, 15087, 15033, 14980,
  14926, 14873, 14821, 14769, 14717, 14665, 14614, 14564, 14513, 14463, 14413, 14364, 14315, 14266, 14218, 14170, 14122, 14075, 14028, 13981, 13935, 13888, 13843, 13797, 13752,
  13707, 13662, 13618, 13574, 13530, 13487, 13443, 13400, 13358, 13315, 13273, 13231, 13190, 13148, 13107, 13066, 13026, 12985, 12945, 12906, 12866, 12827, 12788, 12749, 12710,
  12672, 12633, 12596, 12558, 12520, 12483, 12446, 12409, 12373, 12336, 12300, 12264, 12228, 12193, 12157, 12122, 12087, 12053, 12018, 11984, 11950, 11916, 11882, 11848, 11815,
  11782, 11749, 11716, 11683, 11651, 11619, 11586, 11555, 11523, 11491, 11460, 11429, 11398, 11367, 11336, 11305, 11275, 11245, 11215, 11185, 11155, 11125, 11096, 11067, 11038,
  11009, 10980, 10951, 10923, 10894, 10866, 10838, 10810, 10782, 10755, 10727, 10700, 10673, 10645, 10618, 10592, 10565, 10538, 10512, 10486, 10460, 10434, 10408, 10382, 10356,
  10331, 10305, 10280, 10255, 10230, 10205, 10180, 10156, 10131, 10107, 10082, 10058, 10034, 10010, 9986, 9963, 9939, 9916, 9892, 9869, 9846, 9823, 9800, 9777, 9754, 9732, 9709,
  9687, 9664, 9642, 9620, 9598, 9576, 9554, 9533, 9511, 9489, 9468, 9447, 9425, 9404, 9383, 9362, 9341, 9321, 9300, 9279, 9259, 9239, 9218, 9198, 9178, 9158, 9138, 9118, 9098,
  9079, 9059, 9039, 9020, 9001, 8981, 8962, 8943, 8924, 8905, 8886, 8867, 8849, 8830, 8812, 8793, 8775, 8756, 8738, 8720, 8702, 8684, 8666, 8648, 8630, 8613, 8595, 8577, 8560,
  8542, 8525, 8508, 8490, 8473, 8456, 8439, 8422, 8405, 8389, 8372, 8355, 8339, 8322, 8306, 8289, 8273, 8257, 8240, 8224, 8208, 8192,
];

const Wedge_Codebook = [
  [
    [WEDGE_OBLIQUE27, 4, 4],
    [WEDGE_OBLIQUE63, 4, 4],
    [WEDGE_OBLIQUE117, 4, 4],
    [WEDGE_OBLIQUE153, 4, 4],
    [WEDGE_HORIZONTAL, 4, 2],
    [WEDGE_HORIZONTAL, 4, 4],
    [WEDGE_HORIZONTAL, 4, 6],
    [WEDGE_VERTICAL, 4, 4],
    [WEDGE_OBLIQUE27, 4, 2],
    [WEDGE_OBLIQUE27, 4, 6],
    [WEDGE_OBLIQUE153, 4, 2],
    [WEDGE_OBLIQUE153, 4, 6],
    [WEDGE_OBLIQUE63, 2, 4],
    [WEDGE_OBLIQUE63, 6, 4],
    [WEDGE_OBLIQUE117, 2, 4],
    [WEDGE_OBLIQUE117, 6, 4],
  ],
  [
    [WEDGE_OBLIQUE27, 4, 4],
    [WEDGE_OBLIQUE63, 4, 4],
    [WEDGE_OBLIQUE117, 4, 4],
    [WEDGE_OBLIQUE153, 4, 4],
    [WEDGE_VERTICAL, 2, 4],
    [WEDGE_VERTICAL, 4, 4],
    [WEDGE_VERTICAL, 6, 4],
    [WEDGE_HORIZONTAL, 4, 4],
    [WEDGE_OBLIQUE27, 4, 2],
    [WEDGE_OBLIQUE27, 4, 6],
    [WEDGE_OBLIQUE153, 4, 2],
    [WEDGE_OBLIQUE153, 4, 6],
    [WEDGE_OBLIQUE63, 2, 4],
    [WEDGE_OBLIQUE63, 6, 4],
    [WEDGE_OBLIQUE117, 2, 4],
    [WEDGE_OBLIQUE117, 6, 4],
  ],
  [
    [WEDGE_OBLIQUE27, 4, 4],
    [WEDGE_OBLIQUE63, 4, 4],
    [WEDGE_OBLIQUE117, 4, 4],
    [WEDGE_OBLIQUE153, 4, 4],
    [WEDGE_HORIZONTAL, 4, 2],
    [WEDGE_HORIZONTAL, 4, 6],
    [WEDGE_VERTICAL, 2, 4],
    [WEDGE_VERTICAL, 6, 4],
    [WEDGE_OBLIQUE27, 4, 2],
    [WEDGE_OBLIQUE27, 4, 6],
    [WEDGE_OBLIQUE153, 4, 2],
    [WEDGE_OBLIQUE153, 4, 6],
    [WEDGE_OBLIQUE63, 2, 4],
    [WEDGE_OBLIQUE63, 6, 4],
    [WEDGE_OBLIQUE117, 2, 4],
    [WEDGE_OBLIQUE117, 6, 4],
  ],
];
