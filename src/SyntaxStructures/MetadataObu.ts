import { Array2D } from "../Conventions";
import { AV1Decoder } from "./Obu";
import { METADATA_TYPE, SCALABILITY_MODE_IDC } from "./Semantics";

/**
 * 5.8 Metadata OBU syntax
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#metadata-obu-syntax)
 */
export class MetadataObu {
  metadata: Metadata;
  private decoder: AV1Decoder;

  constructor(d: AV1Decoder) {
    this.metadata = {
      metadata_itut_t35: {},
      metadata_hdr_cll: {},
      metadata_hdr_mdcv: {
        primary_chromaticity_x: [],
        primary_chromaticity_y: [],
      },
      metadata_scalability: {},
      scalability_structure: {
        spatial_layer_max_width: [],
        spatial_layer_max_height: [],
        spatial_layer_ref_id: [],
        temporal_group_temporal_id: [],
        temporal_group_temporal_switching_up_point_flag: [],
        temporal_group_spatial_switching_up_point_flag: [],
        temporal_group_ref_cnt: [],
        temporal_group_ref_pic_diff: Array2D(255),
      },
      metadata_timecode: {},
    } as any;

    this.decoder = d;
  }

  /**
   * 5.8.1 General metadata OBU syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#general-metadata-obu-syntax)
   */
  metadata_obu() {
    const reader = this.decoder.reader;
    const m = this.metadata;

    m.metadata_type = reader.leb128();
    if (m.metadata_type == METADATA_TYPE.METADATA_TYPE_ITUT_T35) this.metadata_itut_t35();
    else if (m.metadata_type == METADATA_TYPE.METADATA_TYPE_HDR_CLL) this.metadata_hdr_cll();
    else if (m.metadata_type == METADATA_TYPE.METADATA_TYPE_HDR_MDCV) this.metadata_hdr_mdcv();
    else if (m.metadata_type == METADATA_TYPE.METADATA_TYPE_SCALABILITY) this.metadata_scalability();
    else if (m.metadata_type == METADATA_TYPE.METADATA_TYPE_TIMECODE) this.metadata_timecode();
  }

  /**
   * 5.8.2 Metadata ITUT T35 syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#metadata-itut-t35-syntax)
   */
  metadata_itut_t35() {
    const reader = this.decoder.reader;
    const mit35 = this.metadata.metadata_itut_t35;

    mit35.itu_t_t35_country_code = reader.f(8);
    if (mit35.itu_t_t35_country_code == 0xff) {
      mit35.itu_t_t35_country_code_extension_byte = reader.f(8);
    }
    mit35.itu_t_t35_payload_bytes;
  }

  /**
   * 5.8.3 Metadata high dynamic range content light level syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#metadata-high-dynamic-range-content-light-level-syntax)
   */
  metadata_hdr_cll() {
    const reader = this.decoder.reader;
    const mhc = this.metadata.metadata_hdr_cll;

    mhc.max_cll = reader.f(16);
    mhc.max_fall = reader.f(16);
  }

  /**
   * 5.8.4 Metadata high dynamic range content light level syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#metadata-high-dynamic-range-mastering-display-color-volume-syntax)
   */
  metadata_hdr_mdcv() {
    const reader = this.decoder.reader;
    const mhm = this.metadata.metadata_hdr_mdcv;

    for (let i = 0; i < 3; i++) {
      mhm.primary_chromaticity_x[i] = reader.f(16);
      mhm.primary_chromaticity_y[i] = reader.f(16);
    }
    mhm.white_point_chromaticity_x = reader.f(16);
    mhm.white_point_chromaticity_y = reader.f(16);
    mhm.luminance_max = reader.f(32);
    mhm.luminance_min = reader.f(32);
  }

  /**
   * 5.8.5 Metadata high dynamic range mastering display color volume syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#metadata-scalability-syntax)
   */
  metadata_scalability() {
    const reader = this.decoder.reader;
    const ms = this.metadata.metadata_scalability;

    ms.scalability_mode_idc = reader.f(8);
    if (ms.scalability_mode_idc == SCALABILITY_MODE_IDC.SCALABILITY_SS) this.scalability_structure();
  }

  /**
   * 5.8.6 Metadata scalability syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#scalability-structure-syntax)
   */
  scalability_structure() {
    const reader = this.decoder.reader;
    const ss = this.metadata.scalability_structure;

    let spatial_layers_cnt_minus_1 = reader.f(2);
    ss.spatial_layer_dimensions_present_flag = reader.f(1);
    let spatial_layer_description_present_flag = reader.f(1);
    let temporal_group_description_present_flag = reader.f(1);
    let scalability_structure_reserved_3bits = reader.f(3);
    if (ss.spatial_layer_dimensions_present_flag) {
      for (let i = 0; i <= spatial_layers_cnt_minus_1; i++) {
        ss.spatial_layer_max_width[i] = reader.f(16);
        ss.spatial_layer_max_height[i] = reader.f(16);
      }
    }
    if (spatial_layer_description_present_flag) {
      for (let i = 0; i <= spatial_layers_cnt_minus_1; i++) ss.spatial_layer_ref_id[i] = reader.f(8);
    }
    if (temporal_group_description_present_flag) {
      ss.temporal_group_size = reader.f(8);
      for (let i = 0; i < ss.temporal_group_size; i++) {
        ss.temporal_group_temporal_id[i] = reader.f(3);
        ss.temporal_group_temporal_switching_up_point_flag[i] = reader.f(1);
        ss.temporal_group_spatial_switching_up_point_flag[i] = reader.f(1);
        ss.temporal_group_ref_cnt[i] = reader.f(3);
        for (let j = 0; j < ss.temporal_group_ref_cnt[i]; j++) {
          ss.temporal_group_ref_pic_diff[i][j] = reader.f(8);
        }
      }
    }
  }

  /**
   * 5.8.7 Scalability structure syntax
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#metadata-timecode-syntax)
   */
  metadata_timecode() {
    const reader = this.decoder.reader;
    const mt = this.metadata.metadata_timecode;

    mt.counting_type = reader.f(5);
    let full_timestamp_flag = reader.f(1);
    mt.discontinuity_flag = reader.f(1);
    mt.cnt_dropped_flag = reader.f(1);
    mt.n_frames = reader.f(9);
    if (full_timestamp_flag) {
      mt.seconds_value = reader.f(6);
      mt.minutes_value = reader.f(6);
      mt.hours_value = reader.f(5);
    } else {
      let seconds_flag = reader.f(1);
      if (seconds_flag) {
        mt.seconds_value = reader.f(6);
        let minutes_flag = reader.f(1);
        if (minutes_flag) {
          mt.minutes_value = reader.f(6);
          let hours_flag = reader.f(1);
          if (hours_flag) {
            mt.hours_value = reader.f(5);
          }
        }
      }
    }
    let time_offset_length = reader.f(5);
    if (time_offset_length > 0) {
      mt.time_offset_value = reader.f(time_offset_length);
    }
  }
}

/**
 * 6.7 Metadata OBU semantics
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#metadata-obu-semantics)
 */
interface Metadata {
  /**
   * 6.7.1 General metadata OBU semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#general-metadata-obu-semantics)
   */
  metadata_type: METADATA_TYPE;

  /**
   * 6.7.2 Metadata ITUT T35 semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#metadata-itut-t35-semantics)
   */
  metadata_itut_t35: {
    itu_t_t35_country_code: number;
    itu_t_t35_country_code_extension_byte: number;
    itu_t_t35_payload_bytes: any;
  };

  /**
   * 6.7.3 Metadata high dynamic range content light level semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#metadata-high-dynamic-range-content-light-level-semantics)
   */
  metadata_hdr_cll: {
    max_cll: number;
    max_fall: number;
  };

  /**
   * 6.7.4 Metadata high dynamic range mastering display color volume semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#metadata-high-dynamic-range-mastering-display-color-volume-semantics)
   */
  metadata_hdr_mdcv: {
    primary_chromaticity_x: number[];
    primary_chromaticity_y: number[];
    white_point_chromaticity_x: number;
    white_point_chromaticity_y: number;
    luminance_max: number;
    luminance_min: number;
  };

  /**
   * 6.7.5 Metadata scalability semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#metadata-scalability-semantics)
   */
  metadata_scalability: {
    scalability_mode_idc: SCALABILITY_MODE_IDC;
  };

  /**
   * 6.7.6 Scalability structure semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#scalability-structure-semantics)
   */
  scalability_structure: {
    spatial_layer_dimensions_present_flag: number;
    spatial_layer_max_width: number[];
    spatial_layer_max_height: number[];
    spatial_layer_ref_id: number[];
    temporal_group_size: number;
    temporal_group_temporal_id: number[];
    temporal_group_temporal_switching_up_point_flag: number[];
    temporal_group_spatial_switching_up_point_flag: number[];
    temporal_group_ref_cnt: number[];
    temporal_group_ref_pic_diff: number[][];
  };

  /**
   * 6.7.7 Metadata timecode semantics
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#metadata-timecode-semantics)
   */
  metadata_timecode: {
    counting_type: number;
    discontinuity_flag: number;
    cnt_dropped_flag: number;
    n_frames: number;
    seconds_value: number;
    minutes_value: number;
    hours_value: number;
    time_offset_length: number;
    time_offset_value: number;
  };
}
