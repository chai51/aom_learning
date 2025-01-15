import { Array2D, Clip3, clone, precision_restricted, Round2 } from "../Conventions";
import * as AV1 from "../define";
import { AV1Decoder } from "../SyntaxStructures/Obu";

import { Tx_Height_Log2, Tx_Width_Log2 } from "../AdditionalTables/ConversionTables";

const Transform_Row_Shift = [0, 1, 2, 2, 2, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2];

/**
 * 7.13 Inverse transform process
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-transform-process)
 */
export class InverseTransform {
  Residual: number[][];
  private T: number[];

  private decoder: AV1Decoder;

  constructor(d: AV1Decoder) {
    this.Residual = Array2D(64);
    this.T = [];

    this.decoder = d;
  }

  /**
   * 7.13.2.1 Butterfly functions
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-transform-process)
   */
  brev(numBits: number, x: number) {
    let t = 0;
    for (let i = 0; i < numBits; i++) {
      let bit = (x >>> i) & 1;
      t += bit << (numBits - 1 - i);
    }
    return t;
  }
  // [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-transform-process)
  B0(a: number, b: number, angle: number, _0: number, r: number) {
    // 1.
    let x = this.T[a] * this.cos128(angle) - this.T[b] * this.sin128(angle);

    // 2.
    let y = this.T[a] * this.sin128(angle) + this.T[b] * this.cos128(angle);

    // 3.
    this.T[a] = Round2(x, 12);

    // 4.
    this.T[b] = Round2(y, 12);

    this.T[a] = precision_restricted(this.T[a], r);
    this.T[b] = precision_restricted(this.T[b], r);
  }
  // [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-transform-process)
  cos128(angle: number) {
    const Cos128_Lookup: number[] = [
      4096, 4095, 4091, 4085, 4076, 4065, 4052, 4036, 4017, 3996, 3973, 3948, 3920, 3889, 3857, 3822, 3784, 3745, 3703, 3659, 3612, 3564, 3513, 3461, 3406, 3349, 3290, 3229, 3166,
      3102, 3035, 2967, 2896, 2824, 2751, 2675, 2598, 2520, 2440, 2359, 2276, 2191, 2106, 2019, 1931, 1842, 1751, 1660, 1567, 1474, 1380, 1285, 1189, 1092, 995, 897, 799, 700, 601,
      501, 401, 301, 201, 101, 0,
    ];
    // 1.
    let angle2 = angle & 255;
    // 2.
    if (angle2 >= 0 && angle2 <= 64) {
      return Cos128_Lookup[angle2];
    }
    // 3.
    else if (angle2 > 64 && angle2 <= 128) {
      return Cos128_Lookup[128 - angle2] * -1;
    }
    // 4.
    else if (angle2 > 128 && angle2 <= 192) {
      return Cos128_Lookup[angle2 - 128] * -1;
    }
    // 5.
    else {
      return Cos128_Lookup[256 - angle2];
    }
  }
  // [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-transform-process)
  sin128(angle: number) {
    return this.cos128(angle - 64);
  }
  // [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-transform-process)
  B(a: number, b: number, angle: number, _1: number, r: number) {
    if (_1 == 0) {
      return this.B0(a, b, angle, 0, r);
    }
    let T = this.T;
    this.B0(a, b, angle, 0, r);
    [T[a], T[b]] = [T[b], T[a]];
  }
  // [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-transform-process)
  H0(a: number, b: number, _0: number, r: number) {
    let T = this.T;
    let x = T[a];
    let y = T[b];
    T[a] = Clip3(-(1 << (r - 1)), (1 << (r - 1)) - 1, x + y);
    T[b] = Clip3(-(1 << (r - 1)), (1 << (r - 1)) - 1, x - y);
  }
  // [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-transform-process)
  H(a: number, b: number, _1: number, r: number) {
    if (_1 == 0) {
      return this.H0(a, b, 0, r);
    }
    this.H0(b, a, 0, r);
  }

  /**
   * 7.13.2.2 Inverse DCT array permutation process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-dct-array-permutation-process)
   */
  inverse_dct_array_permutation(n: number) {
    let copyT = clone(this.T);
    for (let i = 0; i < 1 << n; i++) {
      this.T[i] = copyT[this.brev(n, i)];
    }
  }

  /**
   * 7.13.2.3 Inverse DCT process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-dct-process)
   */
  inverse_DCT_process(n: number, r: number): void {
    let T = this.T;
    // 1.
    this.inverse_dct_array_permutation(n);
    // 2.
    if (n == 6) {
      for (let i = 0; i <= 15; i++) {
        this.B(32 + i, 63 - i, 63 - 4 * this.brev(4, i), 0, r);
      }
    }
    // 3.
    if (n >= 5) {
      for (let i = 0; i <= 7; i++) {
        this.B(16 + i, 31 - i, 6 + (this.brev(3, 7 - i) << 3), 0, r);
      }
    }
    // 4.
    if (n == 6) {
      for (let i = 0; i <= 15; i++) {
        this.H(32 + i * 2, 33 + i * 2, i & 1, r);
      }
    }
    // 5.
    if (n >= 4) {
      for (let i = 0; i <= 3; i++) {
        this.B(8 + i, 15 - i, 12 + (this.brev(2, 3 - i) << 4), 0, r);
      }
    }
    // 6.
    if (n >= 5) {
      for (let i = 0; i <= 7; i++) {
        this.H(16 + 2 * i, 17 + 2 * i, i & 1, r);
      }
    }
    // 7.
    if (n == 6) {
      for (let i = 0; i <= 3; i++) {
        for (let j = 0; j <= 1; j++) {
          this.B(62 - i * 4 - j, 33 + i * 4 + j, 60 - 16 * this.brev(2, i) + 64 * j, 1, r);
        }
      }
    }
    // 8.
    if (n >= 3) {
      for (let i = 0; i <= 1; i++) {
        this.B(4 + i, 7 - i, 56 - 32 * i, 0, r);
      }
    }
    // 9.
    if (n >= 4) {
      for (let i = 0; i <= 3; i++) {
        this.H(8 + 2 * i, 9 + 2 * i, i & 1, r);
      }
    }
    // 10.
    if (n >= 5) {
      for (let i = 0; i <= 1; i++) {
        for (let j = 0; j <= 1; j++) {
          this.B(30 - 4 * i - j, 17 + 4 * i + j, 24 + (j << 6) + ((1 - i) << 5), 1, r);
        }
      }
    }
    // 11.
    if (n == 6) {
      for (let i = 0; i <= 7; i++) {
        for (let j = 0; j <= 1; j++) {
          this.H(32 + i * 4 + j, 35 + i * 4 - j, i & 1, r);
        }
      }
    }
    // 12.
    for (let i = 0; i <= 1; i++) {
      this.B(2 * i, 2 * i + 1, 32 + 16 * i, 1 - i, r);
    }
    // 13.
    if (n >= 3) {
      for (let i = 0; i <= 1; i++) {
        this.H(4 + 2 * i, 5 + 2 * i, i, r);
      }
    }
    // 14.
    if (n >= 4) {
      for (let i = 0; i <= 1; i++) {
        this.B(14 - i, 9 + i, 48 + 64 * i, 1, r);
      }
    }
    // 15.
    if (n >= 5) {
      for (let i = 0; i <= 3; i++) {
        for (let j = 0; j <= 1; j++) {
          this.H(16 + 4 * i + j, 19 + 4 * i - j, i & 1, r);
        }
      }
    }
    // 16.
    if (n == 6) {
      for (let i = 0; i <= 1; i++) {
        for (let j = 0; j <= 3; j++) {
          this.B(61 - i * 8 - j, 34 + i * 8 + j, 56 - i * 32 + (j >> 1) * 64, 1, r);
        }
      }
    }
    // 17.
    for (let i = 0; i <= 1; i++) {
      this.H(i, 3 - i, 0, r);
    }
    // 18.
    if (n >= 3) {
      this.B(6, 5, 32, 1, r);
    }
    // 19.
    if (n >= 4) {
      for (let i = 0; i <= 1; i++) {
        for (let j = 0; j <= 1; j++) {
          this.H(8 + 4 * i + j, 11 + 4 * i - j, i, r);
        }
      }
    }
    // 20.
    if (n >= 5) {
      for (let i = 0; i <= 3; i++) {
        this.B(29 - i, 18 + i, 48 + (i >> 1) * 64, 1, r);
      }
    }
    // 21.
    if (n == 6) {
      for (let i = 0; i <= 3; i++) {
        for (let j = 0; j <= 3; j++) {
          this.H(32 + 8 * i + j, 39 + 8 * i - j, i & 1, r);
        }
      }
    }
    // 22.
    if (n >= 3) {
      for (let i = 0; i <= 3; i++) {
        this.H(i, 7 - i, 0, r);
      }
    }
    // 23.
    if (n >= 4) {
      for (let i = 0; i <= 1; i++) {
        this.B(13 - i, 10 + i, 32, 1, r);
      }
    }
    // 24.
    if (n >= 5) {
      for (let i = 0; i <= 1; i++) {
        for (let j = 0; j <= 3; j++) {
          this.H(16 + i * 8 + j, 23 + i * 8 - j, i, r);
        }
      }
    }
    // 25.
    if (n == 6) {
      for (let i = 0; i <= 7; i++) {
        this.B(59 - i, 36 + i, i < 4 ? 48 : 112, 1, r);
      }
    }
    // 26.
    if (n >= 4) {
      for (let i = 0; i <= 7; i++) {
        this.H(i, 15 - i, 0, r);
      }
    }
    // 27.
    if (n >= 5) {
      for (let i = 0; i <= 3; i++) {
        this.B(27 - i, 20 + i, 32, 1, r);
      }
    }
    // 28.
    if (n == 6) {
      for (let i = 0; i <= 7; i++) {
        this.H(32 + i, 47 - i, 0, r);
        this.H(48 + i, 63 - i, 1, r);
      }
    }
    // 29.
    if (n >= 5) {
      for (let i = 0; i <= 15; i++) {
        this.H(i, 31 - i, 0, r);
      }
    }
    // 30.
    if (n == 6) {
      for (let i = 0; i <= 7; i++) {
        this.B(55 - i, 40 + i, 32, 1, r);
      }
    }
    // 31.
    if (n == 6) {
      for (let i = 0; i <= 31; i++) {
        this.H(i, 63 - i, 0, r);
      }
    }
  }

  /**
   * 7.13.2.4 Inverse ADST input array permutation process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-adst-input-array-permutation-process)
   */
  inverse_adst_input_array_permutation(n: number) {
    let n0 = 1 << n;
    let copyT = clone(this.T);

    for (let i = 0; i < n0; i++) {
      let idx = i & 1 ? i - 1 : n0 - i - 1;
      this.T[i] = copyT[idx];
    }
  }

  /**
   * 7.13.2.5 Inverse ADST output array permutation process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-adst-output-array-permutation-process)
   */
  inverse_adst_output_array_permutation_process(n: number) {
    let T = this.T;
    let n0 = 1 << n;
    let copyT = clone(this.T);
    for (let i = 0; i < n0; i++) {
      let a = (i >> 3) & 1;
      let b = ((i >> 2) & 1) ^ ((i >> 3) & 1);
      let c = ((i >> 1) & 1) ^ ((i >> 2) & 1);
      let d = (i & 1) ^ ((i >> 1) & 1);
      let idx = ((d << 3) | (c << 2) | (b << 1) | a) >> (4 - n);
      T[i] = i & 1 ? -copyT[idx] : copyT[idx];
    }
  }

  /**
   * 7.13.2.6 Inverse ADST4 process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-adst4-process)
   */
  inverse_adst4_process(r: number) {
    let T = this.T;
    let s: number[] = [];
    let x: number[] = [];

    const SINPI_1_9 = 1321;
    const SINPI_2_9 = 2482;
    const SINPI_3_9 = 3344;
    const SINPI_4_9 = 3803;

    s[0] = SINPI_1_9 * T[0];
    s[1] = SINPI_2_9 * T[0];
    s[2] = SINPI_3_9 * T[1];
    s[3] = SINPI_4_9 * T[2];
    s[4] = SINPI_1_9 * T[2];
    s[5] = SINPI_2_9 * T[3];
    s[6] = SINPI_4_9 * T[3];
    let a7 = precision_restricted(T[0] - T[2], r + 1);
    let b7 = precision_restricted(a7 + T[3], r);

    s[0] = s[0] + s[3];
    s[1] = s[1] - s[4];
    s[3] = s[2];
    s[2] = SINPI_3_9 * b7;

    s[0] = s[0] + s[5];
    s[1] = s[1] - s[6];
    s = s.map((v) => precision_restricted(v, r + 12));

    x[0] = s[0] + s[3];
    x[1] = s[1] + s[3];
    x[2] = s[2];
    x[3] = s[0] + s[1];

    x[3] = x[3] - s[3];
    x = x.map((v) => precision_restricted(v, r + 12));

    T[0] = Round2(x[0], 12);
    T[1] = Round2(x[1], 12);
    T[2] = Round2(x[2], 12);
    T[3] = Round2(x[3], 12);
  }

  /**
   * 7.13.2.7 Inverse ADST8 process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-adst8-process)
   */
  inverse_adst8_process(r: number) {
    // 1.
    this.inverse_adst_input_array_permutation(3);
    // 2.
    for (let i = 0; i <= 3; i++) {
      this.B(2 * i, 2 * i + 1, 60 - 16 * i, 1, r);
    }
    // 3.
    for (let i = 0; i <= 3; i++) {
      this.H(i, 4 + i, 0, r);
    }
    // 4.
    for (let i = 0; i <= 1; i++) {
      this.B(4 + 3 * i, 5 + i, 48 - 32 * i, 1, r);
    }
    // 5.
    for (let i = 0; i <= 1; i++) {
      for (let j = 0; j <= 1; j++) {
        this.H(4 * j + i, 2 + 4 * j + i, 0, r);
      }
    }
    // 6.
    for (let i = 0; i <= 1; i++) {
      this.B(2 + 4 * i, 3 + 4 * i, 32, 1, r);
    }
    // 7.
    this.inverse_adst_output_array_permutation_process(3);
  }

  /**
   * 7.13.2.8 Inverse ADST16 process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-adst16-process)
   */
  inverse_adst16_process(r: number) {
    // 1.
    this.inverse_adst_input_array_permutation(4);

    // 2.
    for (let i = 0; i <= 7; i++) {
      this.B(2 * i, 2 * i + 1, 62 - 8 * i, 1, r);
    }

    // 3.
    for (let i = 0; i <= 7; i++) {
      this.H(i, 8 + i, 0, r);
    }

    // 4.
    for (let i = 0; i <= 1; i++) {
      this.B(8 + 2 * i, 9 + 2 * i, 56 - 32 * i, 1, r);
      this.B(13 + 2 * i, 12 + 2 * i, 8 + 32 * i, 1, r);
    }

    // 5.
    for (let i = 0; i <= 3; i++) {
      for (let j = 0; j <= 1; j++) {
        this.H(8 * j + i, 4 + 8 * j + i, 0, r);
      }
    }

    // 6.
    for (let i = 0; i <= 1; i++) {
      for (let j = 0; j <= 1; j++) {
        this.B(4 + 8 * j + 3 * i, 5 + 8 * j + i, 48 - 32 * i, 1, r);
      }
    }

    // 7.
    for (let i = 0; i <= 1; i++) {
      for (let j = 0; j <= 3; j++) {
        this.H(4 * j + i, 2 + 4 * j + i, 0, r);
      }
    }

    // 8.
    for (let i = 0; i <= 3; i++) {
      this.B(2 + 4 * i, 3 + 4 * i, 32, 1, r);
    }

    // 9.
    this.inverse_adst_output_array_permutation_process(4);
  }

  /**
   * 7.13.2.9 Inverse ADST process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-adst-process)
   */
  inverse_adst_process(n: number, r: number) {
    if (n == 2) {
      this.inverse_adst4_process(r);
    } else if (n == 3) {
      this.inverse_adst8_process(r);
    } else {
      this.inverse_adst16_process(r);
    }
  }

  /**
   * 7.13.2.10 Inverse Walsh-Hadamard transform process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-walsh-hadamard-transform-process)
   */
  inverse_WalshHadamard_transform_process(shift: number) {
    let T = this.T;
    let a = T[0] >> shift;
    let c = T[1] >> shift;
    let d = T[2] >> shift;
    let b = T[3] >> shift;
    a += c;
    d -= b;
    let e = (a - d) >>> 1;
    b = e - b;
    c = e - c;
    a -= b;
    d += c;
    T[0] = a;
    T[1] = b;
    T[2] = c;
    T[3] = d;
  }

  /**
   * 7.13.2.11 Inverse identity transform 4 process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-identity-transform-4-process)
   */
  inverse_identity_transform_4() {
    for (let i = 0; i <= 3; i++) {
      this.T[i] = Round2(this.T[i] * 5793, 12);
    }
  }

  /**
   * 7.13.2.12 Inverse identity transform 8 process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-identity-transform-8-process)
   */
  inverse_identity_transform_8() {
    for (let i = 0; i <= 7; i++) {
      this.T[i] = this.T[i] * 2;
    }
  }

  /**
   * 7.13.2.13 Inverse identity transform 16 process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-identity-transform-16-process)
   */
  inverse_identity_transform_16() {
    for (let i = 0; i <= 15; i++) {
      this.T[i] = Round2(this.T[i] * 11586, 12);
    }
  }

  /**
   * 7.13.2.14 Inverse identity transform 32 process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-identity-transform-32-process)
   */
  inverse_identity_transform_32() {
    for (let i = 0; i <= 31; i++) {
      this.T[i] = this.T[i] * 4;
    }
  }

  /**
   * 7.13.2.15 Inverse identity transform process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#inverse-identity-transform-process)
   */
  inverse_identity_transform_process(n: number) {
    if (n == 2) {
      this.inverse_identity_transform_4();
    } else if (n == 3) {
      this.inverse_identity_transform_8();
    } else if (n == 4) {
      this.inverse_identity_transform_16();
    } else if (n == 5) {
      this.inverse_identity_transform_32();
    }
  }

  /**
   * 7.13.3 2D inverse transform process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#2d-inverse-transform-process)
   */
  inverse_transform_2d(txSz: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const isi = tg.intra_segment_id;
    const coef = tg.coefficients;
    const rad = this.decoder.reconstructionAndDequantization;

    let log2W = Tx_Width_Log2[txSz];
    let log2H = Tx_Height_Log2[txSz];
    let w = 1 << log2W;
    let h = 1 << log2H;
    let rowShift = isi.Lossless ? 0 : Transform_Row_Shift[txSz];
    let colShift = isi.Lossless ? 0 : 4;
    const rowClampRange = cc.BitDepth + 8;
    const colClampRange = Math.max(cc.BitDepth + 6, 16);
    this.Residual = Array2D(h);

    for (let i = 0; i < h; i++) {
      let T: number[] = [];
      this.T = T;
      for (let j = 0; j < w; j++) {
        if (i < 32 && j < 32) {
          T[j] = rad.Dequant[i][j];
        } else {
          T[j] = 0;
        }
      }
      if (Math.abs(log2W - log2H) === 1) {
        for (let j = 0; j < w; j++) {
          T[j] = Round2(T[j] * 2896, 12);
        }
      }
      if (isi.Lossless == 1) {
        this.inverse_WalshHadamard_transform_process(2);
      } else if (coef.PlaneTxType === AV1.DCT_DCT || coef.PlaneTxType === AV1.ADST_DCT || coef.PlaneTxType === AV1.FLIPADST_DCT || coef.PlaneTxType === AV1.H_DCT) {
        this.inverse_DCT_process(log2W, rowClampRange);
      } else if (
        coef.PlaneTxType === AV1.DCT_ADST ||
        coef.PlaneTxType === AV1.ADST_ADST ||
        coef.PlaneTxType === AV1.DCT_FLIPADST ||
        coef.PlaneTxType === AV1.FLIPADST_FLIPADST ||
        coef.PlaneTxType === AV1.ADST_FLIPADST ||
        coef.PlaneTxType === AV1.FLIPADST_ADST ||
        coef.PlaneTxType === AV1.H_ADST ||
        coef.PlaneTxType === AV1.H_FLIPADST
      ) {
        this.inverse_adst_process(log2W, rowClampRange);
      } else {
        this.inverse_identity_transform_process(log2W);
      }
      for (let j = 0; j < w; j++) {
        this.Residual[i][j] = Round2(T[j], rowShift);
      }
    }

    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        this.Residual[i][j] = Clip3(-(1 << (colClampRange - 1)), (1 << (colClampRange - 1)) - 1, this.Residual[i][j]);
      }
    }

    for (let j = 0; j < w; j++) {
      let T: number[] = [];
      this.T = T;
      for (let i = 0; i < h; i++) {
        T[i] = this.Residual[i][j];
      }
      if (isi.Lossless == 1) {
        this.inverse_WalshHadamard_transform_process(2);
      } else if (coef.PlaneTxType === AV1.DCT_DCT || coef.PlaneTxType === AV1.DCT_ADST || coef.PlaneTxType === AV1.DCT_FLIPADST || coef.PlaneTxType === AV1.V_DCT) {
        this.inverse_DCT_process(log2H, colClampRange);
      } else if (
        coef.PlaneTxType === AV1.ADST_DCT ||
        coef.PlaneTxType === AV1.ADST_ADST ||
        coef.PlaneTxType === AV1.FLIPADST_DCT ||
        coef.PlaneTxType === AV1.FLIPADST_FLIPADST ||
        coef.PlaneTxType === AV1.ADST_FLIPADST ||
        coef.PlaneTxType === AV1.FLIPADST_ADST ||
        coef.PlaneTxType === AV1.V_ADST ||
        coef.PlaneTxType === AV1.V_FLIPADST
      ) {
        this.inverse_adst_process(log2H, colClampRange);
      } else {
        this.inverse_identity_transform_process(log2H);
      }
      for (let i = 0; i < h; i++) {
        this.Residual[i][j] = Round2(T[i], colShift);
      }
    }
  }
}
