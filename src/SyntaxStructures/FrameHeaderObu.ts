import { Array2D, Array3D, Clip3, clone, clone_cdf, integer, inverseCdf } from "../Conventions";
import { AV1Decoder } from "./Obu";

import { CoeffCdfs, FRAME_RESTORATION_TYPE, FRAME_TYPE, INTERPOLATION_FILTER, NonCoeffCdfs, OBU_HEADER_TYPE, REF_FRAME, TX_MODE } from "./Semantics";

import { assert } from "console";
import {
  Default_Angle_Delta_Cdf,
  Default_Cfl_Alpha_Cdf,
  Default_Cfl_Sign_Cdf,
  Default_Coeff_Base_Cdf,
  Default_Coeff_Base_Eob_Cdf,
  Default_Coeff_Br_Cdf,
  Default_Comp_Bwd_Ref_Cdf,
  Default_Comp_Group_Idx_Cdf,
  Default_Comp_Mode_Cdf,
  Default_Comp_Ref_Cdf,
  Default_Comp_Ref_Type_Cdf,
  Default_Compound_Idx_Cdf,
  Default_Compound_Mode_Cdf,
  Default_Compound_Type_Cdf,
  Default_Dc_Sign_Cdf,
  Default_Delta_Lf_Cdf,
  Default_Delta_Q_Cdf,
  Default_Drl_Mode_Cdf,
  Default_Eob_Extra_Cdf,
  Default_Eob_Pt_1024_Cdf,
  Default_Eob_Pt_128_Cdf,
  Default_Eob_Pt_16_Cdf,
  Default_Eob_Pt_256_Cdf,
  Default_Eob_Pt_32_Cdf,
  Default_Eob_Pt_512_Cdf,
  Default_Eob_Pt_64_Cdf,
  Default_Filter_Intra_Cdf,
  Default_Filter_Intra_Mode_Cdf,
  Default_Inter_Intra_Cdf,
  Default_Inter_Intra_Mode_Cdf,
  Default_Inter_Tx_Type_Set1_Cdf,
  Default_Inter_Tx_Type_Set2_Cdf,
  Default_Inter_Tx_Type_Set3_Cdf,
  Default_Interp_Filter_Cdf,
  Default_Intra_Tx_Type_Set1_Cdf,
  Default_Intra_Tx_Type_Set2_Cdf,
  Default_Intrabc_Cdf,
  Default_Is_Inter_Cdf,
  Default_Motion_Mode_Cdf,
  Default_Mv_Bit_Cdf,
  Default_Mv_Class0_Bit_Cdf,
  Default_Mv_Class0_Fr_Cdf,
  Default_Mv_Class0_Hp_Cdf,
  Default_Mv_Class_Cdf,
  Default_Mv_Fr_Cdf,
  Default_Mv_Hp_Cdf,
  Default_Mv_Joint_Cdf,
  Default_Mv_Sign_Cdf,
  Default_New_Mv_Cdf,
  Default_Palette_Size_2_Uv_Color_Cdf,
  Default_Palette_Size_2_Y_Color_Cdf,
  Default_Palette_Size_3_Uv_Color_Cdf,
  Default_Palette_Size_3_Y_Color_Cdf,
  Default_Palette_Size_4_Uv_Color_Cdf,
  Default_Palette_Size_4_Y_Color_Cdf,
  Default_Palette_Size_5_Uv_Color_Cdf,
  Default_Palette_Size_5_Y_Color_Cdf,
  Default_Palette_Size_6_Uv_Color_Cdf,
  Default_Palette_Size_6_Y_Color_Cdf,
  Default_Palette_Size_7_Uv_Color_Cdf,
  Default_Palette_Size_7_Y_Color_Cdf,
  Default_Palette_Size_8_Uv_Color_Cdf,
  Default_Palette_Size_8_Y_Color_Cdf,
  Default_Palette_Uv_Mode_Cdf,
  Default_Palette_Uv_Size_Cdf,
  Default_Palette_Y_Mode_Cdf,
  Default_Palette_Y_Size_Cdf,
  Default_Partition_W128_Cdf,
  Default_Partition_W16_Cdf,
  Default_Partition_W32_Cdf,
  Default_Partition_W64_Cdf,
  Default_Partition_W8_Cdf,
  Default_Ref_Mv_Cdf,
  Default_Restoration_Type_Cdf,
  Default_Segment_Id_Cdf,
  Default_Segment_Id_Predicted_Cdf,
  Default_Single_Ref_Cdf,
  Default_Skip_Cdf,
  Default_Skip_Mode_Cdf,
  Default_Tx_16x16_Cdf,
  Default_Tx_32x32_Cdf,
  Default_Tx_64x64_Cdf,
  Default_Tx_8x8_Cdf,
  Default_Txb_Skip_Cdf,
  Default_Txfm_Split_Cdf,
  Default_Uni_Comp_Ref_Cdf,
  Default_Use_Obmc_Cdf,
  Default_Use_Sgrproj_Cdf,
  Default_Use_Wiener_Cdf,
  Default_Uv_Mode_Cfl_Allowed_Cdf,
  Default_Uv_Mode_Cfl_Not_Allowed_Cdf,
  Default_Wedge_Index_Cdf,
  Default_Wedge_Inter_Intra_Cdf,
  Default_Y_Mode_Cdf,
  Default_Zero_Mv_Cdf,
} from "../AdditionalTables/DefaultCdfTables";
import { AFFINE, FRAME_LF_COUNT, GM_ABS_ALPHA_BITS, GM_ABS_TRANS_BITS, GM_ABS_TRANS_ONLY_BITS, GM_ALPHA_PREC_BITS, GM_TRANS_ONLY_PREC_BITS, GM_TRANS_PREC_BITS, IDENTITY, MAX_LOOP_FILTER, MAX_SEGMENTS, MAX_TILE_AREA, MAX_TILE_COLS, MAX_TILE_ROWS, MAX_TILE_WIDTH, MV_CONTEXTS, NUM_REF_FRAMES, PRIMARY_REF_NONE, REFS_PER_FRAME, RESTORATION_TILESIZE_MAX, ROTZOOM, SEG_LVL_MAX, SEG_LVL_REF_FRAME, SELECT_INTEGER_MV, SELECT_SCREEN_CONTENT_TOOLS, SUPERRES_DENOM_BITS, SUPERRES_DENOM_MIN, SUPERRES_NUM, TOTAL_REFS_PER_FRAME, TRANSLATION, WARPEDMODEL_PREC_BITS } from "../define";

/**
 * 5.9 Frame header OBU syntax
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#frame-header-obu-syntax)
 */
export class FrameHeaderObu {
  frameHeader: FrameHeader;

  private decoder: AV1Decoder;
  private _cache_non_coeff_cdfs: NonCoeffCdfs[] = [];
  private _cache_coeff_cdfs: CoeffCdfs[] = [];
  private _cache_grain_params: FilmGrainParams[] = [];
  _cache_loop_filter_ref_deltas: number[][] = [];
  _cache_loop_filter_mode_deltas: number[][] = [];
  _cache_FeatureEnabled: number[][][] = [];
  _cache_FeatureData: number[][][] = [];
  _ref_showable_frame: number[] = [];

  constructor(d: AV1Decoder) {
    this.frameHeader = {
      buffer_removal_time: [],
      ref_order_hint: [],
      ref_frame_idx: [],
      RefFrameSignBias: [],
      RefFrameId: [],
      OrderHints: [],
      RefOrderHint: [],
      LosslessArray: [],
      SegQMLevel: [],
      reference_frame_marking: {
        RefValid: [],
      },
      frame_size: {},
      render_size: {},
      frame_size_with_refs: {},
      superres_params: {},
      compute_image_size: {},
      interpolation_filter: {},
      loop_filter_params: {
        loop_filter_level: [],
        loop_filter_ref_deltas: [],
        loop_filter_mode_deltas: [],
      },
      quantization_params: {},
      segmentation_params: {
        FeatureEnabled: Array2D(MAX_SEGMENTS),
        FeatureData: Array2D(MAX_SEGMENTS),
      },
      tile_info: {
        MiColStarts: [],
        MiRowStarts: [],
      },
      delta_q_params: {},
      delta_lf_params: {},
      film_grain_params: {
        point_y_value: [],
        point_y_scaling: [],
        point_cb_value: [],
        point_cb_scaling: [],
        point_cr_value: [],
        point_cr_scaling: [],
        ar_coeffs_y_plus_128: [],
        ar_coeffs_cb_plus_128: [],
        ar_coeffs_cr_plus_128: [],
      },
      read_tx_mode: {},
      skip_mode_params: {
        SkipModeFrame: [],
      },
      frame_reference_mode: {},
      global_motion_params: {
        gm_params: Array2D(NUM_REF_FRAMES),
        GmType: [],
      },
      temporal_point_info: {},
      past_independence: {
        PrevGmParams: Array2D(NUM_REF_FRAMES),
      },
      non_coeff_cdfs: {
        MvJointCdf: [],
        MvClassCdf: [],
        MvClass0BitCdf: Array2D(MV_CONTEXTS),
        MvFrCdf: [],
        MvClass0FrCdf: [],
        MvClass0HpCdf: Array2D(MV_CONTEXTS),
        MvSignCdf: Array2D(MV_CONTEXTS),
        MvBitCdf: Array2D(MV_CONTEXTS),
        MvHpCdf: Array2D(MV_CONTEXTS),
        DeltaLFMultiCdf: [],
      },
      coeff_cdfs: {},
      previous_segment_ids: {
        PrevGmParams: Array2D(NUM_REF_FRAMES),
        RefMiCols: [],
        RefMiRows: [],
        SavedGmParams: Array3D(NUM_REF_FRAMES, NUM_REF_FRAMES),
      },
      ref_frames: {
        RefFrameType: [],
        RefFrameWidth: [],
        RefFrameHeight: [],
        RefRenderWidth: [],
        RefRenderHeight: [],
        RefUpscaledWidth: [],
      },
    } as any;

    this.decoder = d;
  }

  /**
   * 5.9.1 General frame header OBU syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#general-frame-header-obu-syntax)
   */
  frame_header_obu() {
    const oh = this.decoder.obu.obuHeader;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const fh = this.frameHeader;
    const tdo = this.decoder.temporalDelimiterObu;
    const dfw = this.decoder.decodeFrameWrapup;

    assert(typeof seqHeader.seq_profile != "undefined", "It is a requirement of bitstream conformance that a sequence header OBU has been received before a frame header OBU.");
    if (oh.obu_type == OBU_HEADER_TYPE.OBU_FRAME_HEADER || oh.obu_type == OBU_HEADER_TYPE.OBU_FRAME) {
      assert(
        tdo.SeenFrameHeader == 0,
        "If obu_type is equal to OBU_FRAME_HEADER or obu_type is equal to OBU_FRAME, it is a requirement of bitstream conformance that SeenFrameHeader is equal to 0."
      );
    } else if (oh.obu_type == OBU_HEADER_TYPE.OBU_REDUNDANT_FRAME_HEADER) {
      assert(tdo.SeenFrameHeader == 1, "If obu_type is equal to OBU_REDUNDANT_FRAME_HEADER, it is a requirement of bitstream conformance that SeenFrameHeader is equal to 1.");
    }

    if (tdo.SeenFrameHeader == 1) {
      this.frame_header_copy();
    } else {
      tdo.SeenFrameHeader = 1;
      this.uncompressed_header();
      if (fh.show_existing_frame) {
        dfw.decode_frame_wrapup();
        tdo.SeenFrameHeader = 0;
      } else {
        fh.TileNum = 0;
        tdo.SeenFrameHeader = 1;
      }
    }
  }

  /**
   * 5.9.2 Uncompressed header syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#uncompressed-header-syntax)
   */
  uncompressed_header() {
    const reader = this.decoder.reader;
    const oh = this.decoder.obu.obuHeader;
    const oeh = oh.obu_extension_header;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const fh = this.frameHeader;
    const rfm = fh.reference_frame_marking;
    const fs = fh.frame_size;
    const fswr = fh.frame_size_with_refs;
    const qp = fh.quantization_params;
    const dqp = fh.delta_q_params;
    const rf = fh.ref_frames;
    const sfr = this.decoder.setFrameRefs;
    const mfe = this.decoder.motionFieldEstimation;
    const rad = this.decoder.reconstructionAndDequantization;

    let idLen = 0;
    if (seqHeader.frame_id_numbers_present_flag) {
      idLen = seqHeader.additional_frame_id_length_minus_1 + seqHeader.delta_frame_id_length_minus_2 + 3;
    }
    let allFrames = (1 << NUM_REF_FRAMES) - 1;
    if (seqHeader.reduced_still_picture_header) {
      fh.show_existing_frame = 0;
      fh.frame_type = FRAME_TYPE.KEY_FRAME;
      fh.FrameIsIntra = 1;
      fh.show_frame = 1;
      fh.showable_frame = 0;
    } else {
      fh.show_existing_frame = reader.f(1);
      if (oh.obu_type == OBU_HEADER_TYPE.OBU_FRAME) {
        assert(fh.show_existing_frame == 0, "If obu_type is equal to OBU_FRAME, it is a requirement of bitstream conformance that show_existing_frame is equal to 0.");
      }
      if (fh.show_existing_frame == 1) {
        fh.frame_to_show_map_idx = reader.f(3);
        if (seqHeader.decoder_model_info_present_flag && !seqHeader.timing_info.equal_picture_interval) {
          this.temporal_point_info();
        }
        fh.refresh_frame_flags = 0;
        if (seqHeader.frame_id_numbers_present_flag) {
          assert(idLen <= 16, "It is a requirement of bitstream conformance that the number of bits needed to read display_frame_id does not exceed 16.");
          fh.display_frame_id = reader.f(idLen);
          assert(
            fh.display_frame_id == fh.RefFrameId[fh.frame_to_show_map_idx],
            "It is a requirement of bitstream conformance that whenever display_frame_id is read, the value matches RefFrameId[ frame_to_show_map_idx ]"
          );
        }

        fh.frame_type = rf.RefFrameType[fh.frame_to_show_map_idx];
        if (fh.frame_type == FRAME_TYPE.KEY_FRAME) {
          fh.refresh_frame_flags = allFrames;
        }
        if (seqHeader.film_grain_params_present) {
          this.load_grain_params(fh.frame_to_show_map_idx);
        }
        return;
      }
      fh.frame_type = reader.f(2);
      fh.FrameIsIntra = Number(fh.frame_type == FRAME_TYPE.INTRA_ONLY_FRAME || fh.frame_type == FRAME_TYPE.KEY_FRAME);
      fh.show_frame = reader.f(1);
      if (fh.show_frame && seqHeader.decoder_model_info_present_flag && !seqHeader.timing_info.equal_picture_interval) {
        this.temporal_point_info();
      }
      if (fh.show_frame) {
        fh.showable_frame = Number(fh.frame_type != FRAME_TYPE.KEY_FRAME);
      } else {
        fh.showable_frame = reader.f(1);
      }
      if (fh.show_existing_frame == 1) {
        assert(
          this._ref_showable_frame[fh.frame_to_show_map_idx] == 1,
          "It is a requirement of bitstream conformance that when show_existing_frame is used to show a previous frame, that the value of showable_frame for the previous frame was equal to 1."
        );
      }
      /**
       * It is a requirement of bitstream conformance that when show_existing_frame is used to show a previous frame with RefFrameType[ frame_to_show_map_idx ] equal to KEY_FRAME, that the frame is output via the show_existing_frame mechanism at most once.
       */

      if (fh.frame_type == FRAME_TYPE.SWITCH_FRAME || (fh.frame_type == FRAME_TYPE.KEY_FRAME && fh.show_frame)) {
        fh.error_resilient_mode = 1;
      } else {
        fh.error_resilient_mode = reader.f(1);
      }
    }
    if (fh.frame_type == FRAME_TYPE.KEY_FRAME && fh.show_frame) {
      for (let i = 0; i < NUM_REF_FRAMES; i++) {
        rfm.RefValid[i] = 0;
        fh.RefOrderHint[i] = 0;
      }
      for (let i = 0; i < REFS_PER_FRAME; i++) {
        fh.OrderHints[REF_FRAME.LAST_FRAME + i] = 0;
      }
    }

    fh.disable_cdf_update = reader.f(1);
    if (seqHeader.seq_force_screen_content_tools == SELECT_SCREEN_CONTENT_TOOLS) {
      fh.allow_screen_content_tools = reader.f(1);
    } else {
      fh.allow_screen_content_tools = seqHeader.seq_force_screen_content_tools;
    }
    if (fh.allow_screen_content_tools) {
      if (seqHeader.seq_force_integer_mv == SELECT_INTEGER_MV) {
        fh.force_integer_mv = reader.f(1);
      } else {
        fh.force_integer_mv = seqHeader.seq_force_integer_mv;
      }
    } else {
      fh.force_integer_mv = 0;
    }
    if (fh.FrameIsIntra) {
      fh.force_integer_mv = 1;
    }
    if (seqHeader.frame_id_numbers_present_flag) {
      fh.PrevFrameID = fh.current_frame_id;
      fh.current_frame_id = reader.f(idLen);
      if (fh.frame_type != FRAME_TYPE.KEY_FRAME || fh.show_frame == 0) {
        let DiffFrameID: number;
        if (fh.current_frame_id > fh.PrevFrameID) {
          DiffFrameID = fh.current_frame_id - fh.PrevFrameID;
        } else {
          DiffFrameID = (1 << idLen) + fh.current_frame_id - fh.PrevFrameID;
        }
        assert(fh.current_frame_id != fh.PrevFrameID, "current_frame_id is not equal to PrevFrameID");
        assert(DiffFrameID < 1 << (idLen - 1), "DiffFrameID is less than 1 << ( idLen - 1 )");
      }
      this.mark_ref_frames(idLen);
    } else {
      fh.current_frame_id = 0;
    }
    if (fh.frame_type == FRAME_TYPE.SWITCH_FRAME) {
      fh.frame_size_override_flag = 1;
    } else if (seqHeader.reduced_still_picture_header) {
      fh.frame_size_override_flag = 0;
    } else {
      fh.frame_size_override_flag = reader.f(1);
    }
    let order_hint = reader.f(seqHeader.OrderHintBits);
    fh.OrderHint = order_hint;
    if (fh.FrameIsIntra || fh.error_resilient_mode) {
      fh.primary_ref_frame = PRIMARY_REF_NONE;
    } else {
      fh.primary_ref_frame = reader.f(3);
    }
    if (seqHeader.decoder_model_info_present_flag) {
      let buffer_removal_time_present_flag = reader.f(1);
      if (buffer_removal_time_present_flag) {
        for (let opNum = 0; opNum <= seqHeader.operating_points_cnt_minus_1; opNum++) {
          if (seqHeader.decoder_model_present_for_this_op[opNum]) {
            let opPtIdc = seqHeader.operating_point_idc[opNum];
            let inTemporalLayer = (opPtIdc >> oeh.temporal_id) & 1;
            let inSpatialLayer = (opPtIdc >> (oeh.spatial_id + 8)) & 1;
            if (opPtIdc == 0 || (inTemporalLayer && inSpatialLayer)) {
              let n = seqHeader.decoder_model_info.buffer_removal_time_length_minus_1 + 1;
              fh.buffer_removal_time[opNum] = reader.f(n);
            }
          }
        }
      }
    }
    fh.allow_high_precision_mv = 0;
    fh.use_ref_frame_mvs = 0;
    fh.allow_intrabc = 0;
    if (fh.frame_type == FRAME_TYPE.SWITCH_FRAME || (fh.frame_type == FRAME_TYPE.KEY_FRAME && fh.show_frame)) {
      fh.refresh_frame_flags = allFrames;
    } else {
      fh.refresh_frame_flags = reader.f(8);
    }
    if (fh.frame_type == FRAME_TYPE.INTRA_ONLY_FRAME) {
      assert(
        fh.refresh_frame_flags != 0xff,
        "If frame_type is equal to INTRA_ONLY_FRAME, it is a requirement of bitstream conformance that refresh_frame_flags is not equal to 0xff"
      );
    }
    if (!fh.FrameIsIntra || fh.refresh_frame_flags != allFrames) {
      if (fh.error_resilient_mode && seqHeader.enable_order_hint) {
        for (let i = 0; i < NUM_REF_FRAMES; i++) {
          fh.ref_order_hint[i] = reader.f(seqHeader.OrderHintBits);
          if (fh.ref_order_hint[i] != fh.RefOrderHint[i]) {
            rfm.RefValid[i] = 0;
          }
        }
      }
    }

    if (fh.FrameIsIntra) {
      this.frame_size();
      this.render_size();
      if (fh.allow_screen_content_tools && fswr.UpscaledWidth == fs.FrameWidth) {
        fh.allow_intrabc = reader.f(1);
      }
    } else {
      if (!seqHeader.enable_order_hint) {
        fh.frame_refs_short_signaling = 0;
      } else {
        fh.frame_refs_short_signaling = reader.f(1);
        if (fh.frame_refs_short_signaling) {
          fh.last_frame_idx = reader.f(3);
          fh.gold_frame_idx = reader.f(3);
          sfr.set_frame_refs();
        }
      }
      let expectedFrameId: number[] = [];
      for (let i = 0; i < REFS_PER_FRAME; i++) {
        if (!fh.frame_refs_short_signaling) {
          fh.ref_frame_idx[i] = reader.f(3);
          assert(rfm.RefValid[fh.ref_frame_idx[i]] == 1, "It is a requirement of bitstream conformance that RefValid[ ref_frame_idx[ i ] ] is equal to 1");
        }
        if (seqHeader.frame_id_numbers_present_flag) {
          let n = seqHeader.delta_frame_id_length_minus_2 + 2;
          let delta_frame_id_minus_1 = reader.f(n);
          fh.DeltaFrameId = delta_frame_id_minus_1 + 1;
          expectedFrameId[i] = (fh.current_frame_id + (1 << idLen) - fh.DeltaFrameId) % (1 << idLen);
          assert(
            expectedFrameId[i] == fh.RefFrameId[fh.ref_frame_idx[i]],
            "It is a requirement of bitstream conformance that whenever expectedFrameId[ i ] is calculated, the value matches RefFrameId[ ref_frame_idx[ i ] ]"
          );
        }
      }

      if (fh.frame_size_override_flag && !fh.error_resilient_mode) {
        this.frame_size_with_refs();
      } else {
        this.frame_size();
        this.render_size();
      }

      if (fh.force_integer_mv) {
        fh.allow_high_precision_mv = 0;
      } else {
        fh.allow_high_precision_mv = reader.f(1);
      }
      this.read_interpolation_filter();
      fh.is_motion_mode_switchable = reader.f(1);
      if (fh.error_resilient_mode || !seqHeader.enable_ref_frame_mvs) {
        fh.use_ref_frame_mvs = 0;
      } else {
        fh.use_ref_frame_mvs = reader.f(1);
      }
      for (let i = 0; i < REFS_PER_FRAME; i++) {
        let refFrame = REF_FRAME.LAST_FRAME + i;
        let hint = fh.RefOrderHint[fh.ref_frame_idx[i]];
        fh.OrderHints[refFrame] = hint;
        if (!seqHeader.enable_order_hint) {
          fh.RefFrameSignBias[refFrame] = 0;
        } else {
          fh.RefFrameSignBias[refFrame] = Number(this.get_relative_dist(hint, fh.OrderHint) > 0);
        }
      }
    }

    if (seqHeader.reduced_still_picture_header || fh.disable_cdf_update) {
      fh.disable_frame_end_update_cdf = 1;
    } else {
      fh.disable_frame_end_update_cdf = reader.f(1);
    }

    if (fh.primary_ref_frame == PRIMARY_REF_NONE) {
      this.init_non_coeff_cdfs();
      this.setup_past_independence();
    } else {
      this.load_cdfs(fh.ref_frame_idx[fh.primary_ref_frame]);
      this.load_previous();
    }
    if (fh.use_ref_frame_mvs == 1) {
      mfe.motion_field_estimation();
    }
    this.tile_info();

    this.quantization_params();
    this.segmentation_params();
    this.delta_q_params();
    this.delta_lf_params();
    if (fh.primary_ref_frame == PRIMARY_REF_NONE) {
      this.init_coeff_cdfs();
    } else {
      this.load_previous_segment_ids();
    }
    fh.CodedLossless = 1;
    for (let segmentId = 0; segmentId < MAX_SEGMENTS; segmentId++) {
      let qindex = rad.get_qindex(1, segmentId);
      fh.LosslessArray[segmentId] = Number(qindex == 0 && qp.DeltaQYDc == 0 && qp.DeltaQUAc == 0 && qp.DeltaQUDc == 0 && qp.DeltaQVAc == 0 && qp.DeltaQVDc == 0);
      if (!fh.LosslessArray[segmentId]) {
        fh.CodedLossless = 0;
      }
      if (qp.using_qmatrix) {
        if (fh.LosslessArray[segmentId]) {
          fh.SegQMLevel[0][segmentId] = 15;
          fh.SegQMLevel[1][segmentId] = 15;
          fh.SegQMLevel[2][segmentId] = 15;
        } else {
          fh.SegQMLevel[0][segmentId] = qp.qm_y;
          fh.SegQMLevel[1][segmentId] = qp.qm_u;
          fh.SegQMLevel[2][segmentId] = qp.qm_v;
        }
      }
    }
    if (fh.CodedLossless == 1) {
      assert(dqp.delta_q_present == 0, "It is a requirement of bitstream conformance that delta_q_present is equal to 0 when CodedLossless is equal to 1");
    }
    fh.AllLossless = Number(fh.CodedLossless && fs.FrameWidth == fswr.UpscaledWidth);
    this.loop_filter_params();
    this.cdef_params();
    this.lr_params();
    this.read_tx_mode();
    this.frame_reference_mode();
    this.skip_mode_params();
    if (fh.FrameIsIntra || fh.error_resilient_mode || !seqHeader.enable_warped_motion) {
      fh.allow_warped_motion = 0;
    } else {
      fh.allow_warped_motion = reader.f(1);
    }
    fh.reduced_tx_set = reader.f(1);
    this.global_motion_params();
    this.film_grain_params();
  }

  /**
   * 5.9.3 Get relative distance function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#get-relative-distance-function)
   */
  get_relative_dist(a: number, b: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;

    if (!seqHeader.enable_order_hint) return 0;
    let diff = a - b;
    let m = 1 << (seqHeader.OrderHintBits - 1);
    diff = (diff & (m - 1)) - (diff & m);
    return diff;
  }

  /**
   * 5.9.4 Reference frame marking function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#reference-frame-marking-function)
   */
  mark_ref_frames(idLen: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const fh = this.frameHeader;
    const rfm = this.frameHeader.reference_frame_marking;

    let diffLen = seqHeader.delta_frame_id_length_minus_2 + 2;
    for (let i = 0; i < NUM_REF_FRAMES; i++) {
      if (fh.current_frame_id > 1 << diffLen) {
        if (fh.RefFrameId[i] > fh.current_frame_id || fh.RefFrameId[i] < fh.current_frame_id - (1 << diffLen)) {
          rfm.RefValid[i] = 0;
        }
      } else {
        if (fh.RefFrameId[i] > fh.current_frame_id && fh.RefFrameId[i] < (1 << idLen) + fh.current_frame_id - (1 << diffLen)) {
          rfm.RefValid[i] = 0;
        }
      }
    }
  }

  /**
   * 5.9.5 Frame size syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#frame-size-syntax)
   */
  frame_size() {
    const reader = this.decoder.reader;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const fh = this.frameHeader;
    const fs = this.frameHeader.frame_size;

    if (fh.frame_size_override_flag) {
      let n = seqHeader.frame_width_bits_minus_1 + 1;
      fs.frame_width_minus_1 = reader.f(n);
      assert(
        fs.frame_width_minus_1 <= seqHeader.max_frame_width_minus_1,
        "It is a requirement of bitstream conformance that frame_width_minus_1 is less than or equal to max_frame_width_minus_1"
      );
      n = seqHeader.frame_height_bits_minus_1 + 1;
      fs.frame_height_minus_1 = reader.f(n);
      assert(
        fs.frame_height_minus_1 <= seqHeader.max_frame_height_minus_1,
        "It is a requirement of bitstream conformance that frame_width_minus_1 is less than or equal to max_frame_width_minus_1"
      );
      fs.FrameWidth = fs.frame_width_minus_1 + 1;
      fs.FrameHeight = fs.frame_height_minus_1 + 1;
    } else {
      fs.FrameWidth = seqHeader.max_frame_width_minus_1 + 1;
      fs.FrameHeight = seqHeader.max_frame_height_minus_1 + 1;
    }

    this.superres_params();
    this.compute_image_size();
  }

  /**
   * 5.9.6 Render size syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#render-size-syntax)
   */
  render_size() {
    const reader = this.decoder.reader;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const fs = this.frameHeader.frame_size;
    const rs = this.frameHeader.render_size;
    const fswr = this.frameHeader.frame_size_with_refs;

    let render_and_frame_size_different = reader.f(1);
    if (render_and_frame_size_different == 1) {
      let render_width_minus_1 = reader.f(16);
      let render_height_minus_1 = reader.f(16);
      rs.RenderWidth = render_width_minus_1 + 1;
      rs.RenderHeight = render_height_minus_1 + 1;
    } else {
      rs.RenderWidth = fswr.UpscaledWidth;
      rs.RenderHeight = fs.FrameHeight;
    }
  }

  /**
   * 5.9.7 Frame size with refs syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#frame-size-with-refs-syntax)
   */
  frame_size_with_refs() {
    const reader = this.decoder.reader;
    const oh = this.decoder.obu.obuHeader;
    const oeh = oh.obu_extension_header;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const fh = this.frameHeader;
    const rfm = this.frameHeader.reference_frame_marking;
    const fs = this.frameHeader.frame_size;
    const rs = this.frameHeader.render_size;
    const fswr = this.frameHeader.frame_size_with_refs;
    const qp = this.frameHeader.quantization_params;
    const dqp = this.frameHeader.delta_q_params;
    const rf = fh.ref_frames;
    const mfe = this.decoder.motionFieldEstimation;
    const rad = this.decoder.reconstructionAndDequantization;

    for (let i = 0; i < REFS_PER_FRAME; i++) {
      fswr.found_ref = reader.f(1);
      if (fswr.found_ref == 1) {
        let ref_frame_idx = fh.ref_frame_idx[i];
        fswr.UpscaledWidth = rf.RefUpscaledWidth[ref_frame_idx];
        fs.FrameWidth = fswr.UpscaledWidth;
        fs.FrameHeight = rf.RefFrameHeight[ref_frame_idx];
        rs.RenderWidth = rf.RefRenderWidth[ref_frame_idx];
        rs.RenderHeight = rf.RefRenderHeight[ref_frame_idx];
        break;
      }
    }
    if (fswr.found_ref == 0) {
      this.frame_size();
      this.render_size();
    } else {
      this.superres_params();
      this.compute_image_size();
    }
    for (let i = 0; i < REFS_PER_FRAME; i++) {
      let ref_frame_idx = fh.ref_frame_idx[i];
      assert(2 * fs.FrameWidth >= rf.RefUpscaledWidth[ref_frame_idx], "2 * FrameWidth >= RefUpscaledWidth[ ref_frame_idx[ i ] ]");
      assert(2 * fs.FrameHeight >= rf.RefFrameHeight[ref_frame_idx], "2 * FrameHeight >= RefFrameHeight[ ref_frame_idx[ i ] ]");
      assert(fs.FrameWidth <= 16 * rf.RefUpscaledWidth[ref_frame_idx], "FrameWidth <= 16 * RefUpscaledWidth[ ref_frame_idx[ i ] ]");
      assert(fs.FrameHeight <= 16 * rf.RefFrameHeight[ref_frame_idx], "FrameHeight <= 16 * RefFrameHeight[ ref_frame_idx[ i ] ]");
    }
  }

  /**
   * 5.9.8 Superres params syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#superres-params-syntax)
   */
  superres_params() {
    const reader = this.decoder.reader;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const fs = this.frameHeader.frame_size;
    const fswr = this.frameHeader.frame_size_with_refs;
    const sp = this.frameHeader.superres_params;

    if (seqHeader.enable_superres) sp.use_superres = reader.f(1);
    else sp.use_superres = 0;
    if (sp.use_superres) {
      let coded_denom = reader.f(SUPERRES_DENOM_BITS);
      sp.SuperresDenom = coded_denom + SUPERRES_DENOM_MIN;
    } else {
      sp.SuperresDenom = SUPERRES_NUM;
    }
    fswr.UpscaledWidth = fs.FrameWidth;
    fs.FrameWidth = integer((fswr.UpscaledWidth * SUPERRES_NUM + integer(sp.SuperresDenom / 2)) / sp.SuperresDenom);
  }

  /**
   * 5.9.9 Compute image size function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#compute-image-size-function)
   */
  compute_image_size() {
    const fs = this.frameHeader.frame_size;
    const cis = this.frameHeader.compute_image_size;
    const psi = this.frameHeader.previous_segment_ids;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;

    cis.MiCols = 2 * ((fs.FrameWidth + 7) >> 3);
    cis.MiRows = 2 * ((fs.FrameHeight + 7) >> 3);
  }

  /**
   * 5.9.10 Interpolation filter syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#interpolation-filter-syntax)
   */
  read_interpolation_filter() {
    const reader = this.decoder.reader;
    const rif = this.frameHeader.interpolation_filter;

    let is_filter_switchable = reader.f(1);
    if (is_filter_switchable == 1) {
      rif.interpolation_filter = INTERPOLATION_FILTER.SWITCHABLE;
    } else {
      rif.interpolation_filter = reader.f(2);
    }
  }

  /**
   * 5.9.11 Loop filter params syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#loop-filter-params-syntax)
   */
  loop_filter_params() {
    const reader = this.decoder.reader;
    const cc = this.decoder.sequenceHeaderObu.sequenceHeader.color_config;
    const fh = this.frameHeader;
    const lfp = this.frameHeader.loop_filter_params;

    if (fh.CodedLossless || fh.allow_intrabc) {
      lfp.loop_filter_level[0] = 0;
      lfp.loop_filter_level[1] = 0;
      lfp.loop_filter_ref_deltas[REF_FRAME.INTRA_FRAME] = 1;
      lfp.loop_filter_ref_deltas[REF_FRAME.LAST_FRAME] = 0;
      lfp.loop_filter_ref_deltas[REF_FRAME.LAST2_FRAME] = 0;
      lfp.loop_filter_ref_deltas[REF_FRAME.LAST3_FRAME] = 0;
      lfp.loop_filter_ref_deltas[REF_FRAME.BWDREF_FRAME] = 0;
      lfp.loop_filter_ref_deltas[REF_FRAME.GOLDEN_FRAME] = -1;
      lfp.loop_filter_ref_deltas[REF_FRAME.ALTREF_FRAME] = -1;
      lfp.loop_filter_ref_deltas[REF_FRAME.ALTREF2_FRAME] = -1;
      for (let i = 0; i < 2; i++) {
        lfp.loop_filter_mode_deltas[i] = 0;
      }
      return;
    }
    lfp.loop_filter_level[0] = reader.f(6);
    lfp.loop_filter_level[1] = reader.f(6);
    if (cc.NumPlanes > 1) {
      if (lfp.loop_filter_level[0] || lfp.loop_filter_level[1]) {
        lfp.loop_filter_level[2] = reader.f(6);
        lfp.loop_filter_level[3] = reader.f(6);
      }
    }
    lfp.loop_filter_sharpness = reader.f(3);
    lfp.loop_filter_delta_enabled = reader.f(1);
    if (lfp.loop_filter_delta_enabled) {
      let loop_filter_delta_update = reader.f(1);
      if (loop_filter_delta_update) {
        for (let i = 0; i < TOTAL_REFS_PER_FRAME; i++) {
          let update_ref_delta = reader.f(1);
          if (update_ref_delta == 1) {
            lfp.loop_filter_ref_deltas[i] = reader.su(1 + 6);
          }
        }
        for (let i = 0; i < 2; i++) {
          let update_mode_delta = reader.f(1);
          if (update_mode_delta == 1) {
            lfp.loop_filter_mode_deltas[i] = reader.su(1 + 6);
          }
        }
      }
    }
  }

  /**
   * 5.9.12 Quantization params syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#quantization-params-syntax)
   */
  quantization_params() {
    const reader = this.decoder.reader;
    const cc = this.decoder.sequenceHeaderObu.sequenceHeader.color_config;
    const qp = this.frameHeader.quantization_params;

    qp.base_q_idx = reader.f(8);
    qp.DeltaQYDc = this.read_delta_q();
    if (cc.NumPlanes > 1) {
      let diff_uv_delta = 0;
      if (cc.separate_uv_delta_q) {
        diff_uv_delta = reader.f(1);
      }
      qp.DeltaQUDc = this.read_delta_q();
      qp.DeltaQUAc = this.read_delta_q();
      if (diff_uv_delta) {
        qp.DeltaQVDc = this.read_delta_q();
        qp.DeltaQVAc = this.read_delta_q();
      } else {
        qp.DeltaQVDc = qp.DeltaQUDc;
        qp.DeltaQVAc = qp.DeltaQUAc;
      }
    } else {
      qp.DeltaQUDc = 0;
      qp.DeltaQUAc = 0;
      qp.DeltaQVDc = 0;
      qp.DeltaQVAc = 0;
    }
    qp.using_qmatrix = reader.f(1);
    if (qp.using_qmatrix) {
      qp.qm_y = reader.f(4);
      qp.qm_u = reader.f(4);
      if (!cc.separate_uv_delta_q) {
        qp.qm_v = qp.qm_u;
      } else {
        qp.qm_v = reader.f(4);
      }
    }
  }

  /**
   * 5.9.13 Delta quantizer syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#delta-quantizer-syntax)
   */
  read_delta_q() {
    const reader = this.decoder.reader;
    const f = reader.f;

    let delta_coded = reader.f(1);
    if (delta_coded) {
      return reader.su(1 + 6);
    }
    return 0;
  }

  /**
   * 5.9.14 Segmentation params syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#segmentation-params-syntax)
   */
  segmentation_params() {
    const reader = this.decoder.reader;
    const fh = this.frameHeader;
    const sp = this.frameHeader.segmentation_params;

    sp.segmentation_enabled = reader.f(1);
    if (sp.segmentation_enabled == 1) {
      let segmentation_update_data = 1;
      if (fh.primary_ref_frame == PRIMARY_REF_NONE) {
        sp.segmentation_update_map = 1;
        sp.segmentation_temporal_update = 0;
      } else {
        sp.segmentation_update_map = reader.f(1);
        if (sp.segmentation_update_map == 1) sp.segmentation_temporal_update = reader.f(1);
        segmentation_update_data = reader.f(1);
      }
      if (segmentation_update_data == 1) {
        for (let i = 0; i < MAX_SEGMENTS; i++) {
          for (let j = 0; j < SEG_LVL_MAX; j++) {
            let feature_value = 0;
            let feature_enabled = reader.f(1);
            sp.FeatureEnabled[i][j] = feature_enabled;
            let clippedValue = 0;
            if (feature_enabled == 1) {
              let bitsToRead = Segmentation_Feature_Bits[j];
              let limit = Segmentation_Feature_Max[j];
              if (Segmentation_Feature_Signed[j] == 1) {
                feature_value = reader.su(1 + bitsToRead);
                clippedValue = Clip3(-limit, limit, feature_value);
              } else {
                feature_value = reader.f(bitsToRead);
                clippedValue = Clip3(0, limit, feature_value);
              }
            }
            sp.FeatureData[i][j] = clippedValue;
          }
        }
      }
    } else {
      for (let i = 0; i < MAX_SEGMENTS; i++) {
        for (let j = 0; j < SEG_LVL_MAX; j++) {
          sp.FeatureEnabled[i][j] = 0;
          sp.FeatureData[i][j] = 0;
        }
      }
    }
    sp.SegIdPreSkip = 0;
    sp.LastActiveSegId = 0;
    for (let i = 0; i < MAX_SEGMENTS; i++) {
      for (let j = 0; j < SEG_LVL_MAX; j++) {
        if (sp.FeatureEnabled[i][j]) {
          sp.LastActiveSegId = i;
          if (j >= SEG_LVL_REF_FRAME) {
            sp.SegIdPreSkip = 1;
          }
        }
      }
    }
  }

  /**
   * 5.9.15 Tile info syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#tile-info-syntax)
   */
  tile_info() {
    const reader = this.decoder.reader;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const fh = this.frameHeader;
    const cis = fh.compute_image_size;
    const ti = fh.tile_info;

    let sbCols = seqHeader.use_128x128_superblock ? (cis.MiCols + 31) >> 5 : (cis.MiCols + 15) >> 4;
    let sbRows = seqHeader.use_128x128_superblock ? (cis.MiRows + 31) >> 5 : (cis.MiRows + 15) >> 4;
    let sbShift = seqHeader.use_128x128_superblock ? 5 : 4;
    let sbSize = sbShift + 2;
    let maxTileWidthSb = MAX_TILE_WIDTH >> sbSize;
    let maxTileAreaSb = MAX_TILE_AREA >> (2 * sbSize);
    let minLog2TileCols = this.tile_log2(maxTileWidthSb, sbCols);
    let maxLog2TileCols = this.tile_log2(1, Math.min(sbCols, MAX_TILE_COLS));
    let maxLog2TileRows = this.tile_log2(1, Math.min(sbRows, MAX_TILE_ROWS));
    let minLog2Tiles = Math.max(minLog2TileCols, this.tile_log2(maxTileAreaSb, sbRows * sbCols));

    let uniform_tile_spacing_flag = reader.f(1);
    if (uniform_tile_spacing_flag) {
      ti.TileColsLog2 = minLog2TileCols;
      while (ti.TileColsLog2 < maxLog2TileCols) {
        let increment_tile_cols_log2 = reader.f(1);
        if (increment_tile_cols_log2 == 1) {
          ti.TileColsLog2++;
        } else {
          break;
        }
      }
      let tileWidthSb = (sbCols + (1 << ti.TileColsLog2) - 1) >> ti.TileColsLog2;
      assert(tileWidthSb <= maxTileWidthSb, "It is a requirement of bitstream conformance that tileWidthSb is less than or equal to maxTileWidthSb.");
      let i = 0;
      for (let startSb = 0; startSb < sbCols; startSb += tileWidthSb) {
        ti.MiColStarts[i] = startSb << sbShift;
        i += 1;
      }
      ti.MiColStarts[i] = cis.MiCols;
      ti.TileCols = i;

      let minLog2TileRows = Math.max(minLog2Tiles - ti.TileColsLog2, 0);
      ti.TileRowsLog2 = minLog2TileRows;
      while (ti.TileRowsLog2 < maxLog2TileRows) {
        let increment_tile_rows_log2 = reader.f(1);
        if (increment_tile_rows_log2 == 1) {
          ti.TileRowsLog2++;
        } else {
          break;
        }
      }
      let tileHeightSb = (sbRows + (1 << ti.TileRowsLog2) - 1) >> ti.TileRowsLog2;
      assert(tileHeightSb <= maxTileAreaSb, "It is a requirement of bitstream conformance that tileWidthSb * tileHeightSb is less than or equal to maxTileAreaSb.");
      i = 0;
      for (let startSb = 0; startSb < sbRows; startSb += tileHeightSb) {
        ti.MiRowStarts[i] = startSb << sbShift;
        i += 1;
      }
      ti.MiRowStarts[i] = cis.MiRows;
      ti.TileRows = i;
    } else {
      let widestTileSb = 0;
      let startSb = 0;
      let i = 0;
      for (; startSb < sbCols; i++) {
        ti.MiColStarts[i] = startSb << sbShift;
        let maxWidth = Math.min(sbCols - startSb, maxTileWidthSb);
        let width_in_sbs_minus_1 = reader.ns(maxWidth);
        let sizeSb = width_in_sbs_minus_1 + 1;
        widestTileSb = Math.max(sizeSb, widestTileSb);
        startSb += sizeSb;
      }
      assert(startSb == sbCols, "it is a requirement of bitstream conformance that startSb is equal to sbCols when the loop writing MiColStarts exits.");
      ti.MiColStarts[i] = cis.MiCols;
      ti.TileCols = i;
      ti.TileColsLog2 = this.tile_log2(1, ti.TileCols);

      if (minLog2Tiles > 0) {
        maxTileAreaSb = (sbRows * sbCols) >> (minLog2Tiles + 1);
      } else {
        maxTileAreaSb = sbRows * sbCols;
      }
      let maxTileHeightSb = Math.max(integer(maxTileAreaSb / widestTileSb), 1);

      startSb = 0;
      for (i = 0; startSb < sbRows; i++) {
        ti.MiRowStarts[i] = startSb << sbShift;
        let maxHeight = Math.min(sbRows - startSb, maxTileHeightSb);
        let height_in_sbs_minus_1 = reader.ns(maxHeight);
        let sizeSb = height_in_sbs_minus_1 + 1;
        startSb += sizeSb;
      }
      assert(startSb == sbRows, "it is a requirement of bitstream conformance that startSb is equal to sbRows when the loop writing MiRowStarts exits");
      ti.MiRowStarts[i] = cis.MiRows;
      ti.TileRows = i;
      ti.TileRowsLog2 = this.tile_log2(1, ti.TileRows);
    }
    assert(ti.TileCols <= MAX_TILE_COLS, "It is a requirement of bitstream conformance that TileCols is less than or equal to MAX_TILE_COLS.");
    assert(ti.TileRows <= MAX_TILE_ROWS, "It is a requirement of bitstream conformance that TileRows is less than or equal to MAX_TILE_ROWS.");
    if (ti.TileColsLog2 > 0 || ti.TileRowsLog2 > 0) {
      ti.context_update_tile_id = reader.f(ti.TileRowsLog2 + ti.TileColsLog2);
      assert(ti.context_update_tile_id < ti.TileCols * ti.TileRows, "It is a requirement of bitstream conformance that context_update_tile_id is less than TileCols * TileRows");
      let tile_size_bytes_minus_1 = reader.f(2);
      ti.TileSizeBytes = tile_size_bytes_minus_1 + 1;
    } else {
      ti.context_update_tile_id = 0;
    }
  }

  /**
   * 5.9.16 Tile size calculation function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#tile-size-calculation-function)
   */
  tile_log2(blkSize: number, target: number) {
    let k = 0;
    for (k = 0; blkSize << k < target; k++) {}
    return k;
  }

  /**
   * 5.9.17 Quantizer index delta parameters syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#quantizer-index-delta-parameters-syntax)
   */
  delta_q_params() {
    const reader = this.decoder.reader;
    const qp = this.frameHeader.quantization_params;
    const dqp = this.frameHeader.delta_q_params;

    dqp.delta_q_res = 0;
    dqp.delta_q_present = 0;
    if (qp.base_q_idx > 0) {
      dqp.delta_q_present = reader.f(1);
    }
    if (dqp.delta_q_present) {
      dqp.delta_q_res = reader.f(2);
    }
  }

  /**
   * 5.9.18 Loop filter delta parameters syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#loop-filter-delta-parameters-syntax)
   */
  delta_lf_params() {
    const reader = this.decoder.reader;
    const fh = this.frameHeader;
    const dqp = this.frameHeader.delta_q_params;
    const dlp = this.frameHeader.delta_lf_params;

    dlp.delta_lf_present = 0;
    dlp.delta_lf_res = 0;
    dlp.delta_lf_multi = 0;
    if (dqp.delta_q_present) {
      if (!fh.allow_intrabc) {
        dlp.delta_lf_present = reader.f(1);
      }
      if (dlp.delta_lf_present) {
        dlp.delta_lf_res = reader.f(2);
        dlp.delta_lf_multi = reader.f(1);
      }
    }
  }

  /**
   * 5.9.19 CDEF params syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#cdef-params-syntax)
   */
  cdef_params() {
    const reader = this.decoder.reader;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = this.decoder.sequenceHeaderObu.sequenceHeader.color_config;
    const fh = this.frameHeader;
    const cp = this.decoder.tileGroupObu.titleGroup.cdef_params;

    if (fh.CodedLossless || fh.allow_intrabc || !seqHeader.enable_cdef) {
      cp.cdef_bits = 0;
      cp.cdef_y_pri_strength[0] = 0;
      cp.cdef_y_sec_strength[0] = 0;
      cp.cdef_uv_pri_strength[0] = 0;
      cp.cdef_uv_sec_strength[0] = 0;
      cp.CdefDamping = 3;
      return;
    }
    let cdef_damping_minus_3 = reader.f(2);
    cp.CdefDamping = cdef_damping_minus_3 + 3;
    cp.cdef_bits = reader.f(2);
    for (let i = 0; i < 1 << cp.cdef_bits; i++) {
      cp.cdef_y_pri_strength[i] = reader.f(4);
      cp.cdef_y_sec_strength[i] = reader.f(2);
      if (cp.cdef_y_sec_strength[i] == 3) {
        cp.cdef_y_sec_strength[i] += 1;
      }
      if (cc.NumPlanes > 1) {
        cp.cdef_uv_pri_strength[i] = reader.f(4);
        cp.cdef_uv_sec_strength[i] = reader.f(2);
        if (cp.cdef_uv_sec_strength[i] == 3) {
          cp.cdef_uv_sec_strength[i] += 1;
        }
      }
    }
  }

  /**
   * 5.9.20 Loop restoration params syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#loop-restoration-params-syntax)
   */
  lr_params() {
    const reader = this.decoder.reader;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = this.decoder.sequenceHeaderObu.sequenceHeader.color_config;
    const fh = this.frameHeader;
    const lp = this.decoder.tileGroupObu.titleGroup.lr_params;

    if (fh.AllLossless || fh.allow_intrabc || !seqHeader.enable_restoration) {
      lp.FrameRestorationType[0] = FRAME_RESTORATION_TYPE.RESTORE_NONE;
      lp.FrameRestorationType[1] = FRAME_RESTORATION_TYPE.RESTORE_NONE;
      lp.FrameRestorationType[2] = FRAME_RESTORATION_TYPE.RESTORE_NONE;
      lp.UsesLr = 0;
      return;
    }
    const Remap_Lr_Type = [
      FRAME_RESTORATION_TYPE.RESTORE_NONE,
      FRAME_RESTORATION_TYPE.RESTORE_SWITCHABLE,
      FRAME_RESTORATION_TYPE.RESTORE_WIENER,
      FRAME_RESTORATION_TYPE.RESTORE_SGRPROJ,
    ];
    lp.UsesLr = 0;
    let usesChromaLr = 0;
    for (let i = 0; i < cc.NumPlanes; i++) {
      /** +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       *  | lr_type | FrameRestorationType| Name of FrameRestorationType|
       *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       *  |    0    |          0          |      RESTORE_NONE           |
       *  |    1    |          3          |      RESTORE_SWITCHABLE     |
       *  |    2    |          1          |      RESTORE_WIENER         |
       *  |    3    |          2          |      RESTORE_SGRPROJ        |
       *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       */
      let lr_type = reader.f(2);
      lp.FrameRestorationType[i] = Remap_Lr_Type[lr_type];
      if (lp.FrameRestorationType[i] != FRAME_RESTORATION_TYPE.RESTORE_NONE) {
        lp.UsesLr = 1;
        if (i > 0) {
          usesChromaLr = 1;
        }
      }
    }
    if (lp.UsesLr) {
      let lr_unit_shift: number;
      if (seqHeader.use_128x128_superblock) {
        lr_unit_shift = reader.f(1);
        lr_unit_shift++;
      } else {
        lr_unit_shift = reader.f(1);
        if (lr_unit_shift) {
          let lr_unit_extra_shift = reader.f(1);
          lr_unit_shift += lr_unit_extra_shift;
        }
      }
      lp.LoopRestorationSize[0] = RESTORATION_TILESIZE_MAX >> (2 - lr_unit_shift);
      let lr_uv_shift = 0;
      if (cc.subsampling_x && cc.subsampling_y && usesChromaLr) {
        lr_uv_shift = reader.f(1);
      }
      lp.LoopRestorationSize[1] = lp.LoopRestorationSize[0] >> lr_uv_shift;
      lp.LoopRestorationSize[2] = lp.LoopRestorationSize[0] >> lr_uv_shift;
    }
  }

  /**
   * 5.9.21 TX mode syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#tx-mode-syntax)
   */
  read_tx_mode() {
    const reader = this.decoder.reader;
    const fh = this.frameHeader;
    const rtm = this.frameHeader.read_tx_mode;

    if (fh.CodedLossless == 1) {
      rtm.TxMode = TX_MODE.ONLY_4X4;
    } else {
      let tx_mode_select = reader.f(1);
      if (tx_mode_select) {
        rtm.TxMode = TX_MODE.TX_MODE_SELECT;
      } else {
        rtm.TxMode = TX_MODE.TX_MODE_LARGEST;
      }
    }
  }

  /**
   * 5.9.22 Skip mode params syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#skip-mode-params-syntax)
   */
  skip_mode_params() {
    const reader = this.decoder.reader;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const fh = this.frameHeader;
    const frm = this.frameHeader.frame_reference_mode;
    const smp = this.frameHeader.skip_mode_params;

    let skipModeAllowed;
    if (fh.FrameIsIntra || !frm.reference_select || !seqHeader.enable_order_hint) {
      skipModeAllowed = 0;
    } else {
      let forwardIdx = -1;
      let backwardIdx = -1;
      let forwardHint = -1;
      let backwardHint = 0;
      for (let i = 0; i < REFS_PER_FRAME; i++) {
        let refHint = fh.RefOrderHint[fh.ref_frame_idx[i]];
        if (this.get_relative_dist(refHint, fh.OrderHint) < 0) {
          if (forwardIdx < 0 || this.get_relative_dist(refHint, forwardHint) > 0) {
            forwardIdx = i;
            forwardHint = refHint;
          }
        } else if (this.get_relative_dist(refHint, fh.OrderHint) > 0) {
          if (backwardIdx < 0 || this.get_relative_dist(refHint, backwardHint) < 0) {
            backwardIdx = i;
            backwardHint = refHint;
          }
        }
      }
      if (forwardIdx < 0) {
        skipModeAllowed = 0;
      } else if (backwardIdx >= 0) {
        skipModeAllowed = 1;
        smp.SkipModeFrame[0] = REF_FRAME.LAST_FRAME + Math.min(forwardIdx, backwardIdx);
        smp.SkipModeFrame[1] = REF_FRAME.LAST_FRAME + Math.max(forwardIdx, backwardIdx);
      } else {
        let secondForwardIdx = -1;
        let secondForwardHint = -1;
        for (let i = 0; i < REFS_PER_FRAME; i++) {
          let refHint = fh.RefOrderHint[fh.ref_frame_idx[i]];
          if (this.get_relative_dist(refHint, forwardHint) < 0) {
            if (secondForwardIdx < 0 || this.get_relative_dist(refHint, secondForwardHint) > 0) {
              secondForwardIdx = i;
              secondForwardHint = refHint;
            }
          }
        }
        if (secondForwardIdx < 0) {
          skipModeAllowed = 0;
        } else {
          skipModeAllowed = 1;
          smp.SkipModeFrame[0] = REF_FRAME.LAST_FRAME + Math.min(forwardIdx, secondForwardIdx);
          smp.SkipModeFrame[1] = REF_FRAME.LAST_FRAME + Math.max(forwardIdx, secondForwardIdx);
        }
      }
    }
    if (skipModeAllowed) {
      smp.skip_mode_present = reader.f(1);
    } else {
      smp.skip_mode_present = 0;
    }
  }

  /**
   * 5.9.23 Frame reference mode syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#frame-reference-mode-syntax)
   */
  frame_reference_mode() {
    const reader = this.decoder.reader;
    const fh = this.frameHeader;
    const frm = this.frameHeader.frame_reference_mode;

    if (fh.FrameIsIntra) {
      frm.reference_select = 0;
    } else {
      frm.reference_select = reader.f(1);
    }
  }

  /**
   * 5.9.24 Global motion params syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#global-motion-params-syntax)
   */
  global_motion_params() {
    const reader = this.decoder.reader;
    const fh = this.frameHeader;
    const gmp = this.frameHeader.global_motion_params;

    for (let ref = REF_FRAME.LAST_FRAME; ref <= REF_FRAME.ALTREF_FRAME; ref++) {
      gmp.GmType[ref] = IDENTITY;
      for (let i = 0; i < 6; i++) {
        gmp.gm_params[ref][i] = i % 3 == 2 ? 1 << WARPEDMODEL_PREC_BITS : 0;
      }
    }
    if (fh.FrameIsIntra) {
      return;
    }
    for (let ref = REF_FRAME.LAST_FRAME; ref <= REF_FRAME.ALTREF_FRAME; ref++) {
      let is_global = reader.f(1);
      let type = IDENTITY;
      if (is_global) {
        let is_rot_zoom = reader.f(1);
        if (is_rot_zoom) {
          type = ROTZOOM;
        } else {
          let is_translation = reader.f(1);
          type = is_translation ? TRANSLATION : AFFINE;
        }
      }
      gmp.GmType[ref] = type;
      if (type >= ROTZOOM) {
        this.read_global_param(type, ref, 2);
        this.read_global_param(type, ref, 3);
        if (type == AFFINE) {
          this.read_global_param(type, ref, 4);
          this.read_global_param(type, ref, 5);
        } else {
          gmp.gm_params[ref][4] = -gmp.gm_params[ref][3];
          gmp.gm_params[ref][5] = gmp.gm_params[ref][2];
        }
      }
      if (type >= TRANSLATION) {
        this.read_global_param(type, ref, 0);
        this.read_global_param(type, ref, 1);
      }
    }
  }

  /**
   * 5.9.25 Global param syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#global-param-syntax)
   */
  read_global_param(type: number, ref: number, idx: number) {
    const fh = this.frameHeader;
    const gmp = this.frameHeader.global_motion_params;
    const psi = this.frameHeader.previous_segment_ids;

    let absBits = GM_ABS_ALPHA_BITS;
    let precBits = GM_ALPHA_PREC_BITS;
    if (idx < 2) {
      if (type == TRANSLATION) {
        absBits = GM_ABS_TRANS_ONLY_BITS - Number(!fh.allow_high_precision_mv);
        precBits = GM_TRANS_ONLY_PREC_BITS - Number(!fh.allow_high_precision_mv);
      } else {
        absBits = GM_ABS_TRANS_BITS;
        precBits = GM_TRANS_PREC_BITS;
      }
    }
    let precDiff = WARPEDMODEL_PREC_BITS - precBits;
    let round = idx % 3 == 2 ? 1 << WARPEDMODEL_PREC_BITS : 0;
    let sub = idx % 3 == 2 ? 1 << precBits : 0;
    let mx = 1 << absBits;
    let r = (psi.PrevGmParams[ref][idx] >> precDiff) - sub;
    gmp.gm_params[ref][idx] = (this.decode_signed_subexp_with_ref(-mx, mx + 1, r) << precDiff) + round;
  }

  /**
   * 5.9.26 Decode signed subexp with ref syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#decode-signed-subexp-with-ref-syntax)
   */
  decode_signed_subexp_with_ref(low: number, high: number, r: number) {
    let x = this.decode_unsigned_subexp_with_ref(high - low, r - low);
    return x + low;
  }

  /**
   * 5.9.27 Decode unsigned subexp with ref syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#decode-unsigned-subexp-with-ref-syntax)
   */
  decode_unsigned_subexp_with_ref(mx: number, r: number) {
    let v = this.decode_subexp(mx);
    if (r << 1 <= mx) {
      return this.inverse_recenter(r, v);
    } else {
      return mx - 1 - this.inverse_recenter(mx - 1 - r, v);
    }
  }

  /**
   * 5.9.28 Decode subexp syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#decode-subexp-syntax)
   */
  decode_subexp(numSyms: number) {
    const reader = this.decoder.reader;
    const f = reader.f;

    let i = 0;
    let mk = 0;
    let k = 3;
    while (1) {
      let b2 = i ? k + i - 1 : k;
      let a = 1 << b2;
      if (numSyms <= mk + 3 * a) {
        let subexp_final_bits = reader.ns(numSyms - mk);
        return subexp_final_bits + mk;
      } else {
        let subexp_more_bits = reader.f(1);
        if (subexp_more_bits) {
          i++;
          mk += a;
        } else {
          let subexp_bits = reader.f(b2);
          return subexp_bits + mk;
        }
      }
    }
    return 0;
  }

  /**
   * 5.9.29 Inverse recenter function
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-recenter-function)
   */
  inverse_recenter(r: number, v: number) {
    if (v > 2 * r) return v;
    else if (v & 1) return r - ((v + 1) >> 1);
    else return r + (v >> 1);
  }

  /**
   * 5.9.30 Film grain params syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#film-grain-params-syntax)
   */
  film_grain_params() {
    const reader = this.decoder.reader;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = this.decoder.sequenceHeaderObu.sequenceHeader.color_config;
    const fh = this.frameHeader;
    const fgp = this.frameHeader.film_grain_params;

    if (!seqHeader.film_grain_params_present || (!fh.show_frame && !fh.showable_frame)) {
      this.reset_grain_params();
      return;
    }
    fgp.apply_grain = reader.f(1);
    if (!fgp.apply_grain) {
      this.reset_grain_params();
      return;
    }
    fgp.grain_seed = reader.f(16);
    let update_grain = 1;
    if (fh.frame_type == FRAME_TYPE.INTER_FRAME) {
      update_grain = reader.f(1);
    }
    if (!update_grain) {
      fgp.film_grain_params_ref_idx = reader.f(3);
      assert(
        fh.ref_frame_idx.find((v) => fgp.film_grain_params_ref_idx == v),
        "It is a requirement of bitstream conformance that film_grain_params_ref_idx is equal to ref_frame_idx[ j ] for some value of j in the range 0 to REFS_PER_FRAME - 1"
      );
      let tempGrainSeed = fgp.grain_seed;
      this.load_grain_params(fgp.film_grain_params_ref_idx);
      fgp.grain_seed = tempGrainSeed;
      return;
    }
    fgp.num_y_points = reader.f(4);
    assert(fgp.num_y_points <= 14, "It is a requirement of bitstream conformance that num_y_points is less than or equal to 14.");
    for (let i = 0; i < fgp.num_y_points; i++) {
      fgp.point_y_value[i] = reader.f(8);
      if (i > 0) {
        assert(fgp.point_y_value[i] > fgp.point_y_value[i - 1], "it is a requirement of bitstream conformance that point_y_value[ i ] is greater than point_y_value[ i - 1 ]");
      }
      fgp.point_y_scaling[i] = reader.f(8);
    }
    if (cc.mono_chrome) {
      fgp.chroma_scaling_from_luma = 0;
    } else {
      fgp.chroma_scaling_from_luma = reader.f(1);
    }
    if (cc.mono_chrome || fgp.chroma_scaling_from_luma || (cc.subsampling_x == 1 && cc.subsampling_y == 1 && fgp.num_y_points == 0)) {
      fgp.num_cb_points = 0;
      fgp.num_cr_points = 0;
    } else {
      fgp.num_cb_points = reader.f(4);
      assert(fgp.num_cb_points <= 10, "It is a requirement of bitstream conformance that num_cb_points is less than or equal to 10");
      for (let i = 0; i < fgp.num_cb_points; i++) {
        fgp.point_cb_value[i] = reader.f(8);
        if (i > 0) {
          assert(
            fgp.point_cb_value[i] > fgp.point_cb_value[i - 1],
            "it is a requirement of bitstream conformance that point_cb_value[ i ] is greater than point_cb_value[ i - 1 ]."
          );
        }
        fgp.point_cb_scaling[i] = reader.f(8);
      }
      fgp.num_cr_points = reader.f(4);
      assert(fgp.num_cr_points <= 10, "It is a requirement of bitstream conformance that num_cr_points is less than or equal to 10");
      if (cc.subsampling_x == 1 && cc.subsampling_y == 1) {
        if (fgp.num_cb_points == 0) {
          assert(fgp.num_cr_points == 0, "it is a requirement of bitstream conformance that num_cr_points is equal to 0");
        }
        if (fgp.num_cb_points != 0) {
          assert(fgp.num_cr_points != 0, "it is a requirement of bitstream conformance that num_cr_points is not equal to 0");
        }
      }
      for (let i = 0; i < fgp.num_cr_points; i++) {
        fgp.point_cr_value[i] = reader.f(8);
        if (i > 0) {
          assert(
            fgp.point_cr_value[i] > fgp.point_cr_value[i - 1],
            "it is a requirement of bitstream conformance that point_cr_value[ i ] is greater than point_cr_value[ i - 1 ]"
          );
        }
        fgp.point_cr_scaling[i] = reader.f(8);
      }
    }
    fgp.grain_scaling_minus_8 = reader.f(2);
    fgp.ar_coeff_lag = reader.f(2);
    let numPosLuma = 2 * fgp.ar_coeff_lag * (fgp.ar_coeff_lag + 1);
    let numPosChroma;
    if (fgp.num_y_points) {
      numPosChroma = numPosLuma + 1;
      for (let i = 0; i < numPosLuma; i++) fgp.ar_coeffs_y_plus_128[i] = reader.f(8);
    } else {
      numPosChroma = numPosLuma;
    }
    if (fgp.chroma_scaling_from_luma || fgp.num_cb_points) {
      for (let i = 0; i < numPosChroma; i++) fgp.ar_coeffs_cb_plus_128[i] = reader.f(8);
    }
    if (fgp.chroma_scaling_from_luma || fgp.num_cr_points) {
      for (let i = 0; i < numPosChroma; i++) fgp.ar_coeffs_cr_plus_128[i] = reader.f(8);
    }
    fgp.ar_coeff_shift_minus_6 = reader.f(2);
    fgp.grain_scale_shift = reader.f(2);
    if (fgp.num_cb_points) {
      fgp.cb_mult = reader.f(8);
      fgp.cb_luma_mult = reader.f(8);
      fgp.cb_offset = reader.f(9);
    }
    if (fgp.num_cr_points) {
      fgp.cr_mult = reader.f(8);
      fgp.cr_luma_mult = reader.f(8);
      fgp.cr_offset = reader.f(9);
    }
    fgp.overlap_flag = reader.f(1);
    fgp.clip_to_restricted_range = reader.f(1);
  }

  /**
   * 5.9.30 Temporal point info syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#temporal-point-info-syntax)
   */
  temporal_point_info() {
    const reader = this.decoder.reader;
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const tpi = this.frameHeader.temporal_point_info;

    let n = seqHeader.decoder_model_info.frame_presentation_time_length_minus_1 + 1;
    tpi.frame_presentation_time = reader.f(n);
  }

  /**
   * 6.8.1 General frame header OBU semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#general-frame-header-obu-semantics)
   */
  frame_header_copy() {
    this.frameHeader = clone(this.frameHeader);
  }

  /**
   * 6.8.2 Uncompressed header semantics
   * setup_past_independence is a function call that indicates that this frame can be decoded without dependence on previous coded frames.
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#uncompressed-header-semantics)
   */
  setup_past_independence() {
    const cis = this.frameHeader.compute_image_size;
    const lfp = this.frameHeader.loop_filter_params;
    const sp = this.frameHeader.segmentation_params;
    const psi = this.frameHeader.previous_segment_ids;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;

    for (let i = 0; i < MAX_SEGMENTS; i++) {
      for (let j = 0; j < SEG_LVL_MAX; j++) {
        sp.FeatureData[i][j] = 0;
        sp.FeatureEnabled[i][j] = 0;
      }
    }
    db.PrevSegmentIds = Array2D(cis.MiRows, cis.MiCols, 0);
    for (let ref = REF_FRAME.LAST_FRAME; ref <= REF_FRAME.ALTREF_FRAME; ref++) {
      for (let i = 0; i <= 5; i++) {
        psi.PrevGmParams[ref][i] = i % 3 == 2 ? 1 << WARPEDMODEL_PREC_BITS : 0;
      }
    }
    lfp.loop_filter_delta_enabled = 1;
    lfp.loop_filter_ref_deltas[REF_FRAME.INTRA_FRAME] = 1;
    lfp.loop_filter_ref_deltas[REF_FRAME.LAST_FRAME] = 0;
    lfp.loop_filter_ref_deltas[REF_FRAME.LAST2_FRAME] = 0;
    lfp.loop_filter_ref_deltas[REF_FRAME.LAST3_FRAME] = 0;
    lfp.loop_filter_ref_deltas[REF_FRAME.BWDREF_FRAME] = 0;
    lfp.loop_filter_ref_deltas[REF_FRAME.GOLDEN_FRAME] = -1;
    lfp.loop_filter_ref_deltas[REF_FRAME.ALTREF_FRAME] = -1;
    lfp.loop_filter_ref_deltas[REF_FRAME.ALTREF2_FRAME] = -1;
    for (let i = 0; i <= 1; i++) {
      lfp.loop_filter_mode_deltas[i] = 0;
    }
  }

  /**
   * 6.8.2 Uncompressed header semantics
   * init_non_coeff_cdfs is a function call that indicates that the CDF tables which are not used in the coeff( ) syntax structure should be initialised.
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#uncompressed-header-semantics)
   */
  init_non_coeff_cdfs() {
    const ncc = this.frameHeader.non_coeff_cdfs;

    ncc.YModeCdf = inverseCdf(Default_Y_Mode_Cdf);
    ncc.UVModeCflNotAllowedCdf = inverseCdf(Default_Uv_Mode_Cfl_Not_Allowed_Cdf);
    ncc.UVModeCflAllowedCdf = inverseCdf(Default_Uv_Mode_Cfl_Allowed_Cdf);
    ncc.AngleDeltaCdf = inverseCdf(Default_Angle_Delta_Cdf);
    ncc.IntrabcCdf = inverseCdf(Default_Intrabc_Cdf);
    ncc.PartitionW8Cdf = inverseCdf(Default_Partition_W8_Cdf);
    ncc.PartitionW16Cdf = inverseCdf(Default_Partition_W16_Cdf);
    ncc.PartitionW32Cdf = inverseCdf(Default_Partition_W32_Cdf);
    ncc.PartitionW64Cdf = inverseCdf(Default_Partition_W64_Cdf);
    ncc.PartitionW128Cdf = inverseCdf(Default_Partition_W128_Cdf);
    ncc.SegmentIdCdf = inverseCdf(Default_Segment_Id_Cdf);
    ncc.SegmentIdPredictedCdf = inverseCdf(Default_Segment_Id_Predicted_Cdf);
    ncc.Tx8x8Cdf = inverseCdf(Default_Tx_8x8_Cdf);
    ncc.Tx16x16Cdf = inverseCdf(Default_Tx_16x16_Cdf);
    ncc.Tx32x32Cdf = inverseCdf(Default_Tx_32x32_Cdf);
    ncc.Tx64x64Cdf = inverseCdf(Default_Tx_64x64_Cdf);
    ncc.TxfmSplitCdf = inverseCdf(Default_Txfm_Split_Cdf);
    ncc.FilterIntraModeCdf = inverseCdf(Default_Filter_Intra_Mode_Cdf);
    ncc.FilterIntraCdf = inverseCdf(Default_Filter_Intra_Cdf);
    ncc.InterpFilterCdf = inverseCdf(Default_Interp_Filter_Cdf);
    ncc.MotionModeCdf = inverseCdf(Default_Motion_Mode_Cdf);
    ncc.NewMvCdf = inverseCdf(Default_New_Mv_Cdf);
    ncc.ZeroMvCdf = inverseCdf(Default_Zero_Mv_Cdf);
    ncc.RefMvCdf = inverseCdf(Default_Ref_Mv_Cdf);
    ncc.CompoundModeCdf = inverseCdf(Default_Compound_Mode_Cdf);
    ncc.DrlModeCdf = inverseCdf(Default_Drl_Mode_Cdf);
    ncc.IsInterCdf = inverseCdf(Default_Is_Inter_Cdf);
    ncc.CompModeCdf = inverseCdf(Default_Comp_Mode_Cdf);
    ncc.SkipModeCdf = inverseCdf(Default_Skip_Mode_Cdf);
    ncc.SkipCdf = inverseCdf(Default_Skip_Cdf);
    ncc.CompRefCdf = inverseCdf(Default_Comp_Ref_Cdf);
    ncc.CompBwdRefCdf = inverseCdf(Default_Comp_Bwd_Ref_Cdf);
    ncc.SingleRefCdf = inverseCdf(Default_Single_Ref_Cdf);

    for (let i = 0; i < MV_CONTEXTS; i++) {
      ncc.MvJointCdf[i] = inverseCdf(Default_Mv_Joint_Cdf);
    }
    for (let i = 0; i < MV_CONTEXTS; i++) {
      ncc.MvClassCdf[i] = inverseCdf(Default_Mv_Class_Cdf);
    }
    for (let i = 0; i < MV_CONTEXTS; i++) {
      for (let comp = 0; comp <= 1; comp++) {
        ncc.MvClass0BitCdf[i][comp] = inverseCdf(Default_Mv_Class0_Bit_Cdf);
      }
    }
    for (let i = 0; i < MV_CONTEXTS; i++) {
      ncc.MvFrCdf[i] = inverseCdf(Default_Mv_Fr_Cdf);
    }
    for (let i = 0; i < MV_CONTEXTS; i++) {
      ncc.MvClass0FrCdf[i] = inverseCdf(Default_Mv_Class0_Fr_Cdf);
    }
    for (let i = 0; i < MV_CONTEXTS; i++) {
      for (let comp = 0; comp <= 1; comp++) {
        ncc.MvClass0HpCdf[i][comp] = inverseCdf(Default_Mv_Class0_Hp_Cdf);
      }
    }
    for (let i = 0; i < MV_CONTEXTS; i++) {
      for (let comp = 0; comp <= 1; comp++) {
        ncc.MvSignCdf[i][comp] = inverseCdf(Default_Mv_Sign_Cdf);
      }
    }
    for (let i = 0; i < MV_CONTEXTS; i++) {
      for (let comp = 0; comp <= 1; comp++) {
        ncc.MvBitCdf[i][comp] = inverseCdf(Default_Mv_Bit_Cdf);
      }
    }
    for (let i = 0; i < MV_CONTEXTS; i++) {
      for (let comp = 0; comp <= 1; comp++) {
        ncc.MvHpCdf[i][comp] = inverseCdf(Default_Mv_Hp_Cdf);
      }
    }
    ncc.PaletteYModeCdf = inverseCdf(Default_Palette_Y_Mode_Cdf);
    ncc.PaletteUVModeCdf = inverseCdf(Default_Palette_Uv_Mode_Cdf);
    ncc.PaletteYSizeCdf = inverseCdf(Default_Palette_Y_Size_Cdf);
    ncc.PaletteUVSizeCdf = inverseCdf(Default_Palette_Uv_Size_Cdf);
    ncc.PaletteSize2YColorCdf = inverseCdf(Default_Palette_Size_2_Y_Color_Cdf);
    ncc.PaletteSize2UVColorCdf = inverseCdf(Default_Palette_Size_2_Uv_Color_Cdf);
    ncc.PaletteSize3YColorCdf = inverseCdf(Default_Palette_Size_3_Y_Color_Cdf);
    ncc.PaletteSize3UVColorCdf = inverseCdf(Default_Palette_Size_3_Uv_Color_Cdf);
    ncc.PaletteSize4YColorCdf = inverseCdf(Default_Palette_Size_4_Y_Color_Cdf);
    ncc.PaletteSize4UVColorCdf = inverseCdf(Default_Palette_Size_4_Uv_Color_Cdf);
    ncc.PaletteSize5YColorCdf = inverseCdf(Default_Palette_Size_5_Y_Color_Cdf);
    ncc.PaletteSize5UVColorCdf = inverseCdf(Default_Palette_Size_5_Uv_Color_Cdf);
    ncc.PaletteSize6YColorCdf = inverseCdf(Default_Palette_Size_6_Y_Color_Cdf);
    ncc.PaletteSize6UVColorCdf = inverseCdf(Default_Palette_Size_6_Uv_Color_Cdf);
    ncc.PaletteSize7YColorCdf = inverseCdf(Default_Palette_Size_7_Y_Color_Cdf);
    ncc.PaletteSize7UVColorCdf = inverseCdf(Default_Palette_Size_7_Uv_Color_Cdf);
    ncc.PaletteSize8YColorCdf = inverseCdf(Default_Palette_Size_8_Y_Color_Cdf);
    ncc.PaletteSize8UVColorCdf = inverseCdf(Default_Palette_Size_8_Uv_Color_Cdf);
    ncc.DeltaQCdf = inverseCdf(Default_Delta_Q_Cdf);
    ncc.DeltaLFCdf = inverseCdf(Default_Delta_Lf_Cdf);
    for (let i = 0; i < FRAME_LF_COUNT; i++) {
      ncc.DeltaLFMultiCdf[i] = inverseCdf(Default_Delta_Lf_Cdf);
    }
    ncc.IntraTxTypeSet1Cdf = inverseCdf(Default_Intra_Tx_Type_Set1_Cdf);
    ncc.IntraTxTypeSet2Cdf = inverseCdf(Default_Intra_Tx_Type_Set2_Cdf);
    ncc.InterTxTypeSet1Cdf = inverseCdf(Default_Inter_Tx_Type_Set1_Cdf);
    ncc.InterTxTypeSet2Cdf = inverseCdf(Default_Inter_Tx_Type_Set2_Cdf);
    ncc.InterTxTypeSet3Cdf = inverseCdf(Default_Inter_Tx_Type_Set3_Cdf);
    ncc.UseObmcCdf = inverseCdf(Default_Use_Obmc_Cdf);
    ncc.InterIntraCdf = inverseCdf(Default_Inter_Intra_Cdf);
    ncc.CompRefTypeCdf = inverseCdf(Default_Comp_Ref_Type_Cdf);
    ncc.CflSignCdf = inverseCdf(Default_Cfl_Sign_Cdf);
    ncc.UniCompRefCdf = inverseCdf(Default_Uni_Comp_Ref_Cdf);
    ncc.WedgeInterIntraCdf = inverseCdf(Default_Wedge_Inter_Intra_Cdf);
    ncc.CompGroupIdxCdf = inverseCdf(Default_Comp_Group_Idx_Cdf);
    ncc.CompoundIdxCdf = inverseCdf(Default_Compound_Idx_Cdf);
    ncc.CompoundTypeCdf = inverseCdf(Default_Compound_Type_Cdf);
    ncc.InterIntraModeCdf = inverseCdf(Default_Inter_Intra_Mode_Cdf);
    ncc.WedgeIndexCdf = inverseCdf(Default_Wedge_Index_Cdf);
    ncc.CflAlphaCdf = inverseCdf(Default_Cfl_Alpha_Cdf);
    ncc.UseWienerCdf = inverseCdf(Default_Use_Wiener_Cdf);
    ncc.UseSgrprojCdf = inverseCdf(Default_Use_Sgrproj_Cdf);
    ncc.RestorationTypeCdf = inverseCdf(Default_Restoration_Type_Cdf);
  }

  /**
   * 6.8.2 Uncompressed header semantics
   * init_coeff_cdfs( ) is a function call that indicates that the CDF tables used in the coeff( ) syntax structure should be initialised.
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#uncompressed-header-semantics)
   */
  init_coeff_cdfs() {
    const qp = this.frameHeader.quantization_params;
    const cc = this.frameHeader.coeff_cdfs;

    let idx = 3;
    if (qp.base_q_idx <= 20) {
      idx = 0;
    } else if (qp.base_q_idx <= 60) {
      idx = 1;
    } else if (qp.base_q_idx <= 120) {
      idx = 2;
    }

    cc.TxbSkipCdf = inverseCdf(Default_Txb_Skip_Cdf[idx]);
    cc.EobPt16Cdf = inverseCdf(Default_Eob_Pt_16_Cdf[idx]);
    cc.EobPt32Cdf = inverseCdf(Default_Eob_Pt_32_Cdf[idx]);
    cc.EobPt64Cdf = inverseCdf(Default_Eob_Pt_64_Cdf[idx]);
    cc.EobPt128Cdf = inverseCdf(Default_Eob_Pt_128_Cdf[idx]);
    cc.EobPt256Cdf = inverseCdf(Default_Eob_Pt_256_Cdf[idx]);
    cc.EobPt512Cdf = inverseCdf(Default_Eob_Pt_512_Cdf[idx]);
    cc.EobPt1024Cdf = inverseCdf(Default_Eob_Pt_1024_Cdf[idx]);
    cc.EobExtraCdf = inverseCdf(Default_Eob_Extra_Cdf[idx]);
    cc.DcSignCdf = inverseCdf(Default_Dc_Sign_Cdf[idx]);
    cc.CoeffBaseEobCdf = inverseCdf(Default_Coeff_Base_Eob_Cdf[idx]);
    cc.CoeffBaseCdf = inverseCdf(Default_Coeff_Base_Cdf[idx]);
    cc.CoeffBrCdf = inverseCdf(Default_Coeff_Br_Cdf[idx]);
  }

  /**
   * 6.8.2 Uncompressed header semantics
   * When this function is invoked, a copy of each CDF array mentioned in the semantics for init_coeff_cdfs and init_non_coeff_cdfs is loaded from an area of memory indexed by ctx.
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#uncompressed-header-semantics)
   */
  load_cdfs(ctx: number) {
    const fh = this.frameHeader;
    const ncc = fh.non_coeff_cdfs;
    const cc = fh.coeff_cdfs;
    const cncc = this._cache_non_coeff_cdfs[ctx];
    const ccc = this._cache_coeff_cdfs[ctx];

    clone_cdf(ncc, cncc, true);
    clone_cdf(cc, ccc, true);
  }

  /**
   * 6.8.2 Uncompressed header semantics
   * load_previous( ) is a function call that indicates that information from a previous frame may be loaded for use in decoding the current frame.
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#uncompressed-header-semantics)
   */
  load_previous() {
    const fh = this.frameHeader;
    const psi = this.frameHeader.previous_segment_ids;
    const rfl = this.decoder.referenceFrameLoading;

    let prevFrame = fh.ref_frame_idx[fh.primary_ref_frame];
    psi.PrevGmParams = psi.SavedGmParams[prevFrame];
    rfl.load_loop_filter_params(prevFrame);
    rfl.load_segmentation_params(prevFrame);
  }

  /**
   * 6.8.2 Uncompressed header semantics
   * load_previous_segment_ids( ) is a function call that indicates that a segmentation map from a previous frame may be loaded for use in decoding the current frame.
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#uncompressed-header-semantics)
   */
  load_previous_segment_ids() {
    const fh = this.frameHeader;
    const cis = this.frameHeader.compute_image_size;
    const sp = this.frameHeader.segmentation_params;
    const psi = this.frameHeader.previous_segment_ids;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;

    let prevFrame = fh.ref_frame_idx[fh.primary_ref_frame];
    if (sp.segmentation_enabled == 1) {
      psi.RefMiCols[prevFrame] = cis.MiCols;
      psi.RefMiRows[prevFrame] = cis.MiRows;
      for (let row = 0; row < cis.MiRows; row++) {
        for (let col = 0; col < cis.MiCols; col++) {
          db.PrevSegmentIds[row][col] = db.SavedSegmentIds[prevFrame][row][col];
        }
      }
    } else {
      for (let row = 0; row < cis.MiRows; row++) {
        for (let col = 0; col < cis.MiCols; col++) {
          db.PrevSegmentIds[row][col] = 0;
        }
      }
    }
  }

  /**
   * 6.8.20 Film grain params semantics
   * reset_grain_params() is a function call that indicates that all the syntax elements read in film_grain_params should be set equal to 0.
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#film-grain-params-semantics)
   */
  reset_grain_params() {
    const fgp = this.frameHeader.film_grain_params;

    fgp.apply_grain = 0;
    fgp.grain_seed = 0;
    fgp.film_grain_params_ref_idx = 0;
    fgp.num_y_points = 0;
    fgp.point_y_value = [];
    fgp.point_y_scaling = [];
    fgp.chroma_scaling_from_luma = 0;
    fgp.num_cb_points = 0;
    fgp.point_cb_value = [];
    fgp.point_cb_scaling = [];
    fgp.num_cr_points = 0;
    fgp.point_cr_value = [];
    fgp.point_cr_scaling = [];
    fgp.grain_scaling_minus_8 = 0;
    fgp.ar_coeff_lag = 0;
    fgp.ar_coeffs_y_plus_128 = [];
    fgp.ar_coeffs_cb_plus_128 = [];
    fgp.ar_coeffs_cr_plus_128 = [];
    fgp.ar_coeff_shift_minus_6 = 0;
    fgp.grain_scale_shift = 0;
    fgp.cb_mult = 0;
    fgp.cb_luma_mult = 0;
    fgp.cb_offset = 0;
    fgp.cr_mult = 0;
    fgp.cr_luma_mult = 0;
    fgp.overlap_flag = 0;
    fgp.clip_to_restricted_range = 0;
  }

  /**
   * 6.8.20 Film grain params semantics
   * load_grain_params(idx) is a function call that indicates that all the syntax elements read in film_grain_params should be set equal to the values stored in an area of memory indexed by idx.
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#film-grain-params-semantics)
   */
  load_grain_params(idx: number) {
    let fh = this.frameHeader;

    fh.film_grain_params = clone(this._cache_grain_params[idx]);
  }

  /**
   * 7.7 Frame end update CDF process
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#frame-end-update-cdf-process)
   */
  frame_end_update_cdf() {
    const fh = this.frameHeader;

    clone_cdf(fh.non_coeff_cdfs, fh.Saved_non_coeff_cdfs);
    clone_cdf(fh.coeff_cdfs, fh.Saved_coeff_cdfs);
  }

  /**
   * 7.20 Reference frame update process
   * save_cdfs( ctx ) is a function call that indicates that all the CDF arrays are saved into frame context number ctx in the range 0 to (NUM_REF_FRAMES - 1).
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#reference-frame-update-process)
   */
  save_cdfs(ctx: number) {
    const fh = this.frameHeader;
    const ncc = fh.non_coeff_cdfs;
    const cc = fh.coeff_cdfs;
    const tncc = {} as any;
    const tcc = {} as any;

    clone_cdf(tncc, ncc);
    clone_cdf(tcc, cc);

    this._cache_non_coeff_cdfs[ctx] = tncc;
    this._cache_coeff_cdfs[ctx] = tcc;
  }

  /**
   * 7.20 Reference frame update process
   * save_grain_params( i ) is a function call that indicates that all the syntax elements that can be read in film_grain_params should be saved into an area of memory indexed by i.
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#reference-frame-update-process)
   */
  save_grain_params(i: number) {
    let fgp = this.frameHeader.film_grain_params;

    this._cache_grain_params[i] = clone(fgp);
  }

  /**
   * 7.20 Reference frame update process
   * save_loop_filter_params( i ) is a function call that indicates that the values of loop_filter_ref_deltas[ j ] for j = 0 .. TOTAL_REFS_PER_FRAME-1, and the values of loop_filter_mode_deltas[ j ] for j = 0 .. 1 should be saved into an area of memory indexed by i.
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#reference-frame-update-process)
   */
  save_loop_filter_params(i: number) {
    let lfp = this.frameHeader.loop_filter_params;

    let loop_filter_ref_deltas: number[] = [];
    for (let j = 0; j < TOTAL_REFS_PER_FRAME; j++) {
      loop_filter_ref_deltas[j] = lfp.loop_filter_ref_deltas[j];
    }
    let loop_filter_mode_deltas: number[] = [];
    for (let j = 0; j <= 1; j++) {
      loop_filter_mode_deltas[j] = lfp.loop_filter_mode_deltas[j];
    }

    this._cache_loop_filter_ref_deltas[i] = loop_filter_ref_deltas;
    this._cache_loop_filter_mode_deltas[i] = loop_filter_mode_deltas;
  }

  /**
   * 7.20 Reference frame update process
   * save_segmentation_params( i ) is a function call that indicates that the values of FeatureEnabled[ j ][ k ] and FeatureData[ j ][ k ] for j = 0 .. MAX_SEGMENTS-1, for k = 0 .. SEG_LVL_MAX-1 should be saved into an area of memory indexed by i.
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#reference-frame-update-process)
   */
  save_segmentation_params(i: number) {
    const sp = this.frameHeader.segmentation_params;

    let FeatureEnabled = Array2D(MAX_SEGMENTS);
    let FeatureData = Array2D(MAX_SEGMENTS);
    for (let j = 0; j < MAX_SEGMENTS; j++) {
      for (let k = 0; k < SEG_LVL_MAX; k++) {
        FeatureEnabled[j][k] = sp.FeatureEnabled[j][k];
        FeatureData[j][k] = sp.FeatureData[j][k];
      }
    }
    this._cache_FeatureEnabled[i] = FeatureEnabled;
    this._cache_FeatureData[i] = FeatureData;
  }

  /**
   * 8.2.4 Exit process for symbol decoder
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#frame-end-update-cdf-process)
   */
  frame_end_saved_cdf() {
    const fh = this.frameHeader;
    const sd = this.decoder.symbolDecoder;
    const tncc = sd.Tile_non_coeff_cdfs;
    const tcc = sd.Tile_coeff_cdfs;
    const sncc = {} as any;
    const scc = {} as any;

    clone_cdf(sncc, tncc);
    clone_cdf(scc, tcc);

    fh.Saved_non_coeff_cdfs = sncc;
    fh.Saved_coeff_cdfs = scc;
  }
}

interface FrameHeader {
  /**
   * 6.8.1 General frame header OBU semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#general-frame-header-obu-semantics)
   */
  TileNum: number;

  /**
   * 6.8.2 Uncompressed header semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#uncompressed-header-semantics)
   */
  show_existing_frame: number;
  frame_to_show_map_idx: number;
  display_frame_id: number;
  frame_type: FRAME_TYPE;
  show_frame: number;
  showable_frame: number;
  error_resilient_mode: number;
  disable_cdf_update: 0 | 1;
  current_frame_id: number;
  frame_size_override_flag: 0 | 1;
  OrderHint: number;
  primary_ref_frame: number;
  buffer_removal_time: number[];
  allow_screen_content_tools: number;
  allow_intrabc: number;
  force_integer_mv: number;
  ref_order_hint: number[];
  refresh_frame_flags: number;
  frame_refs_short_signaling: number;
  last_frame_idx: number;
  gold_frame_idx: number;
  ref_frame_idx: number[];
  RefFrameSignBias: number[];
  DeltaFrameId: number;
  RefFrameId: number[];
  allow_high_precision_mv: number;
  is_motion_mode_switchable: 0 | 1;
  use_ref_frame_mvs: 0 | 1;
  disable_frame_end_update_cdf: 0 | 1;
  OrderHints: number[];
  CodedLossless: number;
  AllLossless: number;
  allow_warped_motion: number;
  reduced_tx_set: number;
  RefOrderHint: number[];
  FrameIsIntra: number;
  PrevFrameID: number;
  LosslessArray: number[];
  SegQMLevel: number[][];

  /**
   * 6.8.2 Uncompressed header semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#uncompressed-header-semantics)
   */
  non_coeff_cdfs: NonCoeffCdfs;
  coeff_cdfs: CoeffCdfs;
  previous_segment_ids: {
    PrevGmParams: number[][];
    RefMiCols: number[];
    RefMiRows: number[];
    SavedGmParams: number[][][];
  };

  /**
   * 6.8.3 Reference frame marking semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#reference-frame-marking-semantics)
   */
  reference_frame_marking: {
    RefValid: number[];
  };

  /**
   * 6.8.4 Frame size semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#frame-size-semantics)
   */
  frame_size: {
    frame_width_minus_1: number;
    frame_height_minus_1: number;
    FrameWidth: number;
    FrameHeight: number;
  };

  /**
   * 6.8.5 Render size semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#render-size-semantics)
   */
  render_size: {
    RenderWidth: number;
    RenderHeight: number;
  };

  /**
   * 6.8.6 Frame size with refs semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#frame-size-with-refs-semantics)
   */
  frame_size_with_refs: {
    UpscaledWidth: number;
    found_ref: number;
  };

  /**
   * 6.8.7 Superres params semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#superres-params-semantics)
   */
  superres_params: {
    use_superres: 0 | 1;
    SuperresDenom: number;
  };

  /**
   * 6.8.8 Compute image size semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#compute-image-size-semantics)
   */
  compute_image_size: {
    MiCols: number;
    MiRows: number;
  };

  /**
   * 6.8.9 Interpolation filter semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#interpolation-filter-semantics)
   */
  interpolation_filter: {
    interpolation_filter: INTERPOLATION_FILTER;
  };

  /**
   * 6.8.10 Loop filter semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#loop-filter-semantics)
   */
  loop_filter_params: {
    loop_filter_level: number[];
    loop_filter_sharpness: number;
    loop_filter_delta_enabled: 0 | 1;
    loop_filter_ref_deltas: number[];
    loop_filter_mode_deltas: number[];
  };

  /**
   * 6.8.11 Quantization params semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#quantization-params-semantics)
   */
  quantization_params: {
    base_q_idx: number;
    DeltaQYDc: number;
    DeltaQUDc: number;
    DeltaQUAc: number;
    DeltaQVDc: number;
    DeltaQVAc: number;
    using_qmatrix: number;
    qm_y: number;
    qm_u: number;
    qm_v: number;
  };

  /**
   * 6.8.13 Segmentation params semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#segmentation-params-semantics)
   */
  segmentation_params: {
    SegIdPreSkip: number;
    LastActiveSegId: number;
    segmentation_enabled: 0 | 1;
    segmentation_update_map: number;
    segmentation_temporal_update: number;
    FeatureEnabled: number[][];
    FeatureData: number[][];
  };

  /**
   * 6.8.14 Tile info semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#tile-info-semantics)
   */
  tile_info: {
    TileColsLog2: number;
    TileCols: number;
    TileRowsLog2: number;
    TileRows: number;
    MiColStarts: number[];
    MiRowStarts: number[];
    context_update_tile_id: number;
    TileSizeBytes: number;
  };

  /**
   * 6.8.15 Quantizer index delta parameters semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#quantizer-index-delta-parameters-semantics)
   */
  delta_q_params: {
    delta_q_present: number;
    delta_q_res: number;
  };

  /**
   * 6.8.16 Loop filter delta parameters semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#loop-filter-delta-parameters-semantics)
   */
  delta_lf_params: {
    delta_lf_present: number;
    delta_lf_res: number;
    delta_lf_multi: number;
  };

  /**
   * 6.8.17 Global motion params semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#global-motion-params-semantics)
   */
  global_motion_params: {
    gm_params: number[][];
    GmType: number[];
  };

  /**
   * 6.8.20 Film grain params semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#film-grain-params-semantics)
   */
  film_grain_params: FilmGrainParams;

  /**
   * 6.8.21 TX mode semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#tx-mode-semantics)
   */
  read_tx_mode: {
    TxMode: TX_MODE;
  };

  /**
   * 6.8.22 Skip mode params semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#skip-mode-params-semantics)
   */
  skip_mode_params: {
    SkipModeFrame: REF_FRAME[];
    skip_mode_present: number;
  };

  /**
   * 6.8.23 Frame reference mode semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#frame-reference-mode-semantics)
   */
  frame_reference_mode: {
    reference_select: number;
  };

  /**
   * 6.8.24 Temporal point info semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#temporal-point-info-semantics)
   */
  temporal_point_info: {
    frame_presentation_time: number;
  };

  /**
   * 8.2.4 Exit process for symbol decoder
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#exit-process-for-symbol-decoder)
   */
  Saved_non_coeff_cdfs: NonCoeffCdfs;
  Saved_coeff_cdfs: CoeffCdfs;

  ref_frames: {
    RefFrameType: FRAME_TYPE[];
    RefFrameWidth: number[];
    RefFrameHeight: number[];
    RefRenderWidth: number[];
    RefRenderHeight: number[];
    RefUpscaledWidth: number[];
  };
}

interface FilmGrainParams {
  apply_grain: number;
  grain_seed: number;
  film_grain_params_ref_idx: number;
  num_y_points: number;
  point_y_value: number[];
  point_y_scaling: number[];
  chroma_scaling_from_luma: number;
  num_cb_points: number;
  point_cb_value: number[];
  point_cb_scaling: number[];
  num_cr_points: number;
  point_cr_value: number[];
  point_cr_scaling: number[];
  grain_scaling_minus_8: number;
  ar_coeff_lag: number;
  ar_coeffs_y_plus_128: number[];
  ar_coeffs_cb_plus_128: number[];
  ar_coeffs_cr_plus_128: number[];
  ar_coeff_shift_minus_6: number;
  grain_scale_shift: number;
  cb_mult: number;
  cb_luma_mult: number;
  cb_offset: number;
  cr_mult: number;
  cr_luma_mult: number;
  cr_offset: number;
  overlap_flag: 0 | 1;
  clip_to_restricted_range: number;
}

/**
 * 5.10 Frame OBU syntax
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#frame-obu-syntax)
 */
export class FrameObu {
  private decoder: AV1Decoder;

  constructor(d: AV1Decoder) {
    this.decoder = d;
  }

  frame_obu(sz: number) {
    const reader = this.decoder.reader;

    let startBitPos = reader.get_position();
    this.decoder.frameHeaderObu.frame_header_obu();
    this.decoder.obu.byte_alignment();
    let endBitPos = reader.get_position();
    let headerBytes = (endBitPos - startBitPos) / 8;
    sz -= headerBytes;
    this.decoder.tileGroupObu.tile_group_obu(sz);
  }
}


const Segmentation_Feature_Bits = [8, 6, 6, 6, 6, 3, 0, 0];
const Segmentation_Feature_Signed = [1, 1, 1, 1, 1, 0, 0, 0];
const Segmentation_Feature_Max = [255, MAX_LOOP_FILTER, MAX_LOOP_FILTER, MAX_LOOP_FILTER, MAX_LOOP_FILTER, 7, 0, 0];
