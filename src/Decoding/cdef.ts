import { Array2D, Clip3, FloorLog2, integer } from "../Conventions";
import { AV1Decoder } from "../SyntaxStructures/Obu";

import { SUB_SIZE } from "../SyntaxStructures/Semantics";

import { Num_4x4_Blocks_Wide } from "../AdditionalTables/ConversionTables";
import { MI_SIZE, MI_SIZE_LOG2 } from "../define";

/**
 * 7.15 CDEF process
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#cdef-process)
 */
export class CDEF {
  private CdefAvailable: number = undefined as any;

  private decoder: AV1Decoder;
  constructor(d: AV1Decoder) {
    this.decoder = d;
  }

  /**
   * 7.15 CDEF process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#cdef-process)
   */
  cdef() {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const rc = tg.cdef;

    let step4 = Num_4x4_Blocks_Wide[SUB_SIZE.BLOCK_8X8];
    let cdefSize4 = Num_4x4_Blocks_Wide[SUB_SIZE.BLOCK_64X64];
    let cdefMask4 = ~(cdefSize4 - 1);
    for (let r = 0; r < cis.MiRows; r += step4) {
      for (let c = 0; c < cis.MiCols; c += step4) {
        let baseR = r & cdefMask4;
        let baseC = c & cdefMask4;
        let idx = rc.cdef_idx[baseR][baseC];
        this.cdef_block(r, c, idx);
      }
    }
  }

  /**
   * 7.15.1 CDEF block process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#cdef-block-process)
   */
  cdef_block(r: number, c: number, idx: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const cp = tg.cdef_params;
    const dfw = this.decoder.decodeFrameWrapup;
    const p = this.decoder.prediction;

    let startY = r * MI_SIZE;
    let endY = startY + MI_SIZE * 2;
    let startX = c * MI_SIZE;
    let endX = startX + MI_SIZE * 2;
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        dfw.CdefFrame[0][y][x] = p.CurrFrame[0][y][x];
      }
    }
    if (cc.NumPlanes > 1) {
      startY >>= cc.subsampling_y;
      endY >>= cc.subsampling_y;
      startX >>= cc.subsampling_x;
      endX >>= cc.subsampling_x;
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          dfw.CdefFrame[1][y][x] = p.CurrFrame[1][y][x];
          dfw.CdefFrame[2][y][x] = p.CurrFrame[2][y][x];
        }
      }
    }

    if (idx == -1) {
      return;
    }
    let coeffShift = cc.BitDepth - 8;
    let skip = db.Skips[r][c] && db.Skips[r + 1][c] && db.Skips[r][c + 1] && db.Skips[r + 1][c + 1];

    if (skip == 0) {
      let { yDir, var1 } = this.cdef_direction(r, c);
      // 1.
      let priStr = cp.cdef_y_pri_strength[idx] << coeffShift;
      // 2.
      let secStr = cp.cdef_y_sec_strength[idx] << coeffShift;
      // 3.
      let dir = priStr == 0 ? 0 : yDir;
      // 4.
      let varStr = var1 >> 6 ? Math.min(FloorLog2(var1 >> 6), 12) : 0;
      // 5.
      priStr = var1 ? (priStr * (4 + varStr) + 8) >> 4 : 0;
      // 6.
      let damping = cp.CdefDamping + coeffShift;
      // 7.
      this.cdef_filter(0, r, c, priStr, secStr, damping, dir);
      // 8.
      if (cc.NumPlanes == 1) {
        return;
      }
      // 9.
      priStr = cp.cdef_uv_pri_strength[idx] << coeffShift;
      // 10.
      secStr = cp.cdef_uv_sec_strength[idx] << coeffShift;
      // 11.
      dir = priStr == 0 ? 0 : Cdef_Uv_Dir[cc.subsampling_x][cc.subsampling_y][yDir];
      // 12.
      damping = cp.CdefDamping + coeffShift - 1;
      // 13.
      this.cdef_filter(1, r, c, priStr, secStr, damping, dir);
      // 14.
      this.cdef_filter(2, r, c, priStr, secStr, damping, dir);
    }
  }

  /**
   * 7.15.2 CDEF direction process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#cdef-direction-process)
   */
  cdef_direction(r: number, c: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const p = this.decoder.prediction;

    const Div_Table = [0, 840, 420, 280, 210, 168, 140, 120, 105];

    let cost: number[] = [];
    let partial = Array2D(8);
    for (let i = 0; i < 8; i++) {
      cost[i] = 0;
      for (let j = 0; j < 15; j++) {
        partial[i][j] = 0;
      }
    }
    let bestCost = 0;
    let yDir = 0;
    let x0 = c << MI_SIZE_LOG2;
    let y0 = r << MI_SIZE_LOG2;
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        let x = (p.CurrFrame[0][y0 + i][x0 + j] >> (cc.BitDepth - 8)) - 128;
        partial[0][i + j] += x;
        partial[1][i + integer(j / 2)] += x;
        partial[2][i] += x;
        partial[3][3 + i - integer(j / 2)] += x;
        partial[4][7 + i - j] += x;
        partial[5][3 - integer(i / 2) + j] += x;
        partial[6][j] += x;
        partial[7][integer(i / 2) + j] += x;
      }
    }
    for (let i = 0; i < 8; i++) {
      cost[2] += partial[2][i] * partial[2][i];
      cost[6] += partial[6][i] * partial[6][i];
    }
    cost[2] *= Div_Table[8];
    cost[6] *= Div_Table[8];
    for (let i = 0; i < 7; i++) {
      cost[0] += (partial[0][i] * partial[0][i] + partial[0][14 - i] * partial[0][14 - i]) * Div_Table[i + 1];
      cost[4] += (partial[4][i] * partial[4][i] + partial[4][14 - i] * partial[4][14 - i]) * Div_Table[i + 1];
    }
    cost[0] += partial[0][7] * partial[0][7] * Div_Table[8];
    cost[4] += partial[4][7] * partial[4][7] * Div_Table[8];
    for (let i = 1; i < 8; i += 2) {
      for (let j = 0; j < 4 + 1; j++) {
        cost[i] += partial[i][3 + j] * partial[i][3 + j];
      }
      cost[i] *= Div_Table[8];
      for (let j = 0; j < 4 - 1; j++) {
        cost[i] += (partial[i][j] * partial[i][j] + partial[i][10 - j] * partial[i][10 - j]) * Div_Table[2 * j + 2];
      }
    }
    for (let i = 0; i < 8; i++) {
      if (cost[i] > bestCost) {
        bestCost = cost[i];
        yDir = i;
      }
    }
    let var1 = (bestCost - cost[(yDir + 4) & 7]) >> 10;
    return { yDir, var1 };
  }

  /**
   * 7.15.3 CDEF filter process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#cdef-filter-process)
   */
  cdef_filter(plane: number, r: number, c: number, priStr: number, secStr: number, damping: number, dir: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const dfw = this.decoder.decodeFrameWrapup;
    const p = this.decoder.prediction;

    let coeffShift = cc.BitDepth - 8;

    let subX = plane > 0 ? cc.subsampling_x : 0;
    let subY = plane > 0 ? cc.subsampling_y : 0;
    let x0 = (c * MI_SIZE) >> subX;
    let y0 = (r * MI_SIZE) >> subY;
    let w = 8 >> subX;
    let h = 8 >> subY;
    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        let sum = 0;
        let x = p.CurrFrame[plane][y0 + i][x0 + j];
        let max = x;
        let min = x;
        for (let k = 0; k < 2; k++) {
          for (let sign = -1; sign <= 1; sign += 2) {
            let p = this.cdef_get_at(plane, x0, y0, i, j, dir, k, sign, subX, subY);
            if (this.CdefAvailable) {
              sum += Cdef_Pri_Taps[(priStr >> coeffShift) & 1][k] * this.constrain(p - x, priStr, damping);
              max = Math.max(p, max);
              min = Math.min(p, min);
            }
            for (let dirOff = -2; dirOff <= 2; dirOff += 4) {
              let s = this.cdef_get_at(plane, x0, y0, i, j, (dir + dirOff) & 7, k, sign, subX, subY);
              if (this.CdefAvailable) {
                sum += Cdef_Sec_Taps[(priStr >> coeffShift) & 1][k] * this.constrain(s - x, secStr, damping);
                max = Math.max(s, max);
                min = Math.min(s, min);
              }
            }
          }
        }
        dfw.CdefFrame[plane][y0 + i][x0 + j] = Clip3(min, max, x + ((8 + sum - Number(sum < 0)) >> 4));
      }
    }
  }

  /**
   * 7.15.2 7.15.3 CDEF filter process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#cdef-filter-process)
   */
  private constrain(diff: number, threshold: number, damping: number) {
    if (!threshold) return 0;
    let dampingAdj = Math.max(0, damping - FloorLog2(threshold));
    let sign = diff < 0 ? -1 : 1;
    return sign * Clip3(0, Math.abs(diff), threshold - (Math.abs(diff) >> dampingAdj));
  }

  /**
   * 7.15.2 7.15.3 CDEF filter process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#cdef-filter-process)
   */
  private cdef_get_at(plane: number, x0: number, y0: number, i: number, j: number, dir: number, k: number, sign: number, subX: number, subY: number) {
    const p = this.decoder.prediction;

    let y = y0 + i + sign * Cdef_Directions[dir][k][0];
    let x = x0 + j + sign * Cdef_Directions[dir][k][1];
    let candidateR = (y << subY) >> MI_SIZE_LOG2;
    let candidateC = (x << subX) >> MI_SIZE_LOG2;
    if (this.decoder.tileGroupObu.is_inside_filter_region(candidateR, candidateC)) {
      this.CdefAvailable = 1;
      return p.CurrFrame[plane][y][x];
    } else {
      this.CdefAvailable = 0;
      return 0;
    }
  }
}

const Cdef_Uv_Dir = [
  [
    [0, 1, 2, 3, 4, 5, 6, 7],
    [1, 2, 2, 2, 3, 4, 6, 0],
  ],
  [
    [7, 0, 2, 4, 5, 6, 6, 6],
    [0, 1, 2, 3, 4, 5, 6, 7],
  ],
];

const Cdef_Directions = [
  [
    [-1, 1],
    [-2, 2],
  ],
  [
    [0, 1],
    [-1, 2],
  ],
  [
    [0, 1],
    [0, 2],
  ],
  [
    [0, 1],
    [1, 2],
  ],
  [
    [1, 1],
    [2, 2],
  ],
  [
    [1, 0],
    [2, 1],
  ],
  [
    [1, 0],
    [2, 0],
  ],
  [
    [1, 0],
    [2, -1],
  ],
];

const Cdef_Pri_Taps = [
  [4, 2],
  [3, 3],
];
const Cdef_Sec_Taps = [
  [2, 1],
  [2, 1],
];
