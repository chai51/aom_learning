import { Array2D, Array3D, Array4D, Clip1, Clip3, integer, Round2 } from "../Conventions";
import { AV1Decoder } from "../SyntaxStructures/Obu";

import { MATRIX_COEFFICIENTS } from "../SyntaxStructures/Semantics";

import { Gaussian_Sequence } from "../AdditionalTables/ConversionTables";

/**
 * 7.18 Output process
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#loop-restoration-process)
 */
export class Output {
  private RandomRegister!: number;
  private GrainCenter!: number;
  private GrainMin!: number;
  private GrainMax!: number;
  private LumaGrain: number[][] = [];
  private CbGrain: number[][] = [];
  private CrGrain: number[][] = [];
  private ScalingLut: number[][] = [];
  private ScalingShift!: number;
  cameraTile: {
    OutY: number[][];
    OutU: number[][];
    OutV: number[][];
  } = {
    OutY: [],
    OutU: [],
    OutV: [],
  };

  private decoder: AV1Decoder;

  constructor(d: AV1Decoder) {
    this.decoder = d;
  }

  initialize() {}

  /**
   * 7.18.1 General
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#general-17)
   */
  output() {
    this.initialize();

    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const fgp = fh.film_grain_params;
    const ct = this.cameraTile;

    if (seqHeader.OperatingPointIdc != 0) {
      // TODO
    }

    let { w, h, subX, subY } = this.intermediate_output_preparation();

    if (seqHeader.film_grain_params_present == 1 && fgp.apply_grain == 1) {
      this.film_grain_synthesis(w, h, subX, subY);
    }
  }

  /**
   * 7.18.2 Intermediate output preparation process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#intermediate-output-preparation-process)
   */
  //
  intermediate_output_preparation() {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const fs = fh.frame_size;
    const fswr = fh.frame_size_with_refs;
    const rf = fh.ref_frames;
    const lstd = this.decoder.largeScaleTileDecoding;
    const lr = this.decoder.loopRestoration;
    const ct = this.decoder.output.cameraTile;
    const rfu = this.decoder.referenceFrameUpdate;

    if (fh.show_existing_frame == 1) {
      let w = rf.RefUpscaledWidth[fh.frame_to_show_map_idx];
      let h = rf.RefFrameHeight[fh.frame_to_show_map_idx];
      let subX = lstd.RefSubsamplingX[fh.frame_to_show_map_idx];
      let subY = lstd.RefSubsamplingY[fh.frame_to_show_map_idx];

      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
          ct.OutY[y][x] = rfu.FrameStore[fh.frame_to_show_map_idx][0][y][x];
        }
      }

      for (let x = 0; x < (w + subX) >> subX; x++) {
        for (let y = 0; y < (h + subY) >> subY; y++) {
          ct.OutU[y][x] = rfu.FrameStore[fh.frame_to_show_map_idx][1][y][x];
        }
      }

      for (let x = 0; x < (w + subX) >> subX; x++) {
        for (let y = 0; y < (h + subY) >> subY; y++) {
          /**
           * @docs error description
           * sample at location x samples across and y samples down is given by OutV[ y ][ x ] = FrameStore[ frame_to_show_map_idx ][ 2 ][ y ][ x ]
           */
          ct.OutV[y][x] = rfu.FrameStore[fh.frame_to_show_map_idx][2][y][x];
        }
      }

      cc.BitDepth = lstd.RefBitDepth[fh.frame_to_show_map_idx];
      return { w, h, subX, subY };
    } else {
      let w = fswr.UpscaledWidth;
      let h = fs.FrameHeight;
      let subX = cc.subsampling_x;
      let subY = cc.subsampling_y;

      ct.OutY = Array2D(ct.OutY, h);
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) {
          ct.OutY[y][x] = lr.LrFrame[0][y][x];
        }
      }

      ct.OutU = Array2D(ct.OutU, (h + subY) >> subY);
      for (let x = 0; x < (w + subX) >> subX; x++) {
        for (let y = 0; y < (h + subY) >> subY; y++) {
          ct.OutU[y][x] = lr.LrFrame[1][y][x];
        }
      }

      ct.OutV = Array2D(ct.OutV, (h + subY) >> subY);
      for (let x = 0; x < (w + subX) >> subX; x++) {
        for (let y = 0; y < (h + subY) >> subY; y++) {
          ct.OutV[y][x] = lr.LrFrame[2][y][x];
        }
      }
      return { w, h, subX, subY };
    }
  }

  /**
   * 7.18.3 Film grain synthesis process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#film-grain-synthesis-process)
   */
  //
  film_grain_synthesis(w: number, h: number, subX: number, subY: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const fgp = fh.film_grain_params;

    // 1.
    this.RandomRegister = fgp.grain_seed;
    // 2.
    this.GrainCenter = 128 << (cc.BitDepth - 8);
    // 3.
    this.GrainMin = -this.GrainCenter;
    // 4.
    this.GrainMax = (256 << (cc.BitDepth - 8)) - 1 - this.GrainCenter;
    // 5.
    this.generate_grain();
    // 6.
    this.scaling_lookup_initialization();
    // 7.
    this.add_noise_synthesis(w, h, subX, subY);
  }

  /**
   * 7.18.3.2 Random number process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#random-number-process)
   */
  get_random_number(bits: number) {
    let r = this.RandomRegister;
    let bit = ((r >> 0) ^ (r >> 1) ^ (r >> 3) ^ (r >> 12)) & 1;
    r = (r >> 1) | (bit << 15);
    let result = (r >> (16 - bits)) & ((1 << bits) - 1);
    this.RandomRegister = r;
    return result;
  }

  /**
   * 7.18.3.3 Generate grain process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#generate-grain-process)
   */
  generate_grain() {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const fgp = fh.film_grain_params;

    let shift = 12 - cc.BitDepth + fgp.grain_scale_shift;
    this.LumaGrain = Array2D(this.LumaGrain, 73);
    for (let y = 0; y < 73; y++) {
      for (let x = 0; x < 82; x++) {
        let g = 0;
        if (fgp.num_y_points > 0) {
          g = Gaussian_Sequence[this.get_random_number(11)];
        }
        this.LumaGrain[y][x] = Round2(g, shift);
      }
    }

    shift = fgp.ar_coeff_shift_minus_6 + 6;
    for (let y = 3; y < 73; y++) {
      for (let x = 3; x < 82 - 3; x++) {
        let s = 0;
        let pos = 0;
        for (let deltaRow = -fgp.ar_coeff_lag; deltaRow <= 0; deltaRow++) {
          for (let deltaCol = -fgp.ar_coeff_lag; deltaCol <= fgp.ar_coeff_lag; deltaCol++) {
            if (deltaRow == 0 && deltaCol == 0) break;
            let c = fgp.ar_coeffs_y_plus_128[pos] - 128;
            s += this.LumaGrain[y + deltaRow][x + deltaCol] * c;
            pos++;
          }
        }
        this.LumaGrain[y][x] = Clip3(this.GrainMin, this.GrainMax, this.LumaGrain[y][x] + Round2(s, shift));
      }
    }

    let chromaW = cc.subsampling_x ? 44 : 82;
    let chromaH = cc.subsampling_y ? 38 : 73;
    if (cc.mono_chrome == 0) {
    }

    shift = 12 - cc.BitDepth + fgp.grain_scale_shift;
    this.RandomRegister = fgp.grain_seed ^ 0xb524;
    this.CbGrain = Array2D(this.CbGrain, chromaH);
    for (let y = 0; y < chromaH; y++) {
      for (let x = 0; x < chromaW; x++) {
        let g = 0;
        if (fgp.num_cb_points > 0 || fgp.chroma_scaling_from_luma) {
          g = Gaussian_Sequence[this.get_random_number(11)];
        }
        this.CbGrain[y][x] = Round2(g, shift);
      }
    }
    this.RandomRegister = fgp.grain_seed ^ 0x49d8;
    this.CrGrain = Array2D(this.CrGrain, chromaH);
    for (let y = 0; y < chromaH; y++) {
      for (let x = 0; x < chromaW; x++) {
        let g = 0;
        if (fgp.num_cr_points > 0 || fgp.chroma_scaling_from_luma) {
          g = Gaussian_Sequence[this.get_random_number(11)];
        }
        this.CrGrain[y][x] = Round2(g, shift);
      }
    }

    shift = fgp.ar_coeff_shift_minus_6 + 6;
    for (let y = 3; y < chromaH; y++) {
      for (let x = 3; x < chromaW - 3; x++) {
        let s0 = 0;
        let s1 = 0;
        let pos = 0;
        for (let deltaRow = -fgp.ar_coeff_lag; deltaRow <= 0; deltaRow++) {
          for (let deltaCol = -fgp.ar_coeff_lag; deltaCol <= fgp.ar_coeff_lag; deltaCol++) {
            let c0 = fgp.ar_coeffs_cb_plus_128[pos] - 128;
            let c1 = fgp.ar_coeffs_cr_plus_128[pos] - 128;
            if (deltaRow == 0 && deltaCol == 0) {
              if (fgp.num_y_points > 0) {
                let luma = 0;
                let lumaX = ((x - 3) << cc.subsampling_x) + 3;
                let lumaY = ((y - 3) << cc.subsampling_y) + 3;
                for (let i = 0; i <= cc.subsampling_y; i++)
                  for (let j = 0; j <= cc.subsampling_x; j++) {
                    luma += this.LumaGrain[lumaY + i][lumaX + j];
                  }
                luma = Round2(luma, cc.subsampling_x + cc.subsampling_y);
                s0 += luma * c0;
                s1 += luma * c1;
              }
              break;
            }
            s0 += this.CbGrain[y + deltaRow][x + deltaCol] * c0;
            s1 += this.CrGrain[y + deltaRow][x + deltaCol] * c1;
            pos++;
          }
        }
        this.CbGrain[y][x] = Clip3(this.GrainMin, this.GrainMax, this.CbGrain[y][x] + Round2(s0, shift));
        this.CrGrain[y][x] = Clip3(this.GrainMin, this.GrainMax, this.CrGrain[y][x] + Round2(s1, shift));
      }
    }
  }

  /**
   * 7.18.3.4 Scaling lookup initialization process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#scaling-lookup-initialization-process)
   */
  scaling_lookup_initialization() {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const fgp = fh.film_grain_params;

    this.ScalingLut = Array2D(this.ScalingLut, cc.NumPlanes);
    for (let plane = 0; plane < cc.NumPlanes; plane++) {
      let numPoints = fgp.num_cr_points;
      if (plane == 0 || fgp.chroma_scaling_from_luma) {
        numPoints = fgp.num_y_points;
      } else if (plane == 1) {
        numPoints = fgp.num_cb_points;
      }
      if (numPoints == 0) {
        for (let x = 0; x < 256; x++) {
          this.ScalingLut[plane][x] = 0;
        }
      } else {
        for (let x = 0; x < this.get_x(plane, 0); x++) {
          this.ScalingLut[plane][x] = this.get_y(plane, 0);
        }
        for (let i = 0; i < numPoints - 1; i++) {
          let deltaY = this.get_y(plane, i + 1) - this.get_y(plane, i);
          let deltaX = this.get_x(plane, i + 1) - this.get_x(plane, i);
          let delta = deltaY * integer((65536 + (deltaX >> 1)) / deltaX);
          for (let x = 0; x < deltaX; x++) {
            let v = this.get_y(plane, i) + ((x * delta + 32768) >> 16);
            this.ScalingLut[plane][this.get_x(plane, i) + x] = v;
          }
        }
        for (let x = this.get_x(plane, numPoints - 1); x < 256; x++) {
          this.ScalingLut[plane][x] = this.get_y(plane, numPoints - 1);
        }
      }
    }
  }

  /**
   * 7.18.3.4 Scaling lookup initialization process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#scaling-lookup-initialization-process)
   */
  private get_x(plane: number, i: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const fgp = fh.film_grain_params;

    if (plane == 0 || fgp.chroma_scaling_from_luma) {
      return fgp.point_y_value[i];
    } else if (plane == 1) {
      return fgp.point_cb_value[i];
    } else {
      return fgp.point_cr_value[i];
    }
  }

  /**
   * 7.18.3.4 Scaling lookup initialization process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#scaling-lookup-initialization-process)
   */
  private get_y(plane: number, i: number) {
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const fgp = fh.film_grain_params;

    if (plane == 0 || fgp.chroma_scaling_from_luma) {
      return fgp.point_y_scaling[i];
    } else if (plane == 1) {
      return fgp.point_cb_scaling[i];
    } else {
      return fgp.point_cr_scaling[i];
    }
  }

  /**
   * 7.18.3.5 Add noise synthesis process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#add-noise-synthesis-process)
   */
  add_noise_synthesis(w: number, h: number, subX: number, subY: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const fgp = fh.film_grain_params;
    const ct = this.cameraTile;

    let lumaNum = 0;
    let noiseStripe = Array4D<number>(null, 64, cc.NumPlanes, 64);
    for (let y = 0; y < (h + 1) / 2; y += 16) {
      this.RandomRegister = fgp.grain_seed;
      this.RandomRegister ^= ((lumaNum * 37 + 178) & 255) << 8;
      this.RandomRegister ^= (lumaNum * 173 + 105) & 255;
      for (let x = 0; x < (w + 1) / 2; x += 16) {
        let rand = this.get_random_number(8);
        let offsetX = rand >> 4;
        let offsetY = rand & 15;
        for (let plane = 0; plane < cc.NumPlanes; plane++) {
          let planeSubX = plane > 0 ? subX : 0;
          let planeSubY = plane > 0 ? subY : 0;
          let planeOffsetX = planeSubX ? 6 + offsetX : 9 + offsetX * 2;
          let planeOffsetY = planeSubY ? 6 + offsetY : 9 + offsetY * 2;
          for (let i = 0; i < 34 >> planeSubY; i++) {
            for (let j = 0; j < 34 >> planeSubX; j++) {
              let g: number;
              if (plane == 0) {
                g = this.LumaGrain[planeOffsetY + i][planeOffsetX + j];
              } else if (plane == 1) {
                g = this.CbGrain[planeOffsetY + i][planeOffsetX + j];
              } else {
                g = this.CrGrain[planeOffsetY + i][planeOffsetX + j];
              }
              if (planeSubX == 0) {
                if (j < 2 && fgp.overlap_flag && x > 0) {
                  let old = noiseStripe[lumaNum][plane][i][x * 2 + j];
                  if (j == 0) {
                    g = old * 27 + g * 17;
                  } else {
                    g = old * 17 + g * 27;
                  }
                  g = Clip3(this.GrainMin, this.GrainMax, Round2(g, 5));
                }
                noiseStripe[lumaNum][plane][i][x * 2 + j] = g;
              } else {
                if (j == 0 && fgp.overlap_flag && x > 0) {
                  let old = noiseStripe[lumaNum][plane][i][x + j];
                  g = old * 23 + g * 22;
                  g = Clip3(this.GrainMin, this.GrainMax, Round2(g, 5));
                }
                noiseStripe[lumaNum][plane][i][x + j] = g;
              }
            }
          }
        }
      }
      lumaNum++;
    }

    let noiseImage = Array3D<number>(null, cc.NumPlanes, h);
    for (let plane = 0; plane < cc.NumPlanes; plane++) {
      let planeSubX = plane > 0 ? subX : 0;
      let planeSubY = plane > 0 ? subY : 0;
      for (let y = 0; y < (h + planeSubY) >> planeSubY; y++) {
        lumaNum = y >> (5 - planeSubY);
        let i = y - (lumaNum << (5 - planeSubY));
        for (let x = 0; x < (w + planeSubX) >> planeSubX; x++) {
          let g = noiseStripe[lumaNum][plane][i][x];
          if (planeSubY == 0) {
            if (i < 2 && lumaNum > 0 && fgp.overlap_flag) {
              let old = noiseStripe[lumaNum - 1][plane][i + 32][x];
              if (i == 0) {
                g = old * 27 + g * 17;
              } else {
                g = old * 17 + g * 27;
              }
              g = Clip3(this.GrainMin, this.GrainMax, Round2(g, 5));
            }
          } else {
            if (i < 1 && lumaNum > 0 && fgp.overlap_flag) {
              let old = noiseStripe[lumaNum - 1][plane][i + 16][x];
              g = old * 23 + g * 22;
              g = Clip3(this.GrainMin, this.GrainMax, Round2(g, 5));
            }
          }
          noiseImage[plane][y][x] = g;
        }
      }
    }

    let minValue = 0;
    let maxLuma = (256 << (cc.BitDepth - 8)) - 1;
    let maxChroma = maxLuma;
    if (fgp.clip_to_restricted_range) {
      let minValue = 16 << (cc.BitDepth - 8);
      let maxLuma = 235 << (cc.BitDepth - 8);
      if (cc.matrix_coefficients == MATRIX_COEFFICIENTS.MC_IDENTITY) {
        maxChroma = maxLuma;
      } else {
        maxChroma = 240 << (cc.BitDepth - 8);
      }
    }

    this.ScalingShift = fgp.grain_scaling_minus_8 + 8;
    for (let y = 0; y < (h + subY) >> subY; y++) {
      for (let x = 0; x < (w + subX) >> subX; x++) {
        let lumaX = x << subX;
        let lumaY = y << subY;
        let lumaNextX = Math.min(lumaX + 1, w - 1);
        let averageLuma: number;
        if (subX) {
          averageLuma = Round2(ct.OutY[lumaY][lumaX] + ct.OutY[lumaY][lumaNextX], 1);
        } else {
          averageLuma = ct.OutY[lumaY][lumaX];
        }
        if (fgp.num_cb_points > 0 || fgp.chroma_scaling_from_luma) {
          let orig = ct.OutU[y][x];
          let merged: number;
          if (fgp.chroma_scaling_from_luma) {
            merged = averageLuma;
          } else {
            let combined = averageLuma * (fgp.cb_luma_mult - 128) + orig * (fgp.cb_mult - 128);
            merged = Clip1((combined >> 6) + ((fgp.cb_offset - 256) << (cc.BitDepth - 8)), cc.BitDepth);
          }
          let noise = noiseImage[1][y][x];
          noise = Round2(this.scale_lut(1, merged) * noise, this.ScalingShift);
          ct.OutU[y][x] = Clip3(minValue, maxChroma, orig + noise);
        }

        if (fgp.num_cr_points > 0 || fgp.chroma_scaling_from_luma) {
          let orig = ct.OutV[y][x];
          let merged: number;
          if (fgp.chroma_scaling_from_luma) {
            merged = averageLuma;
          } else {
            let combined = averageLuma * (fgp.cr_luma_mult - 128) + orig * (fgp.cr_mult - 128);
            merged = Clip1((combined >> 6) + ((fgp.cr_offset - 256) << (cc.BitDepth - 8)), cc.BitDepth);
          }
          let noise = noiseImage[2][y][x];
          noise = Round2(this.scale_lut(2, merged) * noise, this.ScalingShift);
          ct.OutV[y][x] = Clip3(minValue, maxChroma, orig + noise);
        }
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let orig = ct.OutY[y][x];
        let noise = noiseImage[0][y][x];
        noise = Round2(this.scale_lut(0, orig) * noise, this.ScalingShift);
        if (fgp.num_y_points > 0) {
          ct.OutY[y][x] = Clip3(minValue, maxLuma, orig + noise);
        }
      }
    }
  }
  // [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#add-noise-synthesis-process)
  scale_lut(plane: number, index: number) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;

    let shift = cc.BitDepth - 8;
    let x = index >> shift;
    let rem = index - (x << shift);
    if (cc.BitDepth == 8 || x == 255) {
      return this.ScalingLut[plane][x];
    } else {
      let start = this.ScalingLut[plane][x];
      let end = this.ScalingLut[plane][x + 1];
      return start + Round2((end - start) * rem, shift);
    }
  }
}
