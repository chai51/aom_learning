import { Array2D, Array3D, Clip3, clone, integer, listCompare, Round2Signed } from "../Conventions";
import { AV1Decoder } from "../SyntaxStructures/Obu";

import { PARTITION, REF_FRAME, SUB_SIZE, Y_MODE } from "../SyntaxStructures/Semantics";

import { assert } from "console";
import { Block_Height, Block_Width, Num_4x4_Blocks_High, Num_4x4_Blocks_Wide } from "../AdditionalTables/ConversionTables";
import { IDENTITY, LEAST_SQUARES_SAMPLES_MAX, MAX_REF_MV_STACK_SIZE, MI_SIZE, MV_BORDER, REF_CAT_LEVEL, TRANSLATION, WARPEDMODEL_PREC_BITS } from "../define";

/**
 * 7.10 Motion vector prediction processes
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#motion-vector-prediction-processes)
 */
export class MotionVectorPrediction {
  NumMvFound!: number;
  private NewMvCount!: number;
  RefStackMv: number[][][] = [];
  GlobalMvs: number[][] = [];
  private FoundMatch!: number;
  private CloseMatches!: number;
  private WeightStack: number[] = [];
  ZeroMvContext!: number;
  NumSamples!: number;
  private NumSamplesScanned!: number;
  private TotalMatches!: number;
  private RefIdCount: number[] = [];
  private RefDiffCount: number[] = [];
  private RefIdMvs: number[][][] = [];
  private RefDiffMvs: number[][][] = [];
  DrlCtxStack: number[] = [];
  NewMvContext!: number;
  RefMvContext!: number;
  CandList: number[][] = [];

  private decoder: AV1Decoder;

  constructor(d: AV1Decoder) {
    this.decoder = d;
  }

  /**
   * 7.10.2 Find MV stack process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#find-mv-stack-process)
   */
  find_mv_stack(isCompound: number) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;

    let bw4 = Num_4x4_Blocks_Wide[db.MiSize];
    let bh4 = Num_4x4_Blocks_High[db.MiSize];

    // 1.
    this.NumMvFound = 0;

    // 2.
    this.NewMvCount = 0;

    // 3.
    this.GlobalMvs[0] = this.setup_global_mv(0);

    // 4.
    if (isCompound == 1) {
      this.GlobalMvs[1] = this.setup_global_mv(1);
    }

    // 5.
    this.FoundMatch = 0;

    // 6.
    this.scan_row(-1, isCompound);

    // 7.
    let foundAboveMatch = this.FoundMatch;
    this.FoundMatch = 0;

    // 8.
    this.scan_col(-1, isCompound);

    // 9.
    let foundLeftMatch = this.FoundMatch;
    this.FoundMatch = 0;

    // 10.
    if (Math.max(bw4, bh4) <= 16) {
      if (this.has_top_right()) {
        this.scan_point(-1, bw4, isCompound);
      }
    }

    // 11.
    if (this.FoundMatch == 1) {
      foundAboveMatch = 1;
    }

    // 12.
    this.CloseMatches = foundAboveMatch + foundLeftMatch;

    // 13.
    let numNearest = this.NumMvFound;

    // 14.
    let numNew = this.NewMvCount;

    // 15.
    if (numNearest > 0) {
      for (let idx = 0; idx < numNearest; idx++) {
        this.WeightStack[idx] += REF_CAT_LEVEL;
      }
    }

    // 16.
    this.ZeroMvContext = 0;

    // 17.
    if (fh.use_ref_frame_mvs == 1) {
      this.temporal_scan(isCompound);
    }

    // 18.
    this.scan_point(-1, -1, isCompound);

    // 19.
    if (this.FoundMatch == 1) {
      foundAboveMatch = 1;
    }

    // 20.
    this.FoundMatch = 0;

    // 21.
    this.scan_row(-3, isCompound);

    // 22.
    if (this.FoundMatch == 1) {
      foundAboveMatch = 1;
    }

    // 23.
    this.FoundMatch = 0;

    // 24.
    this.scan_col(-3, isCompound);

    // 25.
    if (this.FoundMatch == 1) {
      foundLeftMatch = 1;
    }

    // 26.
    this.FoundMatch = 0;

    // 27.
    if (bh4 > 1) {
      this.scan_row(-5, isCompound);
    }

    // 28.
    if (this.FoundMatch == 1) {
      foundAboveMatch = 1;
    }

    // 29.
    this.FoundMatch = 0;

    // 30.
    if (bw4 > 1) {
      this.scan_col(-5, isCompound);
    }

    // 31.
    if (this.FoundMatch == 1) {
      foundLeftMatch = 1;
    }

    // 32.
    this.TotalMatches = foundAboveMatch + foundLeftMatch;

    // 33.
    this.sorting(0, numNearest, isCompound);

    // 34.
    this.sorting(numNearest, this.NumMvFound, isCompound);

    // 35.
    if (this.NumMvFound < 2) {
      this.extra_search(isCompound);
    }

    // 36.
    this.context_and_clamping(isCompound, numNew);
  }

  private has_top_right() {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const dp = tg.decode_partition;
    const db = tg.decode_block;

    let bw4 = Num_4x4_Blocks_Wide[db.MiSize];
    let bh4 = Num_4x4_Blocks_High[db.MiSize];
    let bs = Math.max(bw4, bh4);

    if (bs > Num_4x4_Blocks_Wide[SUB_SIZE.BLOCK_64X64]) {
      return false;
    }

    const sb_size = seqHeader.use_128x128_superblock ? SUB_SIZE.BLOCK_128X128 : SUB_SIZE.BLOCK_64X64;
    const sb_mi_size = Num_4x4_Blocks_Wide[sb_size];
    const mask_row = db.MiRow & (sb_mi_size - 1);
    const mask_col = db.MiCol & (sb_mi_size - 1);
    let has_tr = !(mask_row & bs && mask_col & bs);

    assert(bs > 0 && !(bs & (bs - 1)));

    while (bs < sb_mi_size) {
      if (mask_col & bs) {
        if (mask_col & (2 * bs) && mask_row & (2 * bs)) {
          has_tr = false;
          break;
        }
      } else {
        break;
      }
      bs <<= 1;
    }

    if (bw4 < bh4) {
      let is_last_vertical_rect = 0;
      if (!((db.MiCol + bw4) & (bh4 - 1))) {
        is_last_vertical_rect = 1;
      }

      if (!is_last_vertical_rect) {
        has_tr = true;
      }
    }

    if (bw4 > bh4) {
      let is_first_horizontal_rect = 0;
      if (!(db.MiRow & (bw4 - 1))) {
        is_first_horizontal_rect = 1;
      }

      if (!is_first_horizontal_rect) {
        has_tr = false;
      }
    }

    if (dp.partition == PARTITION.PARTITION_VERT_A) {
      if (bw4 == bh4)
        if (mask_row & bs) {
          has_tr = false;
        }
    }
    return has_tr;
  }

  /**
   * 7.10.2.1 Setup global MV process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#setup-global-mv-process)
   */
  setup_global_mv(refList: number) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const gmp = fh.global_motion_params;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const rf = tg.ref_frames;

    let ref = rf.RefFrame[refList];
    let typ;

    if (ref != REF_FRAME.INTRA_FRAME) {
      typ = gmp.GmType[ref];
    }
    let bw = Block_Width[db.MiSize];
    let bh = Block_Height[db.MiSize];

    let mv: number[] = [];
    if (ref == REF_FRAME.INTRA_FRAME || typ == IDENTITY) {
      mv[0] = 0;
      mv[1] = 0;
    } else if (typ == TRANSLATION) {
      mv[0] = gmp.gm_params[ref][0] >> (WARPEDMODEL_PREC_BITS - 3);
      mv[1] = gmp.gm_params[ref][1] >> (WARPEDMODEL_PREC_BITS - 3);
    } else {
      let x = db.MiCol * MI_SIZE + integer(bw / 2) - 1;
      let y = db.MiRow * MI_SIZE + integer(bh / 2) - 1;
      let xc = (gmp.gm_params[ref][2] - (1 << WARPEDMODEL_PREC_BITS)) * x + gmp.gm_params[ref][3] * y + gmp.gm_params[ref][0];
      let yc = gmp.gm_params[ref][4] * x + (gmp.gm_params[ref][5] - (1 << WARPEDMODEL_PREC_BITS)) * y + gmp.gm_params[ref][1];
      if (fh.allow_high_precision_mv) {
        mv[0] = Round2Signed(yc, WARPEDMODEL_PREC_BITS - 3);
        mv[1] = Round2Signed(xc, WARPEDMODEL_PREC_BITS - 3);
      } else {
        mv[0] = Round2Signed(yc, WARPEDMODEL_PREC_BITS - 2) * 2;
        mv[1] = Round2Signed(xc, WARPEDMODEL_PREC_BITS - 2) * 2;
      }
    }
    this.lower_mv_precision(mv);
    return mv;
  }

  /**
   * 7.10.2.2 Scan row process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#scan-row-process)
   */
  scan_row(deltaRow: number, isCompound: number) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;

    let bw4 = Num_4x4_Blocks_Wide[db.MiSize];
    let end4 = Math.min(Math.min(bw4, cis.MiCols - db.MiCol), 16);

    let deltaCol = 0;
    let useStep16 = bw4 >= 16;

    if (Math.abs(deltaRow) > 1) {
      deltaRow += db.MiRow & 1;
      deltaCol = 1 - (db.MiCol & 1);
    }

    let i = 0;
    while (i < end4) {
      let mvRow = db.MiRow + deltaRow;
      let mvCol = db.MiCol + deltaCol + i;
      if (!this.decoder.tileGroupObu.is_inside(mvRow, mvCol)) {
        break;
      }
      let len = Math.min(bw4, Num_4x4_Blocks_Wide[db.MiSizes[mvRow][mvCol]]);
      if (Math.abs(deltaRow) > 1) {
        len = Math.max(2, len);
      }
      if (useStep16) {
        len = Math.max(4, len);
      }
      let weight = len * 2;
      this.add_ref_mv_candidate(mvRow, mvCol, isCompound, weight);
      i += len;
    }
  }

  /**
   * 7.10.2.3 Scan col process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#scan-col-process)
   */
  scan_col(deltaCol: number, isCompound: number) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;

    let bh4 = Num_4x4_Blocks_High[db.MiSize];
    let end4 = Math.min(Math.min(bh4, cis.MiRows - db.MiRow), 16);
    let deltaRow = 0;
    let useStep16 = bh4 >= 16;
    if (Math.abs(deltaCol) > 1) {
      deltaRow = 1 - (db.MiRow & 1);
      deltaCol += db.MiCol & 1;
    }

    let i = 0;
    while (i < end4) {
      let mvRow = db.MiRow + deltaRow + i;
      let mvCol = db.MiCol + deltaCol;
      if (!this.decoder.tileGroupObu.is_inside(mvRow, mvCol)) {
        break;
      }
      let len = Math.min(bh4, Num_4x4_Blocks_High[db.MiSizes[mvRow][mvCol]]);
      if (Math.abs(deltaCol) > 1) {
        len = Math.max(2, len);
      }
      if (useStep16) {
        len = Math.max(4, len);
      }
      let weight = len * 2;
      this.add_ref_mv_candidate(mvRow, mvCol, isCompound, weight);
      i += len;
    }
  }

  /**
   * 7.10.2.4 Scan point process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#scan-point-process)
   */
  scan_point(deltaRow: number, deltaCol: number, isCompound: number) {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;

    let mvRow = db.MiRow + deltaRow;
    let mvCol = db.MiCol + deltaCol;
    let weight = 4;

    if (this.decoder.tileGroupObu.is_inside(mvRow, mvCol) == 1 && db.RefFrames[mvRow][mvCol][0]) {
      this.add_ref_mv_candidate(mvRow, mvCol, isCompound, weight);
    }
  }

  /**
   * 7.10.2.5 Temporal scan process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#temporal-scan-process)
   */
  temporal_scan(isCompound: number) {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;

    let bw4 = Num_4x4_Blocks_Wide[db.MiSize];
    let bh4 = Num_4x4_Blocks_High[db.MiSize];
    let stepW4 = bw4 >= 16 ? 4 : 2;
    let stepH4 = bh4 >= 16 ? 4 : 2;
    const tplSamplePos = [
      [bh4, -2],
      [bh4, bw4],
      [bh4 - 2, bw4],
    ];

    for (let deltaRow = 0; deltaRow < Math.min(bh4, 16); deltaRow += stepH4) {
      for (let deltaCol = 0; deltaCol < Math.min(bw4, 16); deltaCol += stepW4) {
        this.add_tpl_ref_mv(deltaRow, deltaCol, isCompound);
      }
    }

    let allowExtension =
      bh4 >= Num_4x4_Blocks_High[SUB_SIZE.BLOCK_8X8] &&
      bh4 < Num_4x4_Blocks_High[SUB_SIZE.BLOCK_64X64] &&
      bw4 >= Num_4x4_Blocks_Wide[SUB_SIZE.BLOCK_8X8] &&
      bw4 < Num_4x4_Blocks_Wide[SUB_SIZE.BLOCK_64X64];
    if (allowExtension) {
      for (let i = 0; i < 3; i++) {
        let deltaRow = tplSamplePos[i][0];
        let deltaCol = tplSamplePos[i][1];
        if (this.check_sb_border(deltaRow, deltaCol)) {
          this.add_tpl_ref_mv(deltaRow, deltaCol, isCompound);
        }
      }
    }
  }

  /**
   * 7.10.2.5 Temporal scan process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#temporal-scan-process)
   */
  check_sb_border(deltaRow: number, deltaCol: number) {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;

    let row = (db.MiRow & 15) + deltaRow;
    let col = (db.MiCol & 15) + deltaCol;

    return row >= 0 && row < 16 && col >= 0 && col < 16;
  }

  /**
   * 7.10.2.6 Temporal sample process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#temporal-sample-process)
   */
  add_tpl_ref_mv(deltaRow: number, deltaCol: number, isCompound: number) {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const rf = tg.ref_frames;
    const mfe = this.decoder.motionFieldEstimation;

    let mvRow = (db.MiRow + deltaRow) | 1;
    let mvCol = (db.MiCol + deltaCol) | 1;

    if (this.decoder.tileGroupObu.is_inside(mvRow, mvCol) == 0) {
      return;
    }

    let x8 = mvCol >> 1;
    let y8 = mvRow >> 1;

    if (deltaRow == 0 && deltaCol == 0) {
      this.ZeroMvContext = 1;
    }
    if (!isCompound) {
      let candMv = clone(mfe.MotionFieldMvs[rf.RefFrame[0]][y8][x8]);
      if (candMv[0] == -1 << 15) {
        return;
      }
      this.lower_mv_precision(candMv);
      if (deltaRow == 0 && deltaCol == 0) {
        if (Math.abs(candMv[0] - this.GlobalMvs[0][0]) >= 16 || Math.abs(candMv[1] - this.GlobalMvs[0][1]) >= 16) {
          this.ZeroMvContext = 1;
        } else {
          this.ZeroMvContext = 0;
        }
      }
      let idx: number;
      for (idx = 0; idx < this.NumMvFound; idx++) {
        if (candMv[0] == this.RefStackMv[idx][0][0] && candMv[1] == this.RefStackMv[idx][0][1]) {
          break;
        }
      }
      if (idx < this.NumMvFound) {
        this.WeightStack[idx] += 2;
      } else if (this.NumMvFound < MAX_REF_MV_STACK_SIZE) {
        this.RefStackMv = Array3D(this.RefStackMv, this.NumMvFound + 1, 2);
        this.RefStackMv[this.NumMvFound][0] = clone(candMv);
        this.WeightStack[this.NumMvFound] = 2;
        this.NumMvFound += 1;
      }
    } else {
      let candMv0 = clone(mfe.MotionFieldMvs[rf.RefFrame[0]][y8][x8]);
      if (candMv0[0] == -1 << 15) {
        return;
      }
      let candMv1 = clone(mfe.MotionFieldMvs[rf.RefFrame[1]][y8][x8]);
      if (candMv1[0] == -1 << 15) {
        return;
      }
      this.lower_mv_precision(candMv0);
      this.lower_mv_precision(candMv1);
      if (deltaRow == 0 && deltaCol == 0) {
        if (
          Math.abs(candMv0[0] - this.GlobalMvs[0][0]) >= 16 ||
          Math.abs(candMv0[1] - this.GlobalMvs[0][1]) >= 16 ||
          Math.abs(candMv1[0] - this.GlobalMvs[1][0]) >= 16 ||
          Math.abs(candMv1[1] - this.GlobalMvs[1][1]) >= 16
        ) {
          this.ZeroMvContext = 1;
        } else {
          this.ZeroMvContext = 0;
        }
      }
      let idx: number;
      for (idx = 0; idx < this.NumMvFound; idx++) {
        if (
          candMv0[0] == this.RefStackMv[idx][0][0] &&
          candMv0[1] == this.RefStackMv[idx][0][1] &&
          candMv1[0] == this.RefStackMv[idx][1][0] &&
          candMv1[1] == this.RefStackMv[idx][1][1]
        ) {
          break;
        }
      }
      if (idx < this.NumMvFound) {
        this.WeightStack[idx] += 2;
      } else if (this.NumMvFound < MAX_REF_MV_STACK_SIZE) {
        this.RefStackMv[this.NumMvFound][0] = clone(candMv0);
        this.RefStackMv[this.NumMvFound][1] = clone(candMv1);
        this.WeightStack[this.NumMvFound] = 2;
        this.NumMvFound += 1;
      }
    }
  }

  /**
   * 7.10.2.7 Add reference motion vector process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#add-reference-motion-vector-process)
   */
  add_ref_mv_candidate(mvRow: number, mvCol: number, isCompound: number, weight: number) {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const rf = tg.ref_frames;

    if (db.IsInters[mvRow][mvCol] == 0) {
      return;
    }
    if (isCompound == 0) {
      for (let candList = 0; candList <= 1; candList++) {
        if (db.RefFrames[mvRow][mvCol][candList] == rf.RefFrame[0]) {
          this.search_stack(mvRow, mvCol, candList, weight);
        }
      }
    } else {
      if (db.RefFrames[mvRow][mvCol][0] == rf.RefFrame[0] && db.RefFrames[mvRow][mvCol][1] == rf.RefFrame[1]) {
        this.compound_search_stack(mvRow, mvCol, weight);
      }
    }
  }

  /**
   * 7.10.2.8 Search stack process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#search-stack-process)
   */
  search_stack(mvRow: number, mvCol: number, candList: number, weight: number) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const gmp = fh.global_motion_params;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const rf = tg.ref_frames;

    let candMode = db.YModes[mvRow][mvCol];
    let candSize = db.MiSizes[mvRow][mvCol];
    let large = Number(Math.min(Block_Width[candSize], Block_Height[candSize]) >= 8);

    let candMv: number[];
    if ((candMode == Y_MODE.GLOBALMV || candMode == Y_MODE.GLOBAL_GLOBALMV) && gmp.GmType[rf.RefFrame[0]] > TRANSLATION && large == 1) {
      candMv = clone(this.GlobalMvs[0]);
    } else {
      candMv = clone(db.Mvs[mvRow][mvCol][candList]);
    }

    this.lower_mv_precision(candMv);

    if (this.has_newmv(candMode) == 1) {
      this.NewMvCount = this.NewMvCount + 1;
    }
    this.FoundMatch = 1;

    let idx: number;
    for (idx = 0; idx < this.NumMvFound; idx++) {
      if (listCompare(candMv, this.RefStackMv[idx][0]) == 0) {
        this.WeightStack[idx] += weight;
        break;
      }
    }
    if (idx == this.NumMvFound && this.NumMvFound < MAX_REF_MV_STACK_SIZE) {
      // a.
      this.RefStackMv = Array3D(this.RefStackMv, this.NumMvFound + 1, 2);
      this.RefStackMv[this.NumMvFound][0] = clone(candMv);

      // b.
      this.WeightStack[this.NumMvFound] = weight;

      // c.
      this.NumMvFound = this.NumMvFound + 1;
    }
  }

  /**
   * 7.10.2.9 Compound search stack process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#compound-search-stack-process)
   */
  compound_search_stack(mvRow: number, mvCol: number, weight: number) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const gmp = fh.global_motion_params;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const rf = tg.ref_frames;

    let candMvs = clone(db.Mvs[mvRow][mvCol]);
    let candMode = db.YModes[mvRow][mvCol];
    let candSize = db.MiSizes[mvRow][mvCol];

    if (candMode == Y_MODE.GLOBAL_GLOBALMV) {
      for (let refList = 0; refList <= 1; refList++) {
        if (gmp.GmType[rf.RefFrame[refList]] > TRANSLATION) {
          candMvs[refList] = clone(this.GlobalMvs[refList]);
        }
      }
    }
    for (let i = 0; i <= 1; i++) {
      this.lower_mv_precision(candMvs[i]);
    }

    this.FoundMatch = 1;

    let idx: number;
    for (idx = 0; idx < this.NumMvFound; idx++) {
      if (listCompare(candMvs[0], this.RefStackMv[idx][0]) == 0 && listCompare(candMvs[1], this.RefStackMv[idx][1]) == 0) {
        this.WeightStack[idx] += weight;
        break;
      }
    }
    if (idx == this.NumMvFound && this.NumMvFound < MAX_REF_MV_STACK_SIZE) {
      // a.
      for (let i = 0; i <= 1; i++) {
        this.RefStackMv[this.NumMvFound][i] = clone(candMvs[i]);
      }

      // b.
      this.WeightStack[this.NumMvFound] = weight;

      // c.
      this.NumMvFound = this.NumMvFound + 1;
    } else {
    }

    if (this.has_newmv(candMode) == 1) {
      this.NewMvCount = this.NewMvCount + 1;
    }
  }
  has_newmv(mode: Y_MODE) {
    return Number(
      mode == Y_MODE.NEWMV || mode == Y_MODE.NEW_NEWMV || mode == Y_MODE.NEAR_NEWMV || mode == Y_MODE.NEW_NEARMV || mode == Y_MODE.NEAREST_NEWMV || mode == Y_MODE.NEW_NEARESTMV
    );
  }

  /**
   * 7.10.2.10 Lower precision process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#lower-precision-process)
   */
  lower_mv_precision(candMv: number[]) {
    const fh = this.decoder.frameHeaderObu.frameHeader;

    if (fh.allow_high_precision_mv == 1) {
      return;
    }
    for (let i = 0; i <= 1; i++) {
      if (fh.force_integer_mv) {
        let a = Math.abs(candMv[i]);
        let aInt = (a + 3) >> 3;
        if (candMv[i] > 0) {
          candMv[i] = aInt << 3;
        } else {
          candMv[i] = -(aInt << 3);
        }
      } else {
        if (candMv[i] & 1) {
          if (candMv[i] > 0) {
            candMv[i]--;
          } else {
            candMv[i]++;
          }
        }
      }
    }
  }

  /**
   * 7.10.2.11 Sorting process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#sorting-process)
   */
  sorting(start: number, end: number, isCompound: number) {
    while (end > start) {
      let newEnd = start;
      for (let idx = start + 1; idx < end; idx++) {
        if (this.WeightStack[idx - 1] < this.WeightStack[idx]) {
          this.swap_stack(idx - 1, idx, isCompound);
          newEnd = idx;
        }
      }
      end = newEnd;
    }
  }

  /**
   * 7.10.2.11 Sorting process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#sorting-process)
   */
  swap_stack(i: number, j: number, isCompound: number) {
    let temp = this.WeightStack[i];
    this.WeightStack[i] = this.WeightStack[j];
    this.WeightStack[j] = temp;
    for (let list = 0; list < 1 + isCompound; list++) {
      for (let comp = 0; comp < 2; comp++) {
        temp = this.RefStackMv[i][list][comp];
        this.RefStackMv[i][list][comp] = this.RefStackMv[j][list][comp];
        this.RefStackMv[j][list][comp] = temp;
      }
    }
  }

  /**
   * 7.10.2.12 Extra search process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#extra-search-process)
   */
  extra_search(isCompound: number) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;

    for (let list = 0; list < 2; list++) {
      this.RefIdCount[list] = 0;
      this.RefDiffCount[list] = 0;
    }

    let w4 = Math.min(16, Num_4x4_Blocks_Wide[db.MiSize]);
    let h4 = Math.min(16, Num_4x4_Blocks_High[db.MiSize]);
    w4 = Math.min(w4, cis.MiCols - db.MiCol);
    h4 = Math.min(h4, cis.MiRows - db.MiRow);
    let num4x4 = Math.min(w4, h4);
    for (let pass = 0; pass < 2; pass++) {
      let idx = 0;
      while (idx < num4x4 && this.NumMvFound < 2) {
        let mvRow = db.MiRow + idx;
        let mvCol = db.MiCol - 1;
        if (pass == 0) {
          mvRow = db.MiRow - 1;
          mvCol = db.MiCol + idx;
        }
        if (!this.decoder.tileGroupObu.is_inside(mvRow, mvCol)) break;
        this.add_extra_mv_candidate(mvRow, mvCol, isCompound);
        if (pass == 0) {
          idx += Num_4x4_Blocks_Wide[db.MiSizes[mvRow][mvCol]];
        } else {
          idx += Num_4x4_Blocks_High[db.MiSizes[mvRow][mvCol]];
        }
      }
    }

    if (isCompound == 1) {
      let combinedMvs = Array3D<number>(null, 2, 2);
      for (let list = 0; list < 2; list++) {
        let compCount = 0;
        for (let idx = 0; idx < this.RefIdCount[list]; idx++) {
          combinedMvs[compCount][list] = clone(this.RefIdMvs[list][idx]);
          compCount++;
        }
        for (let idx = 0; idx < this.RefDiffCount[list] && compCount < 2; idx++) {
          combinedMvs[compCount][list] = clone(this.RefDiffMvs[list][idx]);
          compCount++;
        }
        while (compCount < 2) {
          combinedMvs[compCount][list] = clone(this.GlobalMvs[list]);
          compCount++;
        }
      }
      if (this.NumMvFound == 1) {
        if (!listCompare(combinedMvs[0][0], this.RefStackMv[0][0]) && !listCompare(combinedMvs[0][1], this.RefStackMv[0][1])) {
          this.RefStackMv[this.NumMvFound][0] = clone(combinedMvs[1][0]);
          this.RefStackMv[this.NumMvFound][1] = clone(combinedMvs[1][1]);
        } else {
          this.RefStackMv[this.NumMvFound][0] = clone(combinedMvs[0][0]);
          this.RefStackMv[this.NumMvFound][1] = clone(combinedMvs[0][1]);
        }
        this.WeightStack[this.NumMvFound] = 2;
        this.NumMvFound++;
      } else {
        for (let idx = 0; idx < 2; idx++) {
          this.RefStackMv[this.NumMvFound][0] = clone(combinedMvs[idx][0]);
          this.RefStackMv[this.NumMvFound][1] = clone(combinedMvs[idx][1]);
          this.WeightStack[this.NumMvFound] = 2;
          this.NumMvFound++;
        }
      }
    } else {
      this.RefStackMv = Array3D(this.RefStackMv, 2, 1);
      for (let idx = this.NumMvFound; idx < 2; idx++) {
        this.RefStackMv[idx][0] = clone(this.GlobalMvs[0]);
      }
    }
  }

  /**
   * 7.10.2.13 Add extra MV candidate process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#add-extra-mv-candidate-process)
   */
  add_extra_mv_candidate(mvRow: number, mvCol: number, isCompound: number) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const rf = tg.ref_frames;

    if (isCompound) {
      this.RefIdMvs = Array3D(this.RefIdMvs, 2, 1);
      this.RefDiffMvs = Array3D(this.RefDiffMvs, 2, 1);
      for (let candList = 0; candList < 2; candList++) {
        let candRef = db.RefFrames[mvRow][mvCol][candList];
        if (candRef > REF_FRAME.INTRA_FRAME) {
          for (let list = 0; list < 2; list++) {
            let candMv = clone(db.Mvs[mvRow][mvCol][candList]);
            if (candRef == rf.RefFrame[list] && this.RefIdCount[list] < 2) {
              this.RefIdMvs[list][this.RefIdCount[list]] = clone(candMv);
              this.RefIdCount[list]++;
            } else if (this.RefDiffCount[list] < 2) {
              if (fh.RefFrameSignBias[candRef] != fh.RefFrameSignBias[rf.RefFrame[list]]) {
                candMv[0] *= -1;
                candMv[1] *= -1;
              }
              this.RefDiffMvs[list][this.RefDiffCount[list]] = clone(candMv);
              this.RefDiffCount[list]++;
            }
          }
        }
      }
    } else {
      for (let candList = 0; candList < 2; candList++) {
        let candRef = db.RefFrames[mvRow][mvCol][candList];
        if (candRef > REF_FRAME.INTRA_FRAME) {
          let candMv = clone(db.Mvs[mvRow][mvCol][candList]);
          if (fh.RefFrameSignBias[candRef] != fh.RefFrameSignBias[rf.RefFrame[0]]) {
            candMv[0] *= -1;
            candMv[1] *= -1;
          }
          let idx: number;
          for (idx = 0; idx < this.NumMvFound; idx++) {
            if (listCompare(candMv, this.RefStackMv[idx][0]) == 0) {
              break;
            }
          }
          if (idx == this.NumMvFound) {
            this.RefStackMv[idx][0] = clone(candMv);
            this.WeightStack[idx] = 2;
            this.NumMvFound++;
          }
        }
      }
    }
  }

  /**
   * 7.10.2.14 Context and clamping process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#context-and-clamping-process)
   */
  context_and_clamping(isCompound: number, numNew: number) {
    const tgo = this.decoder.tileGroupObu;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;

    let bw = Block_Width[db.MiSize];
    let bh = Block_Height[db.MiSize];
    let numLists = isCompound ? 2 : 1;

    for (let idx = 0; idx < this.NumMvFound; idx++) {
      let z = 0;
      if (idx + 1 < this.NumMvFound) {
        let w0 = this.WeightStack[idx];
        let w1 = this.WeightStack[idx + 1];
        if (w0 >= REF_CAT_LEVEL) {
          if (w1 < REF_CAT_LEVEL) {
            z = 1;
          }
        } else {
          z = 2;
        }
      }
      this.DrlCtxStack[idx] = z;
    }

    for (let list = 0; list < numLists; list++) {
      for (let idx = 0; idx < this.NumMvFound; idx++) {
        let refMv = this.RefStackMv[idx][list];
        refMv[0] = tgo.clamp_mv_row(refMv[0], MV_BORDER + bh * 8);
        refMv[1] = tgo.clamp_mv_col(refMv[1], MV_BORDER + bw * 8);
        this.RefStackMv[idx][list] = refMv;
      }
    }

    if (this.CloseMatches == 0) {
      this.NewMvContext = Math.min(this.TotalMatches, 1); // 0,1
      this.RefMvContext = this.TotalMatches;
    } else if (this.CloseMatches == 1) {
      this.NewMvContext = 3 - Math.min(numNew, 1); // 2,3
      this.RefMvContext = 2 + this.TotalMatches;
    } else {
      this.NewMvContext = 5 - Math.min(numNew, 1); // 4,5
      this.RefMvContext = 5;
    }
  }

  /**
   * 7.10.3 Has overlappable candidates process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#has-overlappable-candidates-process)
   */
  has_overlappable_candidates() {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;

    if (db.AvailU) {
      let w4 = Num_4x4_Blocks_Wide[db.MiSize];
      for (let x4 = db.MiCol; x4 < Math.min(cis.MiCols, db.MiCol + w4); x4 += 2) {
        if (db.RefFrames[db.MiRow - 1][x4 | 1][0] > REF_FRAME.INTRA_FRAME) {
          return 1;
        }
      }
    }
    if (db.AvailL) {
      let h4 = Num_4x4_Blocks_High[db.MiSize];
      for (let y4 = db.MiRow; y4 < Math.min(cis.MiRows, db.MiRow + h4); y4 += 2) {
        if (db.RefFrames[y4 | 1][db.MiCol - 1][0] > REF_FRAME.INTRA_FRAME) {
          return 1;
        }
      }
    }
    return 0;
  }

  /**
   * 7.10.4 Find warp samples process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#find-warp-samples-process)
   */
  find_warp_samples() {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;

    this.NumSamples = 0;
    this.NumSamplesScanned = 0;
    let w4 = Num_4x4_Blocks_Wide[db.MiSize];
    let h4 = Num_4x4_Blocks_High[db.MiSize];

    let doTopLeft = 1;
    let doTopRight = 1;
    if (db.AvailU) {
      let srcSize = db.MiSizes[db.MiRow - 1][db.MiCol];
      let srcW = Num_4x4_Blocks_Wide[srcSize];
      if (w4 <= srcW) {
        let colOffset = -(db.MiCol & (srcW - 1));
        if (colOffset < 0) {
          doTopLeft = 0;
        }
        if (colOffset + srcW > w4) {
          doTopRight = 0;
        }
        this.add_sample(-1, 0);
      } else {
        let miStep: number;
        for (let i = 0; i < Math.min(w4, cis.MiCols - db.MiCol); i += miStep) {
          srcSize = db.MiSizes[db.MiRow - 1][db.MiCol + i];
          srcW = Num_4x4_Blocks_Wide[srcSize];
          miStep = Math.min(w4, srcW);
          this.add_sample(-1, i);
        }
      }
    }
    if (db.AvailL) {
      let srcSize = db.MiSizes[db.MiRow][db.MiCol - 1];
      let srcH = Num_4x4_Blocks_High[srcSize];
      if (h4 <= srcH) {
        let rowOffset = -(db.MiRow & (srcH - 1));
        if (rowOffset < 0) doTopLeft = 0;
        this.add_sample(0, -1);
      } else {
        let miStep: number;
        for (let i = 0; i < Math.min(h4, cis.MiRows - db.MiRow); i += miStep) {
          srcSize = db.MiSizes[db.MiRow + i][db.MiCol - 1];
          srcH = Num_4x4_Blocks_High[srcSize];
          miStep = Math.min(h4, srcH);
          this.add_sample(i, -1);
        }
      }
    }
    if (doTopLeft) {
      this.add_sample(-1, -1);
    }
    if (doTopRight) {
      if (Math.max(w4, h4) <= 16) {
        if (this.has_top_right()) {
          this.add_sample(-1, w4);
        }
      }
    }
    if (this.NumSamples == 0 && this.NumSamplesScanned > 0) {
      this.NumSamples = 1;
    }
  }

  /**
   * 7.10.4.2 Add sample process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#add-sample-process)
   */
  add_sample(deltaRow: number, deltaCol: number) {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const rf = tg.ref_frames;
    const m = tg.mv;

    if (this.NumSamplesScanned >= LEAST_SQUARES_SAMPLES_MAX) {
      return;
    }

    let mvRow = db.MiRow + deltaRow;
    let mvCol = db.MiCol + deltaCol;
    if (this.decoder.tileGroupObu.is_inside(mvRow, mvCol) == 0) {
      return;
    }
    if (db.RefFrames[mvRow][mvCol][0] == undefined) {
      return;
    }
    if (db.RefFrames[mvRow][mvCol][0] != rf.RefFrame[0]) {
      return;
    }
    if (db.RefFrames[mvRow][mvCol][1] != REF_FRAME.NONE) {
      return;
    }

    let candSz = db.MiSizes[mvRow][mvCol];
    let candW4 = Num_4x4_Blocks_Wide[candSz];
    let candH4 = Num_4x4_Blocks_High[candSz];
    let candRow = mvRow & ~(candH4 - 1);
    let candCol = mvCol & ~(candW4 - 1);
    let midY = candRow * 4 + candH4 * 2 - 1;
    let midX = candCol * 4 + candW4 * 2 - 1;
    let threshold = Clip3(16, 112, Math.max(Block_Width[db.MiSize], Block_Height[db.MiSize]));
    let mvDiffRow = Math.abs(db.Mvs[candRow][candCol][0][0] - m.Mv[0][0]);
    let mvDiffCol = Math.abs(db.Mvs[candRow][candCol][0][1] - m.Mv[0][1]);
    let valid = Number(mvDiffRow + mvDiffCol <= threshold);

    let cand: number[] = [];
    cand[0] = midY * 8;
    cand[1] = midX * 8;
    cand[2] = midY * 8 + db.Mvs[candRow][candCol][0][0];
    cand[3] = midX * 8 + db.Mvs[candRow][candCol][0][1];

    // 1.
    this.NumSamplesScanned += 1;

    // 2.
    if (valid == 0 && this.NumSamplesScanned > 1) {
      return;
    }

    // 3.
    this.CandList = Array2D(this.CandList, this.NumSamples + 1);
    for (let j = 0; j <= 3; j++) {
      this.CandList[this.NumSamples][j] = cand[j];
    }

    // 4.
    if (valid == 1) {
      this.NumSamples += 1;
    }
  }
}
