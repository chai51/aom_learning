import { Clip1, Clip3, integer, Round2 } from "../Conventions";
import { AV1Decoder } from "../SyntaxStructures/Obu";

import { TX_SIZE } from "../SyntaxStructures/Semantics";

import { assert } from "console";
import { Tx_Height_Log2, Tx_Width_Log2 } from "../AdditionalTables/ConversionTables";
import { Qm_Offset, Quantizer_Matrix } from "../AdditionalTables/QuantizerMatrixTables";
import { ADST_FLIPADST, DCT_FLIPADST, FLIPADST_ADST, FLIPADST_DCT, FLIPADST_FLIPADST, H_FLIPADST, IDTX, SEG_LVL_ALT_Q, V_FLIPADST } from "../define";

/**
 * 7.12 Reconstruction and dequantization
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#reconstruction-and-dequantization)
 */
export class ReconstructionAndDequantization {
  Dequant: number[][] = [];

  private decoder: AV1Decoder;

  constructor(d: AV1Decoder) {
    this.decoder = d;
  }

  /**
   * 7.12.2 Dequantization functions
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#dequantization-functions)
   */
  dc_q(b: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;

    const Dc_Qlookup = [
      [
        4, 8, 8, 9, 10, 11, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 23, 24, 25, 26, 26, 27, 28, 29, 30, 31, 32, 32, 33, 34, 35, 36, 37, 38, 38, 39, 40, 41, 42, 43, 43,
        44, 45, 46, 47, 48, 48, 49, 50, 51, 52, 53, 53, 54, 55, 56, 57, 57, 58, 59, 60, 61, 62, 62, 63, 64, 65, 66, 66, 67, 68, 69, 70, 70, 71, 72, 73, 74, 74, 75, 76, 77, 78, 78,
        79, 80, 81, 81, 82, 83, 84, 85, 85, 87, 88, 90, 92, 93, 95, 96, 98, 99, 101, 102, 104, 105, 107, 108, 110, 111, 113, 114, 116, 117, 118, 120, 121, 123, 125, 127, 129, 131,
        134, 136, 138, 140, 142, 144, 146, 148, 150, 152, 154, 156, 158, 161, 164, 166, 169, 172, 174, 177, 180, 182, 185, 187, 190, 192, 195, 199, 202, 205, 208, 211, 214, 217,
        220, 223, 226, 230, 233, 237, 240, 243, 247, 250, 253, 257, 261, 265, 269, 272, 276, 280, 284, 288, 292, 296, 300, 304, 309, 313, 317, 322, 326, 330, 335, 340, 344, 349,
        354, 359, 364, 369, 374, 379, 384, 389, 395, 400, 406, 411, 417, 423, 429, 435, 441, 447, 454, 461, 467, 475, 482, 489, 497, 505, 513, 522, 530, 539, 549, 559, 569, 579,
        590, 602, 614, 626, 640, 654, 668, 684, 700, 717, 736, 755, 775, 796, 819, 843, 869, 896, 925, 955, 988, 1022, 1058, 1098, 1139, 1184, 1232, 1282, 1336,
      ],
      [
        4, 9, 10, 13, 15, 17, 20, 22, 25, 28, 31, 34, 37, 40, 43, 47, 50, 53, 57, 60, 64, 68, 71, 75, 78, 82, 86, 90, 93, 97, 101, 105, 109, 113, 116, 120, 124, 128, 132, 136, 140,
        143, 147, 151, 155, 159, 163, 166, 170, 174, 178, 182, 185, 189, 193, 197, 200, 204, 208, 212, 215, 219, 223, 226, 230, 233, 237, 241, 244, 248, 251, 255, 259, 262, 266,
        269, 273, 276, 280, 283, 287, 290, 293, 297, 300, 304, 307, 310, 314, 317, 321, 324, 327, 331, 334, 337, 343, 350, 356, 362, 369, 375, 381, 387, 394, 400, 406, 412, 418,
        424, 430, 436, 442, 448, 454, 460, 466, 472, 478, 484, 490, 499, 507, 516, 525, 533, 542, 550, 559, 567, 576, 584, 592, 601, 609, 617, 625, 634, 644, 655, 666, 676, 687,
        698, 708, 718, 729, 739, 749, 759, 770, 782, 795, 807, 819, 831, 844, 856, 868, 880, 891, 906, 920, 933, 947, 961, 975, 988, 1001, 1015, 1030, 1045, 1061, 1076, 1090, 1105,
        1120, 1137, 1153, 1170, 1186, 1202, 1218, 1236, 1253, 1271, 1288, 1306, 1323, 1342, 1361, 1379, 1398, 1416, 1436, 1456, 1476, 1496, 1516, 1537, 1559, 1580, 1601, 1624,
        1647, 1670, 1692, 1717, 1741, 1766, 1791, 1817, 1844, 1871, 1900, 1929, 1958, 1990, 2021, 2054, 2088, 2123, 2159, 2197, 2236, 2276, 2319, 2363, 2410, 2458, 2508, 2561,
        2616, 2675, 2737, 2802, 2871, 2944, 3020, 3102, 3188, 3280, 3375, 3478, 3586, 3702, 3823, 3953, 4089, 4236, 4394, 4559, 4737, 4929, 5130, 5347,
      ],
      [
        4, 12, 18, 25, 33, 41, 50, 60, 70, 80, 91, 103, 115, 127, 140, 153, 166, 180, 194, 208, 222, 237, 251, 266, 281, 296, 312, 327, 343, 358, 374, 390, 405, 421, 437, 453, 469,
        484, 500, 516, 532, 548, 564, 580, 596, 611, 627, 643, 659, 674, 690, 706, 721, 737, 752, 768, 783, 798, 814, 829, 844, 859, 874, 889, 904, 919, 934, 949, 964, 978, 993,
        1008, 1022, 1037, 1051, 1065, 1080, 1094, 1108, 1122, 1136, 1151, 1165, 1179, 1192, 1206, 1220, 1234, 1248, 1261, 1275, 1288, 1302, 1315, 1329, 1342, 1368, 1393, 1419,
        1444, 1469, 1494, 1519, 1544, 1569, 1594, 1618, 1643, 1668, 1692, 1717, 1741, 1765, 1789, 1814, 1838, 1862, 1885, 1909, 1933, 1957, 1992, 2027, 2061, 2096, 2130, 2165,
        2199, 2233, 2267, 2300, 2334, 2367, 2400, 2434, 2467, 2499, 2532, 2575, 2618, 2661, 2704, 2746, 2788, 2830, 2872, 2913, 2954, 2995, 3036, 3076, 3127, 3177, 3226, 3275,
        3324, 3373, 3421, 3469, 3517, 3565, 3621, 3677, 3733, 3788, 3843, 3897, 3951, 4005, 4058, 4119, 4181, 4241, 4301, 4361, 4420, 4479, 4546, 4612, 4677, 4742, 4807, 4871,
        4942, 5013, 5083, 5153, 5222, 5291, 5367, 5442, 5517, 5591, 5665, 5745, 5825, 5905, 5984, 6063, 6149, 6234, 6319, 6404, 6495, 6587, 6678, 6769, 6867, 6966, 7064, 7163,
        7269, 7376, 7483, 7599, 7715, 7832, 7958, 8085, 8214, 8352, 8492, 8635, 8788, 8945, 9104, 9275, 9450, 9639, 9832, 10031, 10245, 10465, 10702, 10946, 11210, 11482, 11776,
        12081, 12409, 12750, 13118, 13501, 13913, 14343, 14807, 15290, 15812, 16356, 16943, 17575, 18237, 18949, 19718, 20521, 21387,
      ],
    ];
    return Dc_Qlookup[(cc.BitDepth - 8) >> 1][Clip3(0, 255, b)];
  }
  // [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#dequantization-functions)
  ac_q(b: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;

    const Ac_Qlookup = [
      [
        4, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50,
        51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93,
        94, 95, 96, 97, 98, 99, 100, 101, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120, 122, 124, 126, 128, 130, 132, 134, 136, 138, 140, 142, 144, 146, 148, 150, 152, 155,
        158, 161, 164, 167, 170, 173, 176, 179, 182, 185, 188, 191, 194, 197, 200, 203, 207, 211, 215, 219, 223, 227, 231, 235, 239, 243, 247, 251, 255, 260, 265, 270, 275, 280,
        285, 290, 295, 300, 305, 311, 317, 323, 329, 335, 341, 347, 353, 359, 366, 373, 380, 387, 394, 401, 408, 416, 424, 432, 440, 448, 456, 465, 474, 483, 492, 501, 510, 520,
        530, 540, 550, 560, 571, 582, 593, 604, 615, 627, 639, 651, 663, 676, 689, 702, 715, 729, 743, 757, 771, 786, 801, 816, 832, 848, 864, 881, 898, 915, 933, 951, 969, 988,
        1007, 1026, 1046, 1066, 1087, 1108, 1129, 1151, 1173, 1196, 1219, 1243, 1267, 1292, 1317, 1343, 1369, 1396, 1423, 1451, 1479, 1508, 1537, 1567, 1597, 1628, 1660, 1692,
        1725, 1759, 1793, 1828,
      ],
      [
        4, 9, 11, 13, 16, 18, 21, 24, 27, 30, 33, 37, 40, 44, 48, 51, 55, 59, 63, 67, 71, 75, 79, 83, 88, 92, 96, 100, 105, 109, 114, 118, 122, 127, 131, 136, 140, 145, 149, 154,
        158, 163, 168, 172, 177, 181, 186, 190, 195, 199, 204, 208, 213, 217, 222, 226, 231, 235, 240, 244, 249, 253, 258, 262, 267, 271, 275, 280, 284, 289, 293, 297, 302, 306,
        311, 315, 319, 324, 328, 332, 337, 341, 345, 349, 354, 358, 362, 367, 371, 375, 379, 384, 388, 392, 396, 401, 409, 417, 425, 433, 441, 449, 458, 466, 474, 482, 490, 498,
        506, 514, 523, 531, 539, 547, 555, 563, 571, 579, 588, 596, 604, 616, 628, 640, 652, 664, 676, 688, 700, 713, 725, 737, 749, 761, 773, 785, 797, 809, 825, 841, 857, 873,
        889, 905, 922, 938, 954, 970, 986, 1002, 1018, 1038, 1058, 1078, 1098, 1118, 1138, 1158, 1178, 1198, 1218, 1242, 1266, 1290, 1314, 1338, 1362, 1386, 1411, 1435, 1463, 1491,
        1519, 1547, 1575, 1603, 1631, 1663, 1695, 1727, 1759, 1791, 1823, 1859, 1895, 1931, 1967, 2003, 2039, 2079, 2119, 2159, 2199, 2239, 2283, 2327, 2371, 2415, 2459, 2507,
        2555, 2603, 2651, 2703, 2755, 2807, 2859, 2915, 2971, 3027, 3083, 3143, 3203, 3263, 3327, 3391, 3455, 3523, 3591, 3659, 3731, 3803, 3876, 3952, 4028, 4104, 4184, 4264,
        4348, 4432, 4516, 4604, 4692, 4784, 4876, 4972, 5068, 5168, 5268, 5372, 5476, 5584, 5692, 5804, 5916, 6032, 6148, 6268, 6388, 6512, 6640, 6768, 6900, 7036, 7172, 7312,
      ],
      [
        4, 13, 19, 27, 35, 44, 54, 64, 75, 87, 99, 112, 126, 139, 154, 168, 183, 199, 214, 230, 247, 263, 280, 297, 314, 331, 349, 366, 384, 402, 420, 438, 456, 475, 493, 511, 530,
        548, 567, 586, 604, 623, 642, 660, 679, 698, 716, 735, 753, 772, 791, 809, 828, 846, 865, 884, 902, 920, 939, 957, 976, 994, 1012, 1030, 1049, 1067, 1085, 1103, 1121, 1139,
        1157, 1175, 1193, 1211, 1229, 1246, 1264, 1282, 1299, 1317, 1335, 1352, 1370, 1387, 1405, 1422, 1440, 1457, 1474, 1491, 1509, 1526, 1543, 1560, 1577, 1595, 1627, 1660,
        1693, 1725, 1758, 1791, 1824, 1856, 1889, 1922, 1954, 1987, 2020, 2052, 2085, 2118, 2150, 2183, 2216, 2248, 2281, 2313, 2346, 2378, 2411, 2459, 2508, 2556, 2605, 2653,
        2701, 2750, 2798, 2847, 2895, 2943, 2992, 3040, 3088, 3137, 3185, 3234, 3298, 3362, 3426, 3491, 3555, 3619, 3684, 3748, 3812, 3876, 3941, 4005, 4069, 4149, 4230, 4310,
        4390, 4470, 4550, 4631, 4711, 4791, 4871, 4967, 5064, 5160, 5256, 5352, 5448, 5544, 5641, 5737, 5849, 5961, 6073, 6185, 6297, 6410, 6522, 6650, 6778, 6906, 7034, 7162,
        7290, 7435, 7579, 7723, 7867, 8011, 8155, 8315, 8475, 8635, 8795, 8956, 9132, 9308, 9484, 9660, 9836, 10028, 10220, 10412, 10604, 10812, 11020, 11228, 11437, 11661, 11885,
        12109, 12333, 12573, 12813, 13053, 13309, 13565, 13821, 14093, 14365, 14637, 14925, 15213, 15502, 15806, 16110, 16414, 16734, 17054, 17390, 17726, 18062, 18414, 18766,
        19134, 19502, 19886, 20270, 20670, 21070, 21486, 21902, 22334, 22766, 23214, 23662, 24126, 24590, 25070, 25551, 26047, 26559, 27071, 27599, 28143, 28687, 29247,
      ],
    ];
    return Ac_Qlookup[(cc.BitDepth - 8) >> 1][Clip3(0, 255, b)];
  }
  // [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#dequantization-functions)
  get_qindex(ignoreDeltaQ: number, segmentId: number) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const qp = fh.quantization_params;
    const sp = fh.segmentation_params;
    const dqp = fh.delta_q_params;
    const tgo = this.decoder.tileGroupObu;
    const tg = tgo.titleGroup;

    if (tgo.seg_feature_active_idx(segmentId, SEG_LVL_ALT_Q) == 1) {
      // 1.
      let data = sp.FeatureData[segmentId][SEG_LVL_ALT_Q];

      // 2.
      let qindex = qp.base_q_idx + data;

      // 3.
      if (ignoreDeltaQ == 0 && dqp.delta_q_present == 1) {
        qindex = tg.CurrentQIndex + data;
      }
      return Clip3(0, 255, qindex);
    } else if (ignoreDeltaQ == 0 && dqp.delta_q_present == 1) {
      return tg.CurrentQIndex;
    } else {
      return qp.base_q_idx;
    }
  }
  // [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#dequantization-functions)
  get_dc_quant(plane: number) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const qp = fh.quantization_params;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const si = tg.segment_id;

    if (plane == 0) {
      return this.dc_q(this.get_qindex(0, si.segment_id) + qp.DeltaQYDc);
    } else if (plane == 1) {
      return this.dc_q(this.get_qindex(0, si.segment_id) + qp.DeltaQUDc);
    } else {
      return this.dc_q(this.get_qindex(0, si.segment_id) + qp.DeltaQVDc);
    }
  }
  // [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#dequantization-functions)
  get_ac_quant(plane: number) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const qp = fh.quantization_params;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const si = tg.segment_id;

    if (plane == 0) {
      return this.ac_q(this.get_qindex(0, si.segment_id));
    } else if (plane == 1) {
      return this.ac_q(this.get_qindex(0, si.segment_id) + qp.DeltaQUAc);
    } else {
      return this.ac_q(this.get_qindex(0, si.segment_id) + qp.DeltaQVAc);
    }
  }

  /**
   * 7.12.3 Reconstruct process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#reconstruct-process)
   */
  reconstruct(plane: number, x: number, y: number, txSz: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const qp = fh.quantization_params;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const isi = tg.intra_segment_id;
    const si = tg.segment_id;
    const coef = tg.coefficients;
    const p = this.decoder.prediction;
    const rad = this.decoder.reconstructionAndDequantization;
    const it = this.decoder.inverseTransform;

    let dqDenom = 1;
    if (txSz == TX_SIZE.TX_32X32 || txSz == TX_SIZE.TX_16X32 || txSz == TX_SIZE.TX_32X16 || txSz == TX_SIZE.TX_16X64 || txSz == TX_SIZE.TX_64X16) {
      dqDenom = 2;
    } else if (txSz == TX_SIZE.TX_64X64 || txSz == TX_SIZE.TX_32X64 || txSz == TX_SIZE.TX_64X32) {
      dqDenom = 4;
    }

    let log2W = Tx_Width_Log2[txSz];
    let log2H = Tx_Height_Log2[txSz];
    let w = 1 << log2W;
    let h = 1 << log2H;
    let tw = Math.min(32, w);
    let th = Math.min(32, h);

    let flipUD = 0;
    if (coef.PlaneTxType == FLIPADST_DCT || coef.PlaneTxType == FLIPADST_ADST || coef.PlaneTxType == V_FLIPADST || coef.PlaneTxType == FLIPADST_FLIPADST) {
      flipUD = 1;
    }
    let flipLR = 0;
    if (coef.PlaneTxType == DCT_FLIPADST || coef.PlaneTxType == ADST_FLIPADST || coef.PlaneTxType == H_FLIPADST || coef.PlaneTxType == FLIPADST_FLIPADST) {
      flipLR = 1;
    }

    // 1.
    for (let i = 0; i < th; i++) {
      for (let j = 0; j < tw; j++) {
        // a.
        let q: number;
        if (i == 0 && j == 0) {
          q = this.get_dc_quant(plane);
        } else {
          q = this.get_ac_quant(plane);
        }

        // b.
        let q2: number; // level
        if (qp.using_qmatrix == 1 && coef.PlaneTxType < IDTX && fh.SegQMLevel[plane][si.segment_id] < 15) {
          q2 = Round2(q * Quantizer_Matrix[fh.SegQMLevel[plane][si.segment_id]][Number(plane > 0)][Qm_Offset[txSz] + i * tw + j], 5);
        } else {
          q2 = q;
        }

        // c.
        let dq = coef.Quant[i * tw + j] * q2;

        // d.
        let sign = dq < 0 ? -1 : 1;

        // e.
        let dq2 = integer((sign * (Math.abs(dq) & 0xffffff)) / dqDenom);

        // f.
        rad.Dequant[i][j] = Clip3(-(1 << (7 + cc.BitDepth)), (1 << (7 + cc.BitDepth)) - 1, dq2);
      }
    }

    // 2.
    it.inverse_transform_2d(txSz);

    // 3.
    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        let xx = flipLR ? w - j - 1 : j;
        let yy = flipUD ? h - i - 1 : i;
        p.CurrFrame[plane][y + yy][x + xx] = Clip1(p.CurrFrame[plane][y + yy][x + xx] + it.Residual[i][j], cc.BitDepth);
      }
    }

    if (isi.Lossless == 1) {
      assert(
        it.Residual.every((v1) => v1.every((v2) => v2 == 1 + cc.BitDepth)),
        "If Lossless is equal to 1, it is a requirement of bitstream conformance that the values written into the Residual array in step 2 are representable by a signed integer with 1 + BitDepth bits."
      );
    }
  }
}
