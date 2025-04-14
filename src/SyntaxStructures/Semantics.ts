/**
 * 6.2.2 OBU header semantics
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#obu-header-semantics)
 */
export enum OBU_HEADER_TYPE {
  OBU_SEQUENCE_HEADER = 1,
  OBU_TEMPORAL_DELIMITER = 2,
  OBU_FRAME_HEADER = 3,
  OBU_TILE_GROUP = 4,
  OBU_METADATA = 5,
  OBU_FRAME = 6,
  OBU_REDUNDANT_FRAME_HEADER = 7,
  OBU_TILE_LIST = 8,
  OBU_PADDING = 15,
}

// 6.4.2 Color config semantics
export enum COLOR_PRIMARIES {
  CP_BT_709 = 1,
  CP_UNSPECIFIED = 2,
  CP_BT_470_M = 4,
  CP_BT_470_B_G = 5,
  CP_BT_601 = 6,
  CP_SMPTE_240 = 7,
  CP_GENERIC_FILM = 8,
  CP_BT_2020 = 9,
  CP_XYZ = 10,
  CP_SMPTE_431 = 11,
  CP_SMPTE_432 = 12,
  CP_EBU_3213 = 22,
}
export enum TRANSFER_CHARACTERISTICS {
  TC_RESERVED_0 = 0,
  TC_BT_709 = 1,
  TC_UNSPECIFIED = 2,
  TC_RESERVED_3 = 3,
  TC_BT_470_M = 4,
  TC_BT_470_B_G = 5,
  TC_BT_601 = 6,
  TC_SMPTE_240 = 7,
  TC_LINEAR = 8,
  TC_LOG_100 = 9,
  TC_LOG_100_SQRT10 = 10,
  TC_IEC_61966 = 11,
  TC_BT_1361 = 12,
  TC_SRGB = 13,
  TC_BT_2020_10_BIT = 14,
  TC_BT_2020_12_BIT = 15,
  TC_SMPTE_2084 = 16,
  TC_SMPTE_428 = 17,
  TC_HLG = 18,
}
export enum MATRIX_COEFFICIENTS {
  MC_IDENTITY = 0,
  MC_BT_709 = 1,
  MC_UNSPECIFIED = 2,
  MC_RESERVED_3 = 3,
  MC_FCC = 4,
  MC_BT_470_B_G = 5,
  MC_BT_601 = 6,
  MC_SMPTE_240 = 7,
  MC_SMPTE_YCGCO = 8,
  MC_BT_2020_NCL = 9,
  MC_BT_2020_CL = 10,
  MC_SMPTE_2085 = 11,
  MC_CHROMAT_NCL = 12,
  MC_CHROMAT_CL = 13,
  MC_ICTCP = 14,
}
export enum CHROMA_SAMPLE_POSITION {
  CSP_UNKNOWN = 0,
  CSP_VERTICAL = 1,
  CSP_COLOCATED = 2,
  CSP_RESERVED = 3,
}

// 6.7.1 General metadata OBU semantics
export enum METADATA_TYPE {
  METADATA_TYPE_HDR_CLL = 1,
  METADATA_TYPE_HDR_MDCV = 2,
  METADATA_TYPE_SCALABILITY = 3,
  METADATA_TYPE_ITUT_T35 = 4,
  METADATA_TYPE_TIMECODE = 5,
}

/**
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  | Name of scalability_mode_idc | Spatial Layers | Resolution Ratio | Temporal Layers | Inter-layer dependency |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |  SCALABILITY_L1T2            |        1       |                  |        2        |                        |
 *  |  SCALABILITY_L1T3            |        1       |                  |        3        |                        |
 *  |  SCALABILITY_L2T1            |        2       |       2:1        |        1        |           Yes          |
 *  |  SCALABILITY_L2T2            |        2       |       2:1        |        2        |           Yes          |
 *  |  SCALABILITY_L2T3            |        2       |       2:1        |        3        |           Yes          |
 *  |  SCALABILITY_S2T1            |        2       |       2:1        |        1        |           No           |
 *  |  SCALABILITY_S2T2            |        2       |       2:1        |        2        |           No           |
 *  |  SCALABILITY_S2T3            |        2       |       2:1        |        3        |           No           |
 *  |  SCALABILITY_L2T1h           |        2       |       1.5:1      |        1        |           Yes          |
 *  |  SCALABILITY_L2T2h           |        2       |       1.5:1      |        2        |           Yes          |
 *  |  SCALABILITY_L2T3h           |        2       |       1.5:1      |        3        |           Yes          |
 *  |  SCALABILITY_S2T1h           |        2       |       1.5:1      |        1        |           No           |
 *  |  SCALABILITY_S2T2h           |        2       |       1.5:1      |        2        |           No           |
 *  |  SCALABILITY_S2T3h           |        2       |       1.5:1      |        3        |           No           |
 *  |  SCALABILITY_L3T1            |        3       |       2:1        |        1        |           Yes          |
 *  |  SCALABILITY_L3T2            |        3       |       2:1        |        2        |           Yes          |
 *  |  SCALABILITY_L3T3            |        3       |       2:1        |        3        |           Yes          |
 *  |  SCALABILITY_S3T1            |        3       |       2:1        |        1        |           No           |
 *  |  SCALABILITY_S3T2            |        3       |       2:1        |        2        |           No           |
 *  |  SCALABILITY_S3T3            |        3       |       2:1        |        3        |           No           |
 *  |  SCALABILITY_L3T2_KEY        |        3       |       2:1        |        2        |           Yes          |
 *  |  SCALABILITY_L3T3_KEY        |        3       |       2:1        |        3        |           Yes          |
 *  |  SCALABILITY_L4T5_KEY        |        4       |       2:1        |        5        |           Yes          |
 *  |  SCALABILITY_L4T7_KEY        |        4       |       2:1        |        7        |           Yes          |
 *  |  SCALABILITY_L3T2_KEY_SHIFT  |        3       |       2:1        |        2        |           Yes          |
 *  |  SCALABILITY_L3T3_KEY_SHIFT  |        3       |       2:1        |        3        |           Yes          |
 *  |  SCALABILITY_L4T5_KEY_SHIFT  |        4       |       2:1        |        5        |           Yes          |
 *  |  SCALABILITY_L4T7_KEY_SHIFT  |        4       |       2:1        |        7        |           Yes          |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 */
// 6.7.5 Metadata scalability semantics
export enum SCALABILITY_MODE_IDC {
  SCALABILITY_L1T2 = 0,
  SCALABILITY_L1T3 = 1,
  SCALABILITY_L2T1 = 2,
  SCALABILITY_L2T2 = 3,
  SCALABILITY_L2T3 = 4,
  SCALABILITY_S2T1 = 5,
  SCALABILITY_S2T2 = 6,
  SCALABILITY_S2T3 = 7,
  SCALABILITY_L2T1h = 8,
  SCALABILITY_L2T2h = 9,
  SCALABILITY_L2T3h = 10,
  SCALABILITY_S2T1h = 11,
  SCALABILITY_S2T2h = 12,
  SCALABILITY_S2T3h = 13,
  SCALABILITY_SS = 14,
  SCALABILITY_L3T1 = 15,
  SCALABILITY_L3T2 = 16,
  SCALABILITY_L3T3 = 17,
  SCALABILITY_S3T1 = 18,
  SCALABILITY_S3T2 = 19,
  SCALABILITY_S3T3 = 20,
  SCALABILITY_L3T2_KEY = 21,
  SCALABILITY_L3T3_KEY = 22,
  SCALABILITY_L4T5_KEY = 23,
  SCALABILITY_L4T7_KEY = 24,
  SCALABILITY_L3T2_KEY_SHIFT = 25,
  SCALABILITY_L3T3_KEY_SHIFT = 26,
  SCALABILITY_L4T5_KEY_SHIFT = 27,
  SCALABILITY_L4T7_KEY_SHIFT = 28,
}

// 6.8.2 Uncompressed header semantics
export enum FRAME_TYPE {
  KEY_FRAME = 0,
  INTER_FRAME = 1,
  INTRA_ONLY_FRAME = 2,
  SWITCH_FRAME = 3,
}

// 6.8.2 Uncompressed header semantics
export interface NonCoeffCdfs {
  YModeCdf: number[][];
  UVModeCflNotAllowedCdf: number[][];
  UVModeCflAllowedCdf: number[][];
  AngleDeltaCdf: number[][];
  IntrabcCdf: number[];
  PartitionW8Cdf: number[][];
  PartitionW16Cdf: number[][];
  PartitionW32Cdf: number[][];
  PartitionW64Cdf: number[][];
  PartitionW128Cdf: number[][];
  SegmentIdCdf: number[][];
  SegmentIdPredictedCdf: number[][];
  Tx8x8Cdf: number[][];
  Tx16x16Cdf: number[][];
  Tx32x32Cdf: number[][];
  Tx64x64Cdf: number[][];
  TxfmSplitCdf: number[][];
  FilterIntraModeCdf: number[];
  FilterIntraCdf: number[][];
  InterpFilterCdf: number[][];
  MotionModeCdf: number[][];
  NewMvCdf: number[][];
  ZeroMvCdf: number[][];
  RefMvCdf: number[][];
  CompoundModeCdf: number[][];
  DrlModeCdf: number[][];
  IsInterCdf: number[][];
  CompModeCdf: number[][];
  SkipModeCdf: number[][];
  SkipCdf: number[][];
  CompRefCdf: number[][][];
  CompBwdRefCdf: number[][][];
  SingleRefCdf: number[][][];
  MvJointCdf: number[][];
  MvClassCdf: number[][][];
  MvClass0BitCdf: number[][][];
  MvFrCdf: number[][][];
  MvClass0FrCdf: number[][][][];
  MvClass0HpCdf: number[][][];
  MvSignCdf: number[][][];
  MvBitCdf: number[][][][];
  MvHpCdf: number[][][];
  PaletteYModeCdf: number[][][];
  PaletteUVModeCdf: number[][];
  PaletteYSizeCdf: number[][];
  PaletteUVSizeCdf: number[][];
  PaletteSize2YColorCdf: number[][];
  PaletteSize2UVColorCdf: number[][];
  PaletteSize3YColorCdf: number[][];
  PaletteSize3UVColorCdf: number[][];
  PaletteSize4YColorCdf: number[][];
  PaletteSize4UVColorCdf: number[][];
  PaletteSize5YColorCdf: number[][];
  PaletteSize5UVColorCdf: number[][];
  PaletteSize6YColorCdf: number[][];
  PaletteSize6UVColorCdf: number[][];
  PaletteSize7YColorCdf: number[][];
  PaletteSize7UVColorCdf: number[][];
  PaletteSize8YColorCdf: number[][];
  PaletteSize8UVColorCdf: number[][];
  DeltaQCdf: number[];
  DeltaLFCdf: number[];
  DeltaLFMultiCdf: number[][];
  IntraTxTypeSet1Cdf: number[][][];
  IntraTxTypeSet2Cdf: number[][][];
  InterTxTypeSet1Cdf: number[][];
  InterTxTypeSet2Cdf: number[];
  InterTxTypeSet3Cdf: number[][];
  UseObmcCdf: number[][];
  InterIntraCdf: number[][];
  CompRefTypeCdf: number[][];
  CflSignCdf: number[];
  UniCompRefCdf: number[][][];
  WedgeInterIntraCdf: number[][];
  CompGroupIdxCdf: number[][];
  CompoundIdxCdf: number[][];
  CompoundTypeCdf: number[][];
  InterIntraModeCdf: number[][];
  WedgeIndexCdf: number[][];
  CflAlphaCdf: number[][];
  UseWienerCdf: number[];
  UseSgrprojCdf: number[];
  RestorationTypeCdf: number[];
}
export interface CoeffCdfs {
  TxbSkipCdf: number[][][];
  EobPt16Cdf: number[][][];
  EobPt32Cdf: number[][][];
  EobPt64Cdf: number[][][];
  EobPt128Cdf: number[][][];
  EobPt256Cdf: number[][][];
  EobPt512Cdf: number[][];
  EobPt1024Cdf: number[][];
  EobExtraCdf: number[][][][];
  DcSignCdf: number[][][];
  CoeffBaseEobCdf: number[][][][];
  CoeffBaseCdf: number[][][][];
  CoeffBrCdf: number[][][][];
}

// 6.8.9 Interpolation filter semantics
export enum INTERPOLATION_FILTER {
  EIGHTTAP = 0,
  EIGHTTAP_SMOOTH = 1,
  EIGHTTAP_SHARP = 2,
  BILINEAR = 3,
  SWITCHABLE = 4,
}

// 6.8.21 TX mode semantics
export enum TX_MODE {
  ONLY_4X4 = 0,
  TX_MODE_LARGEST = 1,
  TX_MODE_SELECT = 2,
}

// 6.10.4 Decode partition semantics
export enum PARTITION {
  PARTITION_NONE = 0,
  PARTITION_HORZ = 1,
  PARTITION_VERT = 2,
  PARTITION_SPLIT = 3,
  PARTITION_HORZ_A = 4,
  PARTITION_HORZ_B = 5,
  PARTITION_VERT_A = 6,
  PARTITION_VERT_B = 7,
  PARTITION_HORZ_4 = 8,
  PARTITION_VERT_4 = 9,
}
export enum SUB_SIZE {
  BLOCK_4X4 = 0,
  BLOCK_4X8 = 1,
  BLOCK_8X4 = 2,
  BLOCK_8X8 = 3,
  BLOCK_8X16 = 4,
  BLOCK_16X8 = 5,
  BLOCK_16X16 = 6,
  BLOCK_16X32 = 7,
  BLOCK_32X16 = 8,
  BLOCK_32X32 = 9,
  BLOCK_32X64 = 10,
  BLOCK_64X32 = 11,
  BLOCK_64X64 = 12,
  BLOCK_64X128 = 13,
  BLOCK_128X64 = 14,
  BLOCK_128X128 = 15,
  BLOCK_4X16 = 16,
  BLOCK_16X4 = 17,
  BLOCK_8X32 = 18,
  BLOCK_32X8 = 19,
  BLOCK_16X64 = 20,
  BLOCK_64X16 = 21,
  BLOCK_INVALID = 22,
}

/**
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  | lr_type | FrameRestorationType | Name of FrameRestorationType |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |    0    |           0          |      RESTORE_NONE            |
 *  |    1    |           3          |      RESTORE_SWITCHABLE      |
 *  |    2    |           1          |      RESTORE_WIENER          |
 *  |    3    |           2          |      RESTORE_SGRPROJ         |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 */
// 6.10.15 Loop restoration params semantics
export enum FRAME_RESTORATION_TYPE {
  RESTORE_NONE = 0,
  RESTORE_SWITCHABLE = 3,
  RESTORE_WIENER = 1,
  RESTORE_SGRPROJ = 2,
}

// 6.10.16 TX size semantics
export enum TX_SIZE {
  TX_4X4 = 0,
  TX_8X8 = 1,
  TX_16X16 = 2,
  TX_32X32 = 3,
  TX_64X64 = 4,
  TX_4X8 = 5,
  TX_8X4 = 6,
  TX_8X16 = 7,
  TX_16X8 = 8,
  TX_16X32 = 9,
  TX_32X16 = 10,
  TX_32X64 = 11,
  TX_64X32 = 12,
  TX_4X16 = 13,
  TX_16X4 = 14,
  TX_8X32 = 15,
  TX_32X8 = 16,
  TX_16X64 = 17,
  TX_64X16 = 18,
}

/**
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-
 *  |  is_inter  | set | Name of transform set |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-
 *  | Don’t care |  0  |     TX_SET_DCTONLY    |
 *  |      0     |  1  |     TX_SET_INTRA_1    |
 *  |      0     |  2  |     TX_SET_INTRA_2    |
 *  |      1     |  1  |     TX_SET_INTER_1    |
 *  |      1     |  2  |     TX_SET_INTER_2    |
 *  |      1     |  3  |     TX_SET_INTER_3    |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-
 *
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-++-+-+-+-+-+-+-+-++-+-+-+-+-+-+-+-++-+-+-+-+-+-+-+-++
 *  |   Transform type  | TX_SET_DCTONLY | TX_SET_INTRA_1 | TX_SET_INTRA_2 | TX_SET_INTER_1 | TX_SET_INTER_2 | TX_SET_INTER_3 |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-++-+-+-+-+-+-+-+-++-+-+-+-+-+-+-+-++-+-+-+-+-+-+-+-++
 *  | DCT_DCT           |        X       |        X       |        X       |        X       |        X       |        X       |
 *  | ADST_DCT          |                |        X       |        X       |        X       |        X       |                |
 *  | DCT_ADST          |                |        X       |        X       |        X       |        X       |                |
 *  | ADST_ADST         |                |        X       |        X       |        X       |        X       |                |
 *  | FLIPADST_DCT      |                |                |                |        X       |        X       |                |
 *  | DCT_FLIPADST      |                |                |                |        X       |        X       |                |
 *  | FLIPADST_FLIPADST |                |                |                |        X       |        X       |                |
 *  | ADST_FLIPADST     |                |                |                |        X       |        X       |                |
 *  | FLIPADST_ADST     |                |                |                |        X       |        X       |                |
 *  | IDTX              |                |        X       |        X       |        X       |        X       |        X       |
 *  | V_DCT             |                |        X       |                |        X       |        X       |                |
 *  | H_DCT             |                |        X       |                |        X       |        X       |                |
 *  | V_ADST            |                |                |                |        X       |                |                |
 *  | H_ADST            |                |                |                |        X       |                |                |
 *  | V_FLIPADST        |                |                |                |        X       |                |                |
 *  | H_FLIPADST        |                |                |                |        X       |                |                |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-++-+-+-+-+-+-+-+-++-+-+-+-+-+-+-+-++-+-+-+-+-+-+-+-++
 */
// 6.10.19
export enum SET {
  TX_SET_DCTONLY = 0,
  TX_SET_INTRA_1 = 1,
  TX_SET_INTRA_2 = 2,
  TX_SET_INTER_1 = 1,
  TX_SET_INTER_2 = 2,
  TX_SET_INTER_3 = 3,
}

// 6.10.22 Inter block mode info semantics
export enum Y_MODE {
  DC_PRED = 0,
  V_PRED = 1,
  H_PRED = 2,
  D45_PRED = 3,
  D135_PRED = 4,
  D113_PRED = 5,
  D157_PRED = 6,
  D203_PRED = 7,
  D67_PRED = 8,
  SMOOTH_PRED = 9,
  SMOOTH_V_PRED = 10,
  SMOOTH_H_PRED = 11,
  PAETH_PRED = 12,
  UV_CFL_PRED = 13,
  NEARESTMV = 14,
  NEARMV = 15,
  GLOBALMV = 16,
  NEWMV = 17,
  NEAREST_NEARESTMV = 18,
  NEAR_NEARMV = 19,
  NEAREST_NEWMV = 20,
  NEW_NEARESTMV = 21,
  NEAR_NEWMV = 22,
  NEW_NEARMV = 23,
  GLOBAL_GLOBALMV = 24,
  NEW_NEWMV = 25,
}

// 6.10.23 Filter intra mode info semantics
export enum FILTER_INTRA_MODE {
  FILTER_DC_PRED = 0,
  FILTER_V_PRED = 1,
  FILTER_H_PRED = 2,
  FILTER_D157_PRED = 3,
  FILTER_PAETH_PRED = 4,
}

// 6.10.24
export enum COMP_MODE {
  SINGLE_REFERENCE = 0,
  COMPOUND_REFERENCE = 1,
}
export enum COMP_REF_TYPE {
  UNIDIR_COMP_REFERENCE = 0,
  BIDIR_COMP_REFERENCE = 1,
}
export enum REF_FRAME {
  NONE = -1,
  INTRA_FRAME = 0,
  LAST_FRAME = 1,
  LAST2_FRAME = 2,
  LAST3_FRAME = 3,
  GOLDEN_FRAME = 4,
  BWDREF_FRAME = 5,
  ALTREF2_FRAME = 6,
  ALTREF_FRAME = 7,
}

// 6.10.26 Read motion mode semantics
export enum MOTION_MODE {
  SIMPLE = 0,
  OBMC = 1,
  LOCALWARP = 2,
}

// 6.10.27 Read inter intra semantics
export enum INTERINTRA_MODE {
  II_DC_PRED = 0,
  II_V_PRED = 1,
  II_H_PRED = 2,
  II_SMOOTH_PRED = 3,
}

// 6.10.28 Read compound type semantics
export enum COMPOUND_TYPE {
  COMPOUND_WEDGE = 0,
  COMPOUND_DIFFWTD = 1,
  COMPOUND_AVERAGE = 2,
  COMPOUND_INTRA = 3,
  COMPOUND_DISTANCE = 4,
}
export enum MASK_TYPE {
  UNIFORM_45 = 0,
  UNIFORM_45_INV = 1,
}

/**
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  | mv_joint | Name of mv_joint | Changes row | Changes col |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
 *  |     0    |  MV_JOINT_ZERO   |     No      |     No      |
 *  |     1    |  MV_JOINT_HNZVZ  |     No      |     Yes     |
 *  |     2    |  MV_JOINT_HZVNZ  |     Yes     |     No      |
 *  |     3    |  MV_JOINT_HNZVNZ |     Yes     |     Yes     |
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+--+-+-+-+-+-+-+-
 */
// 6.10.29 MV semantics
export enum MV_JOINT {
  MV_JOINT_ZERO = 0,
  MV_JOINT_HNZVZ = 1,
  MV_JOINT_HZVNZ = 2,
  MV_JOINT_HNZVNZ = 3,
}

// 6.10.30
export enum MV_CLASS {
  MV_CLASS_0 = 0,
  MV_CLASS_1 = 1,
  MV_CLASS_2 = 2,
  MV_CLASS_3 = 3,
  MV_CLASS_4 = 4,
  MV_CLASS_5 = 5,
  MV_CLASS_6 = 6,
  MV_CLASS_7 = 7,
  MV_CLASS_8 = 8,
  MV_CLASS_9 = 9,
  MV_CLASS_10 = 10,
}

/**
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
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
 *  +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+--+-+-+-
 */
// 6.10.36
export enum SIGN_UV {
  CFL_SIGN_ZERO = 0,
  CFL_SIGN_NEG = 1,
  CFL_SIGN_POS = 2,
}

/**
 * 9.3 Conversion tables
 */
export const Mi_Width_Log2 = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 0, 2, 1, 3, 2, 4];

export const Mi_Height_Log2 = [0, 1, 0, 1, 2, 1, 2, 3, 2, 3, 4, 3, 4, 5, 4, 5, 2, 0, 3, 1, 4, 2];

export const Num_4x4_Blocks_Wide = [1, 1, 2, 2, 2, 4, 4, 4, 8, 8, 8, 16, 16, 16, 32, 32, 1, 4, 2, 8, 4, 16];

export const Block_Width = Num_4x4_Blocks_Wide.map((a) => 4 * a);

export const Num_4x4_Blocks_High = [1, 2, 1, 2, 4, 2, 4, 8, 4, 8, 16, 8, 16, 32, 16, 32, 4, 1, 8, 2, 16, 4];

export const Block_Height = Num_4x4_Blocks_High.map((a) => 4 * a);

export const Size_Group = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 0, 0, 1, 1, 2, 2];

export const Max_Tx_Size_Rect = [
  TX_SIZE.TX_4X4,
  TX_SIZE.TX_4X8,
  TX_SIZE.TX_8X4,
  TX_SIZE.TX_8X8,
  TX_SIZE.TX_8X16,
  TX_SIZE.TX_16X8,
  TX_SIZE.TX_16X16,
  TX_SIZE.TX_16X32,
  TX_SIZE.TX_32X16,
  TX_SIZE.TX_32X32,
  TX_SIZE.TX_32X64,
  TX_SIZE.TX_64X32,
  TX_SIZE.TX_64X64,
  TX_SIZE.TX_64X64,
  TX_SIZE.TX_64X64,
  TX_SIZE.TX_64X64,
  TX_SIZE.TX_4X16,
  TX_SIZE.TX_16X4,
  TX_SIZE.TX_8X32,
  TX_SIZE.TX_32X8,
  TX_SIZE.TX_16X64,
  TX_SIZE.TX_64X16,
];
