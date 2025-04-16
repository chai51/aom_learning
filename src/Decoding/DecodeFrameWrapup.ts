import { clone } from "../Conventions";
import { AV1Decoder } from "../SyntaxStructures/Obu";
import { FRAME_TYPE } from "../SyntaxStructures/Semantics";

/**
 * 7.4 Decode frame wrapup process
 *
 * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#decode-frame-wrapup-process)
 */
export class DecodeFrameWrapup {
  CdefFrame: number[][][] = [];
  UpscaledCdefFrame: number[][][] = [];
  UpscaledCurrFrame: number[][][] = [];

  private decoder: AV1Decoder;

  constructor(d: AV1Decoder) {
    this.decoder = d;
  }

  initialize() {}

  /**
   * 7.4 Decode frame wrapup process
   *
   * [av1-spec Reference](https://aomediacodec.github.io/av1-spec/#decode-frame-wrapup-process)
   */
  decode_frame_wrapup() {
    this.initialize();
    const fh = this.decoder.frameHeaderObu.frameHeader;
    const cis = fh.compute_image_size;
    const lfp = fh.loop_filter_params;
    const sp = fh.segmentation_params;
    const tg = this.decoder.tileGroupObu.titleGroup;
    const db = tg.decode_block;
    const p = this.decoder.prediction;
    const mfmvs = this.decoder.motionFieldMotionVectorStorage;
    const rfu = this.decoder.referenceFrameUpdate;
    const up = this.decoder.upscaling;
    const rfl = this.decoder.referenceFrameLoading;

    if (fh.show_existing_frame == 0) {
      // 1.
      if (lfp.loop_filter_level[0] != 0 || lfp.loop_filter_level[1] != 0) {
        this.decoder.loopFilter.loop_filter();
      }

      // 2.
      this.decoder.cdef.cdef();

      // 3.
      this.UpscaledCdefFrame = up.upscaling(clone(this.CdefFrame));

      // 4.
      this.UpscaledCurrFrame = up.upscaling(clone(p.CurrFrame));

      // 5.
      this.decoder.loopRestoration.loop_restoration();

      // 6.
      mfmvs.motion_field_motion_vector_storage();

      // 7.
      if (sp.segmentation_enabled == 1 && sp.segmentation_update_map == 0) {
        for (let row = 0; row < cis.MiRows; row++) {
          for (let col = 0; col < cis.MiCols; col++) {
            db.SegmentIds[row][col] = db.PrevSegmentIds[row][col];
          }
        }
      }
    } else {
      if (fh.frame_type == FRAME_TYPE.KEY_FRAME) {
        rfl.reference_frame_loading();
      }
    }

    // 1.
    rfu.reference_frame_update();

    // 2.
    if (fh.show_frame == 1 || fh.show_existing_frame == 1) {
      this.decoder.output.output();
    }
  }
}
