import { Array2D, clone, integer } from "../Conventions";
import * as AV1 from "../define";
import { AV1Decoder } from "../SyntaxStructures/Obu";

import { FRAME_TYPE, SUB_SIZE } from "../SyntaxStructures/Semantics";

import { assert } from "console";
import { Num_4x4_Blocks_Wide } from "../AdditionalTables/ConversionTables";

/**
 * 7.3 Large scale tile decoding process
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#large-scale-tile-decoding-process)
 */
export class LargeScaleTileDecoding {
  RefSubsamplingX: number[];
  RefSubsamplingY: number[];
  RefBitDepth: number[];
  private OutputFrameY: number[][];
  private OutputFrameU: number[][];
  private OutputFrameV: number[][];

  private init: boolean;
  private decoder: AV1Decoder;

  constructor(d: AV1Decoder) {
    this.init = false;

    this.RefSubsamplingX = [];
    this.RefSubsamplingY = [];
    this.RefBitDepth = [];
    this.OutputFrameY = Array2D(64);
    this.OutputFrameU = Array2D(64);
    this.OutputFrameV = Array2D(64);

    this.decoder = d;
  }

  initialize() {
    if (this.init) {
      return;
    }
    this.init = true;
  }

  /**
   * 7.3.1 General
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#general-5)
   */
  general(AnchorFrames: number[][][][], tile: number) {
    this.initialize();

    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const rfm = fh.reference_frame_marking;
    const fs = fh.frame_size;
    const fswr = fh.frame_size_with_refs;
    const sp = fh.segmentation_params;
    const cis = fh.compute_image_size;
    const lfp = fh.loop_filter_params;
    const dqp = fh.delta_q_params;
    const dlp = fh.delta_lf_params;
    const frm = fh.frame_reference_mode;
    const psi = fh.previous_segment_ids;
    const rf = fh.ref_frames;
    const tl = this.decoder.tileListObu.tileList;
    const tle = tl.tile_list_entry;
    const ct = this.decoder.output.cameraTile;
    const rfu = this.decoder.referenceFrameUpdate;

    // 2.
    let bitstream = tle.coded_tile_data;

    // 3.
    let last = fh.ref_frame_idx[0];

    // 4.
    rfu.FrameStore[last] = clone(AnchorFrames[tle.anchor_frame_idx]);

    // 5.
    rfm.RefValid[last] = 1;

    // 6.
    rf.RefUpscaledWidth[last] = fswr.UpscaledWidth;

    // 7.
    rf.RefFrameWidth[last] = fs.FrameWidth;

    // 8.
    rf.RefFrameHeight[last] = fs.FrameHeight;

    // 9.
    psi.RefMiCols[last] = cis.MiCols;

    // 10.
    psi.RefMiRows[last] = cis.MiRows;

    // 11.
    this.RefSubsamplingX[last] = cc.subsampling_x;

    // 12.
    this.RefSubsamplingY[last] = cc.subsampling_y;

    // 13.
    this.RefBitDepth[last] = cc.BitDepth;

    // 14.
    this.decode_camera_tile();

    let outputW = (1 + tl.output_frame_width_in_tiles_minus_1) * this.TileWidth;
    let outputH = (1 + tl.output_frame_height_in_tiles_minus_1) * this.TileHeight;

    {
      let destX = this.TileWidth * (tile % (tl.output_frame_width_in_tiles_minus_1 + 1));
      let destY = this.TileHeight * integer(tile / (tl.output_frame_width_in_tiles_minus_1 + 1));
      let w = this.TileWidth;
      let h = this.TileHeight;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          this.OutputFrameY[y + destY][x + destX] = ct.OutY[y][x];
        }
      }
      w = w >> cc.subsampling_x;
      h = h >> cc.subsampling_y;
      destX = destX >> cc.subsampling_x;
      destY = destY >> cc.subsampling_y;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          this.OutputFrameU[y + destY][x + destX] = ct.OutU[y][x];
          this.OutputFrameV[y + destY][x + destX] = ct.OutV[y][x];
        }
      }
    }

    assert(seqHeader.enable_superres == 0, "enable_superres is equal to 0");
    assert(seqHeader.enable_order_hint == 0, "enable_order_hint is equal to 0");
    assert(seqHeader.still_picture == 0, "still_picture is equal to 0");
    assert(seqHeader.film_grain_params_present == 0, "film_grain_params_present is equal to 0");
    assert(seqHeader.timing_info_present_flag == 0, "timing_info_present_flag is equal to 0");
    assert(seqHeader.decoder_model_info_present_flag == 0, "decoder_model_info_present_flag is equal to 0");
    assert(seqHeader.initial_display_delay_present_flag == 0, "initial_display_delay_present_flag is equal to 0");
    assert(seqHeader.enable_restoration == 0, "enable_restoration is equal to 0");
    assert(seqHeader.enable_cdef == 0, "enable_cdef is equal to 0 ");
    assert(cc.mono_chrome == 0, "mono_chrome is equal to 0");
    assert(this.TileHeight == (seqHeader.use_128x128_superblock ? 128 : 64), "TileHeight is equal to (use_128x128_superblock ? 128 : 64) for all tiles");
    assert(this.TileWidth % this.TileHeight == 0, "TileWidth is identical for all tiles and is an integer multiple of TileHeight");
    assert(fs.FrameWidth == cis.MiCols * AV1.MI_SIZE, "FrameWidth is equal to MiCols * MI_SIZE");
    assert(fs.FrameHeight == cis.MiRows * AV1.MI_SIZE, "FrameHeight is equal to MiRows * MI_SIZE");
    assert(fh.show_existing_frame == 0, "show_existing_frame is equal to 0");
    assert(fh.frame_type == FRAME_TYPE.INTER_FRAME, "frame_type is equal to INTER_FRAME");
    assert(fh.show_frame == 1, "show_frame is equal to 1");
    assert(fh.error_resilient_mode == 0, "error_resilient_mode is equal to 0 ");
    assert(fh.disable_cdf_update == 1, "disable_cdf_update is equal to 1");
    assert(fh.disable_frame_end_update_cdf == 1, "disable_frame_end_update_cdf is equal to 1");
    assert(dlp.delta_lf_present == 0, "delta_lf_present is equal to 0");
    assert(dqp.delta_q_present == 0, "delta_q_present is equal to 0");
    assert(fh.frame_size_override_flag == 0, "frame_size_override_flag is equal to 0");
    assert(fh.refresh_frame_flags == 0, "refresh_frame_flags is equal to 0");
    assert(fh.use_ref_frame_mvs == 0, "use_ref_frame_mvs is equal to 0");
    assert(sp.segmentation_temporal_update == 0, "segmentation_temporal_update is equal to 0");
    assert(frm.reference_select == 0, "reference_select is equal to 0");
    assert(lfp.loop_filter_level[0] == 0 && lfp.loop_filter_level[1] == 0, "loop_filter_level[ 0 ] and loop_filter_level[ 1 ] are equal to 0");
    assert(
      tl.tile_count_minus_1 < (tl.output_frame_width_in_tiles_minus_1 + 1) * (tl.output_frame_height_in_tiles_minus_1 + 1),
      "tile_count_minus_1 + 1 is less than or equal to (output_frame_width_in_tiles_minus_1 + 1) * (output_frame_height_in_tiles_minus_1 + 1)."
    );
  }

  /**
   * 7.3.2 Decode camera tile process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#decode-camera-tile-process)
   */
  decode_camera_tile() {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const qp = fh.quantization_params;
    const ti = fh.tile_info;
    const dqp = fh.delta_q_params;
    const tgo = this.decoder.tileGroupObu;
    const tg = tgo.titleGroup;
    const dt = tg.decode_tile;
    const tl = this.decoder.tileListObu.tileList;
    const tle = tl.tile_list_entry;
    const p = this.decoder.prediction;
    const ct = this.decoder.output.cameraTile;
    const sd = this.decoder.symbolDecoder;

    tg.CurrentQIndex = qp.base_q_idx;
    sd.init_symbol(tle.tile_data_size_minus_1 + 1);
    tgo.clear_above_context();
    let sbSize = seqHeader.use_128x128_superblock ? SUB_SIZE.BLOCK_128X128 : SUB_SIZE.BLOCK_64X64;
    let sbSize4 = Num_4x4_Blocks_Wide[sbSize];
    tg.MiRowStart = ti.MiRowStarts[tle.anchor_tile_row];
    tg.MiRowEnd = ti.MiRowStarts[tle.anchor_tile_row + 1];
    tg.MiColStart = ti.MiColStarts[tle.anchor_tile_col];
    tg.MiColEnd = ti.MiColStarts[tle.anchor_tile_col + 1];
    for (let r = tg.MiRowStart; r < tg.MiRowEnd; r += sbSize4) {
      tgo.clear_left_context();
      for (let c = tg.MiColStart; c < tg.MiColEnd; c += sbSize4) {
        dt.ReadDeltas = dqp.delta_q_present;
        if (c < tg.MiColEnd - 1) {
          tgo.clear_block_decoded_flags(r, c, sbSize);
        }
        tgo.decode_partition(r, c, sbSize);
      }
    }
    sd.exit_symbol();
    let w = (tg.MiColEnd - tg.MiColStart) * AV1.MI_SIZE;
    let h = (tg.MiRowEnd - tg.MiRowStart) * AV1.MI_SIZE;
    let x0 = tg.MiColStart * AV1.MI_SIZE;
    let y0 = tg.MiRowStart * AV1.MI_SIZE;
    let subX = cc.subsampling_x;
    let subY = cc.subsampling_y;
    let xC0 = (tg.MiColStart * AV1.MI_SIZE) >> subX;
    let yC0 = (tg.MiRowStart * AV1.MI_SIZE) >> subY;

    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        ct.OutY[y][x] = p.CurrFrame[0][y0 + y][x0 + x];
      }
    }
    for (let x = 0; x < w >> subX; x++) {
      for (let y = 0; y < h >> subY; y++) {
        ct.OutU[y][x] = p.CurrFrame[1][yC0 + y][xC0 + x];
      }
    }
    for (let x = 0; x < w >> subX; x++) {
      for (let y = 0; y < h >> subY; y++) {
        ct.OutV[y][x] = p.CurrFrame[2][yC0 + y][xC0 + x];
      }
    }
  }

  /**
   * A.3 Levels
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#levels)
   */
  get TileWidth() {
    const tg = this.decoder.tileGroupObu.titleGroup;
    return (tg.MiColEnd - tg.MiColStart) * AV1.MI_SIZE;
  }

  /**
   * A.3 Levels
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#levels)
   */
  get TileHeight() {
    const tg = this.decoder.tileGroupObu.titleGroup;
    return (tg.MiRowEnd - tg.MiRowStart) * AV1.MI_SIZE;
  }
}
