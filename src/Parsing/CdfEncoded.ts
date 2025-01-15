import * as AV1 from "../define";
import { AV1Decoder } from "../SyntaxStructures/Obu";

import { COMP_REF_TYPE, PARTITION, REF_FRAME, SET, SUB_SIZE, TX_SIZE, UV_MODE } from "../SyntaxStructures/Semantics";

import {
  Adjusted_Tx_Size,
  Block_Height,
  Block_Width,
  Mi_Height_Log2,
  Mi_Width_Log2,
  Palette_Color_Context,
  Sig_Ref_Diff_Offset,
  Size_Group,
  Tx_Height,
  Tx_Size_Sqr,
  Tx_Size_Sqr_Up,
  Tx_Width,
  Tx_Width_Log2,
} from "../AdditionalTables/ConversionTables";

const Intra_Mode_Context = [0, 1, 2, 3, 4, 4, 4, 4, 3, 0, 1, 2, 0];
const Compound_Mode_Ctx_Map = [
  [0, 1, 1, 1, 1],
  [1, 2, 3, 4, 4],
  [4, 4, 5, 6, 7],
];
const Coeff_Base_Ctx_Offset = [
  [
    [0, 1, 6, 6, 0],
    [1, 6, 6, 21, 0],
    [6, 6, 21, 21, 0],
    [6, 21, 21, 21, 0],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 1, 6, 6, 21],
    [1, 6, 6, 21, 21],
    [6, 6, 21, 21, 21],
    [6, 21, 21, 21, 21],
    [21, 21, 21, 21, 21],
  ],
  [
    [0, 1, 6, 6, 21],
    [1, 6, 6, 21, 21],
    [6, 6, 21, 21, 21],
    [6, 21, 21, 21, 21],
    [21, 21, 21, 21, 21],
  ],
  [
    [0, 1, 6, 6, 21],
    [1, 6, 6, 21, 21],
    [6, 6, 21, 21, 21],
    [6, 21, 21, 21, 21],
    [21, 21, 21, 21, 21],
  ],
  [
    [0, 1, 6, 6, 21],
    [1, 6, 6, 21, 21],
    [6, 6, 21, 21, 21],
    [6, 21, 21, 21, 21],
    [21, 21, 21, 21, 21],
  ],
  [
    [0, 11, 11, 11, 0],
    [11, 11, 11, 11, 0],
    [6, 6, 21, 21, 0],
    [6, 21, 21, 21, 0],
    [21, 21, 21, 21, 0],
  ],
  [
    [0, 16, 6, 6, 21],
    [16, 16, 6, 21, 21],
    [16, 16, 21, 21, 21],
    [16, 16, 21, 21, 21],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 11, 11, 11, 11],
    [11, 11, 11, 11, 11],
    [6, 6, 21, 21, 21],
    [6, 21, 21, 21, 21],
    [21, 21, 21, 21, 21],
  ],
  [
    [0, 16, 6, 6, 21],
    [16, 16, 6, 21, 21],
    [16, 16, 21, 21, 21],
    [16, 16, 21, 21, 21],
    [16, 16, 21, 21, 21],
  ],
  [
    [0, 11, 11, 11, 11],
    [11, 11, 11, 11, 11],
    [6, 6, 21, 21, 21],
    [6, 21, 21, 21, 21],
    [21, 21, 21, 21, 21],
  ],
  [
    [0, 16, 6, 6, 21],
    [16, 16, 6, 21, 21],
    [16, 16, 21, 21, 21],
    [16, 16, 21, 21, 21],
    [16, 16, 21, 21, 21],
  ],
  [
    [0, 11, 11, 11, 11],
    [11, 11, 11, 11, 11],
    [6, 6, 21, 21, 21],
    [6, 21, 21, 21, 21],
    [21, 21, 21, 21, 21],
  ],
  [
    [0, 16, 6, 6, 21],
    [16, 16, 6, 21, 21],
    [16, 16, 21, 21, 21],
    [16, 16, 21, 21, 21],
    [16, 16, 21, 21, 21],
  ],
  [
    [0, 11, 11, 11, 0],
    [11, 11, 11, 11, 0],
    [6, 6, 21, 21, 0],
    [6, 21, 21, 21, 0],
    [21, 21, 21, 21, 0],
  ],
  [
    [0, 16, 6, 6, 21],
    [16, 16, 6, 21, 21],
    [16, 16, 21, 21, 21],
    [16, 16, 21, 21, 21],
    [0, 0, 0, 0, 0],
  ],
  [
    [0, 11, 11, 11, 11],
    [11, 11, 11, 11, 11],
    [6, 6, 21, 21, 21],
    [6, 21, 21, 21, 21],
    [21, 21, 21, 21, 21],
  ],
  [
    [0, 16, 6, 6, 21],
    [16, 16, 6, 21, 21],
    [16, 16, 21, 21, 21],
    [16, 16, 21, 21, 21],
    [16, 16, 21, 21, 21],
  ],
  [
    [0, 11, 11, 11, 11],
    [11, 11, 11, 11, 11],
    [6, 6, 21, 21, 21],
    [6, 21, 21, 21, 21],
    [21, 21, 21, 21, 21],
  ],
  [
    [0, 16, 6, 6, 21],
    [16, 16, 6, 21, 21],
    [16, 16, 21, 21, 21],
    [16, 16, 21, 21, 21],
    [16, 16, 21, 21, 21],
  ],
];
const Coeff_Base_Pos_Ctx_Offset = [AV1.SIG_COEF_CONTEXTS_2D, AV1.SIG_COEF_CONTEXTS_2D + 5, AV1.SIG_COEF_CONTEXTS_2D + 10];
const Mag_Ref_Offset_With_Tx_Class = [
  [
    [0, 1],
    [1, 0],
    [1, 1],
  ],
  [
    [0, 1],
    [1, 0],
    [0, 2],
  ],
  [
    [0, 1],
    [1, 0],
    [2, 0],
  ],
];
const Filter_Intra_Mode_To_Intra_Dir = [UV_MODE.DC_PRED, UV_MODE.V_PRED, UV_MODE.H_PRED, UV_MODE.D157_PRED, UV_MODE.DC_PRED];

/**
 * 8.3 Parsing process for CDF encoded syntax elements
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#parsing-process-for-cdf-encoded-syntax-elements)
 */
export class CdfEncoded {
  private decoder: AV1Decoder;
  constructor(d: AV1Decoder) {
    this.decoder = d;
  }

  use_intrabc(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.IntrabcCdf);
  }
  intra_frame_y_mode(data?: any): UV_MODE {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const sd = this.decoder.symbolDecoder;

    let abovemode = Intra_Mode_Context[db.AvailU ? db.YModes[db.MiRow - 1][db.MiCol] : UV_MODE.DC_PRED];
    let leftmode = Intra_Mode_Context[db.AvailL ? db.YModes[db.MiRow][db.MiCol - 1] : UV_MODE.DC_PRED];
    return sd.read_symbol(sd.TileIntraFrameYModeCdf[abovemode][leftmode]);
  }
  y_mode(data?: any): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const sd = this.decoder.symbolDecoder;

    let ctx = Size_Group[db.MiSize];
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.YModeCdf[ctx]);
  }
  uv_mode(data?: any): UV_MODE {
    const tgo = this.decoder.tileGroupObu;
    const tg = tgo.titleGroup;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;
    const isi = tg.intra_segment_id;
    const sd = this.decoder.symbolDecoder;

    if (isi.Lossless == 1 && tgo.get_plane_residual_size(db.MiSize, 1) == SUB_SIZE.BLOCK_4X4) {
      return sd.read_symbol(sd.Tile_non_coeff_cdfs.UVModeCflAllowedCdf[ifmi.YMode]);
    } else if (isi.Lossless == 0 && Math.max(Block_Width[db.MiSize], Block_Height[db.MiSize]) <= 32) {
      return sd.read_symbol(sd.Tile_non_coeff_cdfs.UVModeCflAllowedCdf[ifmi.YMode]);
    }
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.UVModeCflNotAllowedCdf[ifmi.YMode]);
  }
  angle_delta_y(data?: any): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const ifmi = tg.intra_frame_mode_info;
    const sd = this.decoder.symbolDecoder;

    return sd.read_symbol(sd.Tile_non_coeff_cdfs.AngleDeltaCdf[ifmi.YMode - UV_MODE.V_PRED]);
  }
  angle_delta_uv(data?: any): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const ifmi = tg.intra_frame_mode_info;
    const sd = this.decoder.symbolDecoder;

    return sd.read_symbol(sd.Tile_non_coeff_cdfs.AngleDeltaCdf[ifmi.UVMode - UV_MODE.V_PRED]);
  }
  partition({ bSize, r, c }: { bSize: number; r: number; c: number }): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const sd = this.decoder.symbolDecoder;

    let bsl = Mi_Width_Log2[bSize];
    let above = Number(db.AvailU && Mi_Width_Log2[db.MiSizes[r - 1][c]] < bsl);
    let left = Number(db.AvailL && Mi_Height_Log2[db.MiSizes[r][c - 1]] < bsl);
    let ctx = left * 2 + above;
    switch (bsl) {
      case 1:
        return sd.read_symbol(sd.Tile_non_coeff_cdfs.PartitionW8Cdf[ctx]);
      case 2:
        return sd.read_symbol(sd.Tile_non_coeff_cdfs.PartitionW16Cdf[ctx]);
      case 3:
        return sd.read_symbol(sd.Tile_non_coeff_cdfs.PartitionW32Cdf[ctx]);
      case 4:
        return sd.read_symbol(sd.Tile_non_coeff_cdfs.PartitionW64Cdf[ctx]);
      default:
        return sd.read_symbol(sd.Tile_non_coeff_cdfs.PartitionW128Cdf[ctx]);
    }
  }
  split_or_horz({ bSize, r, c }: { bSize: number; r: number; c: number }): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const sd = this.decoder.symbolDecoder;

    let bsl = Mi_Width_Log2[bSize];
    let above = Number(db.AvailU && Mi_Width_Log2[db.MiSizes[r - 1][c]] < bsl);
    let left = Number(db.AvailL && Mi_Height_Log2[db.MiSizes[r][c - 1]] < bsl);
    let ctx = left * 2 + above;
    let partitionCdf: number[];
    switch (bsl) {
      case 1:
        partitionCdf = sd.Tile_non_coeff_cdfs.PartitionW8Cdf[ctx];
        break;
      case 2:
        partitionCdf = sd.Tile_non_coeff_cdfs.PartitionW16Cdf[ctx];
        break;
      case 3:
        partitionCdf = sd.Tile_non_coeff_cdfs.PartitionW32Cdf[ctx];
        break;
      case 4:
        partitionCdf = sd.Tile_non_coeff_cdfs.PartitionW64Cdf[ctx];
        break;
      default:
        partitionCdf = sd.Tile_non_coeff_cdfs.PartitionW128Cdf[ctx];
    }
    let psum =
      partitionCdf[PARTITION.PARTITION_VERT] -
      partitionCdf[PARTITION.PARTITION_VERT - 1] +
      partitionCdf[PARTITION.PARTITION_SPLIT] -
      partitionCdf[PARTITION.PARTITION_SPLIT - 1] +
      partitionCdf[PARTITION.PARTITION_HORZ_A] -
      partitionCdf[PARTITION.PARTITION_HORZ_A - 1] +
      partitionCdf[PARTITION.PARTITION_VERT_A] -
      partitionCdf[PARTITION.PARTITION_VERT_A - 1] +
      partitionCdf[PARTITION.PARTITION_VERT_B] -
      partitionCdf[PARTITION.PARTITION_VERT_B - 1];
    if (bSize != SUB_SIZE.BLOCK_128X128) {
      psum += partitionCdf[PARTITION.PARTITION_VERT_4] - partitionCdf[PARTITION.PARTITION_VERT_4 - 1];
    }

    /** store the inverse cdf */
    let cdf = [-psum, 0, 0];
    return sd.read_symbol(cdf);
  }
  split_or_vert({ bSize, r, c }: { bSize: number; r: number; c: number }): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const sd = this.decoder.symbolDecoder;

    let bsl = Mi_Width_Log2[bSize];
    let above = Number(db.AvailU && Mi_Width_Log2[db.MiSizes[r - 1][c]] < bsl);
    let left = Number(db.AvailL && Mi_Height_Log2[db.MiSizes[r][c - 1]] < bsl);
    let ctx = left * 2 + above;
    let partitionCdf: number[];
    switch (bsl) {
      case 1:
        partitionCdf = sd.Tile_non_coeff_cdfs.PartitionW8Cdf[ctx];
        break;
      case 2:
        partitionCdf = sd.Tile_non_coeff_cdfs.PartitionW16Cdf[ctx];
        break;
      case 3:
        partitionCdf = sd.Tile_non_coeff_cdfs.PartitionW32Cdf[ctx];
        break;
      case 4:
        partitionCdf = sd.Tile_non_coeff_cdfs.PartitionW64Cdf[ctx];
        break;
      default:
        partitionCdf = sd.Tile_non_coeff_cdfs.PartitionW128Cdf[ctx];
    }
    let psum =
      partitionCdf[PARTITION.PARTITION_HORZ] -
      partitionCdf[PARTITION.PARTITION_HORZ - 1] +
      partitionCdf[PARTITION.PARTITION_SPLIT] -
      partitionCdf[PARTITION.PARTITION_SPLIT - 1] +
      partitionCdf[PARTITION.PARTITION_HORZ_A] -
      partitionCdf[PARTITION.PARTITION_HORZ_A - 1] +
      partitionCdf[PARTITION.PARTITION_HORZ_B] -
      partitionCdf[PARTITION.PARTITION_HORZ_B - 1] +
      partitionCdf[PARTITION.PARTITION_VERT_A] -
      partitionCdf[PARTITION.PARTITION_VERT_A - 1];
    if (bSize != SUB_SIZE.BLOCK_128X128) {
      psum += partitionCdf[PARTITION.PARTITION_HORZ_4] - partitionCdf[PARTITION.PARTITION_HORZ_4 - 1];
    }

    /** store the inverse cdf */
    let cdf = [-psum, 0, 0];
    return sd.read_symbol(cdf);
  }
  tx_depth({ maxRectTxSize }: { maxRectTxSize: number }): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const sd = this.decoder.symbolDecoder;

    let maxTxWidth = Tx_Width[maxRectTxSize];
    let maxTxHeight = Tx_Height[maxRectTxSize];

    let aboveW = 0;
    if (db.AvailU && db.IsInters[db.MiRow - 1][db.MiCol]) {
      aboveW = Block_Width[db.MiSizes[db.MiRow - 1][db.MiCol]];
    } else if (db.AvailU) {
      aboveW = this.get_above_tx_width(db.MiRow, db.MiCol);
    }

    let leftH = 0;
    if (db.AvailL && db.IsInters[db.MiRow][db.MiCol - 1]) {
      leftH = Block_Height[db.MiSizes[db.MiRow][db.MiCol - 1]];
    } else if (db.AvailL) {
      leftH = this.get_left_tx_height(db.MiRow, db.MiCol);
    }
    let ctx = Number(aboveW >= maxTxWidth) + Number(leftH >= maxTxHeight);
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.TxfmSplitCdf[ctx]);
  }
  txfm_split({ row, col, txSz }: { row: number; col: number; txSz: number }): number {
    const tgo = this.decoder.tileGroupObu;
    const tg = tgo.titleGroup;
    const db = tg.decode_block;
    const sd = this.decoder.symbolDecoder;

    let above = Number(this.get_above_tx_width(row, col) < Tx_Width[txSz]);
    let left = Number(this.get_left_tx_height(row, col) < Tx_Height[txSz]);
    let size = Math.min(64, Math.max(Block_Width[db.MiSize], Block_Height[db.MiSize]));
    let maxTxSz = tgo.find_tx_size(size, size);
    let txSzSqrUp = Tx_Size_Sqr_Up[txSz];
    let ctx = Number(txSzSqrUp != maxTxSz) * 3 + (AV1.TX_SIZES - 1 - maxTxSz) * 6 + above + left;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.TxfmSplitCdf[ctx]);
  }
  segment_id({ prevUL, prevU, prevL }: { prevUL: number; prevU: number; prevL: number }): number {
    const sd = this.decoder.symbolDecoder;

    let ctx = 0;
    if (prevUL < 0) {
      ctx = 0;
    } else if (prevUL == prevU && prevUL == prevL) {
      ctx = 2;
    } else if (prevUL == prevU || prevUL == prevL || prevU == prevL) {
      ctx = 1;
    }
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.SegmentIdCdf[ctx]);
  }
  seg_id_predicted(data?: any): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const isi = tg.intra_segment_id;
    const sd = this.decoder.symbolDecoder;

    let ctx = isi.LeftSegPredContext[db.MiRow] + isi.AboveSegPredContext[db.MiCol];
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.SegmentIdPredictedCdf[ctx]);
  }
  new_mv(data?: any): number {
    const mvp = this.decoder.motionVectorPrediction;
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.NewMvCdf[mvp.NewMvContext]);
  }
  zero_mv(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    const mvp = this.decoder.motionVectorPrediction;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.ZeroMvCdf[mvp.ZeroMvContext]);
  }
  ref_mv(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    const mvp = this.decoder.motionVectorPrediction;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.RefMvCdf[mvp.RefMvContext]);
  }
  drl_mode({ idx }: { idx: number }): number {
    const sd = this.decoder.symbolDecoder;
    const mvp = this.decoder.motionVectorPrediction;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.DrlModeCdf[mvp.DrlCtxStack[idx]]);
  }
  is_inter(data?: any): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;
    const sd = this.decoder.symbolDecoder;

    let ctx = 0;
    if (db.AvailU && db.AvailL) {
      ctx = Number(ifmi.LeftIntra && ifmi.AboveIntra ? 3 : ifmi.LeftIntra || ifmi.AboveIntra);
    } else if (db.AvailU || db.AvailL) {
      ctx = 2 * Number(db.AvailU ? ifmi.AboveIntra : ifmi.LeftIntra);
    }
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.IsInterCdf[ctx]);
  }
  use_filter_intra(data?: any): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.FilterIntraCdf[db.MiSize]);
  }
  filter_intra_mode(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.FilterIntraModeCdf);
  }
  comp_mode(data?: any): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;
    const sd = this.decoder.symbolDecoder;

    let ctx = 1;
    if (db.AvailU && db.AvailL) {
      if (ifmi.AboveSingle && ifmi.LeftSingle) {
        ctx = this.check_backward(ifmi.AboveRefFrame[0]) ^ this.check_backward(ifmi.LeftRefFrame[0]);
      } else if (ifmi.AboveSingle) {
        ctx = 2 + Number(this.check_backward(ifmi.AboveRefFrame[0]) || ifmi.AboveIntra);
      } else if (ifmi.LeftSingle) {
        ctx = 2 + Number(this.check_backward(ifmi.LeftRefFrame[0]) || ifmi.LeftIntra);
      } else {
        ctx = 4;
      }
    } else if (db.AvailU) {
      if (ifmi.AboveSingle) {
        ctx = this.check_backward(ifmi.AboveRefFrame[0]);
      } else {
        ctx = 3;
      }
    } else if (db.AvailL) {
      if (ifmi.LeftSingle) {
        ctx = this.check_backward(ifmi.LeftRefFrame[0]);
      } else {
        ctx = 3;
      }
    }
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.CompModeCdf[ctx]);
  }
  skip_mode(data?: any): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const sd = this.decoder.symbolDecoder;

    let ctx = 0;
    if (db.AvailU) {
      ctx += db.SkipModes[db.MiRow - 1][db.MiCol];
    }
    if (db.AvailL) {
      ctx += db.SkipModes[db.MiRow][db.MiCol - 1];
    }
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.SkipModeCdf[ctx]);
  }
  skip(data?: any): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const sd = this.decoder.symbolDecoder;

    let ctx = 0;
    if (db.AvailU) {
      ctx += db.Skips[db.MiRow - 1][db.MiCol];
    }
    if (db.AvailL) {
      ctx += db.Skips[db.MiRow][db.MiCol - 1];
    }
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.SkipCdf[ctx]);
  }
  comp_ref(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    let ctx = this.comp_ref_ctx();
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.CompRefCdf[ctx][0]);
  }
  comp_ref_p1(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    let ctx = this.comp_ref_p1_ctx();
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.CompRefCdf[ctx][1]);
  }
  comp_ref_p2(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    let ctx = this.comp_ref_p2_ctx();
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.CompRefCdf[ctx][2]);
  }
  comp_bwdref(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    let ctx = this.comp_bwdref_ctx();
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.CompBwdRefCdf[ctx][0]);
  }
  comp_bwdref_p1(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    let ctx = this.comp_bwdref_p1_ctx();
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.CompBwdRefCdf[ctx][1]);
  }
  single_ref_p1(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    let ctx = this.single_ref_p1_ctx();
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.SingleRefCdf[ctx][0]);
  }
  single_ref_p2(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    let ctx = this.comp_bwdref_ctx();
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.SingleRefCdf[ctx][1]);
  }
  single_ref_p3(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    let ctx = this.comp_ref_ctx();
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.SingleRefCdf[ctx][2]);
  }
  single_ref_p4(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    let lastCount = this.count_refs(REF_FRAME.LAST_FRAME);
    let last2Count = this.count_refs(REF_FRAME.LAST2_FRAME);
    let ctx = this.ref_count_ctx(lastCount, last2Count);
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.SingleRefCdf[ctx][3]);
  }

  single_ref_p5(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    let ctx = this.comp_ref_p2_ctx();
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.SingleRefCdf[ctx][4]);
  }
  single_ref_p6(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    let brfCount = this.count_refs(REF_FRAME.BWDREF_FRAME);
    let arf2Count = this.count_refs(REF_FRAME.ALTREF2_FRAME);
    let ctx = this.ref_count_ctx(brfCount, arf2Count);
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.SingleRefCdf[ctx][5]);
  }
  compound_mode(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    const mvp = this.decoder.motionVectorPrediction;
    let ctx = Compound_Mode_Ctx_Map[mvp.RefMvContext >> 1][Math.min(mvp.NewMvContext, AV1.COMP_NEWMV_CTXS - 1)];
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.CompoundModeCdf[ctx]);
  }
  interp_filter({ dir }: { dir: number }): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const rf = tg.ref_frames;
    const sd = this.decoder.symbolDecoder;

    let ctx = ((dir & 1) * 2 + Number(rf.RefFrame[1] > REF_FRAME.INTRA_FRAME)) * 4;
    let leftType = 3;
    let aboveType = 3;

    if (db.AvailL) {
      if (db.RefFrames[db.MiRow][db.MiCol - 1][0] == rf.RefFrame[0] || db.RefFrames[db.MiRow][db.MiCol - 1][1] == rf.RefFrame[0])
        leftType = db.InterpFilters[db.MiRow][db.MiCol - 1][dir];
    }

    if (db.AvailU) {
      if (db.RefFrames[db.MiRow - 1][db.MiCol][0] == rf.RefFrame[0] || db.RefFrames[db.MiRow - 1][db.MiCol][1] == rf.RefFrame[0])
        aboveType = db.InterpFilters[db.MiRow - 1][db.MiCol][dir];
    }

    if (leftType == aboveType) ctx += leftType;
    else if (leftType == 3) ctx += aboveType;
    else if (aboveType == 3) ctx += leftType;
    else ctx += 3;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.InterpFilterCdf[ctx]);
  }
  motion_mode(data?: any): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.MotionModeCdf[db.MiSize]);
  }
  mv_joint(data?: any): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const m = tg.mv;
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.MvJointCdf[m.MvCtx]);
  }
  mv_sign({ comp }: { comp: number }): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const m = tg.mv;
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.MvSignCdf[m.MvCtx][comp]);
  }
  mv_class({ comp }: { comp: number }): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const m = tg.mv;
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.MvClassCdf[m.MvCtx][comp]);
  }
  mv_class0_bit({ comp }: { comp: number }): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const m = tg.mv;
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.MvClass0BitCdf[m.MvCtx][comp]);
  }
  mv_class0_fr({ comp, mv_class0_bit }: { comp: number; mv_class0_bit: number }): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const m = tg.mv;
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.MvClass0FrCdf[m.MvCtx][comp][mv_class0_bit]);
  }
  mv_class0_hp({ comp }: { comp: number }): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const m = tg.mv;
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.MvClass0HpCdf[m.MvCtx][comp]);
  }
  mv_fr({ comp }: { comp: number }): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const m = tg.mv;
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.MvFrCdf[m.MvCtx][comp]);
  }
  mv_hp({ comp }: { comp: number }): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const m = tg.mv;
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.MvHpCdf[m.MvCtx][comp]);
  }
  mv_bit({ comp, i }: { comp: number; i: number }): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const m = tg.mv;
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.MvBitCdf[m.MvCtx][comp][i]);
  }
  all_zero({ plane, txSz, w4, h4, x4, y4, txSzCtx }: { txSzCtx: number; plane: number; txSz: number; x4: number; y4: number; w4: number; h4: number }): number {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const tgo = this.decoder.tileGroupObu;
    const tg = tgo.titleGroup;
    const db = tg.decode_block;
    const coef = tg.coefficients;
    const sd = this.decoder.symbolDecoder;

    let maxX4 = cis.MiCols;
    let maxY4 = cis.MiRows;
    if (plane > 0) {
      maxX4 = maxX4 >> cc.subsampling_x;
      maxY4 = maxY4 >> cc.subsampling_y;
    }

    let w = Tx_Width[txSz];
    let h = Tx_Height[txSz];

    let bsize = tgo.get_plane_residual_size(db.MiSize, plane);
    let bw = Block_Width[bsize];
    let bh = Block_Height[bsize];

    let ctx: number;
    if (plane == 0) {
      let top = 0;
      let left = 0;
      for (let k = 0; k < w4; k++) {
        if (x4 + k < maxX4) {
          top = Math.max(top, coef.AboveLevelContext[plane][x4 + k]);
        }
      }
      for (let k = 0; k < h4; k++) {
        if (y4 + k < maxY4) {
          left = Math.max(left, coef.LeftLevelContext[plane][y4 + k]);
        }
      }
      top = Math.min(top, 255);
      left = Math.min(left, 255);
      if (bw == w && bh == h) {
        ctx = 0;
      } else if (top == 0 && left == 0) {
        ctx = 1;
      } else if (top == 0 || left == 0) {
        ctx = 2 + Number(Math.max(top, left) > 3);
      } else if (Math.max(top, left) <= 3) {
        ctx = 4;
      } else if (Math.min(top, left) <= 3) {
        ctx = 5;
      } else {
        ctx = 6;
      }
    } else {
      let above = 0;
      let left = 0;
      for (let i = 0; i < w4; i++) {
        if (x4 + i < maxX4) {
          above |= coef.AboveLevelContext[plane][x4 + i];
          above |= coef.AboveDcContext[plane][x4 + i];
        }
      }
      for (let i = 0; i < h4; i++) {
        if (y4 + i < maxY4) {
          left |= coef.LeftLevelContext[plane][y4 + i];
          left |= coef.LeftDcContext[plane][y4 + i];
        }
      }
      ctx = Number(above != 0) + Number(left != 0);
      ctx += 7;
      if (bw * bh > w * h) ctx += 3;
    }
    return sd.read_symbol(sd.Tile_coeff_cdfs.TxbSkipCdf[txSzCtx][ctx]);
  }
  eob_pt_16({ plane, txSz, x4, y4, ptype }: { plane: number; txSz: number; x4: number; y4: number; ptype: number }): number {
    const sd = this.decoder.symbolDecoder;
    let txType = this.decoder.tileGroupObu.compute_tx_type(plane, txSz, x4, y4);
    let ctx = this.get_tx_class(txType) == AV1.TX_CLASS_2D ? 0 : 1;
    return sd.read_symbol(sd.Tile_coeff_cdfs.EobPt16Cdf[ptype][ctx]);
  }
  eob_pt_32({ plane, txSz, x4, y4, ptype }: { plane: number; txSz: number; x4: number; y4: number; ptype: number }): number {
    const sd = this.decoder.symbolDecoder;
    let txType = this.decoder.tileGroupObu.compute_tx_type(plane, txSz, x4, y4);
    let ctx = this.get_tx_class(txType) == AV1.TX_CLASS_2D ? 0 : 1;
    return sd.read_symbol(sd.Tile_coeff_cdfs.EobPt32Cdf[ptype][ctx]);
  }
  eob_pt_64({ plane, txSz, x4, y4, ptype }: { plane: number; txSz: number; x4: number; y4: number; ptype: number }): number {
    const sd = this.decoder.symbolDecoder;
    let txType = this.decoder.tileGroupObu.compute_tx_type(plane, txSz, x4, y4);
    let ctx = this.get_tx_class(txType) == AV1.TX_CLASS_2D ? 0 : 1;
    return sd.read_symbol(sd.Tile_coeff_cdfs.EobPt64Cdf[ptype][ctx]);
  }
  eob_pt_128({ plane, txSz, x4, y4, ptype }: { plane: number; txSz: number; x4: number; y4: number; ptype: number }): number {
    const sd = this.decoder.symbolDecoder;
    let txType = this.decoder.tileGroupObu.compute_tx_type(plane, txSz, x4, y4);
    let ctx = this.get_tx_class(txType) == AV1.TX_CLASS_2D ? 0 : 1;
    return sd.read_symbol(sd.Tile_coeff_cdfs.EobPt128Cdf[ptype][ctx]);
  }
  eob_pt_256({ plane, txSz, x4, y4, ptype }: { plane: number; txSz: number; x4: number; y4: number; ptype: number }): number {
    const sd = this.decoder.symbolDecoder;
    let txType = this.decoder.tileGroupObu.compute_tx_type(plane, txSz, x4, y4);
    let ctx = this.get_tx_class(txType) == AV1.TX_CLASS_2D ? 0 : 1;
    return sd.read_symbol(sd.Tile_coeff_cdfs.EobPt256Cdf[ptype][ctx]);
  }
  eob_pt_512({ ptype }: { ptype: number }): number {
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_coeff_cdfs.EobPt512Cdf[ptype]);
  }
  eob_pt_1024({ ptype }: { ptype: number }): number {
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_coeff_cdfs.EobPt1024Cdf[ptype]);
  }
  eob_extra({ txSzCtx, ptype, eobPt }: { txSzCtx: number; ptype: number; eobPt: number }): number {
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_coeff_cdfs.EobExtraCdf[txSzCtx][ptype][eobPt - 3]);
  }
  coeff_base({
    txSz,
    plane,
    x4,
    y4,
    scan,
    c,
    txSzCtx,
    ptype,
  }: {
    txSz: number;
    plane: number;
    x4: number;
    y4: number;
    scan: number[];
    c: number;
    txSzCtx: number;
    ptype: number;
  }): number {
    const sd = this.decoder.symbolDecoder;
    let ctx = this.get_coeff_base_ctx(txSz, plane, x4, y4, scan[c], c, 0);
    return sd.read_symbol(sd.Tile_coeff_cdfs.CoeffBaseCdf[txSzCtx][ptype][ctx]);
  }
  coeff_base_eob({
    txSz,
    plane,
    x4,
    y4,
    scan,
    c,
    txSzCtx,
    ptype,
  }: {
    txSz: number;
    plane: number;
    x4: number;
    y4: number;
    scan: number[];
    c: number;
    txSzCtx: number;
    ptype: number;
  }): number {
    const sd = this.decoder.symbolDecoder;
    let ctx = this.get_coeff_base_ctx(txSz, plane, x4, y4, scan[c], c, 1) - AV1.SIG_COEF_CONTEXTS + AV1.SIG_COEF_CONTEXTS_EOB;
    return sd.read_symbol(sd.Tile_coeff_cdfs.CoeffBaseEobCdf[txSzCtx][ptype][ctx]);
  }
  dc_sign({ plane, w4, h4, x4, y4, ptype }: { plane: number; w4: number; h4: number; x4: number; y4: number; ptype: number }): number {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const coef = tg.coefficients;
    const sd = this.decoder.symbolDecoder;

    let maxX4 = cis.MiCols;
    let maxY4 = cis.MiRows;
    if (plane > 0) {
      maxX4 = maxX4 >> cc.subsampling_x;
      maxY4 = maxY4 >> cc.subsampling_y;
    }

    let dcSign = 0;
    for (let k = 0; k < w4; k++) {
      if (x4 + k < maxX4) {
        let sign = coef.AboveDcContext[plane][x4 + k];
        if (sign == 1) {
          dcSign--;
        } else if (sign == 2) {
          dcSign++;
        }
      }
    }
    for (let k = 0; k < h4; k++) {
      if (y4 + k < maxY4) {
        let sign = coef.LeftDcContext[plane][y4 + k];
        if (sign == 1) {
          dcSign--;
        } else if (sign == 2) {
          dcSign++;
        }
      }
    }
    let ctx = 0;
    if (dcSign < 0) {
      ctx = 1;
    } else if (dcSign > 0) {
      ctx = 2;
    }
    return sd.read_symbol(sd.Tile_coeff_cdfs.DcSignCdf[ptype][ctx]);
  }
  coeff_br({ pos, txSz, plane, x4, y4, ptype, txSzCtx }: { pos: number; txSz: number; plane: number; x4: number; y4: number; ptype: number; txSzCtx: number }): number {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const coef = tg.coefficients;
    const sd = this.decoder.symbolDecoder;

    let adjTxSz = Adjusted_Tx_Size[txSz];
    let bwl = Tx_Width_Log2[adjTxSz];
    let txw = Tx_Width[adjTxSz];
    let txh = Tx_Height[adjTxSz];
    let row = pos >> bwl;
    let col = pos - (row << bwl);

    let mag = 0;

    let txType = this.decoder.tileGroupObu.compute_tx_type(plane, txSz, x4, y4);
    let txClass = this.get_tx_class(txType);

    for (let idx = 0; idx < 3; idx++) {
      let refRow = row + Mag_Ref_Offset_With_Tx_Class[txClass][idx][0];
      let refCol = col + Mag_Ref_Offset_With_Tx_Class[txClass][idx][1];
      if (refRow >= 0 && refCol >= 0 && refRow < txh && refCol < 1 << bwl) {
        mag += Math.min(coef.Quant[refRow * txw + refCol], AV1.COEFF_BASE_RANGE + AV1.NUM_BASE_LEVELS + 1);
      }
    }

    mag = Math.min((mag + 1) >> 1, 6);
    let ctx = 0;
    if (pos == 0) {
      ctx = mag;
    } else if (txClass == 0) {
      if (row < 2 && col < 2) {
        ctx = mag + 7;
      } else {
        ctx = mag + 14;
      }
    } else {
      if (txClass == 1) {
        if (col == 0) {
          ctx = mag + 7;
        } else {
          ctx = mag + 14;
        }
      } else {
        if (row == 0) {
          ctx = mag + 7;
        } else {
          ctx = mag + 14;
        }
      }
    }
    return sd.read_symbol(sd.Tile_coeff_cdfs.CoeffBrCdf[Math.min(txSzCtx, TX_SIZE.TX_32X32)][ptype][ctx]);
  }
  has_palette_y({ bsizeCtx }: { bsizeCtx: number }): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const sd = this.decoder.symbolDecoder;

    let ctx = 0;
    if (db.AvailU && db.PaletteSizes[0][db.MiRow - 1][db.MiCol] > 0) {
      ctx += 1;
    }
    if (db.AvailL && db.PaletteSizes[0][db.MiRow][db.MiCol - 1] > 0) {
      ctx += 1;
    }
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.PaletteYModeCdf[bsizeCtx][ctx]);
  }
  has_palette_uv(data?: any): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const pmi = tg.palette_mode_info;
    const sd = this.decoder.symbolDecoder;

    let ctx = pmi.PaletteSizeY > 0 ? 1 : 0;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.PaletteUVModeCdf[ctx]);
  }
  palette_size_y_minus_2({ bsizeCtx }: { bsizeCtx: number }): number {
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.PaletteYSizeCdf[bsizeCtx]);
  }
  palette_size_uv_minus_2({ bsizeCtx }: { bsizeCtx: number }): number {
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.PaletteUVSizeCdf[bsizeCtx]);
  }
  palette_color_idx_y(data?: any): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const pmi = tg.palette_mode_info;
    const pcc = tg.palette_color_context;
    const sd = this.decoder.symbolDecoder;

    let ctx = Palette_Color_Context[pcc.ColorContextHash];
    if (pmi.PaletteSizeY == 2) {
      return sd.read_symbol(sd.Tile_non_coeff_cdfs.PaletteSize2YColorCdf[ctx]);
    } else if (pmi.PaletteSizeY == 3) {
      return sd.read_symbol(sd.Tile_non_coeff_cdfs.PaletteSize3YColorCdf[ctx]);
    } else if (pmi.PaletteSizeY == 4) {
      return sd.read_symbol(sd.Tile_non_coeff_cdfs.PaletteSize4YColorCdf[ctx]);
    } else if (pmi.PaletteSizeY == 5) {
      return sd.read_symbol(sd.Tile_non_coeff_cdfs.PaletteSize5YColorCdf[ctx]);
    } else if (pmi.PaletteSizeY == 6) {
      return sd.read_symbol(sd.Tile_non_coeff_cdfs.PaletteSize6YColorCdf[ctx]);
    } else if (pmi.PaletteSizeY == 7) {
      return sd.read_symbol(sd.Tile_non_coeff_cdfs.PaletteSize7YColorCdf[ctx]);
    } else if (pmi.PaletteSizeY == 8) {
      return sd.read_symbol(sd.Tile_non_coeff_cdfs.PaletteSize8YColorCdf[ctx]);
    }
    return 0;
  }
  palette_color_idx_uv(data?: any): number {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const pmi = tg.palette_mode_info;
    const pcc = tg.palette_color_context;
    const sd = this.decoder.symbolDecoder;

    let ctx = Palette_Color_Context[pcc.ColorContextHash];
    if (pmi.PaletteSizeUV == 2) {
      return sd.read_symbol(sd.Tile_non_coeff_cdfs.PaletteSize2UVColorCdf[ctx]);
    } else if (pmi.PaletteSizeUV == 3) {
      return sd.read_symbol(sd.Tile_non_coeff_cdfs.PaletteSize3UVColorCdf[ctx]);
    } else if (pmi.PaletteSizeUV == 4) {
      return sd.read_symbol(sd.Tile_non_coeff_cdfs.PaletteSize4UVColorCdf[ctx]);
    } else if (pmi.PaletteSizeUV == 5) {
      return sd.read_symbol(sd.Tile_non_coeff_cdfs.PaletteSize5UVColorCdf[ctx]);
    } else if (pmi.PaletteSizeUV == 6) {
      return sd.read_symbol(sd.Tile_non_coeff_cdfs.PaletteSize6UVColorCdf[ctx]);
    } else if (pmi.PaletteSizeUV == 7) {
      return sd.read_symbol(sd.Tile_non_coeff_cdfs.PaletteSize7UVColorCdf[ctx]);
    } else if (pmi.PaletteSizeUV == 8) {
      return sd.read_symbol(sd.Tile_non_coeff_cdfs.PaletteSize8UVColorCdf[ctx]);
    }
    return 0;
  }
  delta_q_abs(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.DeltaQCdf);
  }
  delta_lf_abs({ i }: { i: number }): number {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const dlp = fh.delta_lf_params;
    const sd = this.decoder.symbolDecoder;
    if (dlp.delta_lf_multi == 0) {
      return sd.read_symbol(sd.Tile_non_coeff_cdfs.DeltaLFCdf);
    } else if (dlp.delta_lf_multi == 1) {
      return sd.read_symbol(sd.Tile_non_coeff_cdfs.DeltaLFMultiCdf[i]);
    }
    return 0;
  }
  intra_tx_type({ set, txSz }: { set: SET; txSz: number }): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const ifmi = tg.intra_frame_mode_info;
    const fimi = tg.filter_intra_mode_info;
    const sd = this.decoder.symbolDecoder;

    let intraDir = ifmi.YMode as UV_MODE;
    if (fimi.use_filter_intra === 1) {
      intraDir = Filter_Intra_Mode_To_Intra_Dir[fimi.filter_intra_mode];
    }

    let cdf: number[] = [];
    if (set === SET.TX_SET_INTRA_1) {
      cdf = sd.Tile_non_coeff_cdfs.IntraTxTypeSet1Cdf[Tx_Size_Sqr[txSz]][intraDir];
    } else if (set === SET.TX_SET_INTRA_2) {
      cdf = sd.Tile_non_coeff_cdfs.IntraTxTypeSet2Cdf[Tx_Size_Sqr[txSz]][intraDir];
    }
    return sd.read_symbol(cdf);
  }
  inter_tx_type({ set, txSz }: { set: SET; txSz: number }): number {
    const sd = this.decoder.symbolDecoder;
    let cdf: number[] = [];
    if (set === SET.TX_SET_INTER_1) {
      cdf = sd.Tile_non_coeff_cdfs.InterTxTypeSet1Cdf[Tx_Size_Sqr[txSz]];
    } else if (set === SET.TX_SET_INTER_2) {
      cdf = sd.Tile_non_coeff_cdfs.InterTxTypeSet2Cdf;
    } else if (set === SET.TX_SET_INTER_3) {
      cdf = sd.Tile_non_coeff_cdfs.InterTxTypeSet3Cdf[Tx_Size_Sqr[txSz]];
    }
    return sd.read_symbol(cdf);
  }
  comp_ref_type(data?: any): COMP_REF_TYPE {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;
    const sd = this.decoder.symbolDecoder;

    let above0 = ifmi.AboveRefFrame[0];
    let above1 = ifmi.AboveRefFrame[1];
    let left0 = ifmi.LeftRefFrame[0];
    let left1 = ifmi.LeftRefFrame[1];
    let aboveCompInter = db.AvailU && !ifmi.AboveIntra && !ifmi.AboveSingle;
    let leftCompInter = db.AvailL && !ifmi.LeftIntra && !ifmi.LeftSingle;
    let aboveUniComp = Number(aboveCompInter && this.is_samedir_ref_pair(above0, above1));
    let leftUniComp = Number(leftCompInter && this.is_samedir_ref_pair(left0, left1));

    let ctx = 2;
    if (db.AvailU && !ifmi.AboveIntra && db.AvailL && !ifmi.LeftIntra) {
      let samedir = this.is_samedir_ref_pair(above0, left0);

      if (!aboveCompInter && !leftCompInter) {
        ctx = 1 + 2 * samedir;
      } else if (!aboveCompInter) {
        if (!leftUniComp) ctx = 1;
        else ctx = 3 + samedir;
      } else if (!leftCompInter) {
        if (!aboveUniComp) ctx = 1;
        else ctx = 3 + samedir;
      } else {
        if (!aboveUniComp && !leftUniComp) ctx = 0;
        else if (!aboveUniComp || !leftUniComp) ctx = 2;
        else ctx = 3 + Number((above0 == REF_FRAME.BWDREF_FRAME) == (left0 == REF_FRAME.BWDREF_FRAME));
      }
    } else if (db.AvailU && db.AvailL) {
      if (aboveCompInter) ctx = 1 + 2 * aboveUniComp;
      else if (leftCompInter) ctx = 1 + 2 * leftUniComp;
      else ctx = 2;
    } else if (aboveCompInter) {
      ctx = 4 * aboveUniComp;
    } else if (leftCompInter) {
      ctx = 4 * leftUniComp;
    }
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.CompRefTypeCdf[ctx]);
  }
  uni_comp_ref(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    let ctx = this.single_ref_p1_ctx();
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.UniCompRefCdf[ctx][0]);
  }
  uni_comp_ref_p1(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    let last2Count = this.count_refs(REF_FRAME.LAST2_FRAME);
    let last3GoldCount = this.count_refs(REF_FRAME.LAST3_FRAME) + this.count_refs(REF_FRAME.GOLDEN_FRAME);
    let ctx = this.ref_count_ctx(last2Count, last3GoldCount);
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.UniCompRefCdf[ctx][1]);
  }
  uni_comp_ref_p2(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    let ctx = this.comp_ref_p2_ctx();
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.UniCompRefCdf[ctx][2]);
  }
  comp_group_idx(data?: any): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;
    const sd = this.decoder.symbolDecoder;

    let ctx = 0;
    if (db.AvailU) {
      if (!ifmi.AboveSingle) {
        ctx += db.CompGroupIdxs[db.MiRow - 1][db.MiCol];
      } else if (ifmi.AboveRefFrame[0] == REF_FRAME.ALTREF_FRAME) {
        ctx += 3;
      }
    }
    if (db.AvailL) {
      if (!ifmi.LeftSingle) {
        ctx += db.CompGroupIdxs[db.MiRow][db.MiCol - 1];
      } else if (ifmi.LeftRefFrame[0] == REF_FRAME.ALTREF_FRAME) {
        ctx += 3;
      }
    }
    ctx = Math.min(5, ctx);
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.CompGroupIdxCdf[ctx]);
  }
  compound_idx(data?: any): number {
    const fho = this.decoder.frameHeaderObu;
    const fh = fho.frameHeader;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;
    const rf = tg.ref_frames;
    const sd = this.decoder.symbolDecoder;

    let fwd = Math.abs(fho.get_relative_dist(fh.OrderHints[rf.RefFrame[0]], fh.OrderHint));
    let bck = Math.abs(fho.get_relative_dist(fh.OrderHints[rf.RefFrame[1]], fh.OrderHint));
    let ctx = fwd == bck ? 3 : 0;
    if (db.AvailU) {
      if (!ifmi.AboveSingle) ctx += db.CompoundIdxs[db.MiRow - 1][db.MiCol];
      else if (ifmi.AboveRefFrame[0] == REF_FRAME.ALTREF_FRAME) ctx++;
    }
    if (db.AvailL) {
      if (!ifmi.LeftSingle) ctx += db.CompoundIdxs[db.MiRow][db.MiCol - 1];
      else if (ifmi.LeftRefFrame[0] == REF_FRAME.ALTREF_FRAME) ctx++;
    }
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.CompoundIdxCdf[ctx]);
  }
  compound_type(data?: any): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const sd = this.decoder.symbolDecoder;

    return sd.read_symbol(sd.Tile_non_coeff_cdfs.CompoundTypeCdf[db.MiSize]);
  }
  interintra(data?: any): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const sd = this.decoder.symbolDecoder;

    let ctx = Size_Group[db.MiSize] - 1;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.InterIntraCdf[ctx]);
  }
  interintra_mode(data?: any): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const sd = this.decoder.symbolDecoder;

    let ctx = Size_Group[db.MiSize] - 1;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.InterIntraModeCdf[ctx]);
  }
  wedge_index(data?: any): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const sd = this.decoder.symbolDecoder;

    return sd.read_symbol(sd.Tile_non_coeff_cdfs.WedgeIndexCdf[db.MiSize]);
  }
  wedge_interintra(data?: any): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const sd = this.decoder.symbolDecoder;

    return sd.read_symbol(sd.Tile_non_coeff_cdfs.WedgeInterIntraCdf[db.MiSize]);
  }
  use_obmc(data?: any): number {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const sd = this.decoder.symbolDecoder;

    return sd.read_symbol(sd.Tile_non_coeff_cdfs.UseObmcCdf[db.MiSize]);
  }
  cfl_alpha_signs(data?: any): number {
    const sd = this.decoder.symbolDecoder;

    return sd.read_symbol(sd.Tile_non_coeff_cdfs.CflSignCdf);
  }
  cfl_alpha_u({ signU, signV }: { signU: number; signV: number }): number {
    const sd = this.decoder.symbolDecoder;

    let ctx = (signU - 1) * 3 + signV;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.CflAlphaCdf[ctx]);
  }
  cfl_alpha_v({ signU, signV }: { signU: number; signV: number }): number {
    const sd = this.decoder.symbolDecoder;

    let ctx = (signV - 1) * 3 + signU;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.CflAlphaCdf[ctx]);
  }
  use_wiener(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.UseWienerCdf);
  }
  use_sgrproj(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.UseSgrprojCdf);
  }
  restoration_type(data?: any): number {
    const sd = this.decoder.symbolDecoder;
    return sd.read_symbol(sd.Tile_non_coeff_cdfs.RestorationTypeCdf);
  }

  private get_above_tx_width(row: number, col: number) {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const bts = tg.block_tx_size;

    if (row == db.MiRow) {
      if (!db.AvailU) {
        return 64;
      } else if (db.Skips[row - 1][col] && db.IsInters[row - 1][col]) {
        return Block_Width[db.MiSizes[row - 1][col]];
      }
    }
    return Tx_Width[bts.InterTxSizes[row - 1][col]];
  }

  private get_left_tx_height(row: number, col: number) {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const bts = tg.block_tx_size;

    if (col == db.MiCol) {
      if (!db.AvailL) {
        return 64;
      } else if (db.Skips[row][col - 1] && db.IsInters[row][col - 1]) {
        return Block_Height[db.MiSizes[row][col - 1]];
      }
    }
    return Tx_Height[bts.InterTxSizes[row][col - 1]];
  }

  private check_backward(refFrame: REF_FRAME) {
    return Number(refFrame >= REF_FRAME.BWDREF_FRAME && refFrame <= REF_FRAME.ALTREF_FRAME);
  }

  private count_refs(frameType: REF_FRAME) {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const ifmi = tg.intra_frame_mode_info;

    let c = 0;
    if (db.AvailU) {
      if (ifmi.AboveRefFrame[0] == frameType) c++;
      if (ifmi.AboveRefFrame[1] == frameType) c++;
    }
    if (db.AvailL) {
      if (ifmi.LeftRefFrame[0] == frameType) c++;
      if (ifmi.LeftRefFrame[1] == frameType) c++;
    }
    return c;
  }

  private ref_count_ctx(counts0: number, counts1: number) {
    if (counts0 < counts1) {
      return 0;
    } else if (counts0 == counts1) {
      return 1;
    } else {
      return 2;
    }
  }

  private single_ref_p1_ctx() {
    let fwdCount = this.count_refs(REF_FRAME.LAST_FRAME);
    fwdCount += this.count_refs(REF_FRAME.LAST2_FRAME);
    fwdCount += this.count_refs(REF_FRAME.LAST3_FRAME);
    fwdCount += this.count_refs(REF_FRAME.GOLDEN_FRAME);
    let bwdCount = this.count_refs(REF_FRAME.BWDREF_FRAME);
    bwdCount += this.count_refs(REF_FRAME.ALTREF2_FRAME);
    bwdCount += this.count_refs(REF_FRAME.ALTREF_FRAME);
    return this.ref_count_ctx(fwdCount, bwdCount);
  }

  private comp_bwdref_ctx() {
    let brfarf2Count = this.count_refs(REF_FRAME.BWDREF_FRAME) + this.count_refs(REF_FRAME.ALTREF2_FRAME);
    let arfCount = this.count_refs(REF_FRAME.ALTREF_FRAME);
    return this.ref_count_ctx(brfarf2Count, arfCount);
  }

  private comp_ref_ctx() {
    let last12Count = this.count_refs(REF_FRAME.LAST_FRAME) + this.count_refs(REF_FRAME.LAST2_FRAME);
    let last3GoldCount = this.count_refs(REF_FRAME.LAST3_FRAME) + this.count_refs(REF_FRAME.GOLDEN_FRAME);
    return this.ref_count_ctx(last12Count, last3GoldCount);
  }

  private comp_ref_p1_ctx() {
    let lastCount = this.count_refs(REF_FRAME.LAST_FRAME);
    let last2Count = this.count_refs(REF_FRAME.LAST2_FRAME);
    return this.ref_count_ctx(lastCount, last2Count);
  }

  private comp_ref_p2_ctx() {
    let last3Count = this.count_refs(REF_FRAME.LAST3_FRAME);
    let goldCount = this.count_refs(REF_FRAME.GOLDEN_FRAME);
    return this.ref_count_ctx(last3Count, goldCount);
  }

  private comp_bwdref_p1_ctx() {
    let brfCount = this.count_refs(REF_FRAME.BWDREF_FRAME);
    let arf2Count = this.count_refs(REF_FRAME.ALTREF2_FRAME);
    return this.ref_count_ctx(brfCount, arf2Count);
  }

  private get_coeff_base_ctx(txSz: number, plane: number, blockX: number, blockY: number, pos: number, c: number, isEob: number) {
    const tg = this.decoder.tileGroupObu.titleGroup;
    const coef = tg.coefficients;

    let adjTxSz = Adjusted_Tx_Size[txSz];
    let bwl = Tx_Width_Log2[adjTxSz];
    let width = 1 << bwl;
    let height = Tx_Height[adjTxSz];
    let txType = this.decoder.tileGroupObu.compute_tx_type(plane, txSz, blockX, blockY);
    if (isEob) {
      if (c == 0) {
        return AV1.SIG_COEF_CONTEXTS - 4;
      }
      if (c <= (height << bwl) / 8) {
        return AV1.SIG_COEF_CONTEXTS - 3;
      }
      if (c <= (height << bwl) / 4) {
        return AV1.SIG_COEF_CONTEXTS - 2;
      }
      return AV1.SIG_COEF_CONTEXTS - 1;
    }
    let txClass = this.get_tx_class(txType);
    let row = pos >> bwl;
    let col = pos - (row << bwl);
    let mag = 0;

    for (let idx = 0; idx < AV1.SIG_REF_DIFF_OFFSET_NUM; idx++) {
      let refRow = row + Sig_Ref_Diff_Offset[txClass][idx][0];
      let refCol = col + Sig_Ref_Diff_Offset[txClass][idx][1];
      if (refRow >= 0 && refCol >= 0 && refRow < height && refCol < width) {
        mag += Math.min(Math.abs(coef.Quant[(refRow << bwl) + refCol]), 3);
      }
    }

    let ctx = Math.min((mag + 1) >> 1, 4);
    if (txClass == AV1.TX_CLASS_2D) {
      if (row == 0 && col == 0) {
        return 0;
      }
      return ctx + Coeff_Base_Ctx_Offset[txSz][Math.min(row, 4)][Math.min(col, 4)];
    }
    let idx = txClass == AV1.TX_CLASS_VERT ? row : col;
    return ctx + Coeff_Base_Pos_Ctx_Offset[Math.min(idx, 2)];
  }

  private get_tx_class(txType: number) {
    if (txType == AV1.V_DCT || txType == AV1.V_ADST || txType == AV1.V_FLIPADST) {
      return AV1.TX_CLASS_VERT;
    } else if (txType == AV1.H_DCT || txType == AV1.H_ADST || txType == AV1.H_FLIPADST) {
      return AV1.TX_CLASS_HORIZ;
    } else return AV1.TX_CLASS_2D;
  }

  private is_samedir_ref_pair(ref0: number, ref1: number) {
    return Number(ref0 >= REF_FRAME.BWDREF_FRAME == ref1 >= REF_FRAME.BWDREF_FRAME);
  }
}
