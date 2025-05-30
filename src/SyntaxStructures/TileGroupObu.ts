import { Array1D, Array2D, Array3D, Array4D, Array5D, CeilLog2, Clip1, Clip3, clone, integer, Round2 } from "../Conventions";
import { AV1Decoder } from "./Obu";

import {
  COMP_MODE,
  COMP_REF_TYPE,
  COMPOUND_TYPE,
  FILTER_INTRA_MODE,
  FRAME_RESTORATION_TYPE,
  INTERINTRA_MODE,
  INTERPOLATION_FILTER,
  MASK_TYPE,
  MOTION_MODE,
  MV_CLASS,
  MV_JOINT,
  OBU_HEADER_TYPE,
  PARTITION,
  REF_FRAME,
  SET,
  SIGN_UV,
  SUB_SIZE,
  TX_MODE,
  TX_SIZE,
  Y_MODE,
} from "./Semantics";

import { assert } from "console";
import {
  Block_Height,
  Block_Width,
  Max_Tx_Size_Rect,
  Mi_Height_Log2,
  Mi_Width_Log2,
  Mode_To_Txfm,
  Num_4x4_Blocks_High,
  Num_4x4_Blocks_Wide,
  Palette_Color_Hash_Multipliers,
  Partition_Subsize,
  Split_Tx_Size,
  Tx_Height,
  Tx_Height_Log2,
  Tx_Size_Sqr,
  Tx_Size_Sqr_Up,
  Tx_Width,
  Tx_Width_Log2,
  Wedge_Bits,
} from "../AdditionalTables/ConversionTables";
import {
  Default_Scan_16x16,
  Default_Scan_16x32,
  Default_Scan_16x4,
  Default_Scan_16x8,
  Default_Scan_32x16,
  Default_Scan_32x32,
  Default_Scan_32x8,
  Default_Scan_4x16,
  Default_Scan_4x4,
  Default_Scan_4x8,
  Default_Scan_8x16,
  Default_Scan_8x32,
  Default_Scan_8x4,
  Default_Scan_8x8,
  Mcol_Scan_16x16,
  Mcol_Scan_16x4,
  Mcol_Scan_16x8,
  Mcol_Scan_4x16,
  Mcol_Scan_4x4,
  Mcol_Scan_4x8,
  Mcol_Scan_8x16,
  Mcol_Scan_8x4,
  Mcol_Scan_8x8,
  Mrow_Scan_16x16,
  Mrow_Scan_16x4,
  Mrow_Scan_16x8,
  Mrow_Scan_4x16,
  Mrow_Scan_4x4,
  Mrow_Scan_4x8,
  Mrow_Scan_8x16,
  Mrow_Scan_8x4,
  Mrow_Scan_8x8,
} from "../AdditionalTables/ScanTables";
import { Sgr_Params } from "../Decoding/LoopRestoration";
import {
  ADST_ADST,
  ADST_DCT,
  ADST_FLIPADST,
  BR_CDF_SIZE,
  CLASS0_SIZE,
  COEFF_BASE_RANGE,
  DCT_ADST,
  DCT_DCT,
  DCT_FLIPADST,
  DELTA_LF_SMALL,
  DELTA_Q_SMALL,
  FLIPADST_ADST,
  FLIPADST_DCT,
  FLIPADST_FLIPADST,
  FRAME_LF_COUNT,
  H_ADST,
  H_DCT,
  H_FLIPADST,
  IDTX,
  INTRABC_DELAY_PIXELS,
  INTRABC_DELAY_SB64,
  MAX_ANGLE_DELTA,
  MAX_LOOP_FILTER,
  MAX_VARTX_DEPTH,
  MI_SIZE,
  MI_SIZE_LOG2,
  MV_INTRABC_CONTEXT,
  NUM_BASE_LEVELS,
  PALETTE_COLORS,
  PALETTE_NUM_NEIGHBORS,
  REF_SCALE_SHIFT,
  SEG_LVL_GLOBALMV,
  SEG_LVL_REF_FRAME,
  SEG_LVL_SKIP,
  SGRPROJ_PARAMS_BITS,
  SGRPROJ_PRJ_BITS,
  SGRPROJ_PRJ_SUBEXP_K,
  SUPERRES_NUM,
  TRANSLATION,
  TX_SIZES_ALL,
  V_ADST,
  V_DCT,
  V_FLIPADST,
  WIENER_COEFFS,
} from "../define";

const Wiener_Taps_Mid = [3, -7, 15];
const Sgrproj_Xqd_Mid = [-32, 31];
const Max_Tx_Depth = [0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 4, 4, 4, 2, 2, 3, 3, 4, 4];
/**
 * 5.11 Tile group OBU syntax
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#tile-group-obu-syntax)
 */
export class TileGroupObu {
  titleGroup: TileGroup;
  private init: boolean = false;
  private decoder: AV1Decoder;

  constructor(d: AV1Decoder) {
    this.titleGroup = {
      decode_tile: {
        DeltaLF: [],
      },
      block_decoded: {},
      decode_partition: {},
      decode_block: {
        PaletteCache: [],
      },
      intra_frame_mode_info: {
        LeftRefFrame: [],
        AboveRefFrame: [],
      },
      intra_segment_id: {
        AboveSegPredContext: [],
        LeftSegPredContext: [],
      },
      segment_id: {},
      skip_mode: {},
      skip: {},
      cdef_params: {
        cdef_y_pri_strength: [],
        cdef_uv_pri_strength: [],
        cdef_y_sec_strength: [],
        cdef_uv_sec_strength: [],
      },
      lr_params: {
        FrameRestorationType: [],
        LoopRestorationSize: [],
      },
      tx_size: {},
      block_tx_size: {},
      transform_type: {},
      is_inter: {},
      inter_block_mode_info: {
        interp_filter: [],
      },
      filter_intra_mode_info: {},
      ref_frames: {
        RefFrame: [],
      },
      motion_mode: {},
      inter_intra: {},
      compound_type: {},
      mv: {
        PredMv: [],
      },
      transform_block: {},
      coefficients: {
        Quant: [],
      },
      intra_angle_info: {},
      cfl_alphas: {},
      palette_mode_info: {
        palette_colors_y: [],
        palette_colors_u: [],
        palette_colors_v: [],
      },
      palette_tokens: {},
      palette_color_context: {
        ColorOrder: [],
      },
      cdef: {},
    } as any;

    this.decoder = d;
  }

  initialize() {
    if (this.init) {
      return;
    }
    this.init = true;
  }

  /**
   * 5.11.1 General tile group OBU syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#general-tile-group-obu-syntax)
   */
  tile_group_obu(sz: number) {
    const reader = this.decoder.reader;
    const obu = this.decoder.obu;
    const oh = obu.obuHeader;
    const tdo = this.decoder.temporalDelimiterObu;
    const fho = this.decoder.frameHeaderObu;
    const fh = fho.frameHeader;
    const ti = fh.tile_info;
    const tg = this.titleGroup;
    const dfw = this.decoder.decodeFrameWrapup;
    const p = this.decoder.prediction;
    const sd = this.decoder.symbolDecoder;
    this.initialize();

    tg.NumTiles = ti.TileCols * ti.TileRows;
    let startBitPos = reader.get_position();
    let tile_start_and_end_present_flag = 0;
    if (tg.NumTiles > 1) {
      tile_start_and_end_present_flag = reader.f(1);
    }
    if (oh.obu_type == OBU_HEADER_TYPE.OBU_FRAME) {
      assert(tile_start_and_end_present_flag == 0, "it is a requirement of bitstream conformance that the value of tile_start_and_end_present_flag is equal to 0");
    }

    if (tg.NumTiles == 1 || !tile_start_and_end_present_flag) {
      tg.tg_start = 0;
      tg.tg_end = tg.NumTiles - 1;
    } else {
      let tileBits = ti.TileColsLog2 + ti.TileRowsLog2;
      tg.tg_start = reader.f(tileBits);
      tg.tg_end = reader.f(tileBits);
    }
    assert(
      tg.tg_start == fh.TileNum,
      "It is a requirement of bitstream conformance that the value of tg_start is equal to the value of TileNum at the point that tile_group_obu is invoked."
    );
    assert(tg.tg_end >= tg.tg_start, "It is a requirement of bitstream conformance that the value of tg_end is greater than or equal to tg_start");
    obu.byte_alignment();
    let endBitPos = reader.get_position();
    let headerBytes = (endBitPos - startBitPos) / 8;
    sz -= headerBytes;
    let tileSize: number;
    for (fh.TileNum = tg.tg_start; fh.TileNum <= tg.tg_end; fh.TileNum++) {
      let tileRow = integer(fh.TileNum / ti.TileCols);
      let tileCol = fh.TileNum % ti.TileCols;
      let lastTile = fh.TileNum == tg.tg_end;
      if (lastTile) {
        tileSize = sz;
      } else {
        let tile_size_minus_1 = reader.le(ti.TileSizeBytes);
        tileSize = tile_size_minus_1 + 1;
        sz -= tileSize + ti.TileSizeBytes;
      }
      tg.MiRowStart = ti.MiRowStarts[tileRow];
      tg.MiRowEnd = ti.MiRowStarts[tileRow + 1];
      tg.MiColStart = ti.MiColStarts[tileCol];
      tg.MiColEnd = ti.MiColStarts[tileCol + 1];
      tg.CurrentQIndex = fh.quantization_params.base_q_idx;
      sd.init_symbol(tileSize);
      this.decode_tile();
      sd.exit_symbol();
    }

    if (tg.tg_end == tg.NumTiles - 1) {
      assert(tg.tg_end == tg.NumTiles - 1, "It is a requirement of bitstream conformance that the value of tg_end for the last tile group in each frame is equal to NumTiles - 1.");
      if (!fh.disable_frame_end_update_cdf) {
        fho.frame_end_update_cdf();
      }
      dfw.decode_frame_wrapup();
      tdo.SeenFrameHeader = 0;
    }
  }

  /**
   * 5.11.2 Decode tile syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#decode-tile-syntax)
   */
  decode_tile() {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const dqp = fh.delta_q_params;
    const tg = this.titleGroup;
    const dt = tg.decode_tile;
    const rc = tg.cdef;

    this.clear_above_context();
    for (let i = 0; i < FRAME_LF_COUNT; i++) {
      dt.DeltaLF[i] = 0;
    }
    dt.RefSgrXqd = Array2D(dt.RefSgrXqd, cc.NumPlanes);
    dt.RefLrWiener = Array3D(dt.RefLrWiener, cc.NumPlanes, 2);
    for (let plane = 0; plane < cc.NumPlanes; plane++) {
      for (let pass = 0; pass < 2; pass++) {
        dt.RefSgrXqd[plane][pass] = Sgrproj_Xqd_Mid[pass];
        for (let i = 0; i < WIENER_COEFFS; i++) {
          dt.RefLrWiener[plane][pass][i] = Wiener_Taps_Mid[i];
        }
      }
    }
    let sbSize = seqHeader.use_128x128_superblock ? SUB_SIZE.BLOCK_128X128 : SUB_SIZE.BLOCK_64X64;
    let sbSize4 = Num_4x4_Blocks_Wide[sbSize];
    rc.cdef_idx = Array2D(rc.cdef_idx, tg.MiRowEnd + 16);
    for (let r = tg.MiRowStart; r < tg.MiRowEnd; r += sbSize4) {
      this.clear_left_context();
      for (let c = tg.MiColStart; c < tg.MiColEnd; c += sbSize4) {
        dt.ReadDeltas = dqp.delta_q_present;
        this.clear_cdef(r, c);
        this.clear_block_decoded_flags(r, c, sbSize4);
        this.read_lr(r, c, sbSize);
        this.decode_partition(r, c, sbSize);
      }
    }
  }

  /**
   * 5.11.3 Clear block decoded flags function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#clear-block-decoded-flags-function)
   */
  clear_block_decoded_flags(r: number, c: number, sbSize4: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const tg = this.titleGroup;
    const bd = tg.block_decoded;

    bd.BlockDecoded = Array3D(bd.BlockDecoded, cc.NumPlanes, { begin: -1, end: sbSize4 + 1 });
    for (let plane = 0; plane < cc.NumPlanes; plane++) {
      let subX = plane > 0 ? cc.subsampling_x : 0;
      let subY = plane > 0 ? cc.subsampling_y : 0;
      let sbWidth4 = (tg.MiColEnd - c) >> subX;
      let sbHeight4 = (tg.MiRowEnd - r) >> subY;

      for (let y = -1; y <= sbSize4 >> subY; y++) {
        for (let x = -1; x <= sbSize4 >> subX; x++) {
          if (y < 0 && x < sbWidth4) {
            bd.BlockDecoded[plane][y][x] = 1;
          } else if (x < 0 && y < sbHeight4) {
            bd.BlockDecoded[plane][y][x] = 1;
          } else {
            bd.BlockDecoded[plane][y][x] = 0;
          }
        }
      }
      bd.BlockDecoded[plane][sbSize4 >> subY][-1] = 0;
    }
  }

  /**
   * 5.11.4 Decode partition syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#decode-partition-syntax)
   */
  decode_partition(r: number, c: number, bSize: SUB_SIZE) {
    const reader = this.decoder.reader;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const tg = this.titleGroup;
    const dp = tg.decode_partition;
    const db = tg.decode_block;

    if (r >= cis.MiRows || c >= cis.MiCols) {
      return 0;
    }
    db.AvailU = this.is_inside(r - 1, c);
    db.AvailL = this.is_inside(r, c - 1);
    let num4x4 = Num_4x4_Blocks_Wide[bSize];
    let halfBlock4x4 = num4x4 >> 1;
    let quarterBlock4x4 = halfBlock4x4 >> 1;
    let hasRows = r + halfBlock4x4 < cis.MiRows;
    let hasCols = c + halfBlock4x4 < cis.MiCols;
    if (bSize < SUB_SIZE.BLOCK_8X8) {
      dp.partition = PARTITION.PARTITION_NONE;
    } else if (hasRows && hasCols) {
      dp.partition = reader.S("partition", { r, c, bSize });
    } else if (hasCols) {
      dp.split_or_horz = reader.S("split_or_horz", { r, c, bSize });
      dp.partition = dp.split_or_horz ? PARTITION.PARTITION_SPLIT : PARTITION.PARTITION_HORZ;
    } else if (hasRows) {
      dp.split_or_vert = reader.S("split_or_vert", { r, c, bSize });
      dp.partition = dp.split_or_vert ? PARTITION.PARTITION_SPLIT : PARTITION.PARTITION_VERT;
    } else {
      dp.partition = PARTITION.PARTITION_SPLIT;
    }

    let subSize = Partition_Subsize[dp.partition][bSize];
    assert(
      this.get_plane_residual_size(subSize, 1) != SUB_SIZE.BLOCK_INVALID,
      "It is a requirement of bitstream conformance that get_plane_residual_size( subSize, 1 ) is not equal to SUB_SIZE.BLOCK_INVALID every time subSize is computed"
    );
    let splitSize = Partition_Subsize[PARTITION.PARTITION_SPLIT][bSize];
    if (dp.partition == PARTITION.PARTITION_NONE) {
      this.decode_block(r, c, subSize);
    } else if (dp.partition == PARTITION.PARTITION_HORZ) {
      this.decode_block(r, c, subSize);
      if (hasRows) this.decode_block(r + halfBlock4x4, c, subSize);
    } else if (dp.partition == PARTITION.PARTITION_VERT) {
      this.decode_block(r, c, subSize);
      if (hasCols) this.decode_block(r, c + halfBlock4x4, subSize);
    } else if (dp.partition == PARTITION.PARTITION_SPLIT) {
      this.decode_partition(r, c, subSize);
      this.decode_partition(r, c + halfBlock4x4, subSize);
      this.decode_partition(r + halfBlock4x4, c, subSize);
      this.decode_partition(r + halfBlock4x4, c + halfBlock4x4, subSize);
    } else if (dp.partition == PARTITION.PARTITION_HORZ_A) {
      this.decode_block(r, c, splitSize);
      this.decode_block(r, c + halfBlock4x4, splitSize);
      this.decode_block(r + halfBlock4x4, c, subSize);
    } else if (dp.partition == PARTITION.PARTITION_HORZ_B) {
      this.decode_block(r, c, subSize);
      this.decode_block(r + halfBlock4x4, c, splitSize);
      this.decode_block(r + halfBlock4x4, c + halfBlock4x4, splitSize);
    } else if (dp.partition == PARTITION.PARTITION_VERT_A) {
      this.decode_block(r, c, splitSize);
      this.decode_block(r + halfBlock4x4, c, splitSize);
      this.decode_block(r, c + halfBlock4x4, subSize);
    } else if (dp.partition == PARTITION.PARTITION_VERT_B) {
      this.decode_block(r, c, subSize);
      this.decode_block(r, c + halfBlock4x4, splitSize);
      this.decode_block(r + halfBlock4x4, c + halfBlock4x4, splitSize);
    } else if (dp.partition == PARTITION.PARTITION_HORZ_4) {
      this.decode_block(r + quarterBlock4x4 * 0, c, subSize);
      this.decode_block(r + quarterBlock4x4 * 1, c, subSize);
      this.decode_block(r + quarterBlock4x4 * 2, c, subSize);
      if (r + quarterBlock4x4 * 3 < cis.MiRows) this.decode_block(r + quarterBlock4x4 * 3, c, subSize);
    } else {
      this.decode_block(r, c + quarterBlock4x4 * 0, subSize);
      this.decode_block(r, c + quarterBlock4x4 * 1, subSize);
      this.decode_block(r, c + quarterBlock4x4 * 2, subSize);
      if (c + quarterBlock4x4 * 3 < cis.MiCols) this.decode_block(r, c + quarterBlock4x4 * 3, subSize);
    }
  }

  /**
   * 5.11.5 Decode block syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#decode-block-syntax)
   */
  decode_block(r: number, c: number, subSize: SUB_SIZE) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const tg = this.titleGroup;
    const dt = tg.decode_tile;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;
    const si = tg.segment_id;
    const sm = tg.skip_mode;
    const s = tg.skip;
    const ts = tg.tx_size;
    const ii = tg.is_inter;
    const ibmi = tg.inter_block_mode_info;
    const rf = tg.ref_frames;
    const rct = tg.compound_type;
    const m = tg.mv;
    const pmi = tg.palette_mode_info;

    db.MiRow = r;
    db.MiCol = c;
    db.MiSize = subSize;
    let bw4 = Num_4x4_Blocks_Wide[subSize];
    let bh4 = Num_4x4_Blocks_High[subSize];
    if (bh4 == 1 && cc.subsampling_y && (db.MiRow & 1) == 0) {
      db.HasChroma = 0;
    } else if (bw4 == 1 && cc.subsampling_x && (db.MiCol & 1) == 0) {
      db.HasChroma = 0;
    } else {
      db.HasChroma = Number(cc.NumPlanes > 1);
    }
    db.AvailU = this.is_inside(r - 1, c);
    db.AvailL = this.is_inside(r, c - 1);
    db.AvailUChroma = db.AvailU;
    db.AvailLChroma = db.AvailL;
    if (db.HasChroma) {
      if (cc.subsampling_y && bh4 == 1) {
        db.AvailUChroma = this.is_inside(r - 2, c);
      }
      if (cc.subsampling_x && bw4 == 1) {
        db.AvailLChroma = this.is_inside(r, c - 2);
      }
    } else {
      db.AvailUChroma = 0;
      db.AvailLChroma = 0;
    }
    this.mode_info();
    this.palette_tokens();
    this.read_block_tx_size();

    if (s.skip) {
      this.reset_block_context(bw4, bh4);
    }
    let isCompound = Number(rf.RefFrame[1] > REF_FRAME.INTRA_FRAME);
    db.YModes = Array2D(db.YModes, r + bh4);
    db.UVModes = Array2D(db.UVModes, r + bh4);
    db.RefFrames = Array3D(db.RefFrames, r + bh4, c + bw4);
    db.CompGroupIdxs = Array2D(db.CompGroupIdxs, r + bh4);
    db.CompoundIdxs = Array2D(db.CompoundIdxs, r + bh4);
    db.InterpFilters = Array3D(db.InterpFilters, r + bh4, c + bw4);
    db.Mvs = Array4D(db.Mvs, r + bh4, c + bw4, 2);
    for (let y = 0; y < bh4; y++) {
      for (let x = 0; x < bw4; x++) {
        db.YModes[r + y][c + x] = ifmi.YMode;
        if (rf.RefFrame[0] == REF_FRAME.INTRA_FRAME && db.HasChroma) {
          db.UVModes[r + y][c + x] = ifmi.UVMode;
        }
        for (let refList = 0; refList < 2; refList++) {
          db.RefFrames[r + y][c + x][refList] = rf.RefFrame[refList];
        }
        if (ii.is_inter) {
          if (!ifmi.use_intrabc) {
            db.CompGroupIdxs[r + y][c + x] = rct.comp_group_idx;
            db.CompoundIdxs[r + y][c + x] = rct.compound_idx;
          }
          for (let dir = 0; dir < 2; dir++) {
            db.InterpFilters[r + y][c + x][dir] = ibmi.interp_filter[dir];
          }
          for (let refList = 0; refList < 1 + isCompound; refList++) {
            db.Mvs[r + y][c + x][refList] = clone(m.Mv[refList]);
          }
        }
      }
    }
    this.compute_prediction();
    this.residual();

    db.IsInters = Array2D(db.IsInters, r + bh4);
    db.SkipModes = Array2D(db.SkipModes, r + bh4);
    db.Skips = Array2D(db.Skips, r + bh4);
    db.TxSizes = Array2D(db.TxSizes, r + bh4);
    db.MiSizes = Array2D(db.MiSizes, r + bh4);
    db.SegmentIds = Array2D(db.SegmentIds, r + bh4);
    db.PaletteSizes = Array3D(db.PaletteSizes, 2, r + bh4);
    db.DeltaLFs = Array3D(db.DeltaLFs, r + bh4, c + bw4);
    db.PaletteColors = Array4D(db.PaletteColors, 2, r + bh4, c + bw4);
    for (let y = 0; y < bh4; y++) {
      for (let x = 0; x < bw4; x++) {
        db.IsInters[r + y][c + x] = ii.is_inter;
        db.SkipModes[r + y][c + x] = sm.skip_mode;
        db.Skips[r + y][c + x] = s.skip;
        db.TxSizes[r + y][c + x] = ts.TxSize;
        db.MiSizes[r + y][c + x] = db.MiSize;
        db.SegmentIds[r + y][c + x] = si.segment_id;
        db.PaletteSizes[0][r + y][c + x] = pmi.PaletteSizeY;
        db.PaletteSizes[1][r + y][c + x] = pmi.PaletteSizeUV;
        for (let i = 0; i < pmi.PaletteSizeY; i++) {
          db.PaletteColors[0][r + y][c + x][i] = pmi.palette_colors_y[i];
        }
        for (let i = 0; i < pmi.PaletteSizeUV; i++) {
          db.PaletteColors[1][r + y][c + x][i] = pmi.palette_colors_u[i];
        }
        for (let i = 0; i < FRAME_LF_COUNT; i++) {
          db.DeltaLFs[r + y][c + x][i] = dt.DeltaLF[i];
        }
      }
    }
  }

  /**
   * 5.11.5 Decode block syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#decode-block-syntax)
   */
  reset_block_context(bw4: number, bh4: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const coef = tg.coefficients;

    for (let plane = 0; plane < 1 + 2 * db.HasChroma; plane++) {
      let subX = plane > 0 ? cc.subsampling_x : 0;
      let subY = plane > 0 ? cc.subsampling_y : 0;
      for (let i = db.MiCol >> subX; i < (db.MiCol + bw4) >> subX; i++) {
        coef.AboveLevelContext[plane][i] = 0;
        coef.AboveDcContext[plane][i] = 0;
      }
      for (let i = db.MiRow >> subY; i < (db.MiRow + bh4) >> subY; i++) {
        coef.LeftLevelContext[plane][i] = 0;
        coef.LeftDcContext[plane][i] = 0;
      }
    }
  }

  /**
   * 5.11.6 Mode info syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#mode-info-syntax)
   */
  mode_info() {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const sp = fh.segmentation_params;
    const tg = this.titleGroup;
    const si = tg.segment_id;

    if (fh.FrameIsIntra) {
      this.intra_frame_mode_info();
    } else {
      this.inter_frame_mode_info();
    }
    assert(
      si.segment_id >= 0 && si.segment_id <= sp.LastActiveSegId,
      "It is a requirement of bitstream conformance that the postprocessed value of segment_id is in the range 0 to LastActiveSegId"
    );
  }

  /**
   * 5.11.7 Intra frame mode info syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#intra-frame-mode-info-syntax)
   */
  intra_frame_mode_info() {
    const reader = this.decoder.reader;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const sp = fh.segmentation_params;
    const tg = this.titleGroup;
    const dt = tg.decode_tile;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;
    const sm = tg.skip_mode;
    const s = tg.skip;
    const ii = tg.is_inter;
    const ibmi = tg.inter_block_mode_info;
    const rf = tg.ref_frames;
    const rmm = tg.motion_mode;
    const rct = tg.compound_type;
    const pmi = tg.palette_mode_info;
    const mvp = this.decoder.motionVectorPrediction;

    s.skip = 0;
    if (sp.SegIdPreSkip) {
      this.intra_segment_id();
    }
    sm.skip_mode = 0;
    this.read_skip();
    if (!sp.SegIdPreSkip) {
      this.intra_segment_id();
    }
    this.read_cdef();
    this.read_delta_qindex();
    this.read_delta_lf();
    dt.ReadDeltas = 0;
    rf.RefFrame[0] = REF_FRAME.INTRA_FRAME;
    rf.RefFrame[1] = REF_FRAME.NONE;
    if (fh.allow_intrabc) {
      ifmi.use_intrabc = reader.S("use_intrabc");
    } else {
      ifmi.use_intrabc = 0;
    }
    if (ifmi.use_intrabc) {
      ii.is_inter = 1;
      ifmi.YMode = Y_MODE.DC_PRED;
      ifmi.UVMode = Y_MODE.DC_PRED;
      rmm.motion_mode = MOTION_MODE.SIMPLE;
      rct.compound_type = COMPOUND_TYPE.COMPOUND_AVERAGE;
      pmi.PaletteSizeY = 0;
      pmi.PaletteSizeUV = 0;
      ibmi.interp_filter[0] = INTERPOLATION_FILTER.BILINEAR;
      ibmi.interp_filter[1] = INTERPOLATION_FILTER.BILINEAR;
      mvp.find_mv_stack(0);
      this.assign_mv(0);
    } else {
      ii.is_inter = 0;
      ifmi.intra_frame_y_mode = reader.S("intra_frame_y_mode");
      ifmi.YMode = ifmi.intra_frame_y_mode;
      this.intra_angle_info_y();
      if (db.HasChroma) {
        ifmi.uv_mode = reader.S("uv_mode");
        ifmi.UVMode = ifmi.uv_mode;
        if (ifmi.UVMode == Y_MODE.UV_CFL_PRED) {
          this.read_cfl_alphas();
        }
        this.intra_angle_info_uv();
      }
      pmi.PaletteSizeY = 0;
      pmi.PaletteSizeUV = 0;
      if (db.MiSize >= SUB_SIZE.BLOCK_8X8 && Block_Width[db.MiSize] <= 64 && Block_Height[db.MiSize] <= 64 && fh.allow_screen_content_tools) {
        this.palette_mode_info();
      }
      this.filter_intra_mode_info();
    }
  }

  /**
   * 5.11.8 Intra segment ID syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#intra-segment-id-syntax)
   */
  intra_segment_id() {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const sp = fh.segmentation_params;
    const tg = this.titleGroup;
    const isi = tg.intra_segment_id;
    const si = tg.segment_id;

    if (sp.segmentation_enabled) {
      this.read_segment_id();
    } else {
      si.segment_id = 0;
    }
    isi.Lossless = fh.LosslessArray[si.segment_id];
  }

  /**
   * 5.11.9 Read segment ID syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#read-segment-id-syntax)
   */
  read_segment_id() {
    const reader = this.decoder.reader;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const sp = fh.segmentation_params;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const si = tg.segment_id;
    const s = tg.skip;

    let prevUL = -1;
    if (db.AvailU && db.AvailL) prevUL = db.SegmentIds[db.MiRow - 1][db.MiCol - 1];

    let prevU = -1;
    if (db.AvailU) prevU = db.SegmentIds[db.MiRow - 1][db.MiCol];

    let prevL = -1;
    if (db.AvailL) prevL = db.SegmentIds[db.MiRow][db.MiCol - 1];

    let pred = 0;
    if (prevU == -1) {
      pred = prevL == -1 ? 0 : prevL;
    } else if (prevL == -1) {
      pred = prevU;
    } else {
      pred = prevUL == prevU ? prevU : prevL;
    }
    if (s.skip) {
      si.segment_id = pred;
    } else {
      si.segment_id = reader.S("segment_id", { prevUL, prevU, prevL });
      si.segment_id = this.neg_deinterleave(si.segment_id, pred, sp.LastActiveSegId + 1);
    }
  }

  /**
   * 5.11.9 Read segment ID syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#read-segment-id-syntax)
   */
  neg_deinterleave(diff: number, ref: number, max: number) {
    if (!ref) return diff;
    if (ref >= max - 1) return max - diff - 1;
    if (2 * ref < max) {
      if (diff <= 2 * ref) {
        if (diff & 1) return ref + ((diff + 1) >> 1);
        else return ref - (diff >> 1);
      }
      return diff;
    } else {
      if (diff <= 2 * (max - ref - 1)) {
        if (diff & 1) return ref + ((diff + 1) >> 1);
        else return ref - (diff >> 1);
      }
      return max - (diff + 1);
    }
  }

  /**
   * 5.11.10 Skip mode syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#skip-mode-syntax)
   */
  read_skip_mode() {
    const reader = this.decoder.reader;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const smp = fh.skip_mode_params;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const sm = tg.skip_mode;

    if (
      this.seg_feature_active(SEG_LVL_SKIP) ||
      this.seg_feature_active(SEG_LVL_REF_FRAME) ||
      this.seg_feature_active(SEG_LVL_GLOBALMV) ||
      !smp.skip_mode_present ||
      Block_Width[db.MiSize] < 8 ||
      Block_Height[db.MiSize] < 8
    ) {
      sm.skip_mode = 0;
    } else {
      sm.skip_mode = reader.S("skip_mode");
    }
  }

  /**
   * 5.11.11 Skip syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#skip-syntax)
   */
  read_skip() {
    const reader = this.decoder.reader;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const sp = fh.segmentation_params;
    const tg = this.titleGroup;
    const s = tg.skip;

    if (sp.SegIdPreSkip && this.seg_feature_active(SEG_LVL_SKIP)) {
      s.skip = 1;
    } else {
      s.skip = reader.S("skip");
    }
  }

  /**
   * 5.11.12 Quantizer index delta syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#quantizer-index-delta-syntax)
   */
  read_delta_qindex() {
    const reader = this.decoder.reader;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const dqp = fh.delta_q_params;
    const tg = this.titleGroup;
    const dt = tg.decode_tile;
    const db = tg.decode_block;
    const s = tg.skip;

    let sbSize = seqHeader.use_128x128_superblock ? SUB_SIZE.BLOCK_128X128 : SUB_SIZE.BLOCK_64X64;
    if (db.MiSize == sbSize && s.skip) return;
    if (dt.ReadDeltas) {
      let delta_q_abs = reader.S("delta_q_abs");
      if (delta_q_abs == DELTA_Q_SMALL) {
        let delta_q_rem_bits = reader.L(3);
        delta_q_rem_bits++;
        let delta_q_abs_bits = reader.L(delta_q_rem_bits);
        delta_q_abs = delta_q_abs_bits + (1 << delta_q_rem_bits) + 1;
      }
      if (delta_q_abs) {
        let delta_q_sign_bit = reader.L(1);
        let reducedDeltaQIndex = delta_q_sign_bit ? -delta_q_abs : delta_q_abs;
        tg.CurrentQIndex = Clip3(1, 255, tg.CurrentQIndex + (reducedDeltaQIndex << dqp.delta_q_res));
      }
    }
  }

  /**
   * 5.11.13 Loop filter delta syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#loop-filter-delta-syntax)
   */
  read_delta_lf() {
    const reader = this.decoder.reader;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const dlp = fh.delta_lf_params;
    const tg = this.titleGroup;
    const dt = tg.decode_tile;
    const db = tg.decode_block;
    const s = tg.skip;

    let sbSize = seqHeader.use_128x128_superblock ? SUB_SIZE.BLOCK_128X128 : SUB_SIZE.BLOCK_64X64;
    if (db.MiSize == sbSize && s.skip) return;
    if (dt.ReadDeltas && dlp.delta_lf_present) {
      let frameLfCount = 1;
      if (dlp.delta_lf_multi) {
        frameLfCount = cc.NumPlanes > 1 ? FRAME_LF_COUNT : FRAME_LF_COUNT - 2;
      }
      for (let i = 0; i < frameLfCount; i++) {
        let delta_lf_abs = reader.S("delta_lf_abs", { i });
        let deltaLfAbs = delta_lf_abs;
        if (delta_lf_abs == DELTA_LF_SMALL) {
          let delta_lf_rem_bits = reader.L(3);
          let n = delta_lf_rem_bits + 1;
          let delta_lf_abs_bits = reader.L(n);
          let deltaLfAbs = delta_lf_abs_bits + (1 << n) + 1;
        }
        if (deltaLfAbs) {
          let delta_lf_sign_bit = reader.L(1);
          let reducedDeltaLfLevel = delta_lf_sign_bit ? -deltaLfAbs : deltaLfAbs;
          dt.DeltaLF[i] = Clip3(-MAX_LOOP_FILTER, MAX_LOOP_FILTER, dt.DeltaLF[i] + (reducedDeltaLfLevel << dlp.delta_lf_res));
        }
      }
    }
  }

  /**
   * 5.11.14 Segmentation feature active function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#segmentation-feature-active-function)
   */
  seg_feature_active_idx(idx: number, feature: number) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const sp = fh.segmentation_params;

    return sp.segmentation_enabled && sp.FeatureEnabled[idx][feature];
  }

  /**
   * 5.11.14 Segmentation feature active function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#segmentation-feature-active-function)
   */
  seg_feature_active(feature: number) {
    const tg = this.titleGroup;
    const si = tg.segment_id;
    return this.seg_feature_active_idx(si.segment_id, feature);
  }

  /**
   * 5.11.15 TX size syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#tx-size-syntax)
   */
  read_tx_size(allowSelect: number) {
    const reader = this.decoder.reader;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const rtm = fh.read_tx_mode;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const isi = tg.intra_segment_id;
    const ts = tg.tx_size;

    if (isi.Lossless) {
      ts.TxSize = TX_SIZE.TX_4X4;
      return;
    }
    let maxRectTxSize = Max_Tx_Size_Rect[db.MiSize];
    let maxTxDepth = Max_Tx_Depth[db.MiSize];
    ts.TxSize = maxRectTxSize;
    if (db.MiSize > SUB_SIZE.BLOCK_4X4 && allowSelect && rtm.TxMode == TX_MODE.TX_MODE_SELECT) {
      let tx_depth = reader.S("tx_depth", { maxRectTxSize, maxTxDepth });
      for (let i = 0; i < tx_depth; i++) {
        ts.TxSize = Split_Tx_Size[ts.TxSize];
      }
    }
  }

  /**
   * 5.11.16 Block TX size syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#block-tx-size-syntax)
   */
  read_block_tx_size() {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const rtm = fh.read_tx_mode;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const isi = tg.intra_segment_id;
    const s = tg.skip;
    const ts = tg.tx_size;
    const bts = tg.block_tx_size;
    const ii = tg.is_inter;

    let bw4 = Num_4x4_Blocks_Wide[db.MiSize];
    let bh4 = Num_4x4_Blocks_High[db.MiSize];
    if (rtm.TxMode == TX_MODE.TX_MODE_SELECT && db.MiSize > SUB_SIZE.BLOCK_4X4 && ii.is_inter && !s.skip && !isi.Lossless) {
      let maxTxSz = Max_Tx_Size_Rect[db.MiSize];
      let txW4 = Tx_Width[maxTxSz] / MI_SIZE;
      let txH4 = Tx_Height[maxTxSz] / MI_SIZE;
      for (let row = db.MiRow; row < db.MiRow + bh4; row += txH4)
        for (let col = db.MiCol; col < db.MiCol + bw4; col += txW4) {
          this.read_var_tx_size(row, col, maxTxSz, 0);
        }
    } else {
      this.read_tx_size(Number(!s.skip || !ii.is_inter));
      bts.InterTxSizes = Array2D(bts.InterTxSizes, db.MiRow + bh4);
      for (let row = db.MiRow; row < db.MiRow + bh4; row++)
        for (let col = db.MiCol; col < db.MiCol + bw4; col++) {
          bts.InterTxSizes[row][col] = ts.TxSize;
        }
    }
  }

  /**
   * 5.11.17 Var TX size syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#var-tx-size-syntax)
   */
  read_var_tx_size(row: number, col: number, txSz: number, depth: number) {
    const reader = this.decoder.reader;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const tg = this.titleGroup;
    const ts = tg.tx_size;
    const bts = tg.block_tx_size;

    if (row >= cis.MiRows || col >= cis.MiCols) return;
    let txfm_split: number;
    if (txSz == TX_SIZE.TX_4X4 || depth == MAX_VARTX_DEPTH) {
      txfm_split = 0;
    } else {
      txfm_split = reader.S("txfm_split", { row, col, txSz });
    }
    let w4 = Tx_Width[txSz] / MI_SIZE;
    let h4 = Tx_Height[txSz] / MI_SIZE;
    if (txfm_split) {
      let subTxSz = Split_Tx_Size[txSz];
      let stepW = Tx_Width[subTxSz] / MI_SIZE;
      let stepH = Tx_Height[subTxSz] / MI_SIZE;
      for (let i = 0; i < h4; i += stepH)
        for (let j = 0; j < w4; j += stepW) {
          this.read_var_tx_size(row + i, col + j, subTxSz, depth + 1);
        }
    } else {
      for (let i = 0; i < h4; i++)
        for (let j = 0; j < w4; j++) {
          bts.InterTxSizes[row + i][col + j] = txSz;
        }
      ts.TxSize = txSz;
    }
  }

  /**
   * 5.11.18 Inter frame mode info syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inter-frame-mode-info-syntax)
   */
  inter_frame_mode_info() {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const sp = fh.segmentation_params;
    const tg = this.titleGroup;
    const dt = tg.decode_tile;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;
    const isi = tg.intra_segment_id;
    const si = tg.segment_id;
    const sm = tg.skip_mode;
    const s = tg.skip;
    const ii = tg.is_inter;

    ifmi.use_intrabc = 0;
    ifmi.LeftRefFrame[0] = db.AvailL ? db.RefFrames[db.MiRow][db.MiCol - 1][0] : REF_FRAME.INTRA_FRAME;
    ifmi.AboveRefFrame[0] = db.AvailU ? db.RefFrames[db.MiRow - 1][db.MiCol][0] : REF_FRAME.INTRA_FRAME;
    ifmi.LeftRefFrame[1] = db.AvailL ? db.RefFrames[db.MiRow][db.MiCol - 1][1] : REF_FRAME.NONE;
    ifmi.AboveRefFrame[1] = db.AvailU ? db.RefFrames[db.MiRow - 1][db.MiCol][1] : REF_FRAME.NONE;
    ifmi.LeftIntra = ifmi.LeftRefFrame[0] <= REF_FRAME.INTRA_FRAME;
    ifmi.AboveIntra = ifmi.AboveRefFrame[0] <= REF_FRAME.INTRA_FRAME;
    ifmi.LeftSingle = ifmi.LeftRefFrame[1] <= REF_FRAME.INTRA_FRAME;
    ifmi.AboveSingle = ifmi.AboveRefFrame[1] <= REF_FRAME.INTRA_FRAME;
    s.skip = 0;
    this.inter_segment_id(1);
    this.read_skip_mode();
    if (sm.skip_mode) {
      s.skip = 1;
    } else {
      this.read_skip();
    }
    if (!sp.SegIdPreSkip) {
      this.inter_segment_id(0);
    }
    isi.Lossless = fh.LosslessArray[si.segment_id];
    this.read_cdef();
    this.read_delta_qindex();
    this.read_delta_lf();
    dt.ReadDeltas = 0;
    this.read_is_inter();
    if (ii.is_inter) {
      this.inter_block_mode_info();
    } else {
      this.intra_block_mode_info();
    }
  }

  /**
   * 5.11.19 Inter segment ID syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inter-segment-id-syntax)
   */
  inter_segment_id(preSkip: number) {
    const reader = this.decoder.reader;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const sp = fh.segmentation_params;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const isi = tg.intra_segment_id;
    const si = tg.segment_id;
    const s = tg.skip;

    if (sp.segmentation_enabled) {
      let predictedSegmentId = this.get_segment_id();
      if (sp.segmentation_update_map) {
        if (preSkip && !sp.SegIdPreSkip) {
          si.segment_id = 0;
          return;
        }
        if (!preSkip) {
          if (s.skip) {
            let seg_id_predicted = 0;
            for (let i = 0; i < Num_4x4_Blocks_Wide[db.MiSize]; i++) {
              isi.AboveSegPredContext[db.MiCol + i] = seg_id_predicted;
            }
            for (let i = 0; i < Num_4x4_Blocks_High[db.MiSize]; i++) {
              isi.LeftSegPredContext[db.MiRow + i] = seg_id_predicted;
            }
            this.read_segment_id();
            return;
          }
        }
        if (sp.segmentation_temporal_update == 1) {
          let seg_id_predicted = reader.S("seg_id_predicted");
          if (seg_id_predicted) si.segment_id = predictedSegmentId;
          else this.read_segment_id();
          for (let i = 0; i < Num_4x4_Blocks_Wide[db.MiSize]; i++) {
            isi.AboveSegPredContext[db.MiCol + i] = seg_id_predicted;
          }
          for (let i = 0; i < Num_4x4_Blocks_High[db.MiSize]; i++) {
            isi.LeftSegPredContext[db.MiRow + i] = seg_id_predicted;
          }
        } else {
          this.read_segment_id();
        }
      } else {
        si.segment_id = predictedSegmentId;
      }
    } else {
      si.segment_id = 0;
    }
  }

  /**
   * 5.11.20 Is inter syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#is-inter-syntax)
   */
  read_is_inter() {
    const reader = this.decoder.reader;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const sp = fh.segmentation_params;
    const tg = this.titleGroup;
    const sm = tg.skip_mode;
    const ii = tg.is_inter;
    const si = tg.segment_id;

    if (sm.skip_mode) {
      ii.is_inter = 1;
    } else if (this.seg_feature_active(SEG_LVL_REF_FRAME)) {
      ii.is_inter = Number(sp.FeatureData[si.segment_id][SEG_LVL_REF_FRAME] != REF_FRAME.INTRA_FRAME);
    } else if (this.seg_feature_active(SEG_LVL_GLOBALMV)) {
      ii.is_inter = 1;
    } else {
      ii.is_inter = reader.S("is_inter");
    }
  }

  /**
   * 5.11.21 Get segment ID function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#get-segment-id-function)
   */
  get_segment_id() {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const psi = fh.previous_segment_ids;
    const tg = this.titleGroup;
    const db = tg.decode_block;

    let bw4 = Num_4x4_Blocks_Wide[db.MiSize];
    let bh4 = Num_4x4_Blocks_High[db.MiSize];
    let xMis = Math.min(cis.MiCols - db.MiCol, bw4);
    let yMis = Math.min(cis.MiRows - db.MiRow, bh4);
    let seg = 7;
    for (let y = 0; y < yMis; y++)
      for (let x = 0; x < xMis; x++) {
        seg = Math.min(seg, db.PrevSegmentIds[db.MiRow + y][db.MiCol + x]);
      }
    return seg;
  }

  /**
   * 5.11.22 Intra block mode info syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#intra-block-mode-info-syntax)
   */
  intra_block_mode_info() {
    const reader = this.decoder.reader;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;
    const rf = tg.ref_frames;
    const pmi = tg.palette_mode_info;

    rf.RefFrame[0] = REF_FRAME.INTRA_FRAME;
    rf.RefFrame[1] = REF_FRAME.NONE;
    let y_mode = reader.S("y_mode");
    ifmi.YMode = y_mode;
    this.intra_angle_info_y();
    if (db.HasChroma) {
      ifmi.uv_mode = reader.S("uv_mode");
      ifmi.UVMode = ifmi.uv_mode;
      if (ifmi.UVMode == Y_MODE.UV_CFL_PRED) {
        this.read_cfl_alphas();
      }
      this.intra_angle_info_uv();
    }
    pmi.PaletteSizeY = 0;
    pmi.PaletteSizeUV = 0;
    if (db.MiSize >= SUB_SIZE.BLOCK_8X8 && Block_Width[db.MiSize] <= 64 && Block_Height[db.MiSize] <= 64 && fh.allow_screen_content_tools) this.palette_mode_info();
    this.filter_intra_mode_info();
  }

  /**
   * 5.11.23 Inter block mode info syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inter-block-mode-info-syntax)
   */
  inter_block_mode_info() {
    const reader = this.decoder.reader;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const rif = fh.interpolation_filter;
    const tg = this.titleGroup;
    const ifmi = tg.intra_frame_mode_info;
    const sm = tg.skip_mode;
    const ibmi = tg.inter_block_mode_info;
    const rf = tg.ref_frames;
    const pmi = tg.palette_mode_info;
    const mvp = this.decoder.motionVectorPrediction;

    pmi.PaletteSizeY = 0;
    pmi.PaletteSizeUV = 0;
    this.read_ref_frames();
    let isCompound = Number(rf.RefFrame[1] > REF_FRAME.INTRA_FRAME);
    mvp.find_mv_stack(isCompound);
    if (sm.skip_mode) {
      ifmi.YMode = Y_MODE.NEAREST_NEARESTMV;
    } else if (this.seg_feature_active(SEG_LVL_SKIP) || this.seg_feature_active(SEG_LVL_GLOBALMV)) {
      ifmi.YMode = Y_MODE.GLOBALMV;
    } else if (isCompound) {
      let compound_mode = reader.S("compound_mode");
      ifmi.YMode = Y_MODE.NEAREST_NEARESTMV + compound_mode;
    } else {
      let new_mv = reader.S("new_mv");
      if (new_mv == 0) {
        ifmi.YMode = Y_MODE.NEWMV;
      } else {
        let zero_mv = reader.S("zero_mv");
        if (zero_mv == 0) {
          ifmi.YMode = Y_MODE.GLOBALMV;
        } else {
          let ref_mv = reader.S("ref_mv");
          ifmi.YMode = ref_mv == 0 ? Y_MODE.NEARESTMV : Y_MODE.NEARMV;
        }
      }
    }
    ibmi.RefMvIdx = 0;
    if (ifmi.YMode == Y_MODE.NEWMV || ifmi.YMode == Y_MODE.NEW_NEWMV) {
      for (let idx = 0; idx < 2; idx++) {
        if (mvp.NumMvFound > idx + 1) {
          let drl_mode = reader.S("drl_mode", { idx });
          if (drl_mode == 0) {
            ibmi.RefMvIdx = idx;
            break;
          }
          ibmi.RefMvIdx = idx + 1;
        }
      }
    } else if (this.has_nearmv()) {
      ibmi.RefMvIdx = 1;
      for (let idx = 1; idx < 3; idx++) {
        if (mvp.NumMvFound > idx + 1) {
          let drl_mode = reader.S("drl_mode", { idx });
          if (drl_mode == 0) {
            ibmi.RefMvIdx = idx;
            break;
          }
          ibmi.RefMvIdx = idx + 1;
        }
      }
    }
    this.assign_mv(isCompound);
    this.read_interintra_mode(isCompound);
    this.read_motion_mode(isCompound);
    this.read_compound_type(isCompound);
    if (rif.interpolation_filter == INTERPOLATION_FILTER.SWITCHABLE) {
      for (let dir = 0; dir < (seqHeader.enable_dual_filter ? 2 : 1); dir++) {
        if (this.needs_interp_filter()) {
          ibmi.interp_filter[dir] = reader.S("interp_filter", { dir });
        } else {
          ibmi.interp_filter[dir] = INTERPOLATION_FILTER.EIGHTTAP;
        }
      }
      if (!seqHeader.enable_dual_filter) {
        ibmi.interp_filter[1] = ibmi.interp_filter[0];
      }
    } else {
      for (let dir = 0; dir < 2; dir++) {
        ibmi.interp_filter[dir] = rif.interpolation_filter;
      }
    }
  }

  /**
   * 5.11.23 Inter block mode info syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inter-block-mode-info-syntax)
   */
  has_nearmv() {
    const tg = this.titleGroup;
    const ifmi = tg.intra_frame_mode_info;

    return ifmi.YMode == Y_MODE.NEARMV || ifmi.YMode == Y_MODE.NEAR_NEARMV || ifmi.YMode == Y_MODE.NEAR_NEWMV || ifmi.YMode == Y_MODE.NEW_NEARMV;
  }

  /**
   * 5.11.23 Inter block mode info syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inter-block-mode-info-syntax)
   */
  needs_interp_filter() {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const gmp = fh.global_motion_params;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;
    const sm = tg.skip_mode;
    const rf = tg.ref_frames;
    const rmm = tg.motion_mode;

    let large = Math.min(Block_Width[db.MiSize], Block_Height[db.MiSize]) >= 8;
    if (sm.skip_mode || rmm.motion_mode == MOTION_MODE.LOCALWARP) {
      return 0;
    } else if (large && ifmi.YMode == Y_MODE.GLOBALMV) {
      return gmp.GmType[rf.RefFrame[0]] == TRANSLATION;
    } else if (large && ifmi.YMode == Y_MODE.GLOBAL_GLOBALMV) {
      return gmp.GmType[rf.RefFrame[0]] == TRANSLATION || gmp.GmType[rf.RefFrame[1]] == TRANSLATION;
    } else {
      return 1;
    }
  }

  /**
   * 5.11.24 Filter intra mode info syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#filter-intra-mode-info-syntax)
   */
  filter_intra_mode_info() {
    const reader = this.decoder.reader;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;
    const fimi = tg.filter_intra_mode_info;
    const pmi = tg.palette_mode_info;

    fimi.use_filter_intra = 0;
    if (seqHeader.enable_filter_intra && ifmi.YMode == Y_MODE.DC_PRED && pmi.PaletteSizeY == 0 && Math.max(Block_Width[db.MiSize], Block_Height[db.MiSize]) <= 32) {
      fimi.use_filter_intra = reader.S("use_filter_intra");
      if (fimi.use_filter_intra) {
        fimi.filter_intra_mode = reader.S("filter_intra_mode");
      }
    }
  }

  /**
   * 5.11.25 Ref frames syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#ref-frames-syntax)
   */
  read_ref_frames() {
    const reader = this.decoder.reader;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const sp = fh.segmentation_params;
    const smp = fh.skip_mode_params;
    const frm = fh.frame_reference_mode;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const si = tg.segment_id;
    const sm = tg.skip_mode;
    const rf = tg.ref_frames;

    if (sm.skip_mode) {
      rf.RefFrame[0] = smp.SkipModeFrame[0];
      rf.RefFrame[1] = smp.SkipModeFrame[1];
    } else if (this.seg_feature_active(SEG_LVL_REF_FRAME)) {
      rf.RefFrame[0] = sp.FeatureData[si.segment_id][SEG_LVL_REF_FRAME];
      rf.RefFrame[1] = REF_FRAME.NONE;
    } else if (this.seg_feature_active(SEG_LVL_SKIP) || this.seg_feature_active(SEG_LVL_GLOBALMV)) {
      rf.RefFrame[0] = REF_FRAME.LAST_FRAME;
      rf.RefFrame[1] = REF_FRAME.NONE;
    } else {
      let bw4 = Num_4x4_Blocks_Wide[db.MiSize];
      let bh4 = Num_4x4_Blocks_High[db.MiSize];
      let comp_mode: COMP_MODE = COMP_MODE.SINGLE_REFERENCE;
      if (frm.reference_select && Math.min(bw4, bh4) >= 2) {
        comp_mode = reader.S("comp_mode");
      }
      if (comp_mode == COMP_MODE.COMPOUND_REFERENCE) {
        let comp_ref_type: COMP_REF_TYPE = reader.S("comp_ref_type");
        if (comp_ref_type == COMP_REF_TYPE.UNIDIR_COMP_REFERENCE) {
          let uni_comp_ref = reader.S("uni_comp_ref");
          if (uni_comp_ref) {
            rf.RefFrame[0] = REF_FRAME.BWDREF_FRAME;
            rf.RefFrame[1] = REF_FRAME.ALTREF_FRAME;
          } else {
            let uni_comp_ref_p1 = reader.S("uni_comp_ref_p1");
            if (uni_comp_ref_p1) {
              let uni_comp_ref_p2 = reader.S("uni_comp_ref_p2");
              if (uni_comp_ref_p2) {
                rf.RefFrame[0] = REF_FRAME.LAST_FRAME;
                rf.RefFrame[1] = REF_FRAME.GOLDEN_FRAME;
              } else {
                rf.RefFrame[0] = REF_FRAME.LAST_FRAME;
                rf.RefFrame[1] = REF_FRAME.LAST3_FRAME;
              }
            } else {
              rf.RefFrame[0] = REF_FRAME.LAST_FRAME;
              rf.RefFrame[1] = REF_FRAME.LAST2_FRAME;
            }
          }
        } else {
          let comp_ref = reader.S("comp_ref");
          if (comp_ref == 0) {
            let comp_ref_p1 = reader.S("comp_ref_p1");
            rf.RefFrame[0] = comp_ref_p1 ? REF_FRAME.LAST2_FRAME : REF_FRAME.LAST_FRAME;
          } else {
            let comp_ref_p2 = reader.S("comp_ref_p2");
            rf.RefFrame[0] = comp_ref_p2 ? REF_FRAME.GOLDEN_FRAME : REF_FRAME.LAST3_FRAME;
          }
          let comp_bwdref = reader.S("comp_bwdref");
          if (comp_bwdref == 0) {
            let comp_bwdref_p1 = reader.S("comp_bwdref_p1");
            rf.RefFrame[1] = comp_bwdref_p1 ? REF_FRAME.ALTREF2_FRAME : REF_FRAME.BWDREF_FRAME;
          } else {
            rf.RefFrame[1] = REF_FRAME.ALTREF_FRAME;
          }
        }
      } else {
        let single_ref_p1 = reader.S("single_ref_p1");
        if (single_ref_p1) {
          let single_ref_p2 = reader.S("single_ref_p2");
          if (single_ref_p2 == 0) {
            let single_ref_p6 = reader.S("single_ref_p6");
            rf.RefFrame[0] = single_ref_p6 ? REF_FRAME.ALTREF2_FRAME : REF_FRAME.BWDREF_FRAME;
          } else {
            rf.RefFrame[0] = REF_FRAME.ALTREF_FRAME;
          }
        } else {
          let single_ref_p3 = reader.S("single_ref_p3");
          if (single_ref_p3) {
            let single_ref_p5 = reader.S("single_ref_p5");
            rf.RefFrame[0] = single_ref_p5 ? REF_FRAME.GOLDEN_FRAME : REF_FRAME.LAST3_FRAME;
          } else {
            let single_ref_p4 = reader.S("single_ref_p4");
            rf.RefFrame[0] = single_ref_p4 ? REF_FRAME.LAST2_FRAME : REF_FRAME.LAST_FRAME;
          }
        }
        rf.RefFrame[1] = REF_FRAME.NONE;
      }
    }
    if (rf.conformance) {
      assert(rf.RefFrame[0] == REF_FRAME.LAST_FRAME, "RefFrame[ 0 ] = LAST_FRAME");
      assert(rf.RefFrame[1] == REF_FRAME.NONE, "RefFrame[ 1 ] = NONE");
    }
  }

  /**
   * 5.11.26 Assign MV syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#assign-mv-syntax)
   */
  assign_mv(isCompound: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;
    const ibmi = tg.inter_block_mode_info;
    const m = tg.mv;
    const mvp = this.decoder.motionVectorPrediction;

    m.Mv = Array2D(m.Mv, 2);
    for (let i = 0; i < 1 + isCompound; i++) {
      let compMode: Y_MODE;
      if (ifmi.use_intrabc) {
        compMode = Y_MODE.NEWMV;
      } else {
        compMode = this.get_mode(i);
      }
      if (ifmi.use_intrabc) {
        m.PredMv[0] = clone(mvp.RefStackMv[0][0]);
        if (m.PredMv[0][0] == 0 && m.PredMv[0][1] == 0) {
          m.PredMv[0] = clone(mvp.RefStackMv[1][0]);
        }
        if (m.PredMv[0][0] == 0 && m.PredMv[0][1] == 0) {
          let sbSize = seqHeader.use_128x128_superblock ? SUB_SIZE.BLOCK_128X128 : SUB_SIZE.BLOCK_64X64;
          let sbSize4 = Num_4x4_Blocks_High[sbSize];
          if (db.MiRow - sbSize4 < tg.MiRowStart) {
            m.PredMv[0][0] = 0;
            m.PredMv[0][1] = -(sbSize4 * MI_SIZE + INTRABC_DELAY_PIXELS) * 8;
          } else {
            m.PredMv[0][0] = -(sbSize4 * MI_SIZE * 8);
            m.PredMv[0][1] = 0;
          }
        }
      } else if (compMode == Y_MODE.GLOBALMV) {
        m.PredMv[i] = clone(mvp.GlobalMvs[i]);
      } else {
        let pos = compMode == Y_MODE.NEARESTMV ? 0 : ibmi.RefMvIdx;
        if (compMode == Y_MODE.NEWMV && mvp.NumMvFound <= 1) {
          pos = 0;
        }
        m.PredMv[i] = clone(mvp.RefStackMv[pos][i]);
      }
      if (compMode == Y_MODE.NEWMV) {
        this.read_mv(i);
      } else {
        m.Mv[i] = clone(m.PredMv[i]);
      }
    }
    assert(this.is_mv_valid(isCompound) == 1, "It is a requirement of bitstream conformance that whenever assign_mv returns, the function is_mv_valid(isCompound) would return 1");
  }

  /**
   * 5.11.27 Read motion mode syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#read-motion-mode-syntax)
   */
  read_motion_mode(isCompound: number) {
    const reader = this.decoder.reader;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const gmp = fh.global_motion_params;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;
    const sm = tg.skip_mode;
    const rf = tg.ref_frames;
    const rmm = tg.motion_mode;
    const mvp = this.decoder.motionVectorPrediction;

    if (sm.skip_mode) {
      rmm.motion_mode = MOTION_MODE.SIMPLE;
      return;
    }
    if (!fh.is_motion_mode_switchable) {
      rmm.motion_mode = MOTION_MODE.SIMPLE;
      return;
    }
    if (Math.min(Block_Width[db.MiSize], Block_Height[db.MiSize]) < 8) {
      rmm.motion_mode = MOTION_MODE.SIMPLE;
      return;
    }
    if (!fh.force_integer_mv && (ifmi.YMode == Y_MODE.GLOBALMV || ifmi.YMode == Y_MODE.GLOBAL_GLOBALMV)) {
      if (gmp.GmType[rf.RefFrame[0]] > TRANSLATION) {
        rmm.motion_mode = MOTION_MODE.SIMPLE;
        return;
      }
    }
    if (isCompound || rf.RefFrame[1] == REF_FRAME.INTRA_FRAME || !mvp.has_overlappable_candidates()) {
      rmm.motion_mode = MOTION_MODE.SIMPLE;
      return;
    }
    mvp.find_warp_samples();
    if (fh.force_integer_mv || mvp.NumSamples == 0 || !fh.allow_warped_motion || this.is_scaled(rf.RefFrame[0])) {
      let use_obmc = reader.S("use_obmc");
      rmm.motion_mode = use_obmc ? MOTION_MODE.OBMC : MOTION_MODE.SIMPLE;
    } else {
      rmm.motion_mode = reader.S("motion_mode");
    }
  }

  /**
   * 5.11.27 Read motion mode syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#read-motion-mode-syntax)
   */
  is_scaled(refFrame: number) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const fs = fh.frame_size;
    const rf = fh.ref_frames;

    let refIdx = fh.ref_frame_idx[refFrame - REF_FRAME.LAST_FRAME];
    let xScale = integer(((rf.RefUpscaledWidth[refIdx] << REF_SCALE_SHIFT) + integer(fs.FrameWidth / 2)) / fs.FrameWidth);
    let yScale = integer(((rf.RefFrameHeight[refIdx] << REF_SCALE_SHIFT) + integer(fs.FrameHeight / 2)) / fs.FrameHeight);
    let noScale = 1 << REF_SCALE_SHIFT;
    return Number(xScale != noScale || yScale != noScale);
  }

  /**
   * 5.11.28 Read inter intra syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#read-inter-intra-syntax)
   */
  read_interintra_mode(isCompound: number) {
    const reader = this.decoder.reader;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const sm = tg.skip_mode;
    const fimi = tg.filter_intra_mode_info;
    const rf = tg.ref_frames;
    const rii = tg.inter_intra;
    const rct = tg.compound_type;
    const iai = tg.intra_angle_info;

    if (!sm.skip_mode && seqHeader.enable_interintra_compound && !isCompound && db.MiSize >= SUB_SIZE.BLOCK_8X8 && db.MiSize <= SUB_SIZE.BLOCK_32X32) {
      rii.interintra = reader.S("interintra");
      if (rii.interintra) {
        rii.interintra_mode = reader.S("interintra_mode");
        rf.RefFrame[1] = REF_FRAME.INTRA_FRAME;
        iai.AngleDeltaY = 0;
        iai.AngleDeltaUV = 0;
        fimi.use_filter_intra = 0;
        rii.wedge_interintra = reader.S("wedge_interintra");
        if (rii.wedge_interintra) {
          rii.wedge_index = reader.S("wedge_index");
          rct.wedge_sign = 0;
        }
      }
    } else {
      rii.interintra = 0;
    }
  }

  /**
   * 5.11.29 Read compound type syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#read-compound-type-syntax)
   */
  read_compound_type(isCompound: number) {
    const reader = this.decoder.reader;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const sm = tg.skip_mode;
    const fimi = tg.filter_intra_mode_info;
    const rii = tg.inter_intra;
    const rct = tg.compound_type;

    rct.comp_group_idx = 0;
    rct.compound_idx = 1;
    if (sm.skip_mode) {
      rct.compound_type = COMPOUND_TYPE.COMPOUND_AVERAGE;
      return;
    }
    if (isCompound) {
      let n = Wedge_Bits[db.MiSize];
      if (seqHeader.enable_masked_compound) {
        rct.comp_group_idx = reader.S("comp_group_idx");
      }
      if (rct.comp_group_idx == 0) {
        if (seqHeader.enable_jnt_comp) {
          rct.compound_idx = reader.S("compound_idx");
          rct.compound_type = rct.compound_idx ? COMPOUND_TYPE.COMPOUND_AVERAGE : COMPOUND_TYPE.COMPOUND_DISTANCE;
        } else {
          rct.compound_type = COMPOUND_TYPE.COMPOUND_AVERAGE;
        }
      } else {
        if (n == 0) {
          rct.compound_type = COMPOUND_TYPE.COMPOUND_DIFFWTD;
        } else {
          rct.compound_type = reader.S("compound_type");
        }
      }
      if (rct.compound_type == COMPOUND_TYPE.COMPOUND_WEDGE) {
        rii.wedge_index = reader.S("wedge_index");
        rct.wedge_sign = reader.L(1);
      } else if (rct.compound_type == COMPOUND_TYPE.COMPOUND_DIFFWTD) {
        rct.mask_type = reader.L(1);
      }
    } else {
      if (rii.interintra) {
        rct.compound_type = rii.wedge_interintra ? COMPOUND_TYPE.COMPOUND_WEDGE : COMPOUND_TYPE.COMPOUND_INTRA;
      } else {
        rct.compound_type = COMPOUND_TYPE.COMPOUND_AVERAGE;
      }
    }
  }

  /**
   * 5.11.30 Get mode function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#get-mode-function)
   */
  get_mode(refList: number) {
    const tg = this.titleGroup;
    const ifmi = tg.intra_frame_mode_info;

    let compMode = Y_MODE.GLOBALMV;
    if (refList == 0) {
      if (ifmi.YMode < Y_MODE.NEAREST_NEARESTMV) {
        compMode = ifmi.YMode;
      } else if (ifmi.YMode == Y_MODE.NEW_NEWMV || ifmi.YMode == Y_MODE.NEW_NEARESTMV || ifmi.YMode == Y_MODE.NEW_NEARMV) {
        compMode = Y_MODE.NEWMV;
      } else if (ifmi.YMode == Y_MODE.NEAREST_NEARESTMV || ifmi.YMode == Y_MODE.NEAREST_NEWMV) {
        compMode = Y_MODE.NEARESTMV;
      } else if (ifmi.YMode == Y_MODE.NEAR_NEARMV || ifmi.YMode == Y_MODE.NEAR_NEWMV) {
        compMode = Y_MODE.NEARMV;
      } else {
        compMode = Y_MODE.GLOBALMV;
      }
    } else {
      if (ifmi.YMode == Y_MODE.NEW_NEWMV || ifmi.YMode == Y_MODE.NEAREST_NEWMV || ifmi.YMode == Y_MODE.NEAR_NEWMV) {
        compMode = Y_MODE.NEWMV;
      } else if (ifmi.YMode == Y_MODE.NEAREST_NEARESTMV || ifmi.YMode == Y_MODE.NEW_NEARESTMV) {
        compMode = Y_MODE.NEARESTMV;
      } else if (ifmi.YMode == Y_MODE.NEAR_NEARMV || ifmi.YMode == Y_MODE.NEW_NEARMV) {
        compMode = Y_MODE.NEARMV;
      } else {
        compMode = Y_MODE.GLOBALMV;
      }
    }
    return compMode;
  }

  /**
   * 5.11.31 MV syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#mv-syntax)
   */
  read_mv(ref: number) {
    const reader = this.decoder.reader;
    const tg = this.titleGroup;
    const ifmi = tg.intra_frame_mode_info;
    const m = tg.mv;

    let diffMv = [0, 0];
    if (ifmi.use_intrabc) {
      m.MvCtx = MV_INTRABC_CONTEXT;
    } else {
      m.MvCtx = 0;
    }
    let mv_joint: MV_JOINT = reader.S("mv_joint");
    if (mv_joint == MV_JOINT.MV_JOINT_HZVNZ || mv_joint == MV_JOINT.MV_JOINT_HNZVNZ) {
      diffMv[0] = this.read_mv_component(0);
    }
    if (mv_joint == MV_JOINT.MV_JOINT_HNZVZ || mv_joint == MV_JOINT.MV_JOINT_HNZVNZ) {
      diffMv[1] = this.read_mv_component(1);
    }
    m.Mv = Array2D(m.Mv, ref + 1);
    m.Mv[ref][0] = m.PredMv[ref][0] + diffMv[0];
    m.Mv[ref][1] = m.PredMv[ref][1] + diffMv[1];
  }

  /**
   * 5.11.32 MV component syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#mv-component-syntax)
   */
  read_mv_component(comp: number) {
    const reader = this.decoder.reader;
    const fh = this.decoder.frameHeaderObu.frameHeader;

    let mv_sign = reader.S("mv_sign", { comp });
    let mv_class: MV_CLASS = reader.S("mv_class", { comp });
    let mag = 0;
    if (mv_class == MV_CLASS.MV_CLASS_0) {
      let mv_class0_bit = reader.S("mv_class0_bit", { comp });
      let mv_class0_fr: number;
      if (fh.force_integer_mv) {
        mv_class0_fr = 3;
      } else {
        mv_class0_fr = reader.S("mv_class0_fr", { comp, mv_class0_bit });
      }
      let mv_class0_hp = 1;
      if (fh.allow_high_precision_mv) {
        mv_class0_hp = reader.S("mv_class0_hp", { comp });
      }
      mag = ((mv_class0_bit << 3) | (mv_class0_fr << 1) | mv_class0_hp) + 1;
    } else {
      let d = 0;
      for (let i = 0; i < mv_class; i++) {
        let mv_bit = reader.S("mv_bit", { comp, i });
        d |= mv_bit << i;
      }
      mag = CLASS0_SIZE << (mv_class + 2);
      let mv_fr = 3;
      if (!fh.force_integer_mv) {
        mv_fr = reader.S("mv_fr", { comp });
      }
      let mv_hp = 1;
      if (fh.allow_high_precision_mv) {
        mv_hp = reader.S("mv_hp", { comp });
      }
      mag += ((d << 3) | (mv_fr << 1) | mv_hp) + 1;
    }
    return mv_sign ? -mag : mag;
  }

  /**
   * 5.11.33 Compute prediction syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#compute-prediction-syntax)
   */
  compute_prediction() {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const tg = this.titleGroup;
    const bd = tg.block_decoded;
    const db = tg.decode_block;
    const ii = tg.is_inter;
    const rf = tg.ref_frames;
    const rii = tg.inter_intra;
    const p = this.decoder.prediction;

    let sbMask = seqHeader.use_128x128_superblock ? 31 : 15;
    let subBlockMiRow = db.MiRow & sbMask;
    let subBlockMiCol = db.MiCol & sbMask;
    for (let plane = 0; plane < 1 + db.HasChroma * 2; plane++) {
      let planeSz = this.get_plane_residual_size(db.MiSize, plane);
      let num4x4W = Num_4x4_Blocks_Wide[planeSz];
      let num4x4H = Num_4x4_Blocks_High[planeSz];
      let log2W = MI_SIZE_LOG2 + Mi_Width_Log2[planeSz];
      let log2H = MI_SIZE_LOG2 + Mi_Height_Log2[planeSz];
      let subX = plane > 0 ? cc.subsampling_x : 0;
      let subY = plane > 0 ? cc.subsampling_y : 0;
      let baseX = (db.MiCol >> subX) * MI_SIZE;
      let baseY = (db.MiRow >> subY) * MI_SIZE;
      let candRow = (db.MiRow >> subY) << subY;
      let candCol = (db.MiCol >> subX) << subX;

      rii.IsInterIntra = Number(ii.is_inter && rf.RefFrame[1] == REF_FRAME.INTRA_FRAME);
      if (rii.IsInterIntra) {
        let mode = Y_MODE.SMOOTH_PRED;
        if (rii.interintra_mode == INTERINTRA_MODE.II_DC_PRED) {
          mode = Y_MODE.DC_PRED;
        } else if (rii.interintra_mode == INTERINTRA_MODE.II_V_PRED) {
          mode = Y_MODE.V_PRED;
        } else if (rii.interintra_mode == INTERINTRA_MODE.II_H_PRED) {
          mode = Y_MODE.H_PRED;
        }

        p.predict_intra(
          plane,
          baseX,
          baseY,
          plane == 0 ? db.AvailL : db.AvailLChroma,
          plane == 0 ? db.AvailU : db.AvailUChroma,
          bd.BlockDecoded[plane][(subBlockMiRow >> subY) - 1][(subBlockMiCol >> subX) + num4x4W],
          bd.BlockDecoded[plane][(subBlockMiRow >> subY) + num4x4H][(subBlockMiCol >> subX) - 1],
          mode,
          log2W,
          log2H
        );
      }
      if (ii.is_inter) {
        let predW = Block_Width[db.MiSize] >> subX;
        let predH = Block_Height[db.MiSize] >> subY;
        let someUseIntra = 0;
        for (let r = 0; r < num4x4H << subY; r++)
          for (let c = 0; c < num4x4W << subX; c++)
            if (db.RefFrames[candRow + r][candCol + c][0] == REF_FRAME.INTRA_FRAME) {
              someUseIntra = 1;
            }
        if (someUseIntra) {
          predW = num4x4W * 4;
          predH = num4x4H * 4;
          candRow = db.MiRow;
          candCol = db.MiCol;
        }
        let r = 0;
        for (let y = 0; y < num4x4H * 4; y += predH) {
          let c = 0;
          for (let x = 0; x < num4x4W * 4; x += predW) {
            p.predict_inter(plane, baseX + x, baseY + y, predW, predH, candRow + r, candCol + c);
            c++;
          }
          r++;
        }
      }
    }
  }

  /**
   * 5.11.34 Residual syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#residual-syntax)
   */
  residual() {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const isi = tg.intra_segment_id;
    const ts = tg.tx_size;
    const ii = tg.is_inter;

    let sbMask = seqHeader.use_128x128_superblock ? 31 : 15;
    let widthChunks = Math.max(1, Block_Width[db.MiSize] >> 6);
    let heightChunks = Math.max(1, Block_Height[db.MiSize] >> 6);
    let miSizeChunk = widthChunks > 1 || heightChunks > 1 ? SUB_SIZE.BLOCK_64X64 : db.MiSize;
    for (let chunkY = 0; chunkY < heightChunks; chunkY++) {
      for (let chunkX = 0; chunkX < widthChunks; chunkX++) {
        let miRowChunk = db.MiRow + (chunkY << 4);
        let miColChunk = db.MiCol + (chunkX << 4);
        let subBlockMiRow = miRowChunk & sbMask;
        let subBlockMiCol = miColChunk & sbMask;

        for (let plane = 0; plane < 1 + db.HasChroma * 2; plane++) {
          let txSz = isi.Lossless ? TX_SIZE.TX_4X4 : this.get_tx_size(plane, ts.TxSize);
          let stepX = Tx_Width[txSz] >> 2;
          let stepY = Tx_Height[txSz] >> 2;
          let planeSz = this.get_plane_residual_size(miSizeChunk, plane);
          let num4x4W = Num_4x4_Blocks_Wide[planeSz];
          let num4x4H = Num_4x4_Blocks_High[planeSz];
          let subX = plane > 0 ? cc.subsampling_x : 0;
          let subY = plane > 0 ? cc.subsampling_y : 0;
          let baseX = (miColChunk >> subX) * MI_SIZE;
          let baseY = (miRowChunk >> subY) * MI_SIZE;
          if (ii.is_inter && !isi.Lossless && !plane) {
            this.transform_tree(baseX, baseY, num4x4W * 4, num4x4H * 4);
          } else {
            let baseXBlock = (db.MiCol >> subX) * MI_SIZE;
            let baseYBlock = (db.MiRow >> subY) * MI_SIZE;
            for (let y = 0; y < num4x4H; y += stepY)
              for (let x = 0; x < num4x4W; x += stepX) {
                this.transform_block(plane, baseXBlock, baseYBlock, txSz, x + ((chunkX << 4) >>> subX), y + ((chunkY << 4) >>> subY));
              }
          }
        }
      }
    }
  }

  /**
   * 5.11.35 Transform block syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#transform-block-syntax)
   */
  transform_block(plane: number, baseX: number, baseY: number, txSz: TX_SIZE, x: number, y: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const tg = this.titleGroup;
    const bd = tg.block_decoded;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;
    const s = tg.skip;
    const ii = tg.is_inter;
    const tb = tg.transform_block;
    const pmi = tg.palette_mode_info;
    const p = this.decoder.prediction;
    const rad = this.decoder.reconstructionAndDequantization;

    let startX = baseX + 4 * x;
    let startY = baseY + 4 * y;
    let subX = plane > 0 ? cc.subsampling_x : 0;
    let subY = plane > 0 ? cc.subsampling_y : 0;
    let row = (startY << subY) >> MI_SIZE_LOG2;
    let col = (startX << subX) >> MI_SIZE_LOG2;
    let sbMask = seqHeader.use_128x128_superblock ? 31 : 15;
    let subBlockMiRow = row & sbMask;
    let subBlockMiCol = col & sbMask;
    let stepX = Tx_Width[txSz] >> MI_SIZE_LOG2;
    let stepY = Tx_Height[txSz] >> MI_SIZE_LOG2;
    let maxX = (cis.MiCols * MI_SIZE) >> subX;
    let maxY = (cis.MiRows * MI_SIZE) >> subY;
    if (startX >= maxX || startY >= maxY) {
      return;
    }
    if (!ii.is_inter) {
      if ((plane == 0 && pmi.PaletteSizeY) || (plane != 0 && pmi.PaletteSizeUV)) {
        p.predict_palette(plane, startX, startY, x, y, txSz);
      } else {
        let isCfl = plane > 0 && ifmi.UVMode == Y_MODE.UV_CFL_PRED;
        let mode: Y_MODE;
        if (plane == 0) {
          mode = ifmi.YMode;
        } else {
          mode = isCfl ? Y_MODE.DC_PRED : ifmi.UVMode;
        }
        let log2W = Tx_Width_Log2[txSz];
        let log2H = Tx_Height_Log2[txSz];
        p.predict_intra(
          plane,
          startX,
          startY,
          Number((plane == 0 ? db.AvailL : db.AvailLChroma) || x > 0),
          Number((plane == 0 ? db.AvailU : db.AvailUChroma) || y > 0),
          bd.BlockDecoded[plane][(subBlockMiRow >> subY) - 1][(subBlockMiCol >> subX) + stepX],
          bd.BlockDecoded[plane][(subBlockMiRow >> subY) + stepY][(subBlockMiCol >> subX) - 1],
          mode,
          log2W,
          log2H
        );
        if (isCfl) {
          p.predict_chroma_from_luma(plane, startX, startY, txSz);
        }
      }
      if (plane == 0) {
        tb.MaxLumaW = startX + stepX * 4;
        tb.MaxLumaH = startY + stepY * 4;
      }
    }
    if (this.decoder.obu.onPredFrame) {
      let w = Tx_Width[txSz];
      let h = Tx_Height[txSz];
      let pred = Array2D<number>(null, h);
      for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
          pred[i][j] = p.CurrFrame[plane][startY + i][startX + j];
        }
      }
      this.decoder.obu.onPredFrame(plane, startX, startY, pred);
    }

    if (!s.skip) {
      let eob = this.coeffs(plane, startX, startY, txSz);
      if (eob > 0) {
        rad.reconstruct(plane, startX, startY, txSz);
      }
    }

    if (this.decoder.obu.onResidualFrame) {
      let log2W = Tx_Width_Log2[txSz];
      let log2H = Tx_Height_Log2[txSz];
      let w = 1 << log2W;
      let h = 1 << log2H;
      const frame = Array2D<number>(null, h);
      for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
          frame[i][j] = p.CurrFrame[plane][startY + i][startX + j];
        }
      }
      this.decoder.obu.onResidualFrame(plane, startX, startY, frame);
    }

    tb.LoopfilterTxSizes = Array3D(tb.LoopfilterTxSizes, 3, (row >> subY) + stepY);
    for (let i = 0; i < stepY; i++) {
      for (let j = 0; j < stepX; j++) {
        tb.LoopfilterTxSizes[plane][(row >> subY) + i][(col >> subX) + j] = txSz;
        bd.BlockDecoded[plane][(subBlockMiRow >> subY) + i][(subBlockMiCol >> subX) + j] = 1;
      }
    }
  }

  /**
   * 5.11.36 Transform tree syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#transform-tree-syntax)
   */
  transform_tree(startX: number, startY: number, w: number, h: number) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const tg = this.titleGroup;
    const bts = tg.block_tx_size;

    let maxX = cis.MiCols * MI_SIZE;
    let maxY = cis.MiRows * MI_SIZE;
    if (startX >= maxX || startY >= maxY) {
      return;
    }
    let row = startY >> MI_SIZE_LOG2;
    let col = startX >> MI_SIZE_LOG2;
    let lumaTxSz = bts.InterTxSizes[row][col];
    let lumaW = Tx_Width[lumaTxSz];
    let lumaH = Tx_Height[lumaTxSz];
    if (w <= lumaW && h <= lumaH) {
      let txSz = this.find_tx_size(w, h);
      this.transform_block(0, startX, startY, txSz, 0, 0);
    } else {
      if (w > h) {
        this.transform_tree(startX, startY, integer(w / 2), h);
        this.transform_tree(startX + integer(w / 2), startY, integer(w / 2), h);
      } else if (w < h) {
        this.transform_tree(startX, startY, w, integer(h / 2));
        this.transform_tree(startX, startY + integer(h / 2), w, integer(h / 2));
      } else {
        this.transform_tree(startX, startY, integer(w / 2), integer(h / 2));
        this.transform_tree(startX + integer(w / 2), startY, integer(w / 2), integer(h / 2));
        this.transform_tree(startX, startY + integer(h / 2), integer(w / 2), integer(h / 2));
        this.transform_tree(startX + integer(w / 2), startY + integer(h / 2), integer(w / 2), integer(h / 2));
      }
    }
  }

  /**
   * 5.11.36 Transform tree syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#transform-tree-syntax)
   */
  find_tx_size(w: number, h: number) {
    let txSz = 0;
    for (txSz = 0; txSz < TX_SIZES_ALL; txSz++) if (Tx_Width[txSz] == w && Tx_Height[txSz] == h) break;
    return txSz;
  }

  /**
   * 5.11.37 Get TX size function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#get-tx-size-function)
   */
  get_tx_size(plane: number, txSz: TX_SIZE) {
    const tg = this.titleGroup;
    const db = tg.decode_block;

    if (plane == 0) return txSz;
    let uvTx = Max_Tx_Size_Rect[this.get_plane_residual_size(db.MiSize, plane)];
    if (Tx_Width[uvTx] == 64 || Tx_Height[uvTx] == 64) {
      if (Tx_Width[uvTx] == 16) {
        return TX_SIZE.TX_16X32;
      }
      if (Tx_Height[uvTx] == 16) {
        return TX_SIZE.TX_32X16;
      }
      return TX_SIZE.TX_32X32;
    }
    return uvTx;
  }

  /**
   * 5.11.38 Get plane residual size function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#get-plane-residual-size-function)
   */
  get_plane_residual_size(subsize: number, plane: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;

    let subx = plane > 0 ? cc.subsampling_x : 0;
    let suby = plane > 0 ? cc.subsampling_y : 0;
    return Subsampled_Size[subsize][subx][suby];
  }

  /**
   * 5.11.39 Coefficients syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#coefficients-syntax)
   */
  coeffs(plane: number, startX: number, startY: number, txSz: number) {
    const reader = this.decoder.reader;
    const tg = this.titleGroup;
    const coef = tg.coefficients;
    const rad = this.decoder.reconstructionAndDequantization;

    let x4 = startX >> 2;
    let y4 = startY >> 2;
    let w4 = Tx_Width[txSz] >> 2;
    let h4 = Tx_Height[txSz] >> 2;
    let txSzCtx = (Tx_Size_Sqr[txSz] + Tx_Size_Sqr_Up[txSz] + 1) >> 1;
    let ptype = Number(plane > 0);
    let segEob = txSz == TX_SIZE.TX_16X64 || txSz == TX_SIZE.TX_64X16 ? 512 : Math.min(1024, Tx_Width[txSz] * Tx_Height[txSz]);
    coef.Quant = Array1D(null, segEob, 0);
    rad.Dequant = Array2D(null, 64, 64, 0);

    let eob = 0;
    let culLevel = 0;
    let dcCategory = 0;
    let all_zero = reader.S("all_zero", { txSzCtx, plane, txSz, x4, y4, w4, h4 });
    if (all_zero) {
      let c = 0;
      if (plane == 0) {
        coef.TxTypes = Array2D(coef.TxTypes, y4 + h4);
        for (let i = 0; i < w4; i++) {
          for (let j = 0; j < h4; j++) {
            coef.TxTypes[y4 + j][x4 + i] = DCT_DCT;
          }
        }
      }
    } else {
      if (plane == 0) this.transform_type(x4, y4, txSz);
      coef.PlaneTxType = this.compute_tx_type(plane, txSz, x4, y4);
      let scan = this.get_scan(txSz);

      let eobMultisize = Math.min(Tx_Width_Log2[txSz], 5) + Math.min(Tx_Height_Log2[txSz], 5) - 4;
      let eobPt = 0;
      if (eobMultisize == 0) {
        let eob_pt_16 = reader.S("eob_pt_16", { plane, txSz, x4, y4, ptype });
        eobPt = eob_pt_16 + 1;
      } else if (eobMultisize == 1) {
        let eob_pt_32 = reader.S("eob_pt_32", { plane, txSz, x4, y4, ptype });
        eobPt = eob_pt_32 + 1;
      } else if (eobMultisize == 2) {
        let eob_pt_64 = reader.S("eob_pt_64", { plane, txSz, x4, y4, ptype });
        eobPt = eob_pt_64 + 1;
      } else if (eobMultisize == 3) {
        let eob_pt_128 = reader.S("eob_pt_128", { plane, txSz, x4, y4, ptype });
        eobPt = eob_pt_128 + 1;
      } else if (eobMultisize == 4) {
        let eob_pt_256 = reader.S("eob_pt_256", { plane, txSz, x4, y4, ptype });
        eobPt = eob_pt_256 + 1;
      } else if (eobMultisize == 5) {
        let eob_pt_512 = reader.S("eob_pt_512", { plane, txSz, x4, y4, ptype });
        eobPt = eob_pt_512 + 1;
      } else {
        let eob_pt_1024 = reader.S("eob_pt_1024", { plane, txSz, x4, y4, ptype });
        eobPt = eob_pt_1024 + 1;
      }

      eob = eobPt < 2 ? eobPt : (1 << (eobPt - 2)) + 1;
      let eobShift = Math.max(-1, eobPt - 3);
      if (eobShift >= 0) {
        let eob_extra = reader.S("eob_extra", { txSzCtx, ptype, eobPt });
        if (eob_extra) {
          eob += 1 << eobShift;
        }
        for (let i = 1; i < Math.max(0, eobPt - 2); i++) {
          eobShift = Math.max(0, eobPt - 2) - 1 - i;
          let eob_extra_bit = reader.L(1);
          if (eob_extra_bit) {
            eob += 1 << eobShift;
          }
        }
      }
      for (let c = eob - 1; c >= 0; c--) {
        let pos = scan[c];
        let level = 0;
        if (c == eob - 1) {
          let coeff_base_eob = reader.S("coeff_base_eob", { txSz, plane, x4, y4, c, scan, txSzCtx, ptype });
          level = coeff_base_eob + 1;
        } else {
          let coeff_base = reader.S("coeff_base", { txSz, plane, x4, y4, c, scan, txSzCtx, ptype });
          level = coeff_base;
        }
        if (level > NUM_BASE_LEVELS) {
          for (let idx = 0; idx < COEFF_BASE_RANGE / (BR_CDF_SIZE - 1); idx++) {
            let coeff_br = reader.S("coeff_br", { txSz, pos, plane, x4, y4, txSzCtx, ptype });
            level += coeff_br;
            if (coeff_br < BR_CDF_SIZE - 1) break;
          }
        }
        coef.Quant[pos] = level;
      }
      for (let c = 0; c < eob; c++) {
        let pos = scan[c];
        let sign = 0;
        if (coef.Quant[pos] != 0) {
          if (c == 0) {
            let dc_sign = reader.S("dc_sign", { plane, w4, h4, x4, y4, ptype });
            sign = dc_sign;
          } else {
            let sign_bit = reader.L(1);
            sign = sign_bit;
          }
        }
        if (coef.Quant[pos] > NUM_BASE_LEVELS + COEFF_BASE_RANGE) {
          let length = 0;
          let golomb_length_bit: number;
          do {
            length++;
            golomb_length_bit = reader.L(1);
          } while (!golomb_length_bit);
          if (length == 20) {
            assert(golomb_length_bit == 1, "If length is equal to 20, it is a requirement of bitstream conformance that golomb_length_bit is equal to 1");
          }
          let x = 1;
          for (let i = length - 2; i >= 0; i--) {
            let golomb_data_bit = reader.L(1);
            x = (x << 1) | golomb_data_bit;
          }
          coef.Quant[pos] = x + COEFF_BASE_RANGE + NUM_BASE_LEVELS;
        }
        if (pos == 0 && coef.Quant[pos] > 0) {
          dcCategory = sign ? 1 : 2;
        }
        coef.Quant[pos] = coef.Quant[pos] & 0xfffff;
        culLevel += coef.Quant[pos];
        if (sign) coef.Quant[pos] = -coef.Quant[pos];
      }
      culLevel = Math.min(63, culLevel);
    }
    for (let i = 0; i < w4; i++) {
      coef.AboveLevelContext[plane][x4 + i] = culLevel;
      coef.AboveDcContext[plane][x4 + i] = dcCategory;
    }
    for (let i = 0; i < h4; i++) {
      coef.LeftLevelContext[plane][y4 + i] = culLevel;
      coef.LeftDcContext[plane][y4 + i] = dcCategory;
    }
    return eob;
  }

  /**
   * 5.11.40 Compute transform type function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#compute-transform-type-function)
   */
  compute_tx_type(plane: number, txSz: number, blockX: number, blockY: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;
    const isi = tg.intra_segment_id;
    const ii = tg.is_inter;
    const coef = tg.coefficients;

    let txSzSqrUp = Tx_Size_Sqr_Up[txSz];
    if (isi.Lossless || txSzSqrUp > TX_SIZE.TX_32X32) return DCT_DCT;
    let txSet = this.get_tx_set(txSz);
    if (plane == 0) {
      return coef.TxTypes[blockY][blockX];
    }
    if (ii.is_inter) {
      let x4 = Math.max(db.MiCol, blockX << cc.subsampling_x);
      let y4 = Math.max(db.MiRow, blockY << cc.subsampling_y);
      let txType = coef.TxTypes[y4][x4];
      if (!this.is_tx_type_in_set(txSet, txType)) return DCT_DCT;
      return txType;
    }
    let txType = Mode_To_Txfm[ifmi.UVMode];
    if (!this.is_tx_type_in_set(txSet, txType)) return DCT_DCT;
    return txType;
  }

  /**
   * 5.11.1 General tile group OBU syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#general-tile-group-obu-syntax)
   */
  /** [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#compute-transform-type-function) */
  is_tx_type_in_set(txSet: number, txType: number) {
    const tg = this.titleGroup;
    const ii = tg.is_inter;

    return ii.is_inter ? Tx_Type_In_Set_Inter[txSet][txType] : Tx_Type_In_Set_Intra[txSet][txType];
  }

  /**
   * 5.11.41 Get scan function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#get-scan-function)
   */
  get_mrow_scan(txSz: number) {
    if (txSz == TX_SIZE.TX_4X4) {
      return Mrow_Scan_4x4;
    } else if (txSz == TX_SIZE.TX_4X8) {
      return Mrow_Scan_4x8;
    } else if (txSz == TX_SIZE.TX_8X4) {
      return Mrow_Scan_8x4;
    } else if (txSz == TX_SIZE.TX_8X8) {
      return Mrow_Scan_8x8;
    } else if (txSz == TX_SIZE.TX_8X16) {
      return Mrow_Scan_8x16;
    } else if (txSz == TX_SIZE.TX_16X8) {
      return Mrow_Scan_16x8;
    } else if (txSz == TX_SIZE.TX_16X16) {
      return Mrow_Scan_16x16;
    } else if (txSz == TX_SIZE.TX_4X16) {
      return Mrow_Scan_4x16;
    }
    return Mrow_Scan_16x4;
  }

  /**
   * 5.11.41 Get scan function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#get-scan-function)
   */
  get_mcol_scan(txSz: number) {
    if (txSz == TX_SIZE.TX_4X4) {
      return Mcol_Scan_4x4;
    } else if (txSz == TX_SIZE.TX_4X8) {
      return Mcol_Scan_4x8;
    } else if (txSz == TX_SIZE.TX_8X4) {
      return Mcol_Scan_8x4;
    } else if (txSz == TX_SIZE.TX_8X8) {
      return Mcol_Scan_8x8;
    } else if (txSz == TX_SIZE.TX_8X16) {
      return Mcol_Scan_8x16;
    } else if (txSz == TX_SIZE.TX_16X8) {
      return Mcol_Scan_16x8;
    } else if (txSz == TX_SIZE.TX_16X16) {
      return Mcol_Scan_16x16;
    } else if (txSz == TX_SIZE.TX_4X16) {
      return Mcol_Scan_4x16;
    }
    return Mcol_Scan_16x4;
  }

  /**
   * 5.11.41 Get scan function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#get-scan-function)
   */
  get_default_scan(txSz: number) {
    if (txSz == TX_SIZE.TX_4X4) {
      return Default_Scan_4x4;
    } else if (txSz == TX_SIZE.TX_4X8) {
      return Default_Scan_4x8;
    } else if (txSz == TX_SIZE.TX_8X4) {
      return Default_Scan_8x4;
    } else if (txSz == TX_SIZE.TX_8X8) {
      return Default_Scan_8x8;
    } else if (txSz == TX_SIZE.TX_8X16) {
      return Default_Scan_8x16;
    } else if (txSz == TX_SIZE.TX_16X8) {
      return Default_Scan_16x8;
    } else if (txSz == TX_SIZE.TX_16X16) {
      return Default_Scan_16x16;
    } else if (txSz == TX_SIZE.TX_16X32) {
      return Default_Scan_16x32;
    } else if (txSz == TX_SIZE.TX_32X16) {
      return Default_Scan_32x16;
    } else if (txSz == TX_SIZE.TX_4X16) {
      return Default_Scan_4x16;
    } else if (txSz == TX_SIZE.TX_16X4) {
      return Default_Scan_16x4;
    } else if (txSz == TX_SIZE.TX_8X32) {
      return Default_Scan_8x32;
    } else if (txSz == TX_SIZE.TX_32X8) {
      return Default_Scan_32x8;
    }
    return Default_Scan_32x32;
  }

  /**
   * 5.11.41 Get scan function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#get-scan-function)
   */
  get_scan(txSz: number) {
    const tg = this.titleGroup;
    const coef = tg.coefficients;

    if (txSz == TX_SIZE.TX_16X64) {
      return Default_Scan_16x32;
    }
    if (txSz == TX_SIZE.TX_64X16) {
      return Default_Scan_32x16;
    }
    if (Tx_Size_Sqr_Up[txSz] == TX_SIZE.TX_64X64) {
      return Default_Scan_32x32;
    }
    if (coef.PlaneTxType == IDTX) {
      return this.get_default_scan(txSz);
    }
    let preferRow = coef.PlaneTxType == V_DCT || coef.PlaneTxType == V_ADST || coef.PlaneTxType == V_FLIPADST;
    let preferCol = coef.PlaneTxType == H_DCT || coef.PlaneTxType == H_ADST || coef.PlaneTxType == H_FLIPADST;
    if (preferRow) {
      return this.get_mrow_scan(txSz);
    } else if (preferCol) {
      return this.get_mcol_scan(txSz);
    }
    return this.get_default_scan(txSz);
  }

  /**
   * 5.11.42 Intra angle info luma syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#intra-angle-info-luma-syntax)
   */
  intra_angle_info_y() {
    const reader = this.decoder.reader;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;
    const iai = tg.intra_angle_info;

    iai.AngleDeltaY = 0;
    if (db.MiSize >= SUB_SIZE.BLOCK_8X8) {
      if (this.is_directional_mode(ifmi.YMode)) {
        let angle_delta_y = reader.S("angle_delta_y");
        iai.AngleDeltaY = angle_delta_y - MAX_ANGLE_DELTA;
      }
    }
  }

  /**
   * 5.11.43 Intra angle info chroma syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#intra-angle-info-chroma-syntax)
   */
  intra_angle_info_uv() {
    const reader = this.decoder.reader;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;
    const iai = tg.intra_angle_info;

    iai.AngleDeltaUV = 0;
    if (db.MiSize >= SUB_SIZE.BLOCK_8X8) {
      if (this.is_directional_mode(ifmi.UVMode)) {
        let angle_delta_uv = reader.S("angle_delta_uv");
        iai.AngleDeltaUV = angle_delta_uv - MAX_ANGLE_DELTA;
      }
    }
  }

  /**
   * 5.11.44 Is directional mode function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#is-directional-mode-function)
   */
  is_directional_mode(mode: Y_MODE) {
    if (mode >= Y_MODE.V_PRED && mode <= Y_MODE.D67_PRED) {
      return 1;
    }
    return 0;
  }

  /**
   * 5.11.45 Read CFL alphas syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#read-cfl-alphas-syntax)
   */
  read_cfl_alphas() {
    const reader = this.decoder.reader;
    const tg = this.titleGroup;
    const rca = tg.cfl_alphas;
    /** +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *  | cfl_alpha_signs | Name of signU | Name of signV |
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *  |        0        | CFL_SIGN_ZERO | CFL_SIGN_NEG  |
     *  |        1        | CFL_SIGN_ZERO | CFL_SIGN_POS  |
     *  |        2        | CFL_SIGN_NEG  | CFL_SIGN_ZERO |
     *  |        3        | CFL_SIGN_NEG  | CFL_SIGN_NEG  |
     *  |        4        | CFL_SIGN_NEG  | CFL_SIGN_POS  |
     *  |        5        | CFL_SIGN_POS  | CFL_SIGN_ZERO |
     *  |        6        | CFL_SIGN_POS  | CFL_SIGN_NEG  |
     *  |        7        | CFL_SIGN_POS  | CFL_SIGN_POS  |
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     */
    let cfl_alpha_signs = reader.S("cfl_alpha_signs");
    /** +-+-+-+-+-+-+-+-+-+-+-+-+
     *  | signU | Name of signU |
     *  +-+-+-+-+-+-+-+-+-+-+-+-+
     *  |   0   | CFL_SIGN_ZERO |
     *  |   1   | CFL_SIGN_NEG  |
     *  |   2   | CFL_SIGN_POS  |
     *  +-+-+-+-+-+-+-+-+-+-+-+-+
     */
    let signU: SIGN_UV = integer((cfl_alpha_signs + 1) / 3);
    let signV: SIGN_UV = (cfl_alpha_signs + 1) % 3;
    if (signU != SIGN_UV.CFL_SIGN_ZERO) {
      let cfl_alpha_u = reader.S("cfl_alpha_u", { signU, signV });
      rca.CflAlphaU = 1 + cfl_alpha_u;
      if (signU == SIGN_UV.CFL_SIGN_NEG) {
        rca.CflAlphaU = -rca.CflAlphaU;
      }
    } else {
      rca.CflAlphaU = 0;
    }
    if (signV != SIGN_UV.CFL_SIGN_ZERO) {
      let cfl_alpha_v = reader.S("cfl_alpha_v", { signU, signV });
      rca.CflAlphaV = 1 + cfl_alpha_v;
      if (signV == SIGN_UV.CFL_SIGN_NEG) {
        rca.CflAlphaV = -rca.CflAlphaV;
      }
    } else {
      rca.CflAlphaV = 0;
    }
  }

  /**
   * 5.11.46 Palette mode info syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#palette-mode-info-syntax)
   */
  palette_mode_info() {
    const reader = this.decoder.reader;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;
    const pmi = tg.palette_mode_info;

    let bsizeCtx = Mi_Width_Log2[db.MiSize] + Mi_Height_Log2[db.MiSize] - 2;
    if (ifmi.YMode == Y_MODE.DC_PRED) {
      let has_palette_y = reader.S("has_palette_y", { bsizeCtx });
      if (has_palette_y) {
        let palette_size_y_minus_2 = reader.S("palette_size_y_minus_2", { bsizeCtx });
        pmi.PaletteSizeY = palette_size_y_minus_2 + 2;
        let cacheN = this.get_palette_cache(0);
        let idx = 0;
        for (let i = 0; i < cacheN && idx < pmi.PaletteSizeY; i++) {
          let use_palette_color_cache_y = reader.L(1);
          if (use_palette_color_cache_y) {
            pmi.palette_colors_y[idx] = db.PaletteCache[i];
            idx++;
          }
        }
        if (idx < pmi.PaletteSizeY) {
          pmi.palette_colors_y[idx] = reader.L(cc.BitDepth);
          idx++;
        }
        let paletteBits = 0;
        if (idx < pmi.PaletteSizeY) {
          let minBits = cc.BitDepth - 3;
          let palette_num_extra_bits_y = reader.L(2);
          paletteBits = minBits + palette_num_extra_bits_y;
        }
        while (idx < pmi.PaletteSizeY) {
          let palette_delta_y = reader.L(paletteBits);
          palette_delta_y++;
          pmi.palette_colors_y[idx] = Clip1(pmi.palette_colors_y[idx - 1] + palette_delta_y, cc.BitDepth);
          let range = (1 << cc.BitDepth) - pmi.palette_colors_y[idx] - 1;
          paletteBits = Math.min(paletteBits, CeilLog2(range));
          idx++;
        }
        this.sort(pmi.palette_colors_y, 0, pmi.PaletteSizeY - 1);
      }
    }
    if (db.HasChroma && ifmi.UVMode == Y_MODE.DC_PRED) {
      let has_palette_uv = reader.S("has_palette_uv");
      if (has_palette_uv) {
        let palette_size_uv_minus_2 = reader.S("palette_size_uv_minus_2", { bsizeCtx });
        pmi.PaletteSizeUV = palette_size_uv_minus_2 + 2;
        let cacheN = this.get_palette_cache(1);
        let idx = 0;
        for (let i = 0; i < cacheN && idx < pmi.PaletteSizeUV; i++) {
          let use_palette_color_cache_u = reader.L(1);
          if (use_palette_color_cache_u) {
            pmi.palette_colors_u[idx] = db.PaletteCache[i];
            idx++;
          }
        }
        if (idx < pmi.PaletteSizeUV) {
          pmi.palette_colors_u[idx] = reader.L(cc.BitDepth);
          idx++;
        }
        let paletteBits = 0;
        if (idx < pmi.PaletteSizeUV) {
          let minBits = cc.BitDepth - 3;
          let palette_num_extra_bits_u = reader.L(2);
          paletteBits = minBits + palette_num_extra_bits_u;
        }
        while (idx < pmi.PaletteSizeUV) {
          let palette_delta_u = reader.L(paletteBits);
          pmi.palette_colors_u[idx] = Clip1(pmi.palette_colors_u[idx - 1] + palette_delta_u, cc.BitDepth);
          let range = (1 << cc.BitDepth) - pmi.palette_colors_u[idx];
          paletteBits = Math.min(paletteBits, CeilLog2(range));
          idx++;
        }
        this.sort(pmi.palette_colors_u, 0, pmi.PaletteSizeUV - 1);
        let delta_encode_palette_colors_v = reader.L(1);
        if (delta_encode_palette_colors_v) {
          let minBits = cc.BitDepth - 4;
          let maxVal = 1 << cc.BitDepth;
          let palette_num_extra_bits_v = reader.L(2);
          paletteBits = minBits + palette_num_extra_bits_v;
          pmi.palette_colors_v[0] = reader.L(cc.BitDepth);
          for (let idx = 1; idx < pmi.PaletteSizeUV; idx++) {
            let palette_delta_v = reader.L(paletteBits);
            if (palette_delta_v) {
              let palette_delta_sign_bit_v = reader.L(1);
              if (palette_delta_sign_bit_v) {
                palette_delta_v = -palette_delta_v;
              }
            }
            let val = pmi.palette_colors_v[idx - 1] + palette_delta_v;
            if (val < 0) val += maxVal;
            if (val >= maxVal) val -= maxVal;
            pmi.palette_colors_v[idx] = Clip1(val, cc.BitDepth);
          }
        } else {
          for (idx = 0; idx < pmi.PaletteSizeUV; idx++) {
            pmi.palette_colors_v[idx] = reader.L(cc.BitDepth);
          }
        }
      }
    }
  }

  /**
   * 5.11.46 Palette mode info syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#palette-mode-info-syntax)
   */
  sort(arr: number[], i1: number, i2: number) {
    arr
      .slice(i1, i2 + 1)
      .sort((a, b) => a - b)
      .forEach((value, index) => {
        arr[index + i1] = value;
      });
  }

  /**
   * 5.11.46 Palette mode info syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#palette-mode-info-syntax)
   */
  get_palette_cache(plane: number) {
    const tg = this.titleGroup;
    const db = tg.decode_block;

    let aboveN = 0;
    if ((db.MiRow * MI_SIZE) % 64) {
      aboveN = db.PaletteSizes[plane][db.MiRow - 1][db.MiCol];
    }
    let leftN = 0;
    if (db.AvailL) {
      leftN = db.PaletteSizes[plane][db.MiRow][db.MiCol - 1];
    }
    let aboveIdx = 0;
    let leftIdx = 0;
    let n = 0;
    while (aboveIdx < aboveN && leftIdx < leftN) {
      let aboveC = db.PaletteColors[plane][db.MiRow - 1][db.MiCol][aboveIdx];
      let leftC = db.PaletteColors[plane][db.MiRow][db.MiCol - 1][leftIdx];
      if (leftC < aboveC) {
        if (n == 0 || leftC != db.PaletteCache[n - 1]) {
          db.PaletteCache[n] = leftC;
          n++;
        }
        leftIdx++;
      } else {
        if (n == 0 || aboveC != db.PaletteCache[n - 1]) {
          db.PaletteCache[n] = aboveC;
          n++;
        }
        aboveIdx++;
        if (leftC == aboveC) {
          leftIdx++;
        }
      }
    }
    while (aboveIdx < aboveN) {
      let val = db.PaletteColors[plane][db.MiRow - 1][db.MiCol][aboveIdx];
      aboveIdx++;
      if (n == 0 || val != db.PaletteCache[n - 1]) {
        db.PaletteCache[n] = val;
        n++;
      }
    }
    while (leftIdx < leftN) {
      let val = db.PaletteColors[plane][db.MiRow][db.MiCol - 1][leftIdx];
      leftIdx++;
      if (n == 0 || val != db.PaletteCache[n - 1]) {
        db.PaletteCache[n] = val;
        n++;
      }
    }
    return n;
  }

  /**
   * 5.11.47 Transform type syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#transform-type-syntax)
   */
  transform_type(x4: number, y4: number, txSz: number) {
    const reader = this.decoder.reader;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const qp = fh.quantization_params;
    const sp = fh.segmentation_params;
    const tg = this.titleGroup;
    const si = tg.segment_id;
    const ii = tg.is_inter;
    const coef = tg.coefficients;
    const rad = this.decoder.reconstructionAndDequantization;

    let set = this.get_tx_set(txSz);
    if (set > 0 && (sp.segmentation_enabled ? rad.get_qindex(1, si.segment_id) : qp.base_q_idx) > 0) {
      if (ii.is_inter) {
        let inter_tx_type = reader.S("inter_tx_type", { set, txSz });
        if (set == SET.TX_SET_INTER_1) {
          coef.TxType = Tx_Type_Inter_Inv_Set1[inter_tx_type];
        } else if (set == SET.TX_SET_INTER_2) {
          coef.TxType = Tx_Type_Inter_Inv_Set2[inter_tx_type];
        } else {
          coef.TxType = Tx_Type_Inter_Inv_Set3[inter_tx_type];
        }
      } else {
        let intra_tx_type = reader.S("intra_tx_type", { set, txSz });
        if (set == SET.TX_SET_INTRA_1) {
          coef.TxType = Tx_Type_Intra_Inv_Set1[intra_tx_type];
        } else {
          coef.TxType = Tx_Type_Intra_Inv_Set2[intra_tx_type];
        }
      }
    } else {
      coef.TxType = DCT_DCT;
    }
    coef.TxTypes = Array2D(coef.TxTypes, y4 + (Tx_Height[txSz] >> 2));
    for (let i = 0; i < Tx_Width[txSz] >> 2; i++) {
      for (let j = 0; j < Tx_Height[txSz] >> 2; j++) {
        coef.TxTypes[y4 + j][x4 + i] = coef.TxType;
      }
    }
  }

  /**
   * 5.11.48 Get transform set function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#get-transform-set-function)
   */
  get_tx_set(txSz: number) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const tg = this.titleGroup;
    const ii = tg.is_inter;

    let txSzSqr = Tx_Size_Sqr[txSz];
    let txSzSqrUp = Tx_Size_Sqr_Up[txSz];
    if (txSzSqrUp > TX_SIZE.TX_32X32) return SET.TX_SET_DCTONLY;
    if (ii.is_inter) {
      if (fh.reduced_tx_set || txSzSqrUp == TX_SIZE.TX_32X32) return SET.TX_SET_INTER_3;
      else if (txSzSqr == TX_SIZE.TX_16X16) return SET.TX_SET_INTER_2;
      return SET.TX_SET_INTER_1;
    } else {
      if (txSzSqrUp == TX_SIZE.TX_32X32) return SET.TX_SET_DCTONLY;
      else if (fh.reduced_tx_set) return SET.TX_SET_INTRA_2;
      else if (txSzSqr == TX_SIZE.TX_16X16) return SET.TX_SET_INTRA_2;
      return SET.TX_SET_INTRA_1;
    }
  }

  /**
   * 5.11.49 Palette tokens syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#palette-tokens-syntax)
   */
  palette_tokens() {
    const reader = this.decoder.reader;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const pmi = tg.palette_mode_info;
    const pt = tg.palette_tokens;
    const pcc = tg.palette_color_context;

    let blockHeight = Block_Height[db.MiSize];
    let blockWidth = Block_Width[db.MiSize];
    let onscreenHeight = Math.min(blockHeight, (cis.MiRows - db.MiRow) * MI_SIZE);
    let onscreenWidth = Math.min(blockWidth, (cis.MiCols - db.MiCol) * MI_SIZE);
    pt.ColorMapY = Array2D(pt.ColorMapY, onscreenHeight);
    if (pmi.PaletteSizeY) {
      let color_index_map_y = reader.NS(pmi.PaletteSizeY);
      pt.ColorMapY[0][0] = color_index_map_y;
      for (let i = 1; i < onscreenHeight + onscreenWidth - 1; i++) {
        for (let j = Math.min(i, onscreenWidth - 1); j >= Math.max(0, i - onscreenHeight + 1); j--) {
          this.get_palette_color_context(pt.ColorMapY, i - j, j, pmi.PaletteSizeY);
          let palette_color_idx_y = reader.S("palette_color_idx_y");
          pt.ColorMapY[i - j][j] = pcc.ColorOrder[palette_color_idx_y];
        }
      }
      for (let i = 0; i < onscreenHeight; i++) {
        for (let j = onscreenWidth; j < blockWidth; j++) {
          pt.ColorMapY[i][j] = pt.ColorMapY[i][onscreenWidth - 1];
        }
      }
      for (let i = onscreenHeight; i < blockHeight; i++) {
        for (let j = 0; j < blockWidth; j++) {
          pt.ColorMapY[i][j] = pt.ColorMapY[onscreenHeight - 1][j];
        }
      }
    }
    if (pmi.PaletteSizeUV) {
      pt.ColorMapUV = Array2D(pt.ColorMapUV, onscreenHeight);
      let color_index_map_uv = reader.NS(pmi.PaletteSizeUV);
      pt.ColorMapUV[0][0] = color_index_map_uv;
      blockHeight = blockHeight >> cc.subsampling_y;
      blockWidth = blockWidth >> cc.subsampling_x;
      onscreenHeight = onscreenHeight >> cc.subsampling_y;
      onscreenWidth = onscreenWidth >> cc.subsampling_x;
      if (blockWidth < 4) {
        blockWidth += 2;
        onscreenWidth += 2;
      }
      if (blockHeight < 4) {
        blockHeight += 2;
        onscreenHeight += 2;
      }
      for (let i = 1; i < onscreenHeight + onscreenWidth - 1; i++) {
        for (let j = Math.min(i, onscreenWidth - 1); j >= Math.max(0, i - onscreenHeight + 1); j--) {
          this.get_palette_color_context(pt.ColorMapUV, i - j, j, pmi.PaletteSizeUV);
          let palette_color_idx_uv = reader.S("palette_color_idx_uv");
          pt.ColorMapUV[i - j][j] = pcc.ColorOrder[palette_color_idx_uv];
        }
      }
      for (let i = 0; i < onscreenHeight; i++) {
        for (let j = onscreenWidth; j < blockWidth; j++) {
          pt.ColorMapUV[i][j] = pt.ColorMapUV[i][onscreenWidth - 1];
        }
      }
      for (let i = onscreenHeight; i < blockHeight; i++) {
        for (let j = 0; j < blockWidth; j++) {
          pt.ColorMapUV[i][j] = pt.ColorMapUV[onscreenHeight - 1][j];
        }
      }
    }
  }

  /**
   * 5.11.50 Palette color context function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#palette-color-context-function)
   */
  get_palette_color_context(colorMap: number[][], r: number, c: number, n: number) {
    const tg = this.titleGroup;
    const pcc = tg.palette_color_context;

    let scores: number[] = [];
    for (let i = 0; i < PALETTE_COLORS; i++) {
      scores[i] = 0;
      pcc.ColorOrder[i] = i;
    }
    let neighbor = 0;
    if (c > 0) {
      neighbor = colorMap[r][c - 1];
      scores[neighbor] += 2;
    }
    if (r > 0 && c > 0) {
      neighbor = colorMap[r - 1][c - 1];
      scores[neighbor] += 1;
    }
    if (r > 0) {
      neighbor = colorMap[r - 1][c];
      scores[neighbor] += 2;
    }
    for (let i = 0; i < PALETTE_NUM_NEIGHBORS; i++) {
      let maxScore = scores[i];
      let maxIdx = i;
      for (let j = i + 1; j < n; j++) {
        if (scores[j] > maxScore) {
          maxScore = scores[j];
          maxIdx = j;
        }
      }
      if (maxIdx != i) {
        maxScore = scores[maxIdx];
        let maxColorOrder = pcc.ColorOrder[maxIdx];
        for (let k = maxIdx; k > i; k--) {
          scores[k] = scores[k - 1];
          pcc.ColorOrder[k] = pcc.ColorOrder[k - 1];
        }
        scores[i] = maxScore;
        pcc.ColorOrder[i] = maxColorOrder;
      }
    }
    pcc.ColorContextHash = 0;
    for (let i = 0; i < PALETTE_NUM_NEIGHBORS; i++) {
      pcc.ColorContextHash += scores[i] * Palette_Color_Hash_Multipliers[i];
    }
  }

  /**
   * 5.11.51 Is inside function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#is-inside-function)
   */
  is_inside(candidateR: number, candidateC: number) {
    const tg = this.titleGroup;

    return Number(candidateC >= tg.MiColStart && candidateC < tg.MiColEnd && candidateR >= tg.MiRowStart && candidateR < tg.MiRowEnd);
  }

  /**
   * 5.11.52 Is inside filter region function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#is-inside-filter-region-function)
   */
  is_inside_filter_region(candidateR: number, candidateC: number) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;

    let colStart = 0;
    let colEnd = cis.MiCols;
    let rowStart = 0;
    let rowEnd = cis.MiRows;
    return candidateC >= colStart && candidateC < colEnd && candidateR >= rowStart && candidateR < rowEnd;
  }

  /**
   * 5.11.53 Clamp MV row function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#clamp-mv-row-function)
   */
  clamp_mv_row(mvec: number, border: number) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const tg = this.titleGroup;
    const db = tg.decode_block;

    let bh4 = Num_4x4_Blocks_High[db.MiSize];
    let mbToTopEdge = -(db.MiRow * MI_SIZE * 8);
    let mbToBottomEdge = (cis.MiRows - bh4 - db.MiRow) * MI_SIZE * 8;
    return Clip3(mbToTopEdge - border, mbToBottomEdge + border, mvec);
  }

  /**
   * 5.11.54 Clamp MV col function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#clamp-mv-col-function)
   */
  clamp_mv_col(mvec: number, border: number) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const tg = this.titleGroup;
    const db = tg.decode_block;

    let bw4 = Num_4x4_Blocks_Wide[db.MiSize];
    let mbToLeftEdge = -(db.MiCol * MI_SIZE * 8);
    let mbToRightEdge = (cis.MiCols - bw4 - db.MiCol) * MI_SIZE * 8;
    return Clip3(mbToLeftEdge - border, mbToRightEdge + border, mvec);
  }

  /**
   * 5.11.55 Clear CDEF function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#clear-cdef-function)
   */
  clear_cdef(r: number, c: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const tg = this.titleGroup;
    const rc = tg.cdef;

    rc.cdef_idx[r][c] = -1;
    if (seqHeader.use_128x128_superblock) {
      let cdefSize4 = Num_4x4_Blocks_Wide[SUB_SIZE.BLOCK_64X64];
      rc.cdef_idx[r][c + cdefSize4] = -1;
      rc.cdef_idx[r + cdefSize4][c] = -1;
      rc.cdef_idx[r + cdefSize4][c + cdefSize4] = -1;
    }
  }

  /**
   * 5.11.56 Read CDEF syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#read-cdef-syntax)
   */
  read_cdef() {
    const reader = this.decoder.reader;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const s = tg.skip;
    const cp = tg.cdef_params;
    const rc = tg.cdef;

    if (s.skip || fh.CodedLossless || !seqHeader.enable_cdef || fh.allow_intrabc) {
      return;
    }
    let cdefSize4 = Num_4x4_Blocks_Wide[SUB_SIZE.BLOCK_64X64];
    let cdefMask4 = ~(cdefSize4 - 1);
    let r = db.MiRow & cdefMask4;
    let c = db.MiCol & cdefMask4;
    if (rc.cdef_idx[r][c] == -1) {
      rc.cdef_idx[r][c] = reader.L(cp.cdef_bits);
      let w4 = Num_4x4_Blocks_Wide[db.MiSize];
      let h4 = Num_4x4_Blocks_High[db.MiSize];
      for (let i = r; i < r + h4; i += cdefSize4) {
        for (let j = c; j < c + w4; j += cdefSize4) {
          rc.cdef_idx[i][j] = rc.cdef_idx[r][c];
        }
      }
    }
  }

  /**
   * 5.11.57 Read loop restoration syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#read-loop-restoration-syntax)
   */
  read_lr(r: number, c: number, bSize: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const fs = fh.frame_size;
    const fswr = fh.frame_size_with_refs;
    const sp = fh.superres_params;
    const tg = this.titleGroup;
    const lp = tg.lr_params;

    if (fh.allow_intrabc) {
      return;
    }
    let w = Num_4x4_Blocks_Wide[bSize];
    let h = Num_4x4_Blocks_High[bSize];
    for (let plane = 0; plane < cc.NumPlanes; plane++) {
      if (lp.FrameRestorationType[plane] != FRAME_RESTORATION_TYPE.RESTORE_NONE) {
        let subX = plane == 0 ? 0 : cc.subsampling_x;
        let subY = plane == 0 ? 0 : cc.subsampling_y;
        let unitSize = lp.LoopRestorationSize[plane];

        let unitRows = this.count_units_in_frame(unitSize, Round2(fs.FrameHeight, subY));
        let unitCols = this.count_units_in_frame(unitSize, Round2(fswr.UpscaledWidth, subX));
        let unitRowStart = integer((r * (MI_SIZE >>> subY) + unitSize - 1) / unitSize);
        let unitRowEnd = Math.min(unitRows, integer(((r + h) * (MI_SIZE >>> subY) + unitSize - 1) / unitSize));
        let numerator = 0;
        let denominator = 0;
        if (sp.use_superres) {
          numerator = (MI_SIZE >>> subX) * sp.SuperresDenom;
          denominator = unitSize * SUPERRES_NUM;
        } else {
          numerator = MI_SIZE >>> subX;
          denominator = unitSize;
        }
        let unitColStart = integer((c * numerator + denominator - 1) / denominator);
        let unitColEnd = Math.min(unitCols, integer(((c + w) * numerator + denominator - 1) / denominator));
        lp.LrType = Array3D(lp.LrType, cc.NumPlanes, unitRowEnd);
        lp.LrWiener = Array5D(lp.LrWiener, cc.NumPlanes, unitRowEnd, unitColEnd, 2);
        lp.LrSgrSet = Array3D(lp.LrSgrSet, cc.NumPlanes, unitRowEnd);
        lp.LrSgrXqd = Array4D(lp.LrSgrXqd, cc.NumPlanes, unitRowEnd, unitColEnd);
        for (let unitRow = unitRowStart; unitRow < unitRowEnd; unitRow++) {
          for (let unitCol = unitColStart; unitCol < unitColEnd; unitCol++) {
            this.read_lr_unit(plane, unitRow, unitCol);
          }
        }
      }
    }
  }

  /**
   * 5.11.57 Read loop restoration syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#read-loop-restoration-syntax)
   */
  count_units_in_frame(unitSize: number, frameSize: number) {
    return Math.max(integer((frameSize + (unitSize >> 1)) / unitSize), 1);
  }

  /**
   * 5.11.58 Read loop restoration unit syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#read-loop-restoration-unit-syntax)
   */
  read_lr_unit(plane: number, unitRow: number, unitCol: number) {
    const reader = this.decoder.reader;
    const tg = this.titleGroup;
    const dt = tg.decode_tile;
    const lp = tg.lr_params;

    let restoration_type = FRAME_RESTORATION_TYPE.RESTORE_NONE;
    if (lp.FrameRestorationType[plane] == FRAME_RESTORATION_TYPE.RESTORE_WIENER) {
      let use_wiener = reader.S("use_wiener");
      restoration_type = use_wiener ? FRAME_RESTORATION_TYPE.RESTORE_WIENER : FRAME_RESTORATION_TYPE.RESTORE_NONE;
    } else if (lp.FrameRestorationType[plane] == FRAME_RESTORATION_TYPE.RESTORE_SGRPROJ) {
      let use_sgrproj = reader.S("use_sgrproj");
      restoration_type = use_sgrproj ? FRAME_RESTORATION_TYPE.RESTORE_SGRPROJ : FRAME_RESTORATION_TYPE.RESTORE_NONE;
    } else {
      restoration_type = reader.S("restoration_type");
    }
    lp.LrType[plane][unitRow][unitCol] = restoration_type;
    if (restoration_type == FRAME_RESTORATION_TYPE.RESTORE_WIENER) {
      for (let pass = 0; pass < 2; pass++) {
        let firstCoeff = 0;
        if (plane) {
          firstCoeff = 1;
          lp.LrWiener[plane][unitRow][unitCol][pass][0] = 0;
        } else {
          firstCoeff = 0;
        }
        for (let j = firstCoeff; j < 3; j++) {
          let min = Wiener_Taps_Min[j];
          let max = Wiener_Taps_Max[j];
          let k = Wiener_Taps_K[j];
          let v = this.decode_signed_subexp_with_ref_bool(min, max + 1, k, dt.RefLrWiener[plane][pass][j]);
          lp.LrWiener[plane][unitRow][unitCol][pass][j] = v;
          dt.RefLrWiener[plane][pass][j] = v;
        }
      }
    } else if (restoration_type == FRAME_RESTORATION_TYPE.RESTORE_SGRPROJ) {
      let lr_sgr_set = reader.L(SGRPROJ_PARAMS_BITS);
      lp.LrSgrSet[plane][unitRow][unitCol] = lr_sgr_set;
      for (let i = 0; i < 2; i++) {
        let radius = Sgr_Params[lr_sgr_set][i * 2];
        let min = Sgrproj_Xqd_Min[i];
        let max = Sgrproj_Xqd_Max[i];
        let v = 0;
        if (radius) {
          v = this.decode_signed_subexp_with_ref_bool(min, max + 1, SGRPROJ_PRJ_SUBEXP_K, dt.RefSgrXqd[plane][i]);
        } else {
          v = 0;
          if (i == 1) {
            v = Clip3(min, max, (1 << SGRPROJ_PRJ_BITS) - dt.RefSgrXqd[plane][0]);
          }
        }
        lp.LrSgrXqd[plane][unitRow][unitCol][i] = v;
        dt.RefSgrXqd[plane][i] = v;
      }
    }
  }

  /**
   * 5.11.58 Read loop restoration unit syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#read-loop-restoration-unit-syntax)
   */
  decode_signed_subexp_with_ref_bool(low: number, high: number, k: number, r: number) {
    let x = this.decode_unsigned_subexp_with_ref_bool(high - low, k, r - low);
    return x + low;
  }

  /**
   * 5.11.58 Read loop restoration unit syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#read-loop-restoration-unit-syntax)
   */
  decode_unsigned_subexp_with_ref_bool(mx: number, k: number, r: number) {
    const fho = this.decoder.frameHeaderObu;
    let v = this.decode_subexp_bool(mx, k);
    if (r << 1 <= mx) {
      return fho.inverse_recenter(r, v);
    } else {
      return mx - 1 - fho.inverse_recenter(mx - 1 - r, v);
    }
  }

  /**
   * 5.11.58 Read loop restoration unit syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#read-loop-restoration-unit-syntax)
   */
  decode_subexp_bool(numSyms: number, k: number) {
    const reader = this.decoder.reader;

    let i = 0;
    let mk = 0;
    while (1) {
      let b2 = i ? k + i - 1 : k;
      let a = 1 << b2;
      if (numSyms <= mk + 3 * a) {
        let subexp_unif_bools = reader.NS(numSyms - mk);
        return subexp_unif_bools + mk;
      } else {
        let subexp_more_bools = reader.L(1);
        if (subexp_more_bools) {
          i++;
          mk += a;
        } else {
          let subexp_bools = reader.L(b2);
          return subexp_bools + mk;
        }
      }
    }
    return 0;
  }

  /**
   * 6.10.2 Decode tile semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#decode-tile-semantics)
   */
  clear_left_context() {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const tg = this.titleGroup;
    const isi = tg.intra_segment_id;
    const coef = tg.coefficients;

    coef.LeftLevelContext = Array2D(null, 3, cis.MiRows, 0);
    coef.LeftDcContext = Array2D(null, 3, cis.MiRows, 0);
    isi.LeftSegPredContext = Array1D(null, cis.MiRows, 0);
  }

  /**
   * 6.10.2 Decode tile semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#decode-tile-semantics)
   */
  clear_above_context() {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const tg = this.titleGroup;
    const isi = tg.intra_segment_id;
    const coef = tg.coefficients;

    coef.AboveLevelContext = Array2D(null, 3, cis.MiCols, 0);
    coef.AboveDcContext = Array2D(null, 3, cis.MiCols, 0);
    isi.AboveSegPredContext = Array1D(null, cis.MiCols, 0);
  }

  /**
   * 6.10.25 Assign mv semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#assign-mv-semantics)
   */
  is_mv_valid(isCompound: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const tg = this.titleGroup;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;
    const m = tg.mv;

    for (let i = 0; i < 1 + isCompound; i++) {
      for (let comp = 0; comp < 2; comp++) {
        if (Math.abs(m.Mv[i][comp]) >= 1 << 14) return 0;
      }
    }
    if (!ifmi.use_intrabc) {
      return 1;
    }
    let bw = Block_Width[db.MiSize];
    let bh = Block_Height[db.MiSize];
    if (m.Mv[0][0] & 7 || m.Mv[0][1] & 7) {
      return 0;
    }
    let deltaRow = m.Mv[0][0] >> 3;
    let deltaCol = m.Mv[0][1] >> 3;
    let srcTopEdge = db.MiRow * MI_SIZE + deltaRow;
    let srcLeftEdge = db.MiCol * MI_SIZE + deltaCol;
    let srcBottomEdge = srcTopEdge + bh;
    let srcRightEdge = srcLeftEdge + bw;
    if (db.HasChroma) {
      if (bw < 8 && cc.subsampling_x) srcLeftEdge -= 4;
      if (bh < 8 && cc.subsampling_y) srcTopEdge -= 4;
    }
    if (srcTopEdge < tg.MiRowStart * MI_SIZE || srcLeftEdge < tg.MiColStart * MI_SIZE || srcBottomEdge > tg.MiRowEnd * MI_SIZE || srcRightEdge > tg.MiColEnd * MI_SIZE) {
      return 0;
    }
    let sbSize = seqHeader.use_128x128_superblock ? SUB_SIZE.BLOCK_128X128 : SUB_SIZE.BLOCK_64X64;
    let sbH = Block_Height[sbSize];
    let activeSbRow = integer((db.MiRow * MI_SIZE) / sbH);
    let activeSb64Col = (db.MiCol * MI_SIZE) >> 6;
    let srcSbRow = integer((srcBottomEdge - 1) / sbH);
    let srcSb64Col = (srcRightEdge - 1) >> 6;
    let totalSb64PerRow = ((tg.MiColEnd - tg.MiColStart - 1) >> 4) + 1;
    let activeSb64 = activeSbRow * totalSb64PerRow + activeSb64Col;
    let srcSb64 = srcSbRow * totalSb64PerRow + srcSb64Col;
    if (srcSb64 >= activeSb64 - INTRABC_DELAY_SB64) {
      return 0;
    }
    let gradient = 1 + INTRABC_DELAY_SB64 + seqHeader.use_128x128_superblock;
    let wfOffset = gradient * (activeSbRow - srcSbRow);
    if (srcSbRow > activeSbRow || srcSb64Col >= activeSb64Col - INTRABC_DELAY_SB64 + wfOffset) {
      return 0;
    }
    return 1;
  }
}

interface TileGroup {
  /**
   * 6.10.1 General tile group OBU semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#general-tile-group-obu-semantics)
   */
  NumTiles: number;
  tg_start: number;
  tg_end: number;
  MiRowStart: number;
  MiRowEnd: number;
  MiColStart: number;
  MiColEnd: number;
  CurrentQIndex: number;

  /**
   * 6.10.2 Decode tile semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#decode-tile-semantics)
   */
  decode_tile: {
    ReadDeltas: number;
    DeltaLF: number[];
    RefSgrXqd: number[][];
    RefLrWiener: number[][][];
  };

  /**
   * 6.10.3 Clear block decoded flags semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#clear-block-decoded-flags-semantics)
   */
  block_decoded: {
    BlockDecoded: number[][][];
  };

  /**
   * 6.10.4 Decode partition semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#decode-partition-semantics)
   */
  decode_partition: {
    partition: PARTITION;
    split_or_vert: number;
    split_or_horz: number;
  };

  /**
   * 6.10.5 Decode block semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#decode-block-semantics)
   */
  decode_block: {
    MiRow: number;
    MiCol: number;
    MiSize: SUB_SIZE;
    HasChroma: number;
    AvailU: number;
    AvailL: number;
    AvailUChroma: number;
    AvailLChroma: number;
    YModes: number[][];
    UVModes: number[][];
    RefFrames: REF_FRAME[][][];
    CompGroupIdxs: number[][];
    CompoundIdxs: number[][];
    InterpFilters: number[][][];
    Mvs: number[][][][];
    IsInters: number[][];
    SkipModes: number[][];
    Skips: number[][];
    TxSizes: number[][];
    MiSizes: number[][];
    SegmentIds: number[][];
    PaletteSizes: number[][][];
    PaletteColors: number[][][][];
    DeltaLFs: number[][][];
    PaletteCache: number[];

    PrevSegmentIds: number[][];
    SavedSegmentIds: number[][][];
  };

  /**
   * 6.10.6 Intra frame mode info semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#intra-frame-mode-info-semantics)
   */
  intra_frame_mode_info: {
    use_intrabc: number;
    intra_frame_y_mode: Y_MODE;
    uv_mode: Y_MODE;
    YMode: Y_MODE;
    UVMode: Y_MODE;
    LeftRefFrame: number[];
    AboveRefFrame: number[];
    LeftIntra: boolean;
    AboveIntra: boolean;
    LeftSingle: boolean;
    AboveSingle: boolean;
  };

  /**
   * 6.10.7 Intra segment ID semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#intra-segment-id-semantics)
   */
  intra_segment_id: {
    Lossless: number;
    AboveSegPredContext: number[];
    LeftSegPredContext: number[];
  };

  /**
   * 6.10.8 Read segment ID semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#read-segment-id-semantics)
   */
  segment_id: {
    segment_id: number;
  };

  /**
   * 6.10.10 Skip mode semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#skip-mode-semantics)
   */
  skip_mode: {
    skip_mode: number;
  };

  /**
   * 6.10.11 Skip semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#skip-semantics)
   */
  skip: {
    skip: number;
  };

  /**
   * 6.10.14 CDEF params semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#cdef-params-semantics)
   */
  cdef_params: {
    cdef_bits: number;
    cdef_y_pri_strength: number[];
    cdef_uv_pri_strength: number[];
    cdef_y_sec_strength: number[];
    cdef_uv_sec_strength: number[];
    CdefDamping: number;
  };

  /**
   * 6.10.15 Loop restoration params semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#loop-restoration-params-semantics)
   */
  lr_params: {
    FrameRestorationType: FRAME_RESTORATION_TYPE[];
    UsesLr: number;
    LoopRestorationSize: number[];
    LrType: number[][][];
    LrWiener: number[][][][][];
    LrSgrSet: number[][][];
    LrSgrXqd: number[][][][];
  };

  /**
   * 6.10.16 TX size semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#tx-size-semantics)
   */
  tx_size: {
    TxSize: TX_SIZE;
  };

  /**
   * 6.10.17 Block TX size semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#block-tx-size-semantics)
   */
  block_tx_size: {
    InterTxSizes: number[][];
  };

  /**
   * 6.10.19 Transform type semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#transform-type-semantics)
   */
  transform_type: {
    set: SET;
  };

  /**
   * 6.10.20 Is inter semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#is-inter-semantics)
   */
  is_inter: {
    is_inter: number;
  };

  /**
   * 6.10.22 Inter block mode info semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inter-block-mode-info-semantics)
   */
  inter_block_mode_info: {
    interp_filter: INTERPOLATION_FILTER[];
    RefMvIdx: number;
    drl_mode: number;
  };

  /**
   * 6.10.23 Filter intra mode info semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#filter-intra-mode-info-semantics)
   */
  filter_intra_mode_info: {
    use_filter_intra: number;
    filter_intra_mode: FILTER_INTRA_MODE;
  };

  /**
   * 6.10.24 Ref frames semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#ref-frames-semantics)
   */
  ref_frames: {
    RefFrame: REF_FRAME[];

    /**
     * Flags for bitstream consistency requirements
     *
     * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#ref-frames-semantics)
     */
    conformance?: boolean;
  };

  /**
   * 6.10.26 Read motion mode semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#read-motion-mode-semantics)
   */
  motion_mode: {
    motion_mode: MOTION_MODE;
  };

  /**
   * 6.10.27 Read inter intra semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#read-inter-intra-semantics)
   */
  inter_intra: {
    interintra: number;
    interintra_mode: number;
    wedge_interintra: number;
    wedge_index: number;
    IsInterIntra: number;
  };

  /**
   * 6.10.28 Read compound type semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#read-compound-type-semantics)
   */
  compound_type: {
    comp_group_idx: number;
    compound_idx: number;
    compound_type: COMPOUND_TYPE;
    wedge_sign: number;
    mask_type: MASK_TYPE;
  };

  /**
   * 6.10.29 MV semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#mv-semantics)
   */
  mv: {
    MvCtx: number;
    Mv: number[][];
    PredMv: number[][];
  };

  /**
   * 6.10.33 Transform block semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#transform-block-semantics)
   */
  transform_block: {
    MaxLumaW: number;
    MaxLumaH: number;
    LoopfilterTxSizes: number[][][];
  };

  /**
   * 6.10.34 Coefficients semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#coefficients-semantics)
   */
  coefficients: {
    TxTypes: number[][];
    Quant: number[];
    eob: number;
    AboveLevelContext: number[][];
    LeftLevelContext: number[][];
    AboveDcContext: number[][];
    LeftDcContext: number[][];
    PlaneTxType: number;
    TxType: number;
  };

  /**
   * 6.10.35 Intra angle info semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#intra-angle-info-semantics)
   */
  intra_angle_info: {
    AngleDeltaY: number;
    AngleDeltaUV: number;
  };

  /**
   * 6.10.36 Read CFL alphas semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#read-cfl-alphas-semantics)
   */
  cfl_alphas: {
    CflAlphaU: number;
    CflAlphaV: number;
  };

  /**
   * 6.10.37 Palette mode info semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#palette-mode-info-semantics)
   */
  palette_mode_info: {
    PaletteSizeY: number;
    PaletteSizeUV: number;
    palette_colors_y: number[];
    palette_colors_u: number[];
    palette_colors_v: number[];
  };

  /**
   * 6.10.38 Palette tokens semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#palette-tokens-semantics)
   */
  palette_tokens: {
    ColorMapY: number[][];
    ColorMapUV: number[][];
  };

  /**
   * 6.10.39 Palette color context semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#palette-color-context-semantics)
   */
  palette_color_context: {
    ColorOrder: number[];
    ColorContextHash: number;
  };

  /**
   * 6.10.40 Read CDEF semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#read-cdef-semantics)
   */
  cdef: {
    cdef_idx: number[][];
  };
}

const Subsampled_Size = [
  [
    [SUB_SIZE.BLOCK_4X4, SUB_SIZE.BLOCK_4X4],
    [SUB_SIZE.BLOCK_4X4, SUB_SIZE.BLOCK_4X4],
  ],
  [
    [SUB_SIZE.BLOCK_4X8, SUB_SIZE.BLOCK_4X4],
    [SUB_SIZE.BLOCK_INVALID, SUB_SIZE.BLOCK_4X4],
  ],
  [
    [SUB_SIZE.BLOCK_8X4, SUB_SIZE.BLOCK_INVALID],
    [SUB_SIZE.BLOCK_4X4, SUB_SIZE.BLOCK_4X4],
  ],
  [
    [SUB_SIZE.BLOCK_8X8, SUB_SIZE.BLOCK_8X4],
    [SUB_SIZE.BLOCK_4X8, SUB_SIZE.BLOCK_4X4],
  ],
  [
    [SUB_SIZE.BLOCK_8X16, SUB_SIZE.BLOCK_8X8],
    [SUB_SIZE.BLOCK_INVALID, SUB_SIZE.BLOCK_4X8],
  ],
  [
    [SUB_SIZE.BLOCK_16X8, SUB_SIZE.BLOCK_INVALID],
    [SUB_SIZE.BLOCK_8X8, SUB_SIZE.BLOCK_8X4],
  ],
  [
    [SUB_SIZE.BLOCK_16X16, SUB_SIZE.BLOCK_16X8],
    [SUB_SIZE.BLOCK_8X16, SUB_SIZE.BLOCK_8X8],
  ],
  [
    [SUB_SIZE.BLOCK_16X32, SUB_SIZE.BLOCK_16X16],
    [SUB_SIZE.BLOCK_INVALID, SUB_SIZE.BLOCK_8X16],
  ],
  [
    [SUB_SIZE.BLOCK_32X16, SUB_SIZE.BLOCK_INVALID],
    [SUB_SIZE.BLOCK_16X16, SUB_SIZE.BLOCK_16X8],
  ],
  [
    [SUB_SIZE.BLOCK_32X32, SUB_SIZE.BLOCK_32X16],
    [SUB_SIZE.BLOCK_16X32, SUB_SIZE.BLOCK_16X16],
  ],
  [
    [SUB_SIZE.BLOCK_32X64, SUB_SIZE.BLOCK_32X32],
    [SUB_SIZE.BLOCK_INVALID, SUB_SIZE.BLOCK_16X32],
  ],
  [
    [SUB_SIZE.BLOCK_64X32, SUB_SIZE.BLOCK_INVALID],
    [SUB_SIZE.BLOCK_32X32, SUB_SIZE.BLOCK_32X16],
  ],
  [
    [SUB_SIZE.BLOCK_64X64, SUB_SIZE.BLOCK_64X32],
    [SUB_SIZE.BLOCK_32X64, SUB_SIZE.BLOCK_32X32],
  ],
  [
    [SUB_SIZE.BLOCK_64X128, SUB_SIZE.BLOCK_64X64],
    [SUB_SIZE.BLOCK_INVALID, SUB_SIZE.BLOCK_32X64],
  ],
  [
    [SUB_SIZE.BLOCK_128X64, SUB_SIZE.BLOCK_INVALID],
    [SUB_SIZE.BLOCK_64X64, SUB_SIZE.BLOCK_64X32],
  ],
  [
    [SUB_SIZE.BLOCK_128X128, SUB_SIZE.BLOCK_128X64],
    [SUB_SIZE.BLOCK_64X128, SUB_SIZE.BLOCK_64X64],
  ],
  [
    [SUB_SIZE.BLOCK_4X16, SUB_SIZE.BLOCK_4X8],
    [SUB_SIZE.BLOCK_INVALID, SUB_SIZE.BLOCK_4X8],
  ],
  [
    [SUB_SIZE.BLOCK_16X4, SUB_SIZE.BLOCK_INVALID],
    [SUB_SIZE.BLOCK_8X4, SUB_SIZE.BLOCK_8X4],
  ],
  [
    [SUB_SIZE.BLOCK_8X32, SUB_SIZE.BLOCK_8X16],
    [SUB_SIZE.BLOCK_INVALID, SUB_SIZE.BLOCK_4X16],
  ],
  [
    [SUB_SIZE.BLOCK_32X8, SUB_SIZE.BLOCK_INVALID],
    [SUB_SIZE.BLOCK_16X8, SUB_SIZE.BLOCK_16X4],
  ],
  [
    [SUB_SIZE.BLOCK_16X64, SUB_SIZE.BLOCK_16X32],
    [SUB_SIZE.BLOCK_INVALID, SUB_SIZE.BLOCK_8X32],
  ],
  [
    [SUB_SIZE.BLOCK_64X16, SUB_SIZE.BLOCK_INVALID],
    [SUB_SIZE.BLOCK_32X16, SUB_SIZE.BLOCK_32X8],
  ],
];

const Tx_Type_In_Set_Intra = [
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0],
  [1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
];
const Tx_Type_In_Set_Inter = [
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
];

const Tx_Type_Intra_Inv_Set1 = [IDTX, DCT_DCT, V_DCT, H_DCT, ADST_ADST, ADST_DCT, DCT_ADST];
const Tx_Type_Intra_Inv_Set2 = [IDTX, DCT_DCT, ADST_ADST, ADST_DCT, DCT_ADST];
const Tx_Type_Inter_Inv_Set1 = [
  IDTX,
  V_DCT,
  H_DCT,
  V_ADST,
  H_ADST,
  V_FLIPADST,
  H_FLIPADST,
  DCT_DCT,
  ADST_DCT,
  DCT_ADST,
  FLIPADST_DCT,
  DCT_FLIPADST,
  ADST_ADST,
  FLIPADST_FLIPADST,
  ADST_FLIPADST,
  FLIPADST_ADST,
];
const Tx_Type_Inter_Inv_Set2 = [IDTX, V_DCT, H_DCT, DCT_DCT, ADST_DCT, DCT_ADST, FLIPADST_DCT, DCT_FLIPADST, ADST_ADST, FLIPADST_FLIPADST, ADST_FLIPADST, FLIPADST_ADST];
const Tx_Type_Inter_Inv_Set3 = [IDTX, DCT_DCT];

const Wiener_Taps_Min = [-5, -23, -17];
const Wiener_Taps_Max = [10, 8, 46];
const Wiener_Taps_K = [1, 2, 3];
const Sgrproj_Xqd_Min = [-96, -32];
const Sgrproj_Xqd_Max = [31, 95];
