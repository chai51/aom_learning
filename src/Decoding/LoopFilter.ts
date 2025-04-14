import { Clip3, integer, Round2 } from "../Conventions";
import { AV1Decoder } from "../SyntaxStructures/Obu";

import { REF_FRAME, Y_MODE } from "../SyntaxStructures/Semantics";

import { Block_Height, Block_Width, Tx_Height, Tx_Width } from "../AdditionalTables/ConversionTables";
import { MAX_LOOP_FILTER, MI_SIZE, SEG_LVL_ALT_LF_Y_V } from "../define";

/**
 * 7.14 Loop filter process
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#loop-filter-process)
 */
export class LoopFilter {
  private F: number[];

  private decoder: AV1Decoder;
  constructor(d: AV1Decoder) {
    this.F = [];

    this.decoder = d;
  }

  /**
   * 7.14.1 General
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#general-15)
   */
  loop_filter() {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const lfp = fh.loop_filter_params;

    for (let plane = 0; plane < cc.NumPlanes; plane++) {
      if (plane == 0 || lfp.loop_filter_level[1 + plane]) {
        for (let pass = 0; pass < 2; pass++) {
          let rowStep = plane == 0 ? 1 : 1 << cc.subsampling_y;
          let colStep = plane == 0 ? 1 : 1 << cc.subsampling_x;
          for (let row = 0; row < cis.MiRows; row += rowStep)
            for (let col = 0; col < cis.MiCols; col += colStep) {
              this.loop_filter_edge(plane, pass, row, col);
            }
        }
      }
    }
  }

  /**
   * 7.14.2 Edge loop filter process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#edge-loop-filter-process)
   */
  loop_filter_edge(plane: number, pass: number, row: number, col: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const fs = fh.frame_size;
    const tgo = this.decoder.tileGroupObu;
    const tg = tgo.titleGroup;
    const db = tg.decode_block;
    const tb = tg.transform_block;

    let subX = cc.subsampling_x;
    let subY = cc.subsampling_y;
    if (plane == 0) {
      subX = 0;
      subY = 0;
    }

    let dx = 0;
    let dy = 1;
    if (pass == 0) {
      dx = 1;
      dy = 0;
    }

    let x = col * MI_SIZE;
    let y = row * MI_SIZE;
    row = row | subY;
    col = col | subX;

    let onScreen = 1;
    if (x >= fs.FrameWidth) {
      onScreen = 0;
    } else if (y >= fs.FrameHeight) {
      onScreen = 0;
    } else if (pass == 0 && x == 0) {
      onScreen = 0;
    } else if (pass == 1 && y == 0) {
      onScreen = 0;
    }

    if (onScreen == 0) {
      return;
    }

    let xP = x >> subX;
    let yP = y >> subY;

    let prevRow = row - (dy << subY);
    let prevCol = col - (dx << subX);

    db.MiSize = db.MiSizes[row][col];
    let txSz = tb.LoopfilterTxSizes[plane][row >> subY][col >> subX];
    let planeSize = tgo.get_plane_residual_size(db.MiSize, plane);
    let skip = db.Skips[row][col];
    let isIntra = Number(db.RefFrames[row][col][0] <= REF_FRAME.INTRA_FRAME);
    let prevTxSz = tb.LoopfilterTxSizes[plane][prevRow >> subY][prevCol >> subX];

    let isBlockEdge = 0;
    if (pass == 0 && xP % Block_Width[planeSize] == 0) {
      isBlockEdge = 1;
    } else if (pass == 1 && yP % Block_Height[planeSize] == 0) {
      isBlockEdge = 1;
    }

    let isTxEdge = 0;
    if (pass == 0 && xP % Tx_Width[txSz] == 0) {
      isTxEdge = 1;
    } else if (pass == 1 && yP % Tx_Height[txSz] == 0) {
      isTxEdge = 1;
    }

    let applyFilter = 0;
    if (isTxEdge == 0) {
      applyFilter = 0;
    } else if (isBlockEdge == 1 || skip == 0 || isIntra == 1) {
      applyFilter = 1;
    }

    let filterSize = this.filter_size(txSz, prevTxSz, pass, plane);
    let { lvl, limit, blimit, thresh } = this.adaptive_filter_strength(row, col, plane, pass);

    if (lvl == 0) {
      let afs = this.adaptive_filter_strength(prevRow, prevCol, plane, pass);
      lvl = afs.lvl;
      limit = afs.limit;
      blimit = afs.blimit;
      thresh = afs.thresh;
    }

    for (let i = 0; i < MI_SIZE; i++) {
      if (applyFilter == 1 && lvl > 0) {
        this.sample_filtering(xP + dy * i, yP + dx * i, plane, limit, blimit, thresh, dx, dy, filterSize);
      }
    }
  }

  /**
   * 7.14.3 Filter size process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#filter-size-process)
   */
  filter_size(txSz: number, prevTxSz: number, pass: number, plane: number) {
    let baseSize: number;
    if (pass == 0) {
      baseSize = Math.min(Tx_Width[prevTxSz], Tx_Width[txSz]);
    } else {
      baseSize = Math.min(Tx_Height[prevTxSz], Tx_Height[txSz]);
    }

    let filterSize = Math.min(8, baseSize);
    if (plane == 0) {
      filterSize = Math.min(16, baseSize);
    }
    return filterSize;
  }

  /**
   * 7.14.4 Adaptive filter strength process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#adaptive-filter-strength-process)
   */
  adaptive_filter_strength(row: number, col: number, plane: number, pass: number) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const lfp = fh.loop_filter_params;
    const dlp = fh.delta_lf_params;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;

    let segment = db.SegmentIds[row][col];
    let ref = db.RefFrames[row][col][0];
    let mode = db.YModes[row][col];

    let modeType = 0;
    if (mode >= Y_MODE.NEARESTMV && mode != Y_MODE.GLOBALMV && mode != Y_MODE.GLOBAL_GLOBALMV) {
      modeType = 1;
    }

    let deltaLF;
    if (dlp.delta_lf_multi == 0) {
      deltaLF = db.DeltaLFs[row][col][0];
    } else {
      deltaLF = db.DeltaLFs[row][col][plane == 0 ? pass : plane + 1];
    }
    let lvl = this.adaptive_filter_strength_selection(segment, ref, modeType, deltaLF, plane, pass);

    let shift = 0;
    if (lfp.loop_filter_sharpness > 4) {
      shift = 2;
    } else if (lfp.loop_filter_sharpness > 0) {
      shift = 1;
    }
    let limit;
    if (lfp.loop_filter_sharpness > 0) {
      limit = Clip3(1, 9 - lfp.loop_filter_sharpness, lvl >> shift);
    } else {
      limit = Math.max(1, lvl >> shift);
    }
    let blimit = 2 * (lvl + 2) + limit;
    let thresh = lvl >> 4;

    return { lvl, limit, blimit, thresh };
  }

  /**
   * 7.14.5 Adaptive filter strength selection process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#adaptive-filter-strength-selection-process)
   */
  adaptive_filter_strength_selection(segment: number, ref: number, modeType: number, deltaLF: number, plane: number, pass: number) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const lfp = fh.loop_filter_params;
    const sp = fh.segmentation_params;

    let i = plane == 0 ? pass : plane + 1;
    let baseFilterLevel = Clip3(0, MAX_LOOP_FILTER, deltaLF + lfp.loop_filter_level[i]);

    // 1.
    let lvlSeg = baseFilterLevel;

    // 2.
    let feature = SEG_LVL_ALT_LF_Y_V + i;

    // 3.
    if (this.decoder.tileGroupObu.seg_feature_active_idx(segment, feature) == 1) {
      // a.
      lvlSeg = sp.FeatureData[segment][feature] + lvlSeg;
      // b.
      lvlSeg = Clip3(0, MAX_LOOP_FILTER, lvlSeg);
    }

    // 4.
    if (lfp.loop_filter_delta_enabled == 1) {
      // a.
      let nShift = lvlSeg >> 5;
      // b.
      if (ref == REF_FRAME.INTRA_FRAME) {
        lvlSeg = lvlSeg + (lfp.loop_filter_ref_deltas[REF_FRAME.INTRA_FRAME] << nShift);
      }
      // c.
      else if (ref != REF_FRAME.INTRA_FRAME) {
        lvlSeg = lvlSeg + (lfp.loop_filter_ref_deltas[ref] << nShift) + (lfp.loop_filter_mode_deltas[modeType] << nShift);
      }
      // d.
      lvlSeg = Clip3(0, MAX_LOOP_FILTER, lvlSeg);
    }

    // 5.
    return lvlSeg;
  }

  /**
   * 7.14.6 Sample filtering process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#sample-filtering-process)
   */
  sample_filtering(x: number, y: number, plane: number, limit: number, blimit: number, thresh: number, dx: number, dy: number, filterSize: number) {
    let { hevMask, filterMask, flatMask, flatMask2 } = this.filter_mask(x, y, plane, limit, blimit, thresh, dx, dy, filterSize);

    if (filterMask == 0) {
    } else if (filterSize == 4 || flatMask == 0) {
      this.narrow_filter(hevMask, x, y, plane, dx, dy);
    } else if (filterSize == 8 || flatMask2 == 0) {
      this.wide_filter(x, y, plane, dx, dy, 3);
    } else {
      this.wide_filter(x, y, plane, dx, dy, 4);
    }
  }

  /**
   * 7.14.6.2 Filter mask process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#filter-mask-process)
   */
  filter_mask(x: number, y: number, plane: number, limit: number, blimit: number, thresh: number, dx: number, dy: number, filterSize: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const p = this.decoder.prediction;

    let q0 = p.CurrFrame[plane][y][x];
    let q1 = p.CurrFrame[plane][y + dy][x + dx];
    let q2 = p.CurrFrame[plane][y + dy * 2][x + dx * 2];
    let q3 = p.CurrFrame[plane][y + dy * 3][x + dx * 3];
    let p0 = p.CurrFrame[plane][y - dy][x - dx];
    let p1 = p.CurrFrame[plane][y - dy * 2][x - dx * 2];
    let p2 = p.CurrFrame[plane][y - dy * 3][x - dx * 3];
    let p3 = p.CurrFrame[plane][y - dy * 4][x - dx * 4];

    let hevMask = 0;
    let threshBd = thresh << (cc.BitDepth - 8);
    hevMask |= Number(Math.abs(p1 - p0) > threshBd);
    hevMask |= Number(Math.abs(q1 - q0) > threshBd);

    let filterLen = 16;
    if (filterSize == 4) {
      filterLen = 4;
    } else if (plane != 0) {
      filterLen = 6;
    } else if (filterSize == 8) {
      filterLen = 8;
    }

    let limitBd = limit << (cc.BitDepth - 8);
    let blimitBd = blimit << (cc.BitDepth - 8);
    let mask = 0;
    mask |= Number(Math.abs(p1 - p0) > limitBd);
    mask |= Number(Math.abs(q1 - q0) > limitBd);
    mask |= Number(Math.abs(p0 - q0) * 2 + integer(Math.abs(p1 - q1) / 2) > blimitBd);
    if (filterLen >= 6) {
      mask |= Number(Math.abs(p2 - p1) > limitBd);
      mask |= Number(Math.abs(q2 - q1) > limitBd);
    }
    if (filterLen >= 8) {
      mask |= Number(Math.abs(p3 - p2) > limitBd);
      mask |= Number(Math.abs(q3 - q2) > limitBd);
    }
    let filterMask = Number(mask == 0);

    let thresholdBd = 1 << (cc.BitDepth - 8);
    let flatMask: number | undefined;
    if (filterSize >= 8) {
      mask = 0;
      mask |= Number(Math.abs(p1 - p0) > thresholdBd);
      mask |= Number(Math.abs(q1 - q0) > thresholdBd);
      mask |= Number(Math.abs(p2 - p0) > thresholdBd);
      mask |= Number(Math.abs(q2 - q0) > thresholdBd);
      if (filterLen >= 8) {
        mask |= Number(Math.abs(p3 - p0) > thresholdBd);
        mask |= Number(Math.abs(q3 - q0) > thresholdBd);
      }
      flatMask = Number(mask == 0);
    }

    thresholdBd = 1 << (cc.BitDepth - 8);
    let flatMask2: number | undefined;
    if (filterSize >= 16) {
      let q4 = p.CurrFrame[plane][y + dy * 4][x + dx * 4];
      let q5 = p.CurrFrame[plane][y + dy * 5][x + dx * 5];
      let q6 = p.CurrFrame[plane][y + dy * 6][x + dx * 6];
      let p4 = p.CurrFrame[plane][y - dy * 5][x - dx * 5];
      let p5 = p.CurrFrame[plane][y - dy * 6][x - dx * 6];
      let p6 = p.CurrFrame[plane][y - dy * 7][x - dx * 7];

      mask = 0;
      mask |= Number(Math.abs(p6 - p0) > thresholdBd);
      mask |= Number(Math.abs(q6 - q0) > thresholdBd);
      mask |= Number(Math.abs(p5 - p0) > thresholdBd);
      mask |= Number(Math.abs(q5 - q0) > thresholdBd);
      mask |= Number(Math.abs(p4 - p0) > thresholdBd);
      mask |= Number(Math.abs(q4 - q0) > thresholdBd);
      flatMask2 = Number(mask == 0);
    }
    return { hevMask, filterMask, flatMask, flatMask2 };
  }

  /**
   * 7.14.6.3 Narrow filter process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#narrow-filter-process)
   */
  narrow_filter(hevMask: number, x: number, y: number, plane: number, dx: number, dy: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const p = this.decoder.prediction;

    let q0 = p.CurrFrame[plane][y][x];
    let q1 = p.CurrFrame[plane][y + dy][x + dx];
    let p0 = p.CurrFrame[plane][y - dy][x - dx];
    let p1 = p.CurrFrame[plane][y - dy * 2][x - dx * 2];
    let ps1 = p1 - (0x80 << (cc.BitDepth - 8));
    let ps0 = p0 - (0x80 << (cc.BitDepth - 8));
    let qs0 = q0 - (0x80 << (cc.BitDepth - 8));
    let qs1 = q1 - (0x80 << (cc.BitDepth - 8));
    let filter = hevMask ? this.filter4_clamp(ps1 - qs1) : 0;
    filter = this.filter4_clamp(filter + 3 * (qs0 - ps0));
    let filter1 = this.filter4_clamp(filter + 4) >> 3;
    let filter2 = this.filter4_clamp(filter + 3) >> 3;
    let oq0 = this.filter4_clamp(qs0 - filter1) + (0x80 << (cc.BitDepth - 8));
    let op0 = this.filter4_clamp(ps0 + filter2) + (0x80 << (cc.BitDepth - 8));
    p.CurrFrame[plane][y][x] = oq0;
    p.CurrFrame[plane][y - dy][x - dx] = op0;
    if (!hevMask) {
      filter = Round2(filter1, 1);
      let oq1 = this.filter4_clamp(qs1 - filter) + (0x80 << (cc.BitDepth - 8));
      let op1 = this.filter4_clamp(ps1 + filter) + (0x80 << (cc.BitDepth - 8));
      p.CurrFrame[plane][y + dy][x + dx] = oq1;
      p.CurrFrame[plane][y - dy * 2][x - dx * 2] = op1;
    }
  }

  /**
   * 7.14.6.3 Narrow filter process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#narrow-filter-process)
   */
  private filter4_clamp(value: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;

    return Clip3(-(1 << (cc.BitDepth - 1)), (1 << (cc.BitDepth - 1)) - 1, value);
  }

  /**
   * 7.14.6.4 Wide filter process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#wide-filter-process)
   */
  wide_filter(x: number, y: number, plane: number, dx: number, dy: number, log2Size: number) {
    const pred = this.decoder.prediction;

    let n = 2;
    if (log2Size == 4) {
      n = 6;
    } else if (plane == 0) {
      n = 3;
    }

    let n2 = 1;
    if (log2Size == 3 && plane == 0) {
      n2 = 0;
    }

    for (let i = -n; i < n; i++) {
      let t = 0;
      for (let j = -n; j <= n; j++) {
        let p = Clip3(-(n + 1), n, i + j);
        let tap = Math.abs(j) <= n2 ? 2 : 1;
        t += pred.CurrFrame[plane][y + p * dy][x + p * dx] * tap;
      }
      this.F[i] = Round2(t, log2Size);
    }
    for (let i = -n; i < n; i++) {
      pred.CurrFrame[plane][y + i * dy][x + i * dx] = this.F[i];
    }
  }
}
