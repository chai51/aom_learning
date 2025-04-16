import { Array2D, Clip1, Clip3, clone, integer, Round2 } from "../Conventions";
import { FILTER_BITS, MI_SIZE, MI_SIZE_LOG2, SGRPROJ_MTABLE_BITS, SGRPROJ_PRJ_BITS, SGRPROJ_RECIP_BITS, SGRPROJ_RST_BITS, SGRPROJ_SGR_BITS } from "../define";
import { AV1Decoder } from "../SyntaxStructures/Obu";
import { FRAME_RESTORATION_TYPE } from "../SyntaxStructures/Semantics";

/**
 * 7.17 Loop restoration process
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#loop-restoration-process)
 */
export class LoopRestoration {
  LrFrame: number[][][] = [];
  private StripeStartY!: number ;
  private StripeEndY!: number;
  private PlaneEndX!: number;
  private PlaneEndY!: number;

  private decoder: AV1Decoder;
  constructor(d: AV1Decoder) {
    this.decoder = d;
  }

  /**
   * 7.17 Loop restoration process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#loop-restoration-process)
   */
  loop_restoration() {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const fs = fh.frame_size;
    const fswr = fh.frame_size_with_refs;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const lp = tg.lr_params;
    const dfw = this.decoder.decodeFrameWrapup;

    this.LrFrame = clone(dfw.UpscaledCdefFrame);

    if (lp.UsesLr == 0) {
      return;
    }

    for (let y = 0; y < fs.FrameHeight; y += MI_SIZE) {
      for (let x = 0; x < fswr.UpscaledWidth; x += MI_SIZE) {
        for (let plane = 0; plane < cc.NumPlanes; plane++) {
          if (lp.FrameRestorationType[plane] != FRAME_RESTORATION_TYPE.RESTORE_NONE) {
            let row = y >> MI_SIZE_LOG2;
            let col = x >> MI_SIZE_LOG2;
            this.loop_restore_block(plane, row, col);
          }
        }
      }
    }
  }

  /**
   * 7.17.1 Loop restore block process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#loop-restore-block-process)
   */
  loop_restore_block(plane: number, row: number, col: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const fs = fh.frame_size;
    const fswr = fh.frame_size_with_refs;
    const tgo = this.decoder.tileGroupObu;
    const tg = tgo.titleGroup;
    const lp = tg.lr_params;

    let lumaY = row * MI_SIZE;
    let stripeNum = integer((lumaY + 8) / 64);

    let subX = cc.subsampling_x;
    let subY = cc.subsampling_y;
    if (plane == 0) {
      subX = 0;
      subY = 0;
    }

    this.StripeStartY = (-8 + stripeNum * 64) >> subY;
    this.StripeEndY = this.StripeStartY + (64 >> subY) - 1;
    let unitSize = lp.LoopRestorationSize[plane];
    let unitRows = tgo.count_units_in_frame(unitSize, Round2(fs.FrameHeight, subY));
    let unitCols = tgo.count_units_in_frame(unitSize, Round2(fswr.UpscaledWidth, subX));
    let unitRow = Math.min(unitRows - 1, integer(((row * MI_SIZE + 8) >> subY) / unitSize));
    let unitCol = Math.min(unitCols - 1, integer(((col * MI_SIZE) >> subX) / unitSize));

    this.PlaneEndX = Round2(fswr.UpscaledWidth, subX) - 1;
    this.PlaneEndY = Round2(fs.FrameHeight, subY) - 1;
    let x = (col * MI_SIZE) >> subX;
    let y = (row * MI_SIZE) >> subY;
    let w = Math.min(MI_SIZE >> subX, this.PlaneEndX - x + 1);
    let h = Math.min(MI_SIZE >> subY, this.PlaneEndY - y + 1);
    let rType = lp.LrType[plane][unitRow][unitCol];

    if (rType == FRAME_RESTORATION_TYPE.RESTORE_WIENER) {
      this.wiener_filter(plane, unitRow, unitCol, x, y, w, h);
    } else if (rType == FRAME_RESTORATION_TYPE.RESTORE_SGRPROJ) {
      this.self_guided_filter(plane, unitRow, unitCol, x, y, w, h);
    } else {
    }
  }

  /**
   * 7.17.2 Self guided filter process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#self-guided-filter-process)
   */
  self_guided_filter(plane: number, unitRow: number, unitCol: number, x: number, y: number, w: number, h: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const lp = tg.lr_params;
    const dfw = this.decoder.decodeFrameWrapup;

    // 1.
    let set = lp.LrSgrSet[plane][unitRow][unitCol];
    // 2.
    let pass = 0;
    // 3.
    let flt0 = this.box_filter(plane, x, y, w, h, set, pass);
    // 4.
    pass = 1;
    // 5.
    let flt1 = this.box_filter(plane, x, y, w, h, set, pass);

    let w0 = lp.LrSgrXqd[plane][unitRow][unitCol][0];
    let w1 = lp.LrSgrXqd[plane][unitRow][unitCol][1];
    let w2 = (1 << SGRPROJ_PRJ_BITS) - w0 - w1;
    let r0 = Sgr_Params[set][0];
    let r1 = Sgr_Params[set][2];
    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        let u = dfw.UpscaledCdefFrame[plane][y + i][x + j] << SGRPROJ_RST_BITS;
        let v = w1 * u;
        if (r0) {
          v += w0 * flt0[i][j];
        } else v += w0 * u;
        if (r1) {
          v += w2 * flt1[i][j];
        } else {
          v += w2 * u;
        }
        let s = Round2(v, SGRPROJ_RST_BITS + SGRPROJ_PRJ_BITS);
        this.LrFrame[plane][y + i][x + j] = Clip1(s, cc.BitDepth);
      }
    }
  }

  /**
   * 7.17.3 Box filter process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#box-filter-process)
   */
  box_filter(plane: number, x: number, y: number, w: number, h: number, set: number, pass: number): number[][] {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const dfw = this.decoder.decodeFrameWrapup;

    let r = Sgr_Params[set][pass * 2 + 0];
    if (r == 0) {
      return null as any;
    }

    let eps = Sgr_Params[set][pass * 2 + 1];

    let n = (2 * r + 1) * (2 * r + 1);
    let n2e = n * n * eps;
    let s = integer(((1 << SGRPROJ_MTABLE_BITS) + integer(n2e / 2)) / n2e);
    let A = Array2D<number>(null, { begin: -1, end: h + 1 });
    let B = Array2D<number>(null, { begin: -1, end: h + 1 });
    for (let i = -1; i < h + 1; i++) {
      for (let j = -1; j < w + 1; j++) {
        let a = 0;
        let b = 0;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            let c = this.get_source_sample(plane, x + j + dx, y + i + dy);
            a += c * c;
            b += c;
          }
        }
        a = Round2(a, 2 * (cc.BitDepth - 8));
        let d = Round2(b, cc.BitDepth - 8);
        let p = Math.max(0, a * n - d * d);
        let z = Round2(p * s, SGRPROJ_MTABLE_BITS);
        let a2: number;
        if (z >= 255) {
          a2 = 256;
        } else if (z == 0) {
          a2 = 1;
        } else {
          a2 = integer(((z << SGRPROJ_SGR_BITS) + integer(z / 2)) / (z + 1));
        }
        let oneOverN = integer(((1 << SGRPROJ_RECIP_BITS) + integer(n / 2)) / n);
        let b2 = ((1 << SGRPROJ_SGR_BITS) - a2) * b * oneOverN;
        A[i][j] = a2;
        B[i][j] = Round2(b2, SGRPROJ_RECIP_BITS);
      }
    }

    let F = Array2D<number>(null, h);
    for (let i = 0; i < h; i++) {
      let shift = 5;
      if (pass == 0 && i & 1) {
        shift = 4;
      }
      for (let j = 0; j < w; j++) {
        let a = 0;
        let b = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            let weight: number;
            if (pass == 0) {
              if ((i + dy) & 1) {
                weight = dx == 0 ? 6 : 5;
              } else {
                weight = 0;
              }
            } else {
              weight = dx == 0 || dy == 0 ? 4 : 3;
            }
            a += weight * A[i + dy][j + dx];
            b += weight * B[i + dy][j + dx];
          }
        }
        let v = a * dfw.UpscaledCdefFrame[plane][y + i][x + j] + b;
        F[i][j] = Round2(v, SGRPROJ_SGR_BITS + shift - SGRPROJ_RST_BITS);
      }
    }
    return F;
  }

  /**
   * 7.17.4 Wiener filter process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#wiener-filter-process)
   */
  wiener_filter(plane: number, unitRow: number, unitCol: number, x: number, y: number, w: number, h: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const lp = tg.lr_params;
    const p = this.decoder.prediction;

    p.rounding_variables_derivation(0);
    let vfilter = this.wiener_coefficient(lp.LrWiener[plane][unitRow][unitCol][0]);
    let hfilter = this.wiener_coefficient(lp.LrWiener[plane][unitRow][unitCol][1]);

    let offset = 1 << (cc.BitDepth + FILTER_BITS - p.InterRound0 - 1);
    let limit = (1 << (cc.BitDepth + 1 + FILTER_BITS - p.InterRound0)) - 1;
    let intermediate = Array2D<number>(null, h + 6);
    for (let r = 0; r < h + 6; r++) {
      for (let c = 0; c < w; c++) {
        let s = 0;
        for (let t = 0; t < 7; t++) {
          s += hfilter[t] * this.get_source_sample(plane, x + c + t - 3, y + r - 3);
        }
        let v = Round2(s, p.InterRound0);
        intermediate[r][c] = Clip3(-offset, limit - offset, v);
      }
    }

    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        let s = 0;
        for (let t = 0; t < 7; t++) {
          s += vfilter[t] * intermediate[r + t][c];
        }
        let v = Round2(s, p.InterRound1);
        this.LrFrame[plane][y + r][x + c] = Clip1(v, cc.BitDepth);
      }
    }
  }

  /**
   * 7.17.5 Wiener coefficient process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#wiener-coefficient-process)
   */
  wiener_coefficient(coeff: number[]) {
    let filter: number[] = [];
    filter[3] = 128;
    for (let i = 0; i < 3; i++) {
      let c = coeff[i];
      filter[i] = c;
      filter[6 - i] = c;
      filter[3] -= 2 * c;
    }
    return filter;
  }

  /**
   * 7.17.6 Get source sample process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#get-source-sample-process)
   */
  get_source_sample(plane: number, x: number, y: number) {
    const dfw = this.decoder.decodeFrameWrapup;

    x = Math.min(this.PlaneEndX, x);
    x = Math.max(0, x);
    y = Math.min(this.PlaneEndY, y);
    y = Math.max(0, y);
    if (y < this.StripeStartY) {
      y = Math.max(this.StripeStartY - 2, y);
      return dfw.UpscaledCurrFrame[plane][y][x];
    } else if (y > this.StripeEndY) {
      y = Math.min(this.StripeEndY + 2, y);
      return dfw.UpscaledCurrFrame[plane][y][x];
    } else {
      return dfw.UpscaledCdefFrame[plane][y][x];
    }
  }
}

export const Sgr_Params = [
  [2, 12, 1, 4],
  [2, 15, 1, 6],
  [2, 18, 1, 8],
  [2, 21, 1, 9],
  [2, 24, 1, 10],
  [2, 29, 1, 11],
  [2, 36, 1, 12],
  [2, 45, 1, 13],
  [2, 56, 1, 14],
  [2, 68, 1, 15],
  [0, 0, 1, 5],
  [0, 0, 1, 8],
  [0, 0, 1, 11],
  [0, 0, 1, 14],
  [2, 30, 0, 0],
  [2, 75, 0, 0],
];
