import { assert } from "console";
import { AV1Decoder } from "./SyntaxStructures/Obu";
import { COMP_REF_TYPE, UV_MODE } from "./SyntaxStructures/Semantics";
import { UINT32_MAX } from "./define";

/**
 * 4.2 Arithmetic operators
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#arithmetic-operators)
 */
export function integer(a: number) {
  return Math.trunc(a);
}
export function ceil(x: number) {
  return Math.ceil(x);
}
export function floor(x: number) {
  return Math.floor(x);
}
export function precision_restricted(v: number, r: number) {
  if (r == 0) {
    return 0;
  }
  let bit = (1 << r) - 1;
  if (v < 0) {
    return -(Math.abs(v) & bit);
  }
  return v & bit;
}

/**
 * 4.5 Bitwise operators
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#bitwise-operators)
 */
export function left_shift_64(a: bigint | number, b: number): bigint {
  if (typeof a == "number") {
    a = BigInt(a);
  }
  return a << BigInt(b);
}
export function right_shift_64(a: bigint | number, b: number): bigint {
  if (typeof a == "number") {
    a = BigInt(a);
  }
  return a >> BigInt(b);
}

/**
 * 4.7 Mathematical functions
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#mathematical-functions)
 */
export function Abs(x: number) {
  return Math.abs(x);
}
export function Clip1(x: number, BitDepth: number) {
  return Clip3(0, Math.pow(2, BitDepth) - 1, x);
}
export function Clip3(low: number, high: number, value: number) {
  return value < low ? low : value > high ? high : value;
}
export function Clip3_64(low: bigint | number, high: bigint | number, value: bigint | number) {
  return value < low ? low : value > high ? high : value;
}
export function Min(x: number, y: number) {
  return Math.min(x, y);
}
export function Max(x: number, y: number) {
  return Math.max(x, y);
}
export function Round2_64(x: bigint | number, n: number) {
  if (typeof x == "number") {
    x = BigInt(x);
  }
  if (n == 0) return x;
  let n2 = BigInt(n);
  return (x + (1n << (n2 - 1n))) >> n2;
}
export function Round2(x: number, n: number) {
  if (n == 0) return x;
  return (x + (1 << (n - 1))) >> n;
}
export function Round2Signed(x: number, n: number) {
  if (x >= 0) {
    return Round2(x, n);
  }
  return -Round2(-x, n);
}
export function Round2Signed_64(x: bigint | number, n: number) {
  if (x >= 0n) {
    return Round2_64(x, n);
  }
  return -Round2_64(-x, n);
}
export function FloorLog2_64(x: bigint | number) {
  if (typeof x == "number") {
    x = BigInt(x);
  }
  let s = 0;
  while (x != 0n) {
    x = x >> 1n;
    s++;
  }
  return s - 1;
}
export function FloorLog2(x: number) {
  let s = 0;
  while (x != 0) {
    x = x >> 1;
    s++;
  }
  return s - 1;
}
export function CeilLog2(x: number) {
  if (x < 2) return 0;
  let i = 1;
  let p = 2;
  while (p < x) {
    i++;
    p = p << 1;
  }
  return i;
}

/**
 * 4.10 Descriptors
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#descriptors)
 */
export class BitReader {
  private buffer: Buffer;
  private bitOffset: number;

  private decoder: AV1Decoder;

  constructor(d: AV1Decoder) {
    this.buffer = Buffer.alloc(0);
    this.bitOffset = 0;

    this.decoder = d;
  }

  initialize(buffer: Buffer) {
    this.buffer = buffer;
    this.bitOffset = 0;
  }

  /**
   * 4.9 Functions
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#functions)
   */
  get_position(): number {
    return this.bitOffset;
  }
  get_tell_position(): number {
    return this.buffer.length * 8;
  }

  /**
   * 4.10.2 f(n)
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#fn)
   */
  f(n: number): any {
    if (n % 8 == 0 && this.bitOffset % 8 == 0) {
      return this.number(n / 8);
    }
    let x = 0;
    for (let i = 0; i < n; i++) {
      x = 2 * x + this.read_bit();
    }
    return x;
  }

  /**
   * 4.10.3 uvlc()
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#uvlc)
   */
  uvlc(): number {
    let leadingZeros = 0;
    while (1) {
      let done = this.f(1);
      if (done) {
        break;
      }
      leadingZeros++;
    }
    if (leadingZeros >= 32) {
      return UINT32_MAX;
    }
    let value = this.f(leadingZeros);
    return value + (1 << leadingZeros) - 1;
  }

  /**
   * 4.10.4 le(n)
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#len)
   */
  le(n: number): number {
    let t = 0;
    for (let i = 0; i < n; i++) {
      let byte = this.f(8);
      t += byte << (i * 8);
    }
    return t;
  }

  /**
   * 4.10.5 leb128()
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#leb128)
   */
  leb128(): number {
    let value = 0n;
    let Leb128Bytes = 0;
    for (let i = 0; i < 8; i++) {
      let leb128_byte = this.f(8);
      value |= BigInt(leb128_byte & 0x7f) << BigInt(i * 7);
      Leb128Bytes += 1;
      if (!(leb128_byte & 0x80)) {
        break;
      }
      if (i == 7) {
        assert((leb128_byte & 0x80) == 0, "It is a requirement of bitstream conformance that the most significant bit of leb128_byte is equal to 0 if i is equal to 7.");
      }
    }

    assert(value <= UINT32_MAX, "It is a requirement of bitstream conformance that the value returned from the leb128 parsing process is less than or equal to UINT32_MAX.");
    return Number(value);
  }

  /**
   * 4.10.6 leb128()
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#sun)
   */
  su(n: number): number {
    let value = this.f(n);
    let signMask = 1 << (n - 1);
    if (value & signMask) value = value - 2 * signMask;
    return value;
  }

  /**
   * 4.10.7 ns(n)
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#nsn)
   */
  ns(n: number): number {
    let w = FloorLog2(n) + 1;
    let m = (1 << w) - n;
    let v = this.f(w - 1);
    if (v < m) return v;
    let extra_bit = this.f(1);
    return (v << 1) - m + extra_bit;
  }

  /**
   * 4.10.8 L(n)
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#ln)
   */
  L(n: number): number {
    const sd = this.decoder.symbolDecoder;
    let x = 0;
    for (let i = 0; i < n; i++) {
      x = 2 * x + sd.read_bool();
    }
    return x;
  }

  S(name: "use_intrabc", data?: any): number;
  S(name: "intra_frame_y_mode", data?: any): UV_MODE;
  S(name: "y_mode", data?: any): number;
  S(name: "uv_mode", data?: any): UV_MODE;
  S(name: "angle_delta_y", data?: any): number;
  S(name: "angle_delta_uv", data?: any): number;
  S(name: "partition", data: { r: number; c: number; bSize: number }): number;
  S(name: "split_or_horz", data: { r: number; c: number; bSize: number }): number;
  S(name: "split_or_vert", data: { r: number; c: number; bSize: number }): number;
  S(name: "tx_depth", data?: any): number;
  S(name: "txfm_split", data?: any): number;
  S(name: "segment_id", data?: any): number;
  S(name: "seg_id_predicted", data?: any): number;
  S(name: "new_mv", data?: any): number;
  S(name: "zero_mv", data?: any): number;
  S(name: "ref_mv", data?: any): number;
  S(name: "drl_mode", data?: any): number;
  S(name: "is_inter", data?: any): number;
  S(name: "use_filter_intra", data?: any): number;
  S(name: "filter_intra_mode", data?: any): number;
  S(name: "comp_mode", data?: any): number;
  S(name: "skip_mode", data?: any): number;
  S(name: "skip", data?: any): number;
  S(name: "comp_ref", data?: any): number;
  S(name: "comp_ref_p1", data?: any): number;
  S(name: "comp_ref_p2", data?: any): number;
  S(name: "comp_bwdref", data?: any): number;
  S(name: "comp_bwdref_p1", data?: any): number;
  S(name: "single_ref_p1", data?: any): number;
  S(name: "single_ref_p2", data?: any): number;
  S(name: "single_ref_p3", data?: any): number;
  S(name: "single_ref_p4", data?: any): number;
  S(name: "single_ref_p4", data?: any): number;
  S(name: "single_ref_p5", data?: any): number;
  S(name: "single_ref_p6", data?: any): number;
  S(name: "compound_mode", data?: any): number;
  S(name: "interp_filter", data: { dir: number }): number;
  S(name: "motion_mode", data?: any): number;
  S(name: "mv_joint", data?: any): number;
  S(name: "mv_sign", data?: any): number;
  S(name: "mv_class", data?: any): number;
  S(name: "mv_class0_bit", data?: any): number;
  S(name: "mv_class0_fr", data?: any): number;
  S(name: "mv_class0_hp", data?: any): number;
  S(name: "mv_fr", data?: any): number;
  S(name: "mv_hp", data?: any): number;
  S(name: "mv_bit", data?: any): number;
  S(name: "all_zero", data: { txSzCtx: number; plane: number; txSz: number; x4: number; y4: number; w4: number; h4: number }): number;
  S(name: "eob_pt_16", data: { plane: number; txSz: number; x4: number; y4: number; ptype: number }): number;
  S(name: "eob_pt_32", data: { plane: number; txSz: number; x4: number; y4: number; ptype: number }): number;
  S(name: "eob_pt_64", data: { plane: number; txSz: number; x4: number; y4: number; ptype: number }): number;
  S(name: "eob_pt_128", data: { plane: number; txSz: number; x4: number; y4: number; ptype: number }): number;
  S(name: "eob_pt_256", data: { plane: number; txSz: number; x4: number; y4: number; ptype: number }): number;
  S(name: "eob_pt_512", data: { plane: number; txSz: number; x4: number; y4: number; ptype: number }): number;
  S(name: "eob_pt_1024", data: { plane: number; txSz: number; x4: number; y4: number; ptype: number }): number;
  S(name: "eob_extra", data: { txSzCtx: number; ptype: number; eobPt: number }): number;
  S(name: "coeff_base", data?: any): number;
  S(name: "coeff_base_eob", data?: any): number;
  S(name: "dc_sign", data?: any): number;
  S(name: "coeff_br", data?: any): number;
  S(name: "has_palette_y", data?: any): number;
  S(name: "has_palette_uv", data?: any): number;
  S(name: "palette_size_y_minus_2", data?: any): number;
  S(name: "palette_size_uv_minus_2", data?: any): number;
  S(name: "palette_color_idx_y", data?: any): number;
  S(name: "palette_color_idx_uv", data?: any): number;
  S(name: "delta_q_abs", data?: any): number;
  S(name: "delta_lf_abs", data?: any): number;
  S(name: "intra_tx_type", data?: any): number;
  S(name: "inter_tx_type", data?: any): number;
  S(name: "comp_ref_type", data?: any): COMP_REF_TYPE;
  S(name: "uni_comp_ref", data?: any): number;
  S(name: "uni_comp_ref_p1", data?: any): number;
  S(name: "uni_comp_ref_p2", data?: any): number;
  S(name: "comp_group_idx", data?: any): number;
  S(name: "compound_idx", data?: any): number;
  S(name: "compound_type", data?: any): number;
  S(name: "interintra", data?: any): number;
  S(name: "interintra_mode", data?: any): number;
  S(name: "wedge_index", data?: any): number;
  S(name: "wedge_interintra", data?: any): number;
  S(name: "use_obmc", data?: any): number;
  S(name: "cfl_alpha_signs", data?: any): number;
  S(name: "cfl_alpha_u", data?: any): number;
  S(name: "cfl_alpha_v", data?: any): number;
  S(name: "use_wiener", data?: any): number;
  S(name: "use_sgrproj", data?: any): number;
  S(name: "restoration_type", data?: any): number;
  /**
   * 4.10.9 S()
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#s)
   */
  S(name: string, data: any) {
    const ce = this.decoder.cdfEncoded as any;
    if (name in ce) {
      return ce[name](data);
    }
    assert(false, "Cdf selection failed");
    return 0;
  }

  /**
   * 4.10.10 NS(n)
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#nsn-1)
   */
  NS(n: number) {
    let w = FloorLog2(n) + 1;
    let m = (1 << w) - n;
    let v = this.L(w - 1);
    if (v < m) return v;

    let extra_bit = this.L(1);
    return (v << 1) - m + extra_bit;
  }

  byte(length: number): Buffer {
    const byteOffset = this.bitOffset >> 3;
    const subBuffer = this.buffer.subarray(byteOffset, byteOffset + length);
    this.bitOffset += 8 * length;
    return subBuffer;
  }

  number(length: number): number {
    let result = 0;
    for (let i = 0; i < length; i++) {
      result = (result << 8) + this.read_byte();
    }
    return result;
  }

  numberLE(length: number): number {
    let result = 0;
    for (let i = 0; i < length; i++) {
      result = result + (this.read_byte() << (8 * i));
    }
    return result;
  }

  skip(length: number) {
    this.bitOffset += length;
  }

  seek(length: number) {
    this.bitOffset = length;
  }

  string(length: number) {
    let result = "";
    for (let i = 0; i < length; i++) {
      result += String.fromCharCode(this.read_byte());
    }
    return result;
  }

  private read_bit(): number {
    const byteOffset = this.bitOffset >> 3;
    const bitOffset = this.bitOffset & 7;
    const bit = (this.buffer[byteOffset] >> (7 - bitOffset)) & 1;
    this.bitOffset++;
    return bit;
  }

  private read_byte(): number {
    const byteOffset = this.bitOffset >> 3;
    const byte = this.buffer[byteOffset];
    this.bitOffset += 8;
    return byte;
  }
}

type IndexRange =
  | number
  | {
      startIndex: number;
      endIndex: number;
    };

export function Array1D(len1?: IndexRange, fill?: any) {
  if (typeof len1 == "undefined") {
    return [];
  } else if (typeof len1 == "number") {
    return Array.from({ length: len1 }, (item) => fill);
  } else {
    let arr: any[] = [];
    for (let i = len1.startIndex; i < len1.endIndex; i++) {
      arr[i] = fill;
    }
    return arr;
  }
}

export function Array2D(len1: IndexRange, len2?: IndexRange, fill?: any): any[][] {
  if (typeof len1 == "number") {
    return Array.from({ length: len1 }, (item) => Array1D(len2, fill));
  } else {
    let arr: any[] = [];
    for (let i = len1.startIndex; i < len1.endIndex; i++) {
      arr[i] = Array1D(len2, fill);
    }
    return arr;
  }
}

export function Array3D(len1: IndexRange, len2: IndexRange, len3?: IndexRange, fill?: any): any[][][] {
  if (typeof len1 == "number") {
    return Array.from({ length: len1 }, (item) => Array2D(len2, len3, fill));
  } else {
    let arr: any[] = [];
    for (let i = len1.startIndex; i < len1.endIndex; i++) {
      arr[i] = Array2D(len2, len3, fill);
    }
    return arr;
  }
}

export function Array4D(len1: IndexRange, len2: IndexRange, len3: IndexRange, len4?: IndexRange, fill?: any) {
  if (typeof len1 == "number") {
    return Array.from({ length: len1 }, (item) => Array3D(len2, len3, len4, fill));
  } else {
    let arr: any[] = [];
    for (let i = len1.startIndex; i < len1.endIndex; i++) {
      arr[i] = Array3D(len2, len3, len4, fill);
    }
    return arr;
  }
}

export function Array5D(len1: IndexRange, len2: IndexRange, len3: IndexRange, len4: IndexRange, len5?: IndexRange, fill?: any) {
  if (typeof len1 == "number") {
    return Array.from({ length: len1 }, (item) => Array4D(len2, len3, len4, len5, fill));
  } else {
    let arr: any[] = [];
    for (let i = len1.startIndex; i < len1.endIndex; i++) {
      arr[i] = Array4D(len2, len3, len4, len5, fill);
    }
    return arr;
  }
}

export function clone<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

/**
 * 8.2.6 Symbol decoding process
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#symbol-decoding-process)
 */
export function inverseCdf<T>(t: T): T {
  const data = t as any;
  if (typeof data[0] == "number") {
    return data.map((x: number) => (x ? (1 << 15) - x : 0));
  } else {
    return data.map((x: any) => inverseCdf(x));
  }
}

export function clone_cdf(dst: any, src: any, clearCount?: boolean) {
  if (Array.isArray(src) && typeof src[0] == "number") {
    for (let i = 0; i < src.length; i++) {
      dst[i] = src[i];
      if (clearCount && i == src.length - 1) {
        dst[i] = 0;
      }
    }
    return;
  }
  for (let k of Object.keys(src)) {
    if (dst[k] == undefined) {
      dst[k] = [];
    }
    clone_cdf(dst[k], src[k], clearCount);
  }
}

export function listCompare(a: number[], b: number[]) {
  if (a.length != a.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] != b[i]) {
      return false;
    }
  }
  return true;
}
