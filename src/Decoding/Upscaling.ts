import { Array3D, Clip1, Clip3, integer, Round2 } from "../Conventions";
import * as AV1 from "../define";
import { AV1Decoder } from "../SyntaxStructures/Obu";

import { assert } from "console";

const Upscale_Filter = [
  [0, 0, 0, 128, 0, 0, 0, 0],
  [0, 0, -1, 128, 2, -1, 0, 0],
  [0, 1, -3, 127, 4, -2, 1, 0],
  [0, 1, -4, 127, 6, -3, 1, 0],
  [0, 2, -6, 126, 8, -3, 1, 0],
  [0, 2, -7, 125, 11, -4, 1, 0],
  [-1, 2, -8, 125, 13, -5, 2, 0],
  [-1, 3, -9, 124, 15, -6, 2, 0],
  [-1, 3, -10, 123, 18, -6, 2, -1],
  [-1, 3, -11, 122, 20, -7, 3, -1],
  [-1, 4, -12, 121, 22, -8, 3, -1],
  [-1, 4, -13, 120, 25, -9, 3, -1],
  [-1, 4, -14, 118, 28, -9, 3, -1],
  [-1, 4, -15, 117, 30, -10, 4, -1],
  [-1, 5, -16, 116, 32, -11, 4, -1],
  [-1, 5, -16, 114, 35, -12, 4, -1],
  [-1, 5, -17, 112, 38, -12, 4, -1],
  [-1, 5, -18, 111, 40, -13, 5, -1],
  [-1, 5, -18, 109, 43, -14, 5, -1],
  [-1, 6, -19, 107, 45, -14, 5, -1],
  [-1, 6, -19, 105, 48, -15, 5, -1],
  [-1, 6, -19, 103, 51, -16, 5, -1],
  [-1, 6, -20, 101, 53, -16, 6, -1],
  [-1, 6, -20, 99, 56, -17, 6, -1],
  [-1, 6, -20, 97, 58, -17, 6, -1],
  [-1, 6, -20, 95, 61, -18, 6, -1],
  [-2, 7, -20, 93, 64, -18, 6, -2],
  [-2, 7, -20, 91, 66, -19, 6, -1],
  [-2, 7, -20, 88, 69, -19, 6, -1],
  [-2, 7, -20, 86, 71, -19, 6, -1],
  [-2, 7, -20, 84, 74, -20, 7, -2],
  [-2, 7, -20, 81, 76, -20, 7, -1],
  [-2, 7, -20, 79, 79, -20, 7, -2],
  [-1, 7, -20, 76, 81, -20, 7, -2],
  [-2, 7, -20, 74, 84, -20, 7, -2],
  [-1, 6, -19, 71, 86, -20, 7, -2],
  [-1, 6, -19, 69, 88, -20, 7, -2],
  [-1, 6, -19, 66, 91, -20, 7, -2],
  [-2, 6, -18, 64, 93, -20, 7, -2],
  [-1, 6, -18, 61, 95, -20, 6, -1],
  [-1, 6, -17, 58, 97, -20, 6, -1],
  [-1, 6, -17, 56, 99, -20, 6, -1],
  [-1, 6, -16, 53, 101, -20, 6, -1],
  [-1, 5, -16, 51, 103, -19, 6, -1],
  [-1, 5, -15, 48, 105, -19, 6, -1],
  [-1, 5, -14, 45, 107, -19, 6, -1],
  [-1, 5, -14, 43, 109, -18, 5, -1],
  [-1, 5, -13, 40, 111, -18, 5, -1],
  [-1, 4, -12, 38, 112, -17, 5, -1],
  [-1, 4, -12, 35, 114, -16, 5, -1],
  [-1, 4, -11, 32, 116, -16, 5, -1],
  [-1, 4, -10, 30, 117, -15, 4, -1],
  [-1, 3, -9, 28, 118, -14, 4, -1],
  [-1, 3, -9, 25, 120, -13, 4, -1],
  [-1, 3, -8, 22, 121, -12, 4, -1],
  [-1, 3, -7, 20, 122, -11, 3, -1],
  [-1, 2, -6, 18, 123, -10, 3, -1],
  [0, 2, -6, 15, 124, -9, 3, -1],
  [0, 2, -5, 13, 125, -8, 2, -1],
  [0, 1, -4, 11, 125, -7, 2, 0],
  [0, 1, -3, 8, 126, -6, 2, 0],
  [0, 1, -3, 6, 127, -4, 1, 0],
  [0, 1, -2, 4, 127, -3, 1, 0],
  [0, 0, -1, 2, 128, -1, 0, 0],
];

/**
 * 7.16 Upscaling process
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#cdef-process)
 */
export class Upscaling {
  private decoder: AV1Decoder;

  constructor(d: AV1Decoder) {
    this.decoder = d;
  }

  /**
   * 7.16 Upscaling process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#cdef-process)
   */
  upscaling(frame: number[][][]) {
    const seqHeader = this.decoder.sequenceHeaderObu.sequenceHeader;
    const cc = seqHeader.color_config;
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const fs = fh.frame_size;
    const fswr = fh.frame_size_with_refs;
    const sp = fh.superres_params;
    const cis = fh.compute_image_size;

    if (sp.use_superres == 0) {
      return frame;
    }

    let outputFrame: number[][][] = Array3D(cc.NumPlanes, Round2(fs.FrameHeight, fswr.UpscaledWidth));
    for (let plane = 0; plane < cc.NumPlanes; plane++) {
      let subX = 0;
      let subY = 0;
      if (plane > 0) {
        subX = cc.subsampling_x;
        subY = cc.subsampling_y;
      }
      let downscaledPlaneW = Round2(fs.FrameWidth, subX);
      let upscaledPlaneW = Round2(fswr.UpscaledWidth, subX);
      assert(upscaledPlaneW > downscaledPlaneW, "that upscaledPlaneW is strictly greater than downscaledPlaneW");
      let planeH = Round2(fs.FrameHeight, subY);
      let stepX = integer(((downscaledPlaneW << AV1.SUPERRES_SCALE_BITS) + integer(upscaledPlaneW / 2)) / upscaledPlaneW);
      let err = upscaledPlaneW * stepX - (downscaledPlaneW << AV1.SUPERRES_SCALE_BITS);
      let initialSubpelX =
        integer((-((upscaledPlaneW - downscaledPlaneW) << (AV1.SUPERRES_SCALE_BITS - 1)) + integer(upscaledPlaneW / 2)) / upscaledPlaneW) +
        (1 << (AV1.SUPERRES_EXTRA_BITS - 1)) -
        integer(err / 2);
      initialSubpelX &= AV1.SUPERRES_SCALE_MASK;
      let miW = cis.MiCols >> subX;
      let minX = 0;
      let maxX = miW * AV1.MI_SIZE - 1;
      for (let y = 0; y < planeH; y++) {
        for (let x = 0; x < upscaledPlaneW; x++) {
          let srcX = -(1 << AV1.SUPERRES_SCALE_BITS) + initialSubpelX + x * stepX;
          let srcXPx = srcX >> AV1.SUPERRES_SCALE_BITS;
          let srcXSubpel = (srcX & AV1.SUPERRES_SCALE_MASK) >> AV1.SUPERRES_EXTRA_BITS;
          let sum = 0;
          for (let k = 0; k < AV1.SUPERRES_FILTER_TAPS; k++) {
            let sampleX = Clip3(minX, maxX, srcXPx + (k - AV1.SUPERRES_FILTER_OFFSET));
            let px = frame[plane][y][sampleX];
            sum += px * Upscale_Filter[srcXSubpel][k];
          }
          outputFrame[plane][y][x] = Clip1(Round2(sum, AV1.FILTER_BITS), cc.BitDepth);
        }
      }
    }
    return outputFrame;
  }
}
