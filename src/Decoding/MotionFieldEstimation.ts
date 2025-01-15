import { Array2D, Array3D, Array4D, Clip3, Round2Signed } from "../Conventions";
import * as AV1 from "../define";
import { AV1Decoder } from "../SyntaxStructures/Obu";

import { FRAME_TYPE, REF_FRAME } from "../SyntaxStructures/Semantics";

const Div_Mult: number[] = [
  0, 16384, 8192, 5461, 4096, 3276, 2730, 2340, 2048, 1820, 1638, 1489, 1365, 1260, 1170, 1092, 1024, 963, 910, 862, 819, 780, 744, 712, 682, 655, 630, 606, 585, 564, 546, 528,
];

/**
 * 7.9 Motion field estimation process
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#motion-field-estimation-process)
 */
export class MotionFieldEstimation {
  MotionFieldMvs: number[][][][];
  private PosY8: number = undefined as any;
  private PosX8: number = undefined as any;
  SavedOrderHints: number[][];

  private init: boolean;
  private decoder: AV1Decoder;

  constructor(d: AV1Decoder) {
    this.init = false;
    this.MotionFieldMvs = Array4D(AV1.NUM_REF_FRAMES, 64, 64);
    this.SavedOrderHints = Array2D(AV1.NUM_REF_FRAMES);

    this.decoder = d;
  }

  initialize() {
    if (this.init) {
      return;
    }
    this.init = true;
  }

  /**
   * 7.9.1 General
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#general-7)
   */
  motion_field_estimation() {
    this.initialize();

    const fho = this.decoder.frameHeaderObu;
    const fh = fho.frameHeader;
    const cis = fh.compute_image_size;

    let w8 = cis.MiCols >> 1;
    let h8 = cis.MiRows >> 1;

    for (let ref = REF_FRAME.LAST_FRAME; ref <= REF_FRAME.ALTREF_FRAME; ref++)
      for (let y = 0; y < h8; y++)
        for (let x = 0; x < w8; x++)
          for (let j = 0; j < 2; j++) {
            this.MotionFieldMvs[ref][y][x][j] = -1 << 15;
          }

    let lastIdx = fh.ref_frame_idx[0];
    let curGoldOrderHint = fh.OrderHints[REF_FRAME.GOLDEN_FRAME];
    let lastAltOrderHint = this.SavedOrderHints[lastIdx][REF_FRAME.ALTREF_FRAME];
    let useLast = Number(lastAltOrderHint != curGoldOrderHint);

    if (useLast == 1) {
      this.projection(REF_FRAME.LAST_FRAME, -1);
    }

    let refStamp = AV1.MFMV_STACK_SIZE - 2;
    let useBwd = Number(fho.get_relative_dist(fh.OrderHints[REF_FRAME.BWDREF_FRAME], fh.OrderHint) > 0);

    let projOutput;
    if (useBwd == 1) {
      projOutput = this.projection(REF_FRAME.BWDREF_FRAME, 1);
      if (projOutput == 1) {
        refStamp = refStamp - 1;
      }
    }

    let useAlt2 = Number(fho.get_relative_dist(fh.OrderHints[REF_FRAME.ALTREF2_FRAME], fh.OrderHint) > 0);
    if (useAlt2 == 1) {
      projOutput = this.projection(REF_FRAME.ALTREF2_FRAME, 1);
      if (projOutput == 1) {
        refStamp = refStamp - 1;
      }
    }

    let useAlt = Number(fho.get_relative_dist(fh.OrderHints[REF_FRAME.ALTREF_FRAME], fh.OrderHint) > 0);
    if (useAlt == 1 && refStamp >= 0) {
      projOutput = this.projection(REF_FRAME.ALTREF_FRAME, 1);
      if (projOutput == 1) {
        refStamp = refStamp - 1;
      }
    }

    if (refStamp >= 0) {
      this.projection(REF_FRAME.LAST2_FRAME, -1);
    }
  }

  /**
   * 7.9.2 Projection process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#projection-process)
   */
  projection(src: REF_FRAME, dstSign: number): number {
    const fho = this.decoder.frameHeaderObu;
    const fh = fho.frameHeader;
    const cis = fh.compute_image_size;
    const psi = fh.previous_segment_ids;
    const rf = fh.ref_frames;
    const rfu = this.decoder.referenceFrameUpdate;

    let srcIdx = fh.ref_frame_idx[src - REF_FRAME.LAST_FRAME];
    let w8 = cis.MiCols >> 1;
    let h8 = cis.MiRows >> 1;
    if (
      (psi.RefMiRows[srcIdx] != cis.MiRows && psi.RefMiCols[srcIdx] != cis.MiCols) ||
      rf.RefFrameType[srcIdx] == FRAME_TYPE.INTRA_ONLY_FRAME ||
      rf.RefFrameType[srcIdx] == FRAME_TYPE.KEY_FRAME
    ) {
      return 0;
    }
    for (let y8 = 0; y8 < h8; y8++) {
      for (let x8 = 0; x8 < w8; x8++) {
        let row = 2 * y8 + 1;
        let col = 2 * x8 + 1;
        let srcRef = rfu.SavedRefFrames[srcIdx][row][col];
        if (srcRef > REF_FRAME.INTRA_FRAME) {
          let refToCur = fho.get_relative_dist(fh.OrderHints[src], fh.OrderHint);
          let refOffset = fho.get_relative_dist(fh.OrderHints[src], this.SavedOrderHints[srcIdx][srcRef]);
          let posValid = Number(Math.abs(refToCur) <= AV1.MAX_FRAME_DISTANCE && Math.abs(refOffset) <= AV1.MAX_FRAME_DISTANCE && refOffset > 0);
          if (posValid) {
            let mv = rfu.SavedMvs[srcIdx][row][col];
            let projMv = this.get_mv_projection(mv, refToCur * dstSign, refOffset);
            posValid = this.get_block_position(x8, y8, dstSign, projMv);
            if (posValid) {
              for (let dst = REF_FRAME.LAST_FRAME; dst <= REF_FRAME.ALTREF_FRAME; dst++) {
                let refToDst = fho.get_relative_dist(fh.OrderHint, fh.OrderHints[dst]);
                projMv = this.get_mv_projection(mv, refToDst, refOffset);
                this.MotionFieldMvs[dst][this.PosY8][this.PosX8] = projMv;
              }
            }
          }
        }
      }
    }
    return 1;
  }

  /**
   * 7.9.3 Get MV projection process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#get-mv-projection-process)
   */
  get_mv_projection(mv: number[], numerator: number, denominator: number) {
    let clippedDenominator = Math.min(AV1.MAX_FRAME_DISTANCE, denominator);
    let clippedNumerator = Clip3(-AV1.MAX_FRAME_DISTANCE, AV1.MAX_FRAME_DISTANCE, numerator);
    let projMv: number[] = [];
    for (let i = 0; i < 2; i++) {
      let scaled = Round2Signed(mv[i] * clippedNumerator * Div_Mult[clippedDenominator], 14);
      projMv[i] = Clip3(-(1 << 14) + 1, (1 << 14) - 1, scaled);
    }
    return projMv;
  }

  /**
   * 7.9.4 Get block position process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#get-block-position-process)
   */
  get_block_position(x8: number, y8: number, dstSign: number, projMv: number[]) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const rfm = fh.reference_frame_marking;
    const fs = fh.frame_size;
    const rs = fh.render_size;
    const fswr = fh.frame_size_with_refs;
    const sp = fh.superres_params;
    const cis = fh.compute_image_size;

    let data = { posValid: 1 };
    this.PosY8 = this.project(y8, projMv[0], dstSign, cis.MiRows >> 1, AV1.MAX_OFFSET_HEIGHT, data);
    this.PosX8 = this.project(x8, projMv[1], dstSign, cis.MiCols >> 1, AV1.MAX_OFFSET_WIDTH, data);
    return data.posValid;
  }

  /**
   * 7.9.4 Get block position process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#get-block-position-process)
   */
  project(v8: number, delta: number, dstSign: number, max8: number, maxOff8: number, data: { posValid: number }) {
    let base8 = (v8 >> 3) << 3;
    let offset8: number;
    if (delta >= 0) {
      offset8 = delta >> (3 + 1 + AV1.MI_SIZE_LOG2);
    } else {
      offset8 = -(-delta >> (3 + 1 + AV1.MI_SIZE_LOG2));
    }
    v8 += dstSign * offset8;
    if (v8 < 0 || v8 >= max8 || v8 < base8 - maxOff8 || v8 >= base8 + 8 + maxOff8) {
      data.posValid = 0;
    }
    return v8;
  }
}

/**
 * 7.20 Reference frame update process
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#reference-frame-update-process)
 */
export class ReferenceFrameUpdate {
  FrameStore: number[][][][] = [];
  SavedRefFrames: number[][][] = [];
  SavedMvs: number[][][][] = [];

  private init: boolean;
  private decoder: AV1Decoder;

  constructor(d: AV1Decoder) {
    this.init = false;
    this.decoder = d;
  }

  initialize() {
    if (this.init) {
      return;
    }
    this.init = true;

    const fh = this.decoder.frameHeaderObu.frameHeader;
    const fs = fh.frame_size;
    const cis = fh.compute_image_size;

    this.FrameStore = Array4D(AV1.NUM_REF_FRAMES, 3, fs.FrameHeight);
    this.SavedRefFrames = Array3D(AV1.NUM_REF_FRAMES, cis.MiRows);
    this.SavedMvs = Array4D(AV1.NUM_REF_FRAMES, cis.MiRows, cis.MiCols);
  }

  /**
   * 7.20 Reference frame update process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#reference-frame-update-process)
   */
  reference_frame_update() {
    this.initialize();

    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fho = this.decoder.frameHeaderObu;
    const fh = fho.frameHeader;
    const rfm = fh.reference_frame_marking;
    const fs = fh.frame_size;
    const rs = fh.render_size;
    const fswr = fh.frame_size_with_refs;
    const cis = fh.compute_image_size;
    const gmp = fh.global_motion_params;
    const psi = fh.previous_segment_ids;
    const rf = fh.ref_frames;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const lstd = this.decoder.largeScaleTileDecoding;
    const mfe = this.decoder.motionFieldEstimation;
    const lr = this.decoder.loopRestoration;
    const mfmvs = this.decoder.motionFieldMotionVectorStorage;

    for (let i = 0; i < AV1.NUM_REF_FRAMES; i++) {
      if (((fh.refresh_frame_flags >> i) & 1) == 1) {
        rfm.RefValid[i] = 1;
        fh.RefFrameId[i] = fh.current_frame_id;
        rf.RefUpscaledWidth[i] = fswr.UpscaledWidth;
        rf.RefFrameWidth[i] = fs.FrameWidth;
        rf.RefFrameHeight[i] = fs.FrameHeight;
        rf.RefRenderWidth[i] = rs.RenderWidth;
        rf.RefRenderHeight[i] = rs.RenderHeight;
        psi.RefMiCols[i] = cis.MiCols;
        psi.RefMiRows[i] = cis.MiRows;
        rf.RefFrameType[i] = fh.frame_type;
        lstd.RefSubsamplingX[i] = cc.subsampling_x;
        lstd.RefSubsamplingY[i] = cc.subsampling_y;
        lstd.RefBitDepth[i] = cc.BitDepth;
        fh.RefOrderHint[i] = fh.OrderHint;
        fho._ref_showable_frame[i] = fh.showable_frame;

        for (let j = 0; j < AV1.REFS_PER_FRAME; j++) {
          mfe.SavedOrderHints[i][j + REF_FRAME.LAST_FRAME] = fh.OrderHints[j + REF_FRAME.LAST_FRAME];
        }

        for (let x = 0; x < fswr.UpscaledWidth; x++) {
          for (let y = 0; y < fs.FrameHeight; y++) {
            this.FrameStore[i][0][y][x] = lr.LrFrame[0][y][x];
          }
        }

        for (let plane = 1; plane <= 2; plane++) {
          for (let x = 0; x < (fswr.UpscaledWidth + cc.subsampling_x) >> cc.subsampling_x; x++) {
            for (let y = 0; y < (fs.FrameHeight + cc.subsampling_y) >> cc.subsampling_y; y++) {
              this.FrameStore[i][plane][y][x] = lr.LrFrame[plane][y][x];
            }
          }
        }

        for (let row = 0; row < cis.MiRows; row++) {
          for (let col = 0; col < cis.MiCols; col++) {
            this.SavedRefFrames[i][row][col] = mfmvs.MfRefFrames[row][col];
          }
        }

        for (let comp = 0; comp <= 1; comp++) {
          for (let row = 0; row < cis.MiRows; row++) {
            for (let col = 0; col < cis.MiCols; col++) {
              this.SavedMvs[i][row][col][comp] = mfmvs.MfMvs[row][col][comp];
            }
          }
        }

        for (let ref = REF_FRAME.LAST_FRAME; ref <= REF_FRAME.ALTREF_FRAME; ref++) {
          for (let j = 0; j <= 5; j++) {
            psi.SavedGmParams[i][ref][j] = gmp.gm_params[ref][j];
          }
        }

        for (let row = 0; row < cis.MiRows; row++) {
          for (let col = 0; col < cis.MiCols; col++) {
            db.SavedSegmentIds[i][row][col] = db.SegmentIds[row][col];
          }
        }

        fho.save_cdfs(i);
        if (seqHeader.film_grain_params_present == 1) {
          fho.save_grain_params(i);
        }
        fho.save_loop_filter_params(i);
        fho.save_segmentation_params(i);
      }
    }
  }
}

/**
 * 7.21 Reference frame loading process
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#reference-frame-loading-process)
 */
export class ReferenceFrameLoading {
  private decoder: AV1Decoder;

  constructor(d: AV1Decoder) {
    this.decoder = d;
  }

  /**
   * 7.21 Reference frame loading process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#reference-frame-loading-process)
   */
  reference_frame_loading() {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fho = this.decoder.frameHeaderObu;
    const fh = fho.frameHeader;
    const fs = fh.frame_size;
    const rs = fh.render_size;
    const fswr = fh.frame_size_with_refs;
    const cis = fh.compute_image_size;
    const gmp = fh.global_motion_params;
    const psi = fh.previous_segment_ids;
    const rf = fh.ref_frames;

    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const lstd = this.decoder.largeScaleTileDecoding;
    const mfe = this.decoder.motionFieldEstimation;
    const lr = this.decoder.loopRestoration;
    const mfmvs = this.decoder.motionFieldMotionVectorStorage;
    const rfu = this.decoder.referenceFrameUpdate;

    fh.current_frame_id = fh.RefFrameId[fh.frame_to_show_map_idx];
    fswr.UpscaledWidth = rf.RefUpscaledWidth[fh.frame_to_show_map_idx];
    fs.FrameWidth = rf.RefFrameWidth[fh.frame_to_show_map_idx];
    fs.FrameHeight = rf.RefFrameHeight[fh.frame_to_show_map_idx];
    rs.RenderWidth = rf.RefRenderWidth[fh.frame_to_show_map_idx];
    rs.RenderHeight = rf.RefRenderHeight[fh.frame_to_show_map_idx];
    cis.MiCols = psi.RefMiCols[fh.frame_to_show_map_idx];
    cis.MiRows = psi.RefMiRows[fh.frame_to_show_map_idx];
    cc.subsampling_x = lstd.RefSubsamplingX[fh.frame_to_show_map_idx];
    cc.subsampling_y = lstd.RefSubsamplingY[fh.frame_to_show_map_idx];
    cc.BitDepth = lstd.RefBitDepth[fh.frame_to_show_map_idx];
    fh.OrderHint = fh.RefOrderHint[fh.frame_to_show_map_idx];
    for (let j = 0; j < AV1.REFS_PER_FRAME; j++) {
      fh.OrderHints[j + REF_FRAME.LAST_FRAME] = mfe.SavedOrderHints[fh.frame_to_show_map_idx][j + REF_FRAME.LAST_FRAME];
    }

    for (let x = 0; x < fswr.UpscaledWidth; x++) {
      for (let y = 0; y < fs.FrameHeight; y++) {
        lr.LrFrame[0][y][x] = rfu.FrameStore[fh.frame_to_show_map_idx][0][y][x];
      }
    }

    for (let plane = 1; plane <= 2; plane++) {
      for (let x = 0; x < (fswr.UpscaledWidth + cc.subsampling_x) >> cc.subsampling_x; x++) {
        for (let y = 0; y < (fs.FrameHeight + cc.subsampling_y) >> cc.subsampling_y; y++) {
          lr.LrFrame[plane][y][x] = rfu.FrameStore[fh.frame_to_show_map_idx][plane][y][x];
        }
      }
    }

    for (let row = 0; row < cis.MiRows; row++) {
      for (let col = 0; col < cis.MiCols; col++) {
        mfmvs.MfRefFrames[row][col] = rfu.SavedRefFrames[fh.frame_to_show_map_idx][row][col];
      }
    }
    for (let comp = 0; comp <= 1; comp++) {
      for (let row = 0; row < cis.MiRows; row++) {
        for (let col = 0; col < cis.MiCols; col++) {
          mfmvs.MfMvs[row][col][comp] = rfu.SavedMvs[fh.frame_to_show_map_idx][row][col][comp];
        }
      }
    }
    for (let ref = REF_FRAME.LAST_FRAME; ref <= REF_FRAME.ALTREF_FRAME; ref++) {
      for (let j = 0; j <= 5; j++) {
        gmp.gm_params[ref][j] = psi.SavedGmParams[fh.frame_to_show_map_idx][ref][j];
      }
    }
    for (let row = 0; row < cis.MiRows; row++) {
      for (let col = 0; col < cis.MiCols; col++) {
        db.SegmentIds[row][col] = db.SavedSegmentIds[fh.frame_to_show_map_idx][row][col];
      }
    }
    fho.load_cdfs(fh.frame_to_show_map_idx);
    if (seqHeader.film_grain_params_present == 1) {
      fho.load_grain_params(fh.frame_to_show_map_idx);
    }
    this.load_loop_filter_params(fh.frame_to_show_map_idx);
    this.load_segmentation_params(fh.frame_to_show_map_idx);
  }

  load_loop_filter_params(i: number) {
    const fho = this.decoder.frameHeaderObu;
    const fh = fho.frameHeader;
    const lfp = fh.loop_filter_params;

    for (let j = 0; j < AV1.TOTAL_REFS_PER_FRAME; j++) {
      lfp.loop_filter_ref_deltas[j] = fho._cache_loop_filter_ref_deltas[i][j];
    }
    for (let j = 0; j <= 1; j++) {
      lfp.loop_filter_mode_deltas[j] = fho._cache_loop_filter_mode_deltas[i][j];
    }
  }
  load_segmentation_params(i: number) {
    const fho = this.decoder.frameHeaderObu;
    const fh = fho.frameHeader;
    const sp = fh.segmentation_params;

    for (let j = 0; j < AV1.MAX_SEGMENTS; j++) {
      for (let k = 0; k < AV1.SEG_LVL_MAX; k++) {
        sp.FeatureEnabled[j][k] = fho._cache_FeatureEnabled[i][j][k];
        sp.FeatureData[j][k] = fho._cache_FeatureData[i][j][k];
      }
    }
  }
}
