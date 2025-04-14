import { assert } from "console";
import { SELECT_INTEGER_MV, SELECT_SCREEN_CONTENT_TOOLS, UINT32_MAX } from "../define";
import { AV1Decoder } from "./Obu";
import { CHROMA_SAMPLE_POSITION, COLOR_PRIMARIES, MATRIX_COEFFICIENTS, TRANSFER_CHARACTERISTICS } from "./Semantics";

/**
 * 5.5 Sequence header OBU syntax
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#sequence-header-obu-syntax)
 */
export class SequenceHeaderObu {
  sequenceHeader: SequenceHeader;
  private decoder: AV1Decoder;

  constructor(d: AV1Decoder) {
    this.sequenceHeader = {
      operating_point_idc: [],
      seq_level_idx: [],
      seq_tier: [],
      decoder_model_present_for_this_op: [],
      initial_display_delay_minus_1: [],
      color_config: {},
      timing_info: {},
      decoder_model_info: {},
      operating_parameters_info: [],
    } as any;

    this.decoder = d;
  }

  /**
   * 5.5.1 General sequence header OBU syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#general-sequence-header-obu-syntax)
   */
  sequence_header_obu() {
    const reader = this.decoder.reader;
    const seqHeader = this.sequenceHeader;

    /** +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *  | seq_profile | BitDepth  | Monochrome support|        Chroma subsampling       |
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     *  |      0      |  8 or 10  |        yes        |            YUV 4:2:0            |
     *  |      1      |  8 or 10  |        no         |            YUV 4:4:4            |
     *  |      2      |  8 or 10  |        yes        |            YUV 4:2:2            |
     *  |      2      |    12     |        yes        | YUV 4:2:0, YUV 4:2:2, YUV 4:4:4 |
     *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
     */
    seqHeader.seq_profile = reader.f(3);
    assert(seqHeader.seq_profile <= 2, "It is a requirement of bitstream conformance that seq_profile is not greater than 2.");
    seqHeader.still_picture = reader.f(1);
    seqHeader.reduced_still_picture_header = reader.f(1);
    if (seqHeader.reduced_still_picture_header == 1) {
      assert(seqHeader.still_picture == 1, "If reduced_still_picture_header is equal to 1, it is a requirement of bitstream conformance that still_picture is equal to 1.");
    }

    if (seqHeader.reduced_still_picture_header) {
      seqHeader.timing_info_present_flag = 0;
      seqHeader.decoder_model_info_present_flag = 0;
      seqHeader.initial_display_delay_present_flag = 0;
      seqHeader.operating_points_cnt_minus_1 = 0;
      seqHeader.operating_point_idc[0] = 0;
      seqHeader.seq_level_idx[0] = reader.f(5);
      seqHeader.seq_tier[0] = 0;
      seqHeader.decoder_model_present_for_this_op[0] = 0;
    } else {
      seqHeader.timing_info_present_flag = reader.f(1);
      if (seqHeader.timing_info_present_flag) {
        this.timing_info();
        seqHeader.decoder_model_info_present_flag = reader.f(1);
        if (seqHeader.decoder_model_info_present_flag) {
          this.decoder_model_info();
        }
      } else {
        seqHeader.decoder_model_info_present_flag = 0;
      }
      seqHeader.initial_display_delay_present_flag = reader.f(1);
      seqHeader.operating_points_cnt_minus_1 = reader.f(5);
      for (let i = 0; i <= seqHeader.operating_points_cnt_minus_1; i++) {
        seqHeader.operating_point_idc[i] = reader.f(12);
        seqHeader.seq_level_idx[i] = reader.f(5);
        if (seqHeader.seq_level_idx[i] > 7) {
          seqHeader.seq_tier[i] = reader.f(1);
        } else {
          seqHeader.seq_tier[i] = 0;
        }
        if (seqHeader.decoder_model_info_present_flag) {
          seqHeader.decoder_model_present_for_this_op[i] = reader.f(1);
          if (seqHeader.decoder_model_present_for_this_op[i]) {
            this.operating_parameters_info(i);
          }
        } else {
          seqHeader.decoder_model_present_for_this_op[i] = 0;
        }

        if (seqHeader.initial_display_delay_present_flag) {
          let initial_display_delay_present_for_this_op = reader.f(1);
          if (initial_display_delay_present_for_this_op) {
            seqHeader.initial_display_delay_minus_1[i] = reader.f(4);
          }
        }
      }
      assert(
        new Set(seqHeader.operating_point_idc).size == seqHeader.operating_point_idc.length,
        "This constraint means it is not allowed for two operating points to have the same value of operating_point_idc."
      );
    }
    let operatingPoint = this.choose_operating_point();
    seqHeader.OperatingPointIdc = seqHeader.operating_point_idc[operatingPoint];

    seqHeader.frame_width_bits_minus_1 = reader.f(4);
    seqHeader.frame_height_bits_minus_1 = reader.f(4);
    seqHeader.max_frame_width_minus_1 = reader.f(seqHeader.frame_width_bits_minus_1 + 1);
    seqHeader.max_frame_height_minus_1 = reader.f(seqHeader.frame_height_bits_minus_1 + 1);
    if (seqHeader.reduced_still_picture_header) {
      seqHeader.frame_id_numbers_present_flag = 0;
    } else {
      seqHeader.frame_id_numbers_present_flag = reader.f(1);
    }
    if (seqHeader.frame_id_numbers_present_flag) {
      seqHeader.delta_frame_id_length_minus_2 = reader.f(4);
      seqHeader.additional_frame_id_length_minus_1 = reader.f(3);
    }

    seqHeader.use_128x128_superblock = reader.f(1);
    seqHeader.enable_filter_intra = reader.f(1);
    seqHeader.enable_intra_edge_filter = reader.f(1);
    if (seqHeader.reduced_still_picture_header) {
      seqHeader.enable_interintra_compound = 0;
      seqHeader.enable_masked_compound = 0;
      seqHeader.enable_warped_motion = 0;
      seqHeader.enable_dual_filter = 0;
      seqHeader.enable_order_hint = 0;
      seqHeader.enable_jnt_comp = 0;
      seqHeader.enable_ref_frame_mvs = 0;
      seqHeader.seq_force_screen_content_tools = SELECT_SCREEN_CONTENT_TOOLS;
      seqHeader.seq_force_integer_mv = SELECT_INTEGER_MV;
      seqHeader.OrderHintBits = 0;
    } else {
      seqHeader.enable_interintra_compound = reader.f(1);
      seqHeader.enable_masked_compound = reader.f(1);
      seqHeader.enable_warped_motion = reader.f(1);
      seqHeader.enable_dual_filter = reader.f(1);
      seqHeader.enable_order_hint = reader.f(1);
      if (seqHeader.enable_order_hint) {
        seqHeader.enable_jnt_comp = reader.f(1);
        seqHeader.enable_ref_frame_mvs = reader.f(1);
      } else {
        seqHeader.enable_jnt_comp = 0;
        seqHeader.enable_ref_frame_mvs = 0;
      }
      let seq_choose_screen_content_tools = reader.f(1);
      if (seq_choose_screen_content_tools) {
        seqHeader.seq_force_screen_content_tools = SELECT_SCREEN_CONTENT_TOOLS;
      } else {
        seqHeader.seq_force_screen_content_tools = reader.f(1);
      }
      if (seqHeader.seq_force_screen_content_tools > 0) {
        let seq_choose_integer_mv = reader.f(1);
        if (seq_choose_integer_mv) {
          seqHeader.seq_force_integer_mv = SELECT_INTEGER_MV;
        } else {
          seqHeader.seq_force_integer_mv = reader.f(1);
        }
      } else {
        seqHeader.seq_force_integer_mv = SELECT_INTEGER_MV;
      }
      if (seqHeader.enable_order_hint) {
        let order_hint_bits_minus_1 = reader.f(3);
        seqHeader.OrderHintBits = order_hint_bits_minus_1 + 1;
      } else {
        seqHeader.OrderHintBits = 0;
      }
    }
    seqHeader.enable_superres = reader.f(1);
    seqHeader.enable_cdef = reader.f(1);
    seqHeader.enable_restoration = reader.f(1);

    this.color_config();
    seqHeader.film_grain_params_present = reader.f(1);
  }

  /**
   * 5.5.2 Color config syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#color-config-syntax)
   */
  color_config() {
    const reader = this.decoder.reader;
    const cc = this.sequenceHeader.color_config;
    const seqHeader = this.sequenceHeader;

    let high_bitdepth = reader.f(1);
    if (seqHeader.seq_profile == 2 && high_bitdepth) {
      let twelve_bit = reader.f(1);
      cc.BitDepth = twelve_bit ? 12 : 10;
    } else if (seqHeader.seq_profile <= 2) {
      cc.BitDepth = high_bitdepth ? 10 : 8;
    }
    if (seqHeader.seq_profile == 1) {
      cc.mono_chrome = 0;
    } else {
      cc.mono_chrome = reader.f(1);
    }
    cc.NumPlanes = cc.mono_chrome ? 1 : 3;
    let color_description_present_flag = reader.f(1);
    let color_primaries = COLOR_PRIMARIES.CP_UNSPECIFIED;
    let transfer_characteristics = TRANSFER_CHARACTERISTICS.TC_UNSPECIFIED;
    if (color_description_present_flag) {
      /**
       *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       *  | color_primaries | Name of color primaries | Description                                     |
       *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       *  |        1        |     CP_BT_709           | BT.709                                          |
       *  |        2        |     CP_UNSPECIFIED      | Unspecified                                     |
       *  |        4        |     CP_BT_470_M         | BT.470 System M (historical)                    |
       *  |        5        |     CP_BT_470_B_G       | BT.470 System B, G (historical)                 |
       *  |        6        |     CP_BT_601           | BT.601                                          |
       *  |        7        |     CP_SMPTE_240        | SMPTE 240                                       |
       *  |        8        |     CP_GENERIC_FILM     | Generic film (color filters using illuminant C) |
       *  |        9        |     CP_BT_2020          | BT.2020, BT.2100                                |
       *  |        10       |     CP_XYZ              | SMPTE 428 (CIE 1921 XYZ)                        |
       *  |        11       |     CP_SMPTE_431        | SMPTE RP 431-2                                  |
       *  |        12       |     CP_SMPTE_432        | SMPTE EG 432-1                                  |
       *  |        22       |     CP_EBU_3213         | EBU Tech. 3213-E                                |
       *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       */
      color_primaries = reader.f(8);
      transfer_characteristics = reader.f(8);
      cc.matrix_coefficients = reader.f(8);
    } else {
      color_primaries = COLOR_PRIMARIES.CP_UNSPECIFIED;
      transfer_characteristics = TRANSFER_CHARACTERISTICS.TC_UNSPECIFIED;
      cc.matrix_coefficients = MATRIX_COEFFICIENTS.MC_UNSPECIFIED;
    }
    if (cc.mono_chrome) {
      cc.color_range = reader.f(1);
      /**
       *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       *  | subsampling_x | subsampling_y | mono_chrome |   Description   |
       *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       *  |       0       |       0       |      0      |    YUV 4:4:4    |
       *  |       1       |       0       |      0      |    YUV 4:2:2    |
       *  |       1       |       1       |      0      |    YUV 4:2:0    |
       *  |       1       |       1       |      1      | Monochrome 4:0:0|
       *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
       */
      cc.subsampling_x = 1;
      cc.subsampling_y = 1;
      cc.chroma_sample_position = CHROMA_SAMPLE_POSITION.CSP_UNKNOWN;
      cc.separate_uv_delta_q = 0;
      return;
    } else if (
      color_primaries == COLOR_PRIMARIES.CP_BT_709 &&
      transfer_characteristics == TRANSFER_CHARACTERISTICS.TC_SRGB &&
      cc.matrix_coefficients == MATRIX_COEFFICIENTS.MC_IDENTITY
    ) {
      cc.color_range = 1;
      cc.subsampling_x = 0;
      cc.subsampling_y = 0;
    } else {
      cc.color_range = reader.f(1);
      if (seqHeader.seq_profile == 0) {
        cc.subsampling_x = 1;
        cc.subsampling_y = 1;
      } else if (seqHeader.seq_profile == 1) {
        cc.subsampling_x = 0;
        cc.subsampling_y = 0;
      } else {
        if (cc.BitDepth == 12) {
          cc.subsampling_x = reader.f(1);
          if (cc.subsampling_x) cc.subsampling_y = reader.f(1);
          else cc.subsampling_y = 0;
        } else {
          cc.subsampling_x = 1;
          cc.subsampling_y = 0;
        }
      }
      if (cc.subsampling_x && cc.subsampling_y) {
        cc.chroma_sample_position = reader.f(2);
      }
    }
    cc.separate_uv_delta_q = reader.f(1);
    if (cc.matrix_coefficients == MATRIX_COEFFICIENTS.MC_IDENTITY) {
      assert(
        cc.subsampling_x == 0 && cc.subsampling_y == 0,
        "If matrix_coefficients is equal to MC_IDENTITY, it is a requirement of bitstream conformance that subsampling_x is equal to 0 and subsampling_y is equal to 0."
      );
    }
  }

  /**
   * 5.5.3 Timing info syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#timing-info-syntax)
   */
  timing_info() {
    const reader = this.decoder.reader;
    const f = reader.f;
    const ti = this.sequenceHeader.timing_info;

    ti.num_units_in_display_tick = reader.f(32);
    assert(ti.num_units_in_display_tick > 0, "It is a requirement of bitstream conformance that num_units_in_display_tick is greater than 0.");
    ti.time_scale = reader.f(32);
    assert(ti.time_scale > 0, "It is a requirement of bitstream conformance that time_scale is greater than 0.");
    ti.equal_picture_interval = reader.f(1);
    if (ti.equal_picture_interval) {
      ti.num_ticks_per_picture_minus_1 = reader.uvlc();
      assert(
        ti.num_ticks_per_picture_minus_1 >= 0 && ti.num_ticks_per_picture_minus_1 < UINT32_MAX,
        "It is a requirement of bitstream conformance that the value of num_ticks_per_picture_minus_1 shall be in the range of 0 to (1 << 32) - 2, inclusive."
      );
    }
    ti.DispCT = ti.num_units_in_display_tick / ti.time_scale;
  }

  /**
   * 5.5.4 Decoder model info syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#decoder-model-info-syntax)
   */
  decoder_model_info() {
    const reader = this.decoder.reader;
    const ti = this.sequenceHeader.timing_info;
    const dmi = this.sequenceHeader.decoder_model_info;

    dmi.buffer_delay_length_minus_1 = reader.f(5);
    let num_units_in_decoding_tick = reader.f(32);
    if (num_units_in_decoding_tick <= 0) {
      throw "num_units_in_decoding_tick shall be greater than 0";
    }
    dmi.buffer_removal_time_length_minus_1 = reader.f(5);
    dmi.frame_presentation_time_length_minus_1 = reader.f(5);
    dmi.DecCT = num_units_in_decoding_tick / ti.time_scale;
  }

  /**
   * 5.5.5 Operating parameters info syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#operating-parameters-info-syntax)
   */
  operating_parameters_info(op: number) {
    const reader = this.decoder.reader;
    const dmi = this.sequenceHeader.decoder_model_info;
    const opi = this.sequenceHeader.operating_parameters_info[op];

    let n = dmi.buffer_delay_length_minus_1 + 1;
    opi.decoder_buffer_delay = reader.f(n);
    opi.encoder_buffer_delay = reader.f(n);
    opi.low_delay_mode_flag = reader.f(1);
  }

  /**
   * 6.4.1 General sequence header OBU semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#general-sequence-header-obu-semantics)
   */
  choose_operating_point() {
    // TODO
    return 0;
  }
}

/**
 * 6.4 Sequence header OBU semantics
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#sequence-header-obu-semantics)
 */
interface SequenceHeader {
  /**
   * 6.4.1 General sequence header OBU semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#general-sequence-header-obu-semantics)
   */
  seq_profile: number;
  still_picture: number;
  reduced_still_picture_header: number;
  timing_info_present_flag: number;
  decoder_model_info_present_flag: number;
  initial_display_delay_present_flag: number;
  operating_points_cnt_minus_1: number;
  operating_point_idc: number[];
  seq_level_idx: number[];
  seq_tier: number[];
  decoder_model_present_for_this_op: number[];
  initial_display_delay_minus_1: number[];
  OperatingPointIdc: number;
  frame_width_bits_minus_1: number;
  frame_height_bits_minus_1: number;
  max_frame_width_minus_1: number;
  max_frame_height_minus_1: number;
  frame_id_numbers_present_flag: number;
  additional_frame_id_length_minus_1: number;
  delta_frame_id_length_minus_2: number;
  use_128x128_superblock: number;
  enable_filter_intra: number;
  enable_intra_edge_filter: number;
  enable_interintra_compound: number;
  enable_masked_compound: number;
  enable_warped_motion: number;
  enable_order_hint: number;
  enable_dual_filter: number;
  enable_jnt_comp: number;
  enable_ref_frame_mvs: number;
  seq_force_screen_content_tools: number;
  seq_force_integer_mv: number;
  OrderHintBits: number;
  enable_superres: number;
  enable_cdef: number;
  enable_restoration: number;
  film_grain_params_present: number;

  /**
   * 6.4.2 Color config semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#color-config-semantics)
   */
  color_config: {
    mono_chrome: number;
    matrix_coefficients: MATRIX_COEFFICIENTS;
    color_range: number;
    subsampling_x: number;
    subsampling_y: number;
    chroma_sample_position: CHROMA_SAMPLE_POSITION;
    separate_uv_delta_q: number;
    BitDepth: number;
    NumPlanes: number;
  };

  /**
   * 6.4.3 Timing info semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#timing-info-semantics)
   */
  timing_info: {
    num_units_in_display_tick: number;
    time_scale: number;
    equal_picture_interval: number;
    num_ticks_per_picture_minus_1: number;
    DispCT: number;
  };

  /**
   * 6.4.4 Decoder model info semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#decoder-model-info-semantics)
   */
  decoder_model_info: {
    buffer_delay_length_minus_1: number;
    buffer_removal_time_length_minus_1: number;
    frame_presentation_time_length_minus_1: number;
    DecCT: number;
  };

  /**
   * 6.4.5 Operating parameters info semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#operating-parameters-info-semantics)
   */
  operating_parameters_info: {
    decoder_buffer_delay: number;
    encoder_buffer_delay: number;
    low_delay_mode_flag: number;
  }[];
}
