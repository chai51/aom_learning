import { Array2D, Array3D } from "../Conventions";
import { REFMVS_LIMIT } from "../define";
import { AV1Decoder } from "../SyntaxStructures/Obu";

import { REF_FRAME } from "../SyntaxStructures/Semantics";

/**
 * 7.19 Motion field motion vector storage process
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#loop-restoration-process)
 */
export class MotionFieldMotionVectorStorage {
  MfRefFrames: REF_FRAME[][];
  MfMvs: number[][][];

  private init: boolean;
  private decoder: AV1Decoder;

  constructor(d: AV1Decoder) {
    this.init = false;

    this.MfRefFrames = [];
    this.MfMvs = [];

    this.decoder = d;
  }

  initialize() {
    if (this.init) {
      return;
    }
    this.init = true;

    const cis = this.decoder.frameHeaderObu.frameHeader.compute_image_size;
    const sbRows = cis.MiRows + 32;
    const sbCols = cis.MiCols + 32;

    this.MfRefFrames = Array2D(sbRows);
    this.MfMvs = Array3D(sbRows, sbCols);
  }

  /**
   * 7.19 Motion field motion vector storage process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#loop-restoration-process)
   */
  motion_field_motion_vector_storage() {
    this.initialize();
    const fho = this.decoder.frameHeaderObu;
    const fh = fho.frameHeader;
    const cis = fh.compute_image_size;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;

    for (let row = 0; row < cis.MiRows; row++) {
      for (let col = 0; col < cis.MiCols; col++) {
        this.MfRefFrames[row][col] = REF_FRAME.NONE;
        this.MfMvs[row][col][0] = 0;
        this.MfMvs[row][col][1] = 0;
        for (let list = 0; list < 2; list++) {
          let r = db.RefFrames[row][col][list];
          if (r > REF_FRAME.INTRA_FRAME) {
            let refIdx = fh.ref_frame_idx[r - REF_FRAME.LAST_FRAME];
            let dist = fho.get_relative_dist(fh.RefOrderHint[refIdx], fh.OrderHint);
            if (dist < 0) {
              let mvRow = db.Mvs[row][col][list][0];
              let mvCol = db.Mvs[row][col][list][1];
              if (Math.abs(mvRow) <= REFMVS_LIMIT && Math.abs(mvCol) <= REFMVS_LIMIT) {
                this.MfRefFrames[row][col] = r;
                this.MfMvs[row][col][0] = mvRow;
                this.MfMvs[row][col][1] = mvCol;
              }
            }
          }
        }
      }
    }
  }
}
